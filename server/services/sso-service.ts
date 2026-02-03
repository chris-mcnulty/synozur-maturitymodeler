import { ConfidentialClientApplication, Configuration, AuthorizationUrlRequest, AuthorizationCodeRequest } from '@azure/msal-node';
import { randomBytes, createHash, randomUUID } from 'crypto';
import { storage } from '../storage';

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function generateState(): string {
  return randomUUID();
}

const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com',
  'protonmail.com', 'proton.me',
  'zoho.com',
  'yandex.com', 'yandex.ru',
  'mail.com', 'email.com',
  'gmx.com', 'gmx.net',
  'fastmail.com',
  'tutanota.com',
]);

const msalConfig: Configuration = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID || 'common'}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET!,
  },
  system: {
    loggerOptions: {
      loggerCallback: (loglevel, message) => {
        if (loglevel <= 1) {
          console.log('[MSAL]', message);
        }
      },
      piiLoggingEnabled: false,
      logLevel: 2,
    },
  },
};

let msalClient: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication {
  if (!msalClient) {
    if (!process.env.AZURE_CLIENT_ID || !process.env.AZURE_CLIENT_SECRET) {
      throw new Error('Azure SSO is not configured. Missing AZURE_CLIENT_ID or AZURE_CLIENT_SECRET.');
    }
    msalClient = new ConfidentialClientApplication(msalConfig);
  }
  return msalClient;
}

export function isSsoConfigured(): boolean {
  return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID);
}

export function isPublicDomain(domain: string): boolean {
  return PUBLIC_DOMAINS.has(domain.toLowerCase());
}

export function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length > 1 ? parts[1].toLowerCase() : '';
}

export async function getAuthorizationUrl(redirectUri: string, returnUrl?: string): Promise<{ url: string; state: string }> {
  const client = getMsalClient();
  
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();
  
  // Store state in database for production scalability (10-minute expiry)
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await storage.createSsoAuthState({
    state,
    codeVerifier: verifier,
    redirectUrl: returnUrl || null,
    expiresAt,
  });
  
  const authCodeUrlParameters: AuthorizationUrlRequest = {
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    redirectUri,
    state,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    prompt: 'select_account',
  };
  
  const url = await client.getAuthCodeUrl(authCodeUrlParameters);
  return { url, state };
}

interface TokenClaims {
  oid?: string;
  sub?: string;
  tid?: string; // Azure AD tenant ID
  preferred_username?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
}

export interface SsoUserInfo {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  ssoTenantId?: string; // Azure AD tenant ID for the user's organization
}

export async function handleCallback(code: string, state: string, redirectUri: string): Promise<{
  user: SsoUserInfo;
  codeVerifier: string;
  redirectUrl?: string;
}> {
  const client = getMsalClient();
  
  // Retrieve state from database instead of in-memory Map
  const savedState = await storage.getSsoAuthState(state);
  if (!savedState) {
    throw new Error('Invalid or expired authentication state');
  }
  
  // Check if state has expired
  if (new Date() > savedState.expiresAt) {
    await storage.deleteSsoAuthState(state);
    throw new Error('Authentication state has expired');
  }
  
  // Delete state immediately to prevent replay attacks
  await storage.deleteSsoAuthState(state);
  
  const tokenRequest: AuthorizationCodeRequest = {
    code,
    scopes: ['openid', 'profile', 'email', 'User.Read'],
    redirectUri,
    codeVerifier: savedState.codeVerifier,
  };
  
  const response = await client.acquireTokenByCode(tokenRequest);
  
  if (!response || !response.idTokenClaims) {
    throw new Error('Failed to acquire token');
  }
  
  const claims = response.idTokenClaims as TokenClaims;
  const userId = claims.oid || claims.sub;
  const email = claims.email || claims.preferred_username;
  const name = claims.name || `${claims.given_name || ''} ${claims.family_name || ''}`.trim();
  
  if (!userId || !email) {
    throw new Error('Missing required user claims (oid/sub or email)');
  }
  
  return {
    user: {
      id: userId,
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      firstName: claims.given_name,
      lastName: claims.family_name,
      ssoTenantId: claims.tid, // Azure AD tenant ID for the user's organization
    },
    codeVerifier: savedState.codeVerifier,
    redirectUrl: savedState.redirectUrl || undefined,
  };
}

export interface ProvisioningResult {
  user: any;
  isNewUser: boolean;
  isNewTenant: boolean;
  tenant?: any;
  error?: string;
}

export async function provisionUser(ssoUserInfo: SsoUserInfo): Promise<ProvisioningResult> {
  const domain = extractDomain(ssoUserInfo.email);
  const isPublic = isPublicDomain(domain);
  
  let existingUser = await storage.getUserBySsoProvider('microsoft', ssoUserInfo.id);
  
  if (!existingUser) {
    existingUser = await storage.getUserByEmail(ssoUserInfo.email);
    if (existingUser) {
      await storage.updateUser(existingUser.id, {
        ssoProvider: 'microsoft',
        ssoProviderId: ssoUserInfo.id,
        emailVerified: true,
        name: existingUser.name || ssoUserInfo.name,
      });
      return { user: existingUser, isNewUser: false, isNewTenant: false };
    }
  } else {
    return { user: existingUser, isNewUser: false, isNewTenant: false };
  }
  
  const allowTenantCreation = await getAppSetting('allowTenantSelfCreation', true);
  
  if (!isPublic) {
    // First, try to find tenant by Azure AD tenant ID (most reliable)
    let tenant: any = null;
    if (ssoUserInfo.ssoTenantId) {
      tenant = await storage.getTenantBySsoTenantId(ssoUserInfo.ssoTenantId);
    }
    
    // Fall back to domain-based lookup if no Azure AD tenant match
    if (!tenant) {
      const tenantDomain = await storage.getTenantDomainByDomain(domain);
      if (tenantDomain) {
        tenant = await storage.getTenant(tenantDomain.tenantId);
        
        // Update tenant with Azure AD tenant ID if not already set
        if (tenant && !tenant.ssoTenantId && ssoUserInfo.ssoTenantId) {
          await storage.updateTenant(tenant.id, { ssoTenantId: ssoUserInfo.ssoTenantId });
          tenant.ssoTenantId = ssoUserInfo.ssoTenantId;
        }
      }
    }
    
    if (tenant) {
      if (!tenant.allowUserSelfProvisioning) {
        return { user: null, isNewUser: false, isNewTenant: false, error: 'This organization does not allow self-provisioning. Please contact your administrator for an invitation.' };
      }
      
      const newUser = await createSsoUser(ssoUserInfo, tenant.id);
      
      if (tenant.syncToHubSpot) {
        await syncUserToHubSpot(newUser, tenant);
      }
      
      return { user: newUser, isNewUser: true, isNewTenant: false, tenant };
    }
    
    if (allowTenantCreation) {
      const tenantName = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
      const newTenant = await storage.createTenant({
        name: tenantName,
        logoUrl: null,
        primaryColor: null,
        secondaryColor: null,
        allowUserSelfProvisioning: true,
        syncToHubSpot: true,
        inviteOnly: false,
        ssoTenantId: ssoUserInfo.ssoTenantId || null, // Store Azure AD tenant ID
      });
      
      await storage.createTenantDomain({
        tenantId: newTenant.id,
        domain,
        verified: true,
      });
      
      const newUser = await createSsoUser(ssoUserInfo, newTenant.id, 'tenant_admin');
      
      if (newTenant.syncToHubSpot) {
        await syncUserToHubSpot(newUser, newTenant);
      }
      
      return { user: newUser, isNewUser: true, isNewTenant: true, tenant: newTenant };
    } else {
      return { user: null, isNewUser: false, isNewTenant: false, error: 'New organization registration is currently disabled. Please contact support.' };
    }
  } else {
    const newUser = await createSsoUser(ssoUserInfo, null);
    return { user: newUser, isNewUser: true, isNewTenant: false };
  }
}

async function createSsoUser(ssoUserInfo: SsoUserInfo, tenantId: string | null, role: string = 'user'): Promise<any> {
  const username = await generateUniqueUsername(ssoUserInfo.email);
  
  const user = await storage.createUser({
    username,
    password: `sso_${Date.now()}_${Math.random().toString(36)}`,
    email: ssoUserInfo.email,
    name: ssoUserInfo.name,
    role,
    emailVerified: true,
    ssoProvider: 'microsoft',
    ssoProviderId: ssoUserInfo.id,
    tenantId,
  });
  
  return user;
}

async function generateUniqueUsername(email: string): Promise<string> {
  const baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  let username = baseUsername;
  let counter = 1;
  
  while (await storage.getUserByUsername(username)) {
    username = `${baseUsername}${counter}`;
    counter++;
  }
  
  return username;
}

// Check if user profile has all required fields completed
export function isProfileComplete(user: any): boolean {
  const requiredFields = ['company', 'companySize', 'jobTitle', 'industry', 'country'];
  return requiredFields.every(field => user[field] && user[field].trim() !== '');
}

async function getAppSetting(key: string, defaultValue: any): Promise<any> {
  try {
    const setting = await storage.getSetting(key);
    return setting?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

async function syncUserToHubSpot(user: any, tenant: any): Promise<void> {
  console.log(`[HubSpot Sync] New SSO user created: ${user.email} in tenant ${tenant?.name || 'none'}`);
}

// Admin consent URL generation for enterprise onboarding
export interface AdminConsentInfo {
  consentUrl: string;
  appName: string;
  requiredPermissions: string[];
  instructions: string;
}

export function generateAdminConsentUrl(azureTenantId?: string): AdminConsentInfo {
  if (!process.env.AZURE_CLIENT_ID) {
    throw new Error('Azure SSO is not configured');
  }
  
  // Use 'common' for multi-tenant apps, or specific tenant ID if provided
  const tenantIdOrCommon = azureTenantId || 'common';
  
  const consentUrl = `https://login.microsoftonline.com/${tenantIdOrCommon}/adminconsent?client_id=${process.env.AZURE_CLIENT_ID}`;
  
  return {
    consentUrl,
    appName: 'Orion Maturity Assessment Platform',
    requiredPermissions: [
      'Sign in and read user profile (openid, profile)',
      'View user email address (email)',
      'Read basic user information (User.Read)',
    ],
    instructions: `
To enable seamless sign-in for your organization:

1. Open the Admin Consent URL below (requires Azure AD Global Administrator or Application Administrator role)
2. Review the permissions requested by Orion
3. Click "Accept" to grant consent for all users in your organization

Once granted, users in your organization can sign in without seeing individual consent prompts.

Note: These are minimal, read-only permissions that allow Orion to authenticate users and read their basic profile information. No sensitive data access is requested.
    `.trim(),
  };
}

export async function getConsentStatusForTenant(tenantId: string): Promise<{
  hasAdminConsent: boolean;
  ssoTenantId: string | null;
}> {
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  
  return {
    hasAdminConsent: tenant.ssoAdminConsentGranted,
    ssoTenantId: tenant.ssoTenantId,
  };
}

export async function markAdminConsentGranted(tenantId: string): Promise<void> {
  await storage.updateTenant(tenantId, { ssoAdminConsentGranted: true });
}

// Periodic cleanup of expired SSO auth states (runs every 5 minutes)
let cleanupIntervalId: NodeJS.Timeout | null = null;

export function startSsoStateCleanup(): void {
  if (cleanupIntervalId) return; // Already running
  
  cleanupIntervalId = setInterval(async () => {
    try {
      const cleaned = await storage.cleanupExpiredSsoAuthStates();
      if (cleaned > 0) {
        console.log(`[SSO Cleanup] Removed ${cleaned} expired auth state(s)`);
      }
    } catch (error) {
      console.error('[SSO Cleanup] Error cleaning up expired states:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
  
  console.log('[SSO] Database-backed auth state management initialized');
}

export function stopSsoStateCleanup(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}
