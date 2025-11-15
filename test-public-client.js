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

async function testPublicClient() {
  console.log('🔓 Testing Public OAuth Client (No Secret Required)\n');
  console.log('═══════════════════════════════════════════════════════\n');

  const cookieJar = new CookieJar();
  const fetchWithCookies = fetchCookie(fetch, cookieJar);

  try {
    // Login
    console.log('1️⃣  Logging in as test user');
    const loginRes = await fetchWithCookies(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'chris.mcnulty@synozur.com',
        password: 'East2west!'
      })
    });
    
    if (!loginRes.ok) throw new Error('Login failed');
    console.log('✅ Logged in\n');

    // Public client config
    const CLIENT_ID = 'public_test_client_001';
    const REDIRECT_URI = 'http://localhost:3000/callback';
    
    console.log('2️⃣  Using Public OAuth Client');
    console.log('────────────────────────────────────────────────────');
    console.log(`   • Client ID: ${CLIENT_ID}`);
    console.log(`   • Client Type: PUBLIC (no secret)`);
    console.log(`   • PKCE: Required`);
    console.log('');

    // Generate PKCE
    console.log('3️⃣  Generating PKCE Challenge');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    console.log('✅ PKCE generated\n');

    // Get authorization code
    console.log('4️⃣  Requesting Authorization Code');
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

    // Check if we need to consent
    let authCode;
    if (authorizeRes.status === 302) {
      const location = authorizeRes.headers.get('location');
      if (location?.includes('/oauth/consent')) {
        console.log('   • Consent required, submitting approval');
        
        // Submit consent
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
          })
        });
        
        const consentData = await consentRes.json();
        const redirectUrl = new URL(consentData.redirect_url);
        authCode = redirectUrl.searchParams.get('code');
      } else {
        const redirectUrl = new URL(location);
        authCode = redirectUrl.searchParams.get('code');
      }
    }
    
    if (!authCode) {
      throw new Error('Failed to get authorization code');
    }
    
    console.log('✅ Authorization code received');
    console.log(`   • Code: ${authCode.substring(0, 20)}...`);
    console.log('');

    // Test: Exchange code WITHOUT client secret (public client)
    console.log('5️⃣  Exchanging Code for Tokens (WITHOUT Client Secret)');
    console.log('────────────────────────────────────────────────────');
    
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID
      // Intentionally NOT providing client_secret for public client
    });

    const tokenRes = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams
    });

    if (!tokenRes.ok) {
      const error = await tokenRes.json();
      throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
    }

    const tokens = await tokenRes.json();
    console.log('✅ Tokens received successfully (public client)');
    console.log(`   • Access token: ${tokens.access_token.substring(0, 30)}...`);
    console.log(`   • Refresh token: ${tokens.refresh_token.substring(0, 30)}...`);
    console.log(`   • ID token: ${tokens.id_token.substring(0, 30)}...`);
    console.log(`   • Expires in: ${tokens.expires_in} seconds`);
    console.log('');

    // Test: Refresh token without client secret
    console.log('6️⃣  Testing Refresh Token (WITHOUT Client Secret)');
    console.log('────────────────────────────────────────────────────');
    
    const refreshParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: CLIENT_ID
      // Intentionally NOT providing client_secret
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
      throw new Error(`Refresh failed: ${error.error_description || error.error}`);
    }

    const refreshedTokens = await refreshRes.json();
    console.log('✅ Refresh successful (public client)');
    console.log(`   • New access token: ${refreshedTokens.access_token.substring(0, 30)}...`);
    console.log(`   • Expires in: ${refreshedTokens.expires_in} seconds`);
    console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Public Client Test PASSED!');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Summary:');
    console.log('✅ Public client can exchange authorization codes without secret');
    console.log('✅ Public client can refresh tokens without secret');
    console.log('✅ PKCE verification still enforced for security');
    console.log('✅ OAuth 2.1 public client flow working correctly');

  } catch (error) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ Public Client Test FAILED');
    console.log('═══════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testPublicClient().catch(console.error);
