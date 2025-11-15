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

async function testAuthenticationEnforcement() {
  console.log('🛡️  Testing Client Authentication Enforcement\n');
  console.log('═══════════════════════════════════════════════════════\n');

  const cookieJar = new CookieJar();
  const fetchWithCookies = fetchCookie(fetch, cookieJar);

  try {
    // Login
    console.log('1️⃣  Setting up test');
    const loginRes = await fetchWithCookies(`${BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'chris.mcnulty@synozur.com',
        password: 'East2west!'
      })
    });
    
    if (!loginRes.ok) throw new Error('Login failed');
    
    const CLIENT_ID = 'nebula_dev_eed8c7f6ed8ffbdd';
    const REDIRECT_URI = 'https://e790b9bb-142e-4283-ad40-0d97909b078e-00-2m5ydpw5a67dn.spock.replit.dev/auth/callback';

    // Get authorization code
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
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

    const location = authorizeRes.headers.get('location');
    const redirectUrl = new URL(location);
    const authCode = redirectUrl.searchParams.get('code');
    console.log('✅ Got test authorization code\n');

    // Test 1: Missing client credentials entirely
    console.log('2️⃣  Test: Request without any client credentials');
    console.log('────────────────────────────────────────────────────');
    
    const tokenParams1 = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID
      // Intentionally omitting client_secret
    });

    const tokenRes1 = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams1
    });

    if (tokenRes1.ok) {
      console.log('❌ FAILED: Token endpoint accepted request without client authentication');
      process.exit(1);
    }

    const error1 = await tokenRes1.json();
    if (error1.error === 'invalid_client') {
      console.log('✅ PASS: Request rejected with invalid_client');
      console.log(`   Error: ${error1.error_description}`);
    } else {
      console.log(`❌ FAILED: Wrong error code: ${error1.error}`);
      process.exit(1);
    }
    console.log('');

    // Test 2: Wrong client secret
    console.log('3️⃣  Test: Request with invalid client secret');
    console.log('────────────────────────────────────────────────────');
    
    const tokenParams2 = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID,
      client_secret: 'wrong_secret_123456789'
    });

    const tokenRes2 = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams2
    });

    if (tokenRes2.ok) {
      console.log('❌ FAILED: Token endpoint accepted invalid client secret');
      process.exit(1);
    }

    const error2 = await tokenRes2.json();
    if (error2.error === 'invalid_client') {
      console.log('✅ PASS: Invalid secret rejected with invalid_client');
      console.log(`   Error: ${error2.error_description}`);
    } else {
      console.log(`❌ FAILED: Wrong error code: ${error2.error}`);
      process.exit(1);
    }
    console.log('');

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Client Authentication Enforcement Test PASSED!');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Summary:');
    console.log('✅ Requests without client_secret are rejected');
    console.log('✅ Requests with invalid client_secret are rejected');
    console.log('✅ Proper error codes returned (invalid_client)');
    console.log('✅ OAuth 2.1 security requirements enforced');

  } catch (error) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ Authentication Enforcement Test FAILED');
    console.log('═══════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testAuthenticationEnforcement().catch(console.error);
