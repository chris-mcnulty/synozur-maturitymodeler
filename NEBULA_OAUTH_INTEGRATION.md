# Nebula OAuth Integration with Orion Identity Provider

## Objective
Integrate Nebula with Orion's OAuth 2.1 identity provider to enable Single Sign-On (SSO) for users across the Synozur ecosystem.

## OAuth Endpoints

### Development Environment
- **Base URL**: `http://localhost:5000` (or your Orion development URL)
- **Authorization**: `http://localhost:5000/oauth/authorize`
- **Token**: `http://localhost:5000/oauth/token`
- **UserInfo**: `http://localhost:5000/oauth/userinfo`
- **JWKS**: `http://localhost:5000/.well-known/jwks.json`
- **Discovery**: `http://localhost:5000/.well-known/openid-configuration`

### Production Environment
- **Base URL**: `https://orion.synozur.com` (update with actual production URL)
- **Authorization**: `https://orion.synozur.com/oauth/authorize`
- **Token**: `https://orion.synozur.com/oauth/token`
- **UserInfo**: `https://orion.synozur.com/oauth/userinfo`
- **JWKS**: `https://orion.synozur.com/.well-known/jwks.json`
- **Discovery**: `https://orion.synozur.com/.well-known/openid-configuration`

## OAuth Client Credentials

### Development
```javascript
const DEV_CONFIG = {
  client_id: 'nebula_dev',
  client_secret: '[Run seed-oauth.ts in Orion to get this]',
  redirect_uri: 'http://localhost:5001/auth/callback',
  scopes: 'openid profile email'
};
```

### Production
```javascript
const PROD_CONFIG = {
  client_id: 'nebula_prod',
  client_secret: '[Will be provided securely]',
  redirect_uri: 'https://nebula.synozur.com/auth/callback',
  scopes: 'openid profile email'
};
```

## Implementation Steps

### 1. Install Required Dependencies
```bash
npm install node-jose jsonwebtoken
```

### 2. Create OAuth Service (server/services/oauth-client.ts)
```typescript
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import jose from 'node-jose';

interface OAuthConfig {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  scopes: string;
}

export class OAuthClient {
  private config: OAuthConfig;
  private codeVerifier?: string;
  private codeChallenge?: string;
  private state?: string;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  // Generate PKCE challenge
  generatePKCE() {
    this.codeVerifier = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(this.codeVerifier).digest();
    this.codeChallenge = hash.toString('base64url');
    return {
      code_verifier: this.codeVerifier,
      code_challenge: this.codeChallenge,
      code_challenge_method: 'S256'
    };
  }

  // Generate state for CSRF protection
  generateState() {
    this.state = crypto.randomBytes(16).toString('base64url');
    return this.state;
  }

  // Build authorization URL
  getAuthorizationUrl() {
    const pkce = this.generatePKCE();
    const state = this.generateState();
    
    const params = new URLSearchParams({
      client_id: this.config.client_id,
      redirect_uri: this.config.redirect_uri,
      response_type: 'code',
      scope: this.config.scopes,
      state: state,
      code_challenge: pkce.code_challenge,
      code_challenge_method: pkce.code_challenge_method
    });

    return `${this.config.authorization_endpoint}?${params.toString()}`;
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(code: string) {
    const response = await fetch(this.config.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.config.client_id}:${this.config.client_secret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: this.config.redirect_uri,
        code_verifier: this.codeVerifier!
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error_description || 'Token exchange failed');
    }

    return response.json();
  }

  // Get user info
  async getUserInfo(accessToken: string) {
    const response = await fetch(this.config.userinfo_endpoint, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user info');
    }

    return response.json();
  }

  // Verify ID token
  async verifyIdToken(idToken: string) {
    // Fetch JWKS
    const jwksResponse = await fetch(this.config.jwks_uri);
    const jwks = await jwksResponse.json();
    
    // Create keystore
    const keystore = await jose.JWK.asKeyStore(jwks);
    
    // Verify and decode token
    const result = await jose.JWS.createVerify(keystore).verify(idToken);
    const claims = JSON.parse(result.payload.toString());
    
    // Verify standard claims
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
      throw new Error('ID token has expired');
    }
    
    if (claims.aud !== this.config.client_id) {
      throw new Error('Invalid audience in ID token');
    }
    
    return claims;
  }
}
```

### 3. Create OAuth Routes (server/routes/auth-routes.ts)
```typescript
import express from 'express';
import { OAuthClient } from '../services/oauth-client';

const router = express.Router();

// Initialize OAuth client
const oauthClient = new OAuthClient({
  client_id: process.env.OAUTH_CLIENT_ID!,
  client_secret: process.env.OAUTH_CLIENT_SECRET!,
  redirect_uri: process.env.OAUTH_REDIRECT_URI!,
  authorization_endpoint: process.env.OAUTH_AUTHORIZATION_ENDPOINT!,
  token_endpoint: process.env.OAUTH_TOKEN_ENDPOINT!,
  userinfo_endpoint: process.env.OAUTH_USERINFO_ENDPOINT!,
  jwks_uri: process.env.OAUTH_JWKS_URI!,
  scopes: 'openid profile email'
});

// Store PKCE and state in session
router.get('/auth/login', (req, res) => {
  const authUrl = oauthClient.getAuthorizationUrl();
  
  // Store OAuth state in session for validation
  req.session.oauth_state = oauthClient.state;
  req.session.code_verifier = oauthClient.codeVerifier;
  
  res.redirect(authUrl);
});

// OAuth callback
router.get('/auth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    // Validate state
    if (state !== req.session.oauth_state) {
      return res.status(400).json({ error: 'Invalid state parameter' });
    }
    
    // Restore code verifier
    oauthClient.codeVerifier = req.session.code_verifier;
    
    // Exchange code for tokens
    const tokens = await oauthClient.exchangeCodeForTokens(code as string);
    
    // Get user info
    const userInfo = await oauthClient.getUserInfo(tokens.access_token);
    
    // Verify ID token
    const idTokenClaims = await oauthClient.verifyIdToken(tokens.id_token);
    
    // Create or update user in your database
    const user = await createOrUpdateUser({
      orion_id: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
      preferred_username: userInfo.preferred_username,
      tenant_id: userInfo.tenant_id
    });
    
    // Set session
    req.session.user = user;
    req.session.access_token = tokens.access_token;
    req.session.refresh_token = tokens.refresh_token;
    
    // Redirect to dashboard
    res.redirect('/dashboard');
    
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/auth/error');
  }
});

// Logout
router.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

export default router;
```

### 4. Environment Variables (.env)
```bash
# Development
OAUTH_CLIENT_ID=nebula_dev
OAUTH_CLIENT_SECRET=[FROM_SEED_SCRIPT]
OAUTH_REDIRECT_URI=http://localhost:5001/auth/callback
OAUTH_AUTHORIZATION_ENDPOINT=http://localhost:5000/oauth/authorize
OAUTH_TOKEN_ENDPOINT=http://localhost:5000/oauth/token
OAUTH_USERINFO_ENDPOINT=http://localhost:5000/oauth/userinfo
OAUTH_JWKS_URI=http://localhost:5000/.well-known/jwks.json

# Production (use different values)
# OAUTH_CLIENT_ID=nebula_prod
# OAUTH_CLIENT_SECRET=[SECURE_SECRET]
# OAUTH_REDIRECT_URI=https://nebula.synozur.com/auth/callback
# OAUTH_AUTHORIZATION_ENDPOINT=https://orion.synozur.com/oauth/authorize
# OAUTH_TOKEN_ENDPOINT=https://orion.synozur.com/oauth/token
# OAUTH_USERINFO_ENDPOINT=https://orion.synozur.com/oauth/userinfo
# OAUTH_JWKS_URI=https://orion.synozur.com/.well-known/jwks.json
```

### 5. Frontend Integration (React)
```tsx
// client/src/pages/Login.tsx
import { Button } from '@/components/ui/button';

export function LoginPage() {
  const handleSSOLogin = () => {
    // Redirect to backend OAuth login endpoint
    window.location.href = '/auth/login';
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold">Sign in to Nebula</h2>
          <p className="mt-2 text-muted-foreground">
            Use your Synozur account to continue
          </p>
        </div>
        <Button 
          onClick={handleSSOLogin}
          className="w-full"
          size="lg"
        >
          Sign in with Synozur SSO
        </Button>
      </div>
    </div>
  );
}
```

### 6. Session Management
```typescript
// server/middleware/auth.ts
export function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

export function refreshTokenIfNeeded(req, res, next) {
  // Implement token refresh logic if access token is expired
  // Use refresh_token to get new access_token
  next();
}
```

## Testing Instructions

### 1. Get Development Client Secret
In Orion project, run:
```bash
npm run seed:oauth
```
Copy the generated client secret for nebula_dev.

### 2. Configure Environment
Add the client secret and other OAuth settings to your .env file.

### 3. Test OAuth Flow
1. Start Orion on port 5000
2. Start Nebula on port 5001
3. Navigate to Nebula's login page
4. Click "Sign in with Synozur SSO"
5. You should be redirected to Orion's login page
6. Log in with your Orion credentials
7. Approve the consent request
8. You should be redirected back to Nebula and logged in

### 4. Verify Token
Test the token introspection:
```bash
curl -X POST http://localhost:5000/oauth/introspect \
  -H "Authorization: Basic [base64(client_id:client_secret)]" \
  -d "token=[access_token]"
```

## Security Considerations

1. **PKCE**: Always use PKCE for authorization code flow
2. **State Parameter**: Validate state to prevent CSRF attacks
3. **Token Storage**: Store tokens securely in sessions
4. **HTTPS**: Use HTTPS in production
5. **Token Refresh**: Implement token refresh before expiration
6. **Logout**: Clear session and optionally notify Orion

## User Data Mapping

The UserInfo endpoint returns:
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "email_verified": true,
  "name": "User Name",
  "preferred_username": "username",
  "tenant_id": "tenant_uuid",
  "roles": ["user"],
  "updated_at": 1234567890
}
```

Map these fields to your Nebula user model as needed.

## Production Setup

1. Request production client credentials from Synozur admin
2. Update redirect URI to production URL
3. Ensure HTTPS is configured
4. Set up proper session management
5. Implement token refresh strategy
6. Add monitoring and error tracking

## Support

For issues or questions:
- Check Orion's discovery endpoint for current configuration
- Review OAuth logs in Orion for authentication failures
- Ensure redirect URIs match exactly (including trailing slashes)
- Verify client credentials are correct for the environment

## Notes
- Orion automatically approves its own authentication requests
- Users only see consent screen once per scope combination
- Tokens expire after 1 hour (access) and 30 days (refresh)
- ID tokens contain user claims for quick access