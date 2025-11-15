// Environment detection and configuration for OAuth 2.0 identity provider

export type Environment = 'development' | 'staging' | 'production';

// Detect the current environment based on domain or env variables
export function detectEnvironment(): Environment {
  const domain = process.env.REPLIT_DOMAINS?.split(',')[0] || '';
  const nodeEnv = process.env.NODE_ENV;
  
  // Check for explicit environment variable first
  if (process.env.OAUTH_ENVIRONMENT === 'production') {
    return 'production';
  } else if (process.env.OAUTH_ENVIRONMENT === 'staging') {
    return 'staging';
  } else if (process.env.OAUTH_ENVIRONMENT === 'development') {
    return 'development';
  }
  
  // Check domain patterns
  if (domain) {
    if (domain.includes('production') || domain.includes('prod.')) {
      return 'production';
    }
    if (domain.includes('staging') || domain.includes('stage.')) {
      return 'staging';
    }
  }
  
  // Default based on NODE_ENV
  if (nodeEnv === 'production') {
    // In Replit, we treat production mode as staging unless explicitly set
    return 'staging';
  }
  
  return 'development';
}

// Get the base URL for the current environment
export function getBaseUrl(): string {
  const replitUrl = process.env.REPLIT_URL;
  const replitDomains = process.env.REPLIT_DOMAINS?.split(',') || [];
  const env = detectEnvironment();
  
  // In production, use the primary domain
  if (env === 'production' && replitDomains.length > 0) {
    // Look for a custom domain or use the first one
    const customDomain = replitDomains.find(d => !d.includes('.repl.co') && !d.includes('.replit.dev'));
    return `https://${customDomain || replitDomains[0]}`;
  }
  
  // For dev and staging, use the Replit URL or domains
  if (replitDomains.length > 0) {
    return `https://${replitDomains[0]}`;
  }
  
  if (replitUrl) {
    return replitUrl;
  }
  
  // Fallback for local development
  return 'http://localhost:5000';
}

// OAuth configuration per environment
export interface OAuthConfig {
  environment: Environment;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  introspectionEndpoint: string;
  jwksUri: string;
  registrationEndpoint?: string;
  tokenLifetimes: {
    authorizationCode: number; // seconds
    accessToken: number; // seconds
    refreshToken: number; // seconds
    idToken: number; // seconds
  };
  security: {
    requirePKCE: boolean;
    requireConsent: boolean;
    allowedScopes: string[];
  };
}

export function getOAuthConfig(): OAuthConfig {
  const env = detectEnvironment();
  const baseUrl = getBaseUrl();
  
  const config: OAuthConfig = {
    environment: env,
    issuer: baseUrl,
    authorizationEndpoint: `${baseUrl}/oauth/authorize`,
    tokenEndpoint: `${baseUrl}/oauth/token`,
    userInfoEndpoint: `${baseUrl}/oauth/userinfo`,
    introspectionEndpoint: `${baseUrl}/oauth/introspect`,
    jwksUri: `${baseUrl}/.well-known/jwks.json`,
    registrationEndpoint: env === 'development' ? `${baseUrl}/oauth/register` : undefined,
    tokenLifetimes: {
      authorizationCode: 10 * 60, // 10 minutes
      accessToken: 60 * 60, // 1 hour
      refreshToken: 30 * 24 * 60 * 60, // 30 days
      idToken: 60 * 60, // 1 hour
    },
    security: {
      requirePKCE: true, // Always require PKCE for OAuth 2.1 compliance
      requireConsent: true, // Always show consent screen
      allowedScopes: [
        'openid', // OpenID Connect
        'profile', // User profile information
        'email', // Email address
        'offline_access', // Refresh tokens
        'orion:read', // Read access to Orion data
        'orion:write', // Write access to Orion data
        'nebula:read', // Read access to Nebula data
        'nebula:write', // Write access to Nebula data
        'vega:read', // Read access to Vega data
        'vega:write', // Write access to Vega data
      ],
    },
  };
  
  // Environment-specific overrides
  if (env === 'production') {
    // Stricter security in production
    config.tokenLifetimes.authorizationCode = 5 * 60; // 5 minutes
    config.tokenLifetimes.accessToken = 30 * 60; // 30 minutes
  } else if (env === 'development') {
    // Longer lifetimes for easier testing in development
    config.tokenLifetimes.accessToken = 24 * 60 * 60; // 24 hours
    config.tokenLifetimes.refreshToken = 90 * 24 * 60 * 60; // 90 days
  }
  
  return config;
}

// Helper to validate redirect URIs based on environment
export function isValidRedirectUri(clientRedirectUri: string, requestedUri: string, environment: Environment): boolean {
  // Exact match is always valid
  if (clientRedirectUri === requestedUri) {
    return true;
  }
  
  // In development, allow localhost variations
  if (environment === 'development') {
    const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/;
    if (localhostPattern.test(clientRedirectUri) && localhostPattern.test(requestedUri)) {
      // Extract paths for comparison
      const clientPath = new URL(clientRedirectUri).pathname;
      const requestedPath = new URL(requestedUri).pathname;
      return clientPath === requestedPath;
    }
  }
  
  return false;
}

// Helper to generate the OpenID Connect discovery document
export function getDiscoveryDocument() {
  const config = getOAuthConfig();
  
  return {
    issuer: config.issuer,
    authorization_endpoint: config.authorizationEndpoint,
    token_endpoint: config.tokenEndpoint,
    userinfo_endpoint: config.userInfoEndpoint,
    introspection_endpoint: config.introspectionEndpoint,
    jwks_uri: config.jwksUri,
    registration_endpoint: config.registrationEndpoint,
    scopes_supported: config.security.allowedScopes,
    response_types_supported: ['code', 'token', 'id_token', 'code id_token', 'code token', 'id_token token', 'code id_token token'],
    response_modes_supported: ['query', 'fragment'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
    claims_supported: [
      'sub', 'name', 'email', 'email_verified', 'preferred_username',
      'tenant_id', 'tenant_name', 'roles', 'application_roles',
    ],
    code_challenge_methods_supported: ['S256', 'plain'],
    ui_locales_supported: ['en'],
  };
}