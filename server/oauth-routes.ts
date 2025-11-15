// Simplified OAuth 2.1 endpoints for initial implementation
import express, { Router } from 'express';
import { db } from './db';
import { 
  oauthClients, 
  oauthAuthorizationCodes, 
  oauthTokens, 
  oauthUserConsents,
  users,
  applications,
  userApplicationRoles,
  applicationRoles,
} from '@shared/schema';
import { eq, and, gte, isNull } from 'drizzle-orm';
import { getOAuthConfig, getDiscoveryDocument, detectEnvironment } from './config/environment';
import { jwtSigningService } from './services/jwt-signing';
import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

const router = Router();

// Helper to hash tokens for secure storage
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Helper to generate secure random tokens
function generateToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

// Helper to verify PKCE challenge
function verifyPKCEChallenge(codeVerifier: string, codeChallenge: string, method: string = 'S256'): boolean {
  if (method === 'plain') {
    return codeVerifier === codeChallenge;
  } else if (method === 'S256') {
    const hash = createHash('sha256').update(codeVerifier).digest('base64url');
    return hash === codeChallenge;
  }
  return false;
}

// Helper to normalize and hash scopes for consistent storage/lookup
function normalizeScopes(scopes: string | string[]): { normalized: string[], hash: string } {
  const scopeArray = Array.isArray(scopes) ? scopes : scopes.split(' ').filter(s => s);
  const normalized = [...new Set(scopeArray)].sort(); // Dedupe and sort
  const hash = createHash('sha256').update(normalized.join(' ')).digest('base64url');
  return { normalized, hash };
}

// OpenID Connect Discovery endpoint
router.get('/.well-known/openid-configuration', (req, res) => {
  const discovery = getDiscoveryDocument();
  res.json(discovery);
});

// JWKS (JSON Web Key Set) endpoint
router.get('/.well-known/jwks.json', async (req, res) => {
  try {
    const jwks = await jwtSigningService.getJWKS();
    res.json(jwks);
  } catch (error) {
    console.error('Error generating JWKS:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Simplified authorization endpoint - returns JSON for now
router.get('/oauth/authorize', async (req, res) => {
  try {
    const {
      response_type,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
    } = req.query as Record<string, string>;
    
    // Validate required parameters
    if (!response_type || !client_id || !redirect_uri) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters',
      });
    }
    
    // Only support code flow
    if (response_type !== 'code') {
      return res.status(400).json({
        error: 'unsupported_response_type',
        error_description: 'Only authorization code flow is supported',
      });
    }
    
    // Validate client
    const [client] = await db
      .select()
      .from(oauthClients)
      .where(
        and(
          eq(oauthClients.clientId, client_id),
          eq(oauthClients.environment, detectEnvironment())
        )
      )
      .limit(1);
    
    if (!client) {
      return res.status(400).json({
        error: 'invalid_client',
        error_description: 'Client not found',
      });
    }
    
    // Check if PKCE is required
    if (client.pkceRequired && !code_challenge) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'PKCE code challenge required',
      });
    }
    
    // Check if user is authenticated
    if (!req.user) {
      // Save OAuth parameters in session if available
      if (req.session) {
        req.session.oauthRequest = {
          response_type,
          client_id,
          redirect_uri,
          scope,
          state,
          code_challenge,
          code_challenge_method,
        };
      }
      
      // Return login required response
      return res.status(401).json({
        error: 'login_required',
        error_description: 'User authentication required',
        login_url: `/auth?returnUrl=${encodeURIComponent(req.originalUrl)}`,
      });
    }
    
    // Check if consent already exists
    const { normalized, hash } = normalizeScopes(scope || '');
    
    // Check if this is Orion self-authentication (auto-approve)
    const [orionApp] = await db
      .select()
      .from(applications)
      .where(eq(applications.clientKey, 'orion'))
      .limit(1);
    
    const isOrionSelfAuth = client.applicationId === orionApp?.id;
    
    // Check for existing consent
    const [existingConsent] = await db
      .select()
      .from(oauthUserConsents)
      .where(
        and(
          eq(oauthUserConsents.userId, req.user!.id),
          eq(oauthUserConsents.clientId, client.id),
          eq(oauthUserConsents.scopesHash, hash),
          isNull(oauthUserConsents.revokedAt)
        )
      )
      .limit(1);
    
    if (!isOrionSelfAuth && !existingConsent) {
      // Need to get user consent - redirect to consent screen
      const consentUrl = new URL('/oauth/consent', `${req.protocol}://${req.get('host')}`);
      consentUrl.searchParams.append('client_id', client_id);
      consentUrl.searchParams.append('redirect_uri', redirect_uri);
      consentUrl.searchParams.append('response_type', response_type);
      if (scope) consentUrl.searchParams.append('scope', scope);
      if (state) consentUrl.searchParams.append('state', state);
      if (code_challenge) consentUrl.searchParams.append('code_challenge', code_challenge);
      if (code_challenge_method) consentUrl.searchParams.append('code_challenge_method', code_challenge_method);
      
      return res.redirect(consentUrl.toString());
    }
    
    // User has already consented or it's Orion self-auth - generate authorization code
    if (existingConsent) {
      // Update lastUsedAt
      await db.update(oauthUserConsents)
        .set({ lastUsedAt: new Date() })
        .where(eq(oauthUserConsents.id, existingConsent.id));
    } else if (isOrionSelfAuth) {
      // Auto-create consent for Orion self-auth
      await db.insert(oauthUserConsents).values({
        userId: req.user!.id,
        clientId: client.id,
        scopes: normalized,
        scopesHash: hash,
      });
    }
    
    const authCode = generateToken(32);
    const config = getOAuthConfig();
    const expiresAt = new Date(Date.now() + config.tokenLifetimes.authorizationCode * 1000);
    
    // Store authorization code
    await db.insert(oauthAuthorizationCodes).values({
      code: hashToken(authCode),
      clientId: client.id,
      userId: req.user!.id,
      scope: scope || null,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge || null,
      codeChallengeMethod: code_challenge_method || 'S256',
      expiresAt,
    });
    
    // Build redirect URL
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.append('code', authCode);
    if (state) {
      redirectUrl.searchParams.append('state', state);
    }
    
    res.redirect(redirectUrl.toString());
  } catch (error) {
    console.error('Error in authorization endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error',
    });
  }
});

// Simplified token endpoint
router.post('/oauth/token', express.json(), express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const {
      grant_type,
      code,
      redirect_uri,
      client_id,
      client_secret,
      code_verifier,
    } = req.body;
    
    // Only support authorization_code grant for now
    if (grant_type !== 'authorization_code') {
      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code grant is supported',
      });
    }
    
    if (!code || !redirect_uri || !client_id) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters',
      });
    }
    
    // Validate client
    const [client] = await db
      .select()
      .from(oauthClients)
      .where(
        and(
          eq(oauthClients.clientId, client_id),
          eq(oauthClients.environment, detectEnvironment())
        )
      )
      .limit(1);
    
    if (!client) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Invalid client',
      });
    }
    
    // Verify client secret if provided
    if (client_secret) {
      const validSecret = await bcrypt.compare(client_secret, client.clientSecretHash);
      if (!validSecret) {
        return res.status(401).json({
          error: 'invalid_client',
          error_description: 'Invalid client credentials',
        });
      }
    }
    
    // Find authorization code (already hashed in database)
    const authCodeRecord = await db.query.oauthAuthorizationCodes.findFirst({
      where: and(
        eq(oauthAuthorizationCodes.code, hashToken(code)),
        eq(oauthAuthorizationCodes.clientId, client.id),
        eq(oauthAuthorizationCodes.redirectUri, redirect_uri),
        gte(oauthAuthorizationCodes.expiresAt, new Date())
      ),
    });
    
    if (!authCodeRecord) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Invalid or expired authorization code',
      });
    }
    
    // Verify PKCE if present
    if (authCodeRecord.codeChallenge) {
      if (!code_verifier) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'PKCE code verifier required',
        });
      }
      
      if (!verifyPKCEChallenge(code_verifier, authCodeRecord.codeChallenge, authCodeRecord.codeChallengeMethod || 'S256')) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid PKCE code verifier',
        });
      }
    }
    
    // Delete used authorization code
    await db.delete(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.code, hashToken(code)));
    
    // Generate tokens
    const config = getOAuthConfig();
    const accessToken = generateToken(32);
    const refreshToken = generateToken(32);
    const expiresIn = config.tokenLifetimes.accessToken;
    
    // Store tokens
    const scopes = authCodeRecord.scope ? authCodeRecord.scope.split(' ') : [];
    await db.insert(oauthTokens).values({
      userId: authCodeRecord.userId,
      clientId: client.id,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      tokenType: 'Bearer',
      scopes,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    });
    
    // Build token response
    const tokenResponse: any = {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
    
    // Add ID token if OpenID Connect scope is present
    if (scopes.includes('openid')) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, authCodeRecord.userId),
      });
      
      if (user) {
        const idTokenClaims = {
          sub: user.id,
          name: user.name,
          email: user.email,
          email_verified: user.emailVerified,
        };
        
        const idToken = await jwtSigningService.signIdToken(
          user.id,
          client.clientId,
          undefined, // nonce support can be added later
          idTokenClaims
        );
        
        tokenResponse.id_token = idToken;
      }
    }
    
    res.json(tokenResponse);
  } catch (error) {
    console.error('Error in token endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error',
    });
  }
});

// Simplified userinfo endpoint
router.get('/oauth/userinfo', async (req, res) => {
  try {
    // Extract access token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'invalid_request',
        error_description: 'Missing or invalid authorization header',
      });
    }
    
    const accessToken = authHeader.slice(7);
    
    // Find token
    const tokenRecord = await db.query.oauthTokens.findFirst({
      where: and(
        eq(oauthTokens.accessTokenHash, hashToken(accessToken)),
        gte(oauthTokens.expiresAt, new Date()),
        isNull(oauthTokens.revokedAt)
      ),
    });
    
    if (!tokenRecord) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Invalid or expired access token',
      });
    }
    
    // Get user
    const user = await db.query.users.findFirst({
      where: eq(users.id, tokenRecord.userId),
    });
    
    if (!user) {
      return res.status(404).json({
        error: 'not_found',
        error_description: 'User not found',
      });
    }
    
    // Build userinfo response
    const scopes = tokenRecord.scopes || [];
    const userInfo: any = {
      sub: user.id,
    };
    
    if (scopes.includes('profile')) {
      userInfo.name = user.name;
      userInfo.preferred_username = user.username;
    }
    
    if (scopes.includes('email')) {
      userInfo.email = user.email;
      userInfo.email_verified = user.emailVerified;
    }
    
    res.json(userInfo);
  } catch (error) {
    console.error('Error in userinfo endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error',
    });
  }
});

// Consent GET endpoint - fetch application details for consent screen
router.get('/api/oauth/consent', async (req, res) => {
  try {
    const { client_id, redirect_uri, response_type, scope } = req.query;
    
    // Validate required parameters
    if (!client_id || !redirect_uri || !response_type) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing required parameters',
      });
    }
    
    // Find OAuth client
    const [client] = await db
      .select()
      .from(oauthClients)
      .where(
        and(
          eq(oauthClients.clientId, client_id as string),
          eq(oauthClients.environment, detectEnvironment())
        )
      )
      .limit(1);
    
    if (!client) {
      return res.status(404).json({
        error: 'invalid_client',
        error_description: 'Client not found',
      });
    }
    
    // Validate redirect URI
    if (!client.redirectUris?.includes(redirect_uri as string)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Invalid redirect URI',
      });
    }
    
    // Get application details
    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, client.applicationId!))
      .limit(1);
    
    if (!application) {
      return res.status(404).json({
        error: 'server_error',
        error_description: 'Application not found',
      });
    }
    
    // Return consent request details
    res.json({
      application: {
        id: application.id,
        name: application.displayName,
        description: application.description,
        logoUrl: application.logoUrl,
      },
      client_id,
      redirect_uri,
      scope: scope || '',
      response_type,
    });
  } catch (error) {
    console.error('Error in consent GET endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error',
    });
  }
});

// Consent POST endpoint - handle user approval/denial
router.post('/api/oauth/consent', express.json(), async (req, res) => {
  try {
    const { 
      client_id,
      redirect_uri,
      response_type,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      approved,
    } = req.body;
    
    // Ensure user is authenticated
    if (!req.user) {
      return res.status(401).json({
        error: 'login_required',
        error_description: 'User authentication required',
      });
    }
    
    // Find OAuth client
    const [client] = await db
      .select()
      .from(oauthClients)
      .where(
        and(
          eq(oauthClients.clientId, client_id),
          eq(oauthClients.environment, detectEnvironment())
        )
      )
      .limit(1);
    
    if (!client) {
      return res.status(404).json({
        error: 'invalid_client',
        error_description: 'Client not found',
      });
    }
    
    // Validate redirect URI
    if (!client.redirectUris?.includes(redirect_uri)) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Invalid redirect URI',
      });
    }
    
    const redirectUrl = new URL(redirect_uri);
    
    if (!approved) {
      // User denied consent
      redirectUrl.searchParams.append('error', 'access_denied');
      redirectUrl.searchParams.append('error_description', 'User denied consent');
      if (state) {
        redirectUrl.searchParams.append('state', state);
      }
      return res.json({ redirect_url: redirectUrl.toString() });
    }
    
    // User approved - store consent
    const { normalized, hash } = normalizeScopes(scope || '');
    
    // Upsert consent (update lastUsedAt if exists)
    const existingConsent = await db.query.oauthUserConsents.findFirst({
      where: and(
        eq(oauthUserConsents.userId, req.user!.id),
        eq(oauthUserConsents.clientId, client.id),
        eq(oauthUserConsents.scopesHash, hash),
        isNull(oauthUserConsents.revokedAt)
      ),
    });
    
    if (existingConsent) {
      // Update lastUsedAt
      await db.update(oauthUserConsents)
        .set({ lastUsedAt: new Date() })
        .where(eq(oauthUserConsents.id, existingConsent.id));
    } else {
      // Create new consent
      await db.insert(oauthUserConsents).values({
        userId: req.user!.id,
        clientId: client.id,
        scopes: normalized,
        scopesHash: hash,
      });
    }
    
    // Generate authorization code
    const authCode = generateToken(32);
    const config = getOAuthConfig();
    const expiresAt = new Date(Date.now() + config.tokenLifetimes.authorizationCode * 1000);
    
    // Store authorization code
    await db.insert(oauthAuthorizationCodes).values({
      code: hashToken(authCode),
      clientId: client.id,
      userId: req.user!.id,
      scope: scope || null,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge || null,
      codeChallengeMethod: code_challenge_method || 'S256',
      expiresAt,
    });
    
    // Build redirect URL with authorization code
    redirectUrl.searchParams.append('code', authCode);
    if (state) {
      redirectUrl.searchParams.append('state', state);
    }
    
    res.json({ redirect_url: redirectUrl.toString() });
  } catch (error) {
    console.error('Error in consent POST endpoint:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Internal server error',
    });
  }
});

// Simplified introspect endpoint  
router.post('/oauth/introspect', express.json(), express.urlencoded({ extended: true }), async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.json({ active: false });
    }
    
    // Find token
    const tokenRecord = await db.query.oauthTokens.findFirst({
      where: and(
        eq(oauthTokens.accessTokenHash, hashToken(token)),
        isNull(oauthTokens.revokedAt)
      ),
    });
    
    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      return res.json({ active: false });
    }
    
    // Return token info
    res.json({
      active: true,
      scope: tokenRecord.scopes?.join(' ') || '',
      exp: Math.floor(tokenRecord.expiresAt.getTime() / 1000),
      sub: tokenRecord.userId,
    });
  } catch (error) {
    console.error('Error in introspect endpoint:', error);
    res.json({ active: false });
  }
});

export default router;