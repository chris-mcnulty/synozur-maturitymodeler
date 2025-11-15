// Simplified OAuth 2.1 endpoints for initial implementation
import express, { Router } from 'express';
import { db } from './db';
import { 
  oauthClients, 
  oauthAuthorizationCodes, 
  oauthTokens, 
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
    const client = await db.query.oauthClients.findFirst({
      where: and(
        eq(oauthClients.clientId, client_id),
        eq(oauthClients.environment, detectEnvironment())
      ),
    });
    
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
    if (!req.isAuthenticated()) {
      // Save OAuth parameters in session
      req.session.oauthRequest = {
        response_type,
        client_id,
        redirect_uri,
        scope,
        state,
        code_challenge,
        code_challenge_method,
      };
      
      // Return login required response
      return res.status(401).json({
        error: 'login_required',
        error_description: 'User authentication required',
        login_url: `/login?returnUrl=${encodeURIComponent(req.originalUrl)}`,
      });
    }
    
    // For now, auto-approve consent (TODO: implement consent screen)
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
    const client = await db.query.oauthClients.findFirst({
      where: and(
        eq(oauthClients.clientId, client_id),
        eq(oauthClients.environment, detectEnvironment())
      ),
    });
    
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
    
    // Find authorization code
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