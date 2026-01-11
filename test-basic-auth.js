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

async function testBasicAuthFlow() {
  console.log('🔐 Testing HTTP Basic Authentication Support\n');
  console.log('═══════════════════════════════════════════════════════\n');

  const cookieJar = new CookieJar();
  const fetchWithCookies = fetchCookie(fetch, cookieJar);

  try {
    // Login
    console.log('1️⃣  Logging in');
    const loginRes = await fetchWithCookies(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: process.env.TEST_USERNAME,
        password: process.env.TEST_PASSWORD
      })
    });
    
    if (!loginRes.ok) throw new Error('Login failed');
    console.log('✅ Logged in\n');

    // OAuth client credentials
    const CLIENT_ID = process.env.TEST_CLIENT_ID;
    const CLIENT_SECRET = process.env.TEST_CLIENT_SECRET;
    const REDIRECT_URI = process.env.TEST_REDIRECT_URI;

    // Generate PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString('base64url');

    console.log('2️⃣  Getting authorization code');
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

    const location = authorizeRes.headers.get('location');
    const redirectUrl = new URL(location);
    const authCode = redirectUrl.searchParams.get('code');
    console.log(`✅ Got authorization code\n`);

    // Test 1: HTTP Basic auth (standard OAuth 2.0 method)
    console.log('3️⃣  Testing HTTP Basic Authentication');
    console.log('────────────────────────────────────────────────────');
    
    const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    const tokenParams1 = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier
    });

    const tokenRes1 = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: tokenParams1
    });

    if (!tokenRes1.ok) {
      const error = await tokenRes1.json();
      throw new Error(`Basic auth failed: ${error.error_description || error.error}`);
    }

    const tokens1 = await tokenRes1.json();
    console.log('✅ HTTP Basic authentication successful');
    console.log(`   • Access token: ${tokens1.access_token.substring(0, 30)}...`);
    console.log(`   • Refresh token: ${tokens1.refresh_token.substring(0, 30)}...`);
    console.log('');

    // Test 2: Refresh with Basic auth
    console.log('4️⃣  Testing Refresh Token with HTTP Basic Auth');
    console.log('────────────────────────────────────────────────────');
    
    const refreshParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens1.refresh_token
    });

    const refreshRes = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`
      },
      body: refreshParams
    });

    if (!refreshRes.ok) {
      const error = await refreshRes.json();
      throw new Error(`Refresh with Basic auth failed: ${error.error_description || error.error}`);
    }

    const tokens2 = await refreshRes.json();
    console.log('✅ Refresh token with HTTP Basic auth successful');
    console.log(`   • New access token: ${tokens2.access_token.substring(0, 30)}...`);
    console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 HTTP Basic Authentication Test PASSED!');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Summary:');
    console.log('✅ Token endpoint accepts HTTP Basic authentication');
    console.log('✅ Refresh token works with HTTP Basic auth');
    console.log('✅ Credentials parsed correctly from Authorization header');

  } catch (error) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ HTTP Basic Auth Test FAILED');
    console.log('═══════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testBasicAuthFlow().catch(console.error);
