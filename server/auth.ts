import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

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

export function setupAuth(app: Express) {
  const isProduction = process.env.NODE_ENV === 'production';
  
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: isProduction, // Require HTTPS in production
      httpOnly: true, // Prevent XSS attacks
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax', // CSRF protection
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
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
    const user = await storage.getUser(id);
    done(null, user);
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
          await sendVerificationEmail(user.email, token, baseUrl);
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
      
      await sendVerificationEmail(email, token, baseUrl);

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
      const returnUrl = (req.query.returnUrl as string) || '/';
      
      const { url } = await getAuthorizationUrl(redirectUri, returnUrl);
      res.redirect(url);
    } catch (error) {
      console.error('SSO initiation error:', error);
      res.status(500).json({ error: "Failed to initiate SSO login" });
    }
  });

  app.get("/auth/sso/callback", async (req, res) => {
    try {
      const { handleCallback, provisionOrLinkUser } = await import('./services/sso-service.js');
      
      const { code, state, error: authError, error_description } = req.query;
      
      if (authError) {
        console.error('SSO auth error:', authError, error_description);
        return res.redirect(`/login?error=${encodeURIComponent(error_description as string || 'SSO authentication failed')}`);
      }
      
      if (!code || !state) {
        return res.redirect('/login?error=Invalid+SSO+response');
      }
      
      const redirectUri = `${req.protocol}://${req.get('host')}/auth/sso/callback`;
      
      const { user: ssoUser, redirectUrl } = await handleCallback(
        code as string,
        state as string,
        redirectUri
      );
      
      // Provision or link user to existing account
      const allowTenantCreation = true; // TODO: read from app settings
      const result = await provisionOrLinkUser(ssoUser, allowTenantCreation);
      
      // Log in the user
      req.login(result.user, (err: any) => {
        if (err) {
          console.error('SSO login session error:', err);
          return res.redirect('/login?error=Session+creation+failed');
        }
        
        // Redirect to the original page or home
        const destination = redirectUrl || '/';
        res.redirect(destination);
      });
    } catch (error: any) {
      console.error('SSO callback error:', error);
      const errorMessage = error.message || 'SSO authentication failed';
      res.redirect(`/login?error=${encodeURIComponent(errorMessage)}`);
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
  app.get("/api/auth/sso/admin-consent", async (req, res) => {
    try {
      const { generateAdminConsentUrl, isSsoConfigured } = await import('./services/sso-service.js');
      
      if (!isSsoConfigured()) {
        return res.status(400).json({ error: 'Microsoft SSO is not configured' });
      }
      
      // For authenticated users, use their tenant's Azure AD ID if available
      let azureTenantId: string | undefined;
      if (req.isAuthenticated() && req.user?.tenantId) {
        const tenant = await storage.getTenant(req.user.tenantId);
        azureTenantId = tenant?.ssoTenantId || undefined;
      }
      
      const consentInfo = generateAdminConsentUrl(azureTenantId);
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