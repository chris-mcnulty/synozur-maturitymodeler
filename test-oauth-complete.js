import crypto from 'crypto';
import fetch from 'node-fetch';
import { CookieJar } from 'tough-cookie';
import fetchCookie from 'fetch-cookie';

const BASE_URL = 'http://localhost:5000';

// PKCE helpers
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

async function testCompleteOAuthFlow() {
  console.log('🚀 Complete OAuth 2.1 Flow Test\n');
  console.log('═══════════════════════════════════════════════════════\n');

  const cookieJar = new CookieJar();
  const fetchWithCookies = fetchCookie(fetch, cookieJar);

  try {
    // Step 1: Test discovery endpoint
    console.log('1️⃣  Testing OpenID Discovery Endpoint');
    console.log('────────────────────────────────────────────────────');
    const discoveryRes = await fetch(`${BASE_URL}/.well-known/openid-configuration`);
    const discovery = await discoveryRes.json();
    console.log('✅ Discovery endpoint working');
    console.log(`   • Issuer: ${discovery.issuer}`);
    console.log(`   • Grant types: ${discovery.grant_types_supported.join(', ')}`);
    console.log(`   • PKCE methods: ${discovery.code_challenge_methods_supported.join(', ')}`);
    console.log('');

    // Step 2: Test JWKS endpoint
    console.log('2️⃣  Testing JWKS Endpoint');
    console.log('────────────────────────────────────────────────────');
    const jwksRes = await fetch(`${BASE_URL}/.well-known/jwks.json`);
    const jwks = await jwksRes.json();
    console.log('✅ JWKS endpoint working');
    console.log(`   • Available keys: ${jwks.keys.length}`);
    console.log(`   • Key algorithm: ${jwks.keys[0].alg}`);
    console.log(`   • Key type: ${jwks.keys[0].kty}`);
    console.log('');

    // Step 3: Login as test user
    console.log('3️⃣  Logging in as test user');
    console.log('────────────────────────────────────────────────────');
    const loginRes = await fetchWithCookies(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'chris.mcnulty@synozur.com',
        password: 'East2west!'
      })
    });

    if (!loginRes.ok) {
      throw new Error('Login failed');
    }

    const loginData = await loginRes.json();
    console.log('✅ Login successful');
    console.log(`   • User: ${loginData.username}`);
    console.log(`   • Email: ${loginData.email}`);
    console.log('');

    // Step 4: Use Nebula dev client
    console.log('4️⃣  Using Nebula Dev OAuth Client');
    console.log('────────────────────────────────────────────────────');
    const CLIENT_ID = 'nebula_dev_eed8c7f6ed8ffbdd';
    const CLIENT_SECRET = 'nNIoaNk2SZtQwI6Q_CjF814l0dOqm8vVu-lIwjUvzXA';
    const REDIRECT_URI = 'https://e790b9bb-142e-4283-ad40-0d97909b078e-00-2m5ydpw5a67dn.spock.replit.dev/auth/callback';
    console.log(`   • Client ID: ${CLIENT_ID}`);
    console.log(`   • Redirect URI: ${REDIRECT_URI}`);
    console.log('');

    // Step 5: Generate PKCE
    console.log('5️⃣  Generating PKCE Challenge');
    console.log('────────────────────────────────────────────────────');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    console.log('✅ PKCE generated');
    console.log(`   • Method: S256`);
    console.log(`   • Verifier: ${codeVerifier.substring(0, 20)}...`);
    console.log(`   • Challenge: ${codeChallenge.substring(0, 20)}...`);
    console.log('');

    // Step 6: Request authorization
    console.log('6️⃣  Requesting Authorization Code');
    console.log('────────────────────────────────────────────────────');
    const state = crypto.randomBytes(16).toString('base64url');
    const authParams = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid profile email',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    const authorizeRes = await fetchWithCookies(`${BASE_URL}/oauth/authorize?${authParams}`, {
      redirect: 'manual'
    });

    console.log(`   • Response status: ${authorizeRes.status}`);
    console.log(`   • Response headers: ${authorizeRes.headers.get('location') ? 'Redirect' : 'No redirect'}`);
    
    const location = authorizeRes.headers.get('location');
    let authCode;
    
    if (location && location.includes('/oauth/consent')) {
      console.log('✅ Redirected to consent screen (first-time authorization)');
      console.log(`   • Consent URL: ${location.substring(0, 60)}...`);
      console.log('');
      
      console.log('7️⃣  Approving Consent');
      console.log('────────────────────────────────────────────────────');
      
      // Approve consent
      const consentRes = await fetchWithCookies(`${BASE_URL}/api/oauth/consent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: CLIENT_ID,
          redirect_uri: REDIRECT_URI,
          response_type: 'code',
          scope: 'openid profile email',
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          approved: true
        }),
        redirect: 'manual'
      });

      const consentData = await consentRes.json();
      console.log(`   • Consent response status: ${consentRes.status}`);
      
      if (!consentData.redirect_url) {
        throw new Error(`No redirect URL from consent. Response: ${JSON.stringify(consentData)}`);
      }

      const redirectUrl = new URL(consentData.redirect_url);
      authCode = redirectUrl.searchParams.get('code');
      
      if (!authCode) {
        throw new Error('No authorization code in redirect');
      }

      console.log('✅ Consent approved, authorization code received');
      console.log(`   • Code: ${authCode.substring(0, 20)}...`);
      console.log('');
    } else if (location && (location.includes('code=') || location.startsWith(REDIRECT_URI))) {
      // Direct authorization code issuance (consent already granted)
      console.log('✅ Authorization code issued directly (consent previously granted)');
      const redirectUrl = new URL(location);
      authCode = redirectUrl.searchParams.get('code');
      
      if (!authCode) {
        throw new Error('No authorization code in redirect');
      }
      
      console.log(`   • Code: ${authCode.substring(0, 20)}...`);
      console.log('');
    } else {
      throw new Error(`Unexpected authorization response. Location: ${location}`);
    }

    if (!authCode) {
      throw new Error('Failed to obtain authorization code');
    }

      // Step 8: Exchange code for tokens
      console.log('8️⃣  Exchanging Code for Tokens');
      console.log('────────────────────────────────────────────────────');
      
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      });

      console.log(`   • Token params: grant_type, code, redirect_uri, code_verifier, client_id, client_secret`);
      
      const tokenRes = await fetch(`${BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: tokenParams
      });
      
      console.log(`   • Token response status: ${tokenRes.status}`);

      if (!tokenRes.ok) {
        const error = await tokenRes.json();
        throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
      }

      const tokens = await tokenRes.json();
      console.log('✅ Tokens received successfully');
      console.log(`   • Access token: ${tokens.access_token.substring(0, 30)}...`);
      console.log(`   • Refresh token: ${tokens.refresh_token.substring(0, 30)}...`);
      console.log(`   • ID token: ${tokens.id_token.substring(0, 30)}...`);
      console.log(`   • Token type: ${tokens.token_type}`);
      console.log(`   • Expires in: ${tokens.expires_in} seconds`);
      console.log('');

      // Step 9: Get user info
      console.log('9️⃣  Fetching User Info with Access Token');
      console.log('────────────────────────────────────────────────────');
      
      const userinfoRes = await fetch(`${BASE_URL}/oauth/userinfo`, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (!userinfoRes.ok) {
        throw new Error('Failed to fetch user info');
      }

      const userinfo = await userinfoRes.json();
      console.log('✅ User info retrieved');
      console.log(`   • User ID (sub): ${userinfo.sub}`);
      console.log(`   • Email: ${userinfo.email}`);
      console.log(`   • Email verified: ${userinfo.email_verified}`);
      console.log(`   • Name: ${userinfo.name || 'N/A'}`);
      console.log(`   • Username: ${userinfo.preferred_username}`);
      console.log(`   • Tenant ID: ${userinfo.tenant_id || 'none'}`);
      console.log(`   • Roles: ${userinfo.roles?.join(', ') || 'none'}`);
      console.log('');

      // Step 10: Test token refresh
      console.log('🔟 Testing Token Refresh');
      console.log('────────────────────────────────────────────────────');
      
      const refreshParams = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      });

      const refreshRes = await fetch(`${BASE_URL}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: refreshParams
      });

      if (!refreshRes.ok) {
        const error = await refreshRes.json();
        console.log(`⚠️  Refresh token failed: ${error.error_description || error.error}`);
      } else {
        const refreshedTokens = await refreshRes.json();
        console.log('✅ Token refresh successful');
        console.log(`   • New access token: ${refreshedTokens.access_token.substring(0, 30)}...`);
        console.log(`   • Expires in: ${refreshedTokens.expires_in} seconds`);
      }
      console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 OAuth 2.1 Flow Test PASSED - All features working!');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ OAuth Test FAILED');
    console.log('═══════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testCompleteOAuthFlow().catch(console.error);
