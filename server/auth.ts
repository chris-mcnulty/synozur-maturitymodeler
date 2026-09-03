import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser, InsertTenant } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

// Only allow same-origin relative paths as post-auth redirect targets.
// Rejects absolute URLs, protocol-relative URLs (//host), and backslash
// tricks that browsers may treat as protocol-relative, to prevent SSO/OAuth
// login flows from being abused as open redirects.
function sanitizeReturnPath(input: string | undefined | null): string {
  if (!input || typeof input !== 'string') return '/';
  if (!input.startsWith('/')) return '/';
  if (input.startsWith('//') || input.startsWith('/\\')) return '/';
  if (input.includes('://')) return '/';
  return input;
}

async function comparePasswords(supplied: string, stored: string) {
  try {
    const [hashed, salt] = stored.split(".");
    if (!hashed || !salt) {
      // Malformed hash - missing salt or hash
      return false;
    }
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    // Handle any errors during password comparison gracefully
    console.error('Password comparison error:', error);
    return false;
  }
}

export function buildSessionSettings(
  store: session.Store | undefined = storage.sessionStore,
  isProduction = process.env.NODE_ENV === 'production',
): session.SessionOptions {
  return {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      secure: isProduction,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7,
      sameSite: 'lax',
    },
  };
}

export function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === 'production';

  // Replit terminates TLS at its reverse proxy. Trust the first proxy hop so
  // express-session recognizes forwarded HTTPS and emits Secure cookies.
  app.set("trust proxy", 1);
  app.use(session(buildSessionSettings(storage.sessionStore, isProduction)));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      } else {
        return done(null, user);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (err) {
      console.error('[Auth] Failed to deserialize user:', err);
      done(null, false);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByUsername(req.body.username);
    if (existingUser) {
      return res.status(400).send("Username already exists");
    }

    const existingEmail = await storage.getUserByEmail(req.body.email);
    if (existingEmail) {
      return res.status(400).send("Email already exists");
    }

    try {
      // Explicitly set role to 'user' for all new registrations
      // Admin users must be created through the admin panel
      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        role: 'user', // Force all new registrations to be regular users
      });

      // Send verification email (don't block registration if email fails)
      if (user.email) {
        try {
          const { generateVerificationToken, sendVerificationEmail } = 
            await import('./services/email-verification.js');
          const token = await generateVerificationToken(user.id);
          const baseUrl = `${req.protocol}://${req.get('host')}`;
          await sendVerificationEmail(user.email, token, baseUrl, user.tenantId);
        } catch (emailError) {
          console.error('Failed to send verification email:', emailError);
          // Continue with registration even if email fails
        }
      }

      req.login(user, (err) => {
        if (err) return next(err);
        // Remove password from response
        const { password: _, ...safeUser } = user;
        res.status(201).json(safeUser);
      });
    } catch (error: any) {
      // Handle database constraint errors gracefully
      if (error.code === '23505') { // PostgreSQL unique constraint violation
        if (error.constraint?.includes('email')) {
          return res.status(400).send("Email already exists");
        }
        if (error.constraint?.includes('username')) {
          return res.status(400).send("Username already exists");
        }
        return res.status(400).send("User already exists");
      }
      // For other errors, pass to error handler
      next(error);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    // Remove password from response
    if (req.user) {
      const { password: _, ...safeUser } = req.user;
      res.status(200).json(safeUser);
    } else {
      res.status(401).json({ error: "Authentication failed" });
    }
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    // Remove password from response
    if (req.user) {
      const { password: _, ...safeUser } = req.user;
      res.json(safeUser);
    } else {
      res.sendStatus(401);
    }
  });

  // Update current user's profile (for SSO users completing their profile)
  app.patch("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const userId = req.user!.id;
      const { company, companySize, jobTitle, industry, country } = req.body;
      
      // Only allow updating profile fields, not sensitive fields like role/email/password
      const updatedUser = await storage.updateUser(userId, {
        company,
        companySize,
        jobTitle,
        industry,
        country,
      });
      
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { password: _, ...safeUser } = updatedUser;
      res.json(safeUser);
    } catch (error: any) {
      console.error('Profile update error:', error);
      res.status(500).json({ error: error.message || "Failed to update profile" });
    }
  });

  // Email verification endpoint
  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: "Verification token is required" });
      }

      const { verifyEmailToken } = await import('./services/email-verification.js');
      const result = await verifyEmailToken(token);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.json({ success: true, message: "Email verified successfully" });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: "Failed to verify email" });
    }
  });

  // Resend verification email endpoint
  app.post("/api/auth/resend-verification", async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const { getUserByEmail, generateVerificationToken, sendVerificationEmail } = 
        await import('./services/email-verification.js');
      
      const user = await getUserByEmail(email);
      
      if (!user) {
        // Don't reveal if email exists for security
        return res.json({ success: true, message: "If an account exists with that email, a verification link has been sent." });
      }

      if (user.emailVerified) {
        return res.status(400).json({ error: "Email is already verified" });
      }

      const token = await generateVerificationToken(user.id);
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      
      await sendVerificationEmail(email, token, baseUrl, user.tenantId);

      res.json({ success: true, message: "Verification email sent" });
    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ error: "Failed to send verification email" });
    }
  });

  // Microsoft Entra ID SSO Routes
  app.get("/auth/sso/microsoft", async (req, res) => {
    try {
      const { getAuthorizationUrl, isSsoConfigured } = await import('./services/sso-service.js');
      
      if (!isSsoConfigured()) {
        return res.status(503).json({ error: "Microsoft SSO is not configured" });
      }
      
      const redirectUri = `${req.protocol}://${req.get('host')}/auth/sso/callback`;
      const returnUrl = sanitizeReturnPath(req.query.returnUrl as string | undefined);
      
      const { url } = await getAuthorizationUrl(redirectUri, returnUrl);
      res.redirect(url);
    } catch (error) {
      console.error('SSO initiation error:', error);
      res.status(500).json({ error: "Failed to initiate SSO login" });
    }
  });

  app.get("/auth/sso/callback", async (req, res) => {
    try {
      const { handleCallback, provisionUser, isProfileComplete } = await import('./services/sso-service.js');
      
      const { code, state, error: authError, error_description, admin_consent, tenant } = req.query;
      const {
        verifyAdminConsentRequestState,
        handleBasicConsentCallback,
      } = await import('./services/sso-service.js');
      const consentState = verifyAdminConsentRequestState(typeof state === 'string' ? state : undefined);

      // Basic SSO consent uses a scope-specific authorization request. It
      // returns an authorization code rather than admin_consent=True, so
      // complete it separately from the normal user sign-in flow.
      if (consentState?.consentType === 'sso' && code) {
        if (authError) {
          return res.redirect(`/auth?error=${encodeURIComponent(error_description as string || 'Microsoft SSO consent was declined')}`);
        }

        const redirectUri = `${req.protocol}://${req.get('host')}/auth/sso/callback`;
        const { ssoTenantId } = await handleBasicConsentCallback(code as string, redirectUri);
        const orionTenant = consentState.orionTenantId
          ? await storage.getTenant(consentState.orionTenantId)
          : (ssoTenantId ? await storage.getTenantBySsoTenantId(ssoTenantId) : undefined);

        if (!orionTenant) {
          console.warn(`[SSO] Basic consent received for unknown Azure tenant ${ssoTenantId || 'unknown'}`);
          return res.redirect('/auth?error=Microsoft+tenant+could+not+be+matched+to+an+organization');
        }
        if (orionTenant.ssoTenantId && ssoTenantId && orionTenant.ssoTenantId !== ssoTenantId) {
          console.warn(`[SSO] Basic consent tenant mismatch for Orion tenant "${orionTenant.name}"`);
          return res.redirect('/auth?error=Microsoft+tenant+did+not+match+the+requested+organization');
        }

        await storage.updateTenant(orionTenant.id, {
          ssoTenantId: ssoTenantId || orionTenant.ssoTenantId,
          ssoAdminConsentGranted: true,
        });
        console.log(`[SSO] Basic sign-in consent granted for Azure tenant ${ssoTenantId || orionTenant.ssoTenantId} → Orion tenant "${orionTenant.name}"`);
        return res.redirect('/auth?ssoConsent=granted');
      }
      
      // Handle admin consent callback — Azure redirects here after IT admin approves org consent
      // Parameters: admin_consent=True&tenant=<azure-tenant-id>  (no code/state)
      if (admin_consent !== undefined) {
        if (String(admin_consent).toLowerCase() === 'true' && tenant) {
          // Auto-mark the matching Orion tenant as having granted admin consent
          try {
            const stateTenantId = consentState?.orionTenantId;
            const orionTenant = stateTenantId
              ? await storage.getTenant(stateTenantId)
              : await storage.getTenantBySsoTenantId(tenant as string);
            if (orionTenant) {
              if (orionTenant.ssoTenantId && orionTenant.ssoTenantId !== tenant) {
                console.warn(`[SSO] Admin consent tenant mismatch for Orion tenant "${orionTenant.name}"`);
                return res.redirect('/auth?error=Microsoft+tenant+did+not+match+the+requested+organization');
              }
              const updates: Partial<InsertTenant> = {
                ssoTenantId: tenant as string,
              };
              // URLs created before the split requested both permission sets.
              // Treat those callbacks as granting both so existing tenants are
              // not disrupted. New callbacks update only their requested area.
              if (consentState?.consentType === 'planner') {
                updates.plannerAdminConsentGranted = true;
              } else if (consentState?.consentType === 'sso') {
                updates.ssoAdminConsentGranted = true;
              } else {
                updates.ssoAdminConsentGranted = true;
                updates.plannerAdminConsentGranted = true;
              }
              await storage.updateTenant(orionTenant.id, updates);
              console.log(`[SSO] ${consentState?.consentType === 'planner' ? 'Planner' : 'Microsoft'} consent granted for Azure tenant ${tenant} → Orion tenant "${orionTenant.name}"`);
            } else {
              console.warn(`[SSO] Admin consent received for unknown Azure tenant ${tenant}`);
            }
          } catch (err) {
            console.error('[SSO] Failed to auto-mark consent granted:', err);
          }
          return res.redirect(consentState?.consentType === 'planner'
            ? '/auth?plannerConsent=granted'
            : '/auth?ssoConsent=granted');
        } else {
          // Admin declined consent
          return res.redirect('/auth?error=Admin+consent+was+declined');
        }
      }

      if (authError) {
        console.error('SSO auth error:', authError, error_description);
        return res.redirect(`/auth?error=${encodeURIComponent(error_description as string || 'SSO authentication failed')}`);
      }
      
      if (!code || !state) {
        return res.redirect('/auth?error=Invalid+SSO+response');
      }
      
      const redirectUri = `${req.protocol}://${req.get('host')}/auth/sso/callback`;
      
      const { user: ssoUser, redirectUrl } = await handleCallback(
        code as string,
        state as string,
        redirectUri
      );
      
      // Provision or link user to existing account
      const result = await provisionUser(ssoUser);
      
      // Check for provisioning errors
      if (result.error || !result.user) {
        const errorMessage = result.error || 'Failed to provision user account';
        return res.redirect(`/auth?error=${encodeURIComponent(errorMessage)}`);
      }
      
      // Log in the user
      req.login(result.user, (err: any) => {
        if (err) {
          console.error('SSO login session error:', err);
          return res.redirect('/auth?error=Session+creation+failed');
        }
        
        // Check if user needs to complete their profile (new SSO users)
        // Re-validate the stored redirect target here too, in case older
        // records were persisted before this check existed.
        const safeDestination = sanitizeReturnPath(redirectUrl);
        if (result.isNewUser || !isProfileComplete(result.user, result.tenant)) {
          // Redirect to profile completion with the original destination
          const returnTo = encodeURIComponent(safeDestination);
          return res.redirect(`/complete-profile?returnTo=${returnTo}`);
        }
        
        // Redirect to the original page or home
        res.redirect(safeDestination);
      });
    } catch (error: any) {
      console.error('SSO callback error:', error);
      const errorMessage = error.message || 'SSO authentication failed';
      res.redirect(`/auth?error=${encodeURIComponent(errorMessage)}`);
    }
  });

  // Check if SSO is available
  app.get("/api/auth/sso/status", async (req, res) => {
    try {
      const { isSsoConfigured } = await import('./services/sso-service.js');
      res.json({ 
        microsoft: isSsoConfigured(),
      });
    } catch (error) {
      res.json({ microsoft: false });
    }
  });

  // Generate admin consent URL for IT administrators (public - generates generic URL)
  // Accepts optional ?ssoTenantId= query param (used by admin to generate for any tenant)
  app.get("/api/auth/sso/admin-consent", async (req, res) => {
    try {
      const { generateAdminConsentUrl, isSsoConfigured } = await import('./services/sso-service.js');
      
      if (!isSsoConfigured()) {
        return res.status(400).json({ error: 'Microsoft SSO is not configured' });
      }
      
      // Query param takes precedence (admin generating for a specific tenant)
      let azureTenantId: string | undefined = req.query.ssoTenantId as string | undefined;
      let orionTenantId: string | undefined;
      const requestedOrionTenantId = req.query.orionTenantId as string | undefined;
      const requestedTenantHint = req.query.tenantHint as string | undefined;
      const consentType = req.query.consentType === 'planner' ? 'planner' : 'sso';

      // Planner uses application permissions and is configured centrally for
      // support-ticket sync. Only a signed-in Orion global admin may initiate
      // that separate tenant-admin consent flow.
      if (consentType === 'planner') {
        if (!req.isAuthenticated() || req.user?.role !== 'global_admin') {
          return res.status(403).json({ error: 'Global admin access required for Planner consent' });
        }
        azureTenantId = process.env.AZURE_TENANT_ID || azureTenantId;
        if (azureTenantId) {
          const plannerTenant = await storage.getTenantBySsoTenantId(azureTenantId);
          if (plannerTenant) orionTenantId = plannerTenant.id;
        }
      }

      if (requestedOrionTenantId && consentType === 'sso') {
        if (!req.isAuthenticated() || !req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        const canGenerateForTenant =
          req.user.role === 'global_admin'
          || (req.user.role === 'tenant_admin' && req.user.tenantId === requestedOrionTenantId);
        if (!canGenerateForTenant) {
          return res.status(403).json({ error: 'You do not have permission to generate consent for this tenant' });
        }
        const requestedTenant = await storage.getTenant(requestedOrionTenantId);
        if (!requestedTenant) {
          return res.status(404).json({ error: 'Tenant not found' });
        }
        orionTenantId = requestedTenant.id;
        if (!azureTenantId) azureTenantId = requestedTenant.ssoTenantId || undefined;
        if (!azureTenantId && requestedTenantHint) {
          const domain = await storage.getTenantDomainByDomain(requestedTenantHint);
          if (!domain || domain.tenantId !== requestedTenant.id || !domain.verified) {
            return res.status(400).json({ error: 'Tenant domain is not verified for this organization' });
          }
          azureTenantId = domain.domain;
        }
      }
      
      // Fall back to authenticated user's own tenant
      if (!orionTenantId && consentType === 'sso' && req.isAuthenticated() && req.user?.tenantId) {
        orionTenantId = req.user.tenantId;
        const tenant = await storage.getTenant(req.user.tenantId);
        if (!azureTenantId) azureTenantId = tenant?.ssoTenantId || undefined;
      }
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const consentInfo = generateAdminConsentUrl(azureTenantId, baseUrl, orionTenantId, consentType);
      res.json(consentInfo);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to generate admin consent URL' });
    }
  });

  // Get consent status for caller's tenant (requires authentication)
  app.get("/api/auth/sso/consent-status", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      if (!req.user?.tenantId) {
        return res.status(400).json({ error: 'User is not associated with a tenant' });
      }
      
      const { getConsentStatusForTenant } = await import('./services/sso-service.js');
      const status = await getConsentStatusForTenant(req.user.tenantId);
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get consent status' });
    }
  });

  // Mark admin consent as granted (requires tenant_admin or global_admin)
  app.post("/api/auth/sso/consent-granted", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const user = req.user as any;
      const isTenantAdmin = user.role === 'tenant_admin' || user.role === 'global_admin';
      
      if (!isTenantAdmin) {
        return res.status(403).json({ error: 'Tenant admin or global admin access required' });
      }
      
      if (!user.tenantId) {
        return res.status(400).json({ error: 'User is not associated with a tenant' });
      }
      
      const { markAdminConsentGranted } = await import('./services/sso-service.js');
      await markAdminConsentGranted(user.tenantId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to mark consent as granted' });
    }
  });
}

// Middleware to ensure user is authenticated
export function ensureAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
}

// Middleware to ensure user is a global admin
export function ensureGlobalAdmin(req: any, res: any, next: any) {
  if (req.isAuthenticated() && req.user.role === 'global_admin') {
    return next();
  }
  res.status(401).json({ error: "Global admin access required" });
}

// Middleware to ensure user has any admin role (global_admin or tenant_admin)
export function ensureAnyAdmin(req: any, res: any, next: any) {
  if (req.isAuthenticated() && (req.user.role === 'global_admin' || req.user.role === 'tenant_admin')) {
    return next();
  }
  res.status(401).json({ error: "Admin access required" });
}

// Middleware to ensure user is admin (backward compatibility - maps to global_admin)
// DEPRECATED: Use ensureGlobalAdmin or ensureAnyAdmin instead
export function ensureAdmin(req: any, res: any, next: any) {
  // Support both legacy 'admin' and new 'global_admin' during migration
  if (req.isAuthenticated() && (req.user.role === 'admin' || req.user.role === 'global_admin')) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized. Admin access required." });
}

// Middleware to ensure user can manage models (global_admin, tenant_admin, or tenant_modeler)
export function ensureCanManageModels(req: any, res: any, next: any) {
  if (req.isAuthenticated() && 
      (req.user.role === 'global_admin' || 
       req.user.role === 'tenant_admin' || 
       req.user.role === 'tenant_modeler')) {
    return next();
  }
  res.status(401).json({ error: "Model management access required" });
}

// Middleware to ensure user is admin or modeler (can manage models but not users)
// DEPRECATED: Use ensureCanManageModels instead
export function ensureAdminOrModeler(req: any, res: any, next: any) {
  // Support legacy roles during migration
  if (req.isAuthenticated() && 
      (req.user.role === 'admin' || 
       req.user.role === 'global_admin' ||
       req.user.role === 'tenant_admin' ||
       req.user.role === 'tenant_modeler' ||
       req.user.role === 'modeler')) {
    return next();
  }
  res.status(401).json({ error: "Admin or modeler access required" });
}