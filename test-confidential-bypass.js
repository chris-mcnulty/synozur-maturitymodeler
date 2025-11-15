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

async function testConfidentialClientBypass() {
  console.log('🔒 Testing Confidential Client Authentication Enforcement\n');
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

    // Confidential client (Nebula Dev)
    const CLIENT_ID = 'nebula_dev_eed8c7f6ed8ffbdd';
    const CLIENT_SECRET = 'nNIoaNk2SZtQwI6Q_CjF814l0dOqm8vVu-lIwjUvzXA';
    const REDIRECT_URI = 'https://e790b9bb-142e-4283-ad40-0d97909b078e-00-2m5ydpw5a67dn.spock.replit.dev/auth/callback';
    
    console.log('2️⃣  Using Confidential OAuth Client (Nebula Dev)');
    console.log('────────────────────────────────────────────────────');
    console.log(`   • Client ID: ${CLIENT_ID}`);
    console.log(`   • Client Type: CONFIDENTIAL (has secret)`);
    console.log('');

    // Generate PKCE
    console.log('3️⃣  Generating PKCE Challenge');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    console.log('✅ PKCE generated\n');

    // Get authorization code
    console.log('4️⃣  Requesting Authorization Code');
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
    
    if (!authCode) {
      throw new Error('Failed to get authorization code');
    }
    
    console.log('✅ Authorization code received\n');

    // ATTACK 1: Try to exchange code WITHOUT providing client_secret
    console.log('🚨 ATTACK 1: Exchange code WITHOUT client_secret');
    console.log('────────────────────────────────────────────────────');
    
    const tokenParams1 = new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
      client_id: CLIENT_ID
      // Intentionally OMITTING client_secret
    });

    const tokenRes1 = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams1
    });

    if (tokenRes1.ok) {
      const tokens = await tokenRes1.json();
      console.log('❌ SECURITY BREACH: Got tokens without secret!');
      console.log(`   • Access token: ${tokens.access_token?.substring(0, 20)}...`);
      throw new Error('CRITICAL: Confidential client bypassed authentication!');
    } else {
      const error1 = await tokenRes1.json();
      if (error1.error === 'invalid_client') {
        console.log('✅ PASS: Request properly rejected');
        console.log(`   • Error: ${error1.error}`);
        console.log(`   • Description: ${error1.error_description}`);
        console.log('');
      } else {
        throw new Error(`Unexpected error: ${error1.error}`);
      }
    }

    // Get a valid refresh token first
    console.log('5️⃣  Getting valid refresh token (with secret)');
    const validTokenRes = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: REDIRECT_URI,
        code_verifier: codeVerifier,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET
      })
    });

    if (!validTokenRes.ok) {
      throw new Error('Failed to get valid tokens');
    }

    const validTokens = await validTokenRes.json();
    console.log('✅ Got valid tokens\n');

    // ATTACK 2: Try to refresh token WITHOUT providing client_secret
    console.log('🚨 ATTACK 2: Refresh token WITHOUT client_secret');
    console.log('────────────────────────────────────────────────────');
    
    const refreshParams = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: validTokens.refresh_token,
      client_id: CLIENT_ID
      // Intentionally OMITTING client_secret
    });

    const refreshRes = await fetch(`${BASE_URL}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: refreshParams
    });

    if (refreshRes.ok) {
      const refreshedTokens = await refreshRes.json();
      console.log('❌ SECURITY BREACH: Refreshed tokens without secret!');
      console.log(`   • New access token: ${refreshedTokens.access_token?.substring(0, 20)}...`);
      throw new Error('CRITICAL: Confidential client bypassed authentication on refresh!');
    } else {
      const error2 = await refreshRes.json();
      if (error2.error === 'invalid_client') {
        console.log('✅ PASS: Refresh properly rejected');
        console.log(`   • Error: ${error2.error}`);
        console.log(`   • Description: ${error2.error_description}`);
        console.log('');
      } else {
        throw new Error(`Unexpected error: ${error2.error}`);
      }
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Confidential Client Authentication Enforcement PASSED!');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Summary:');
    console.log('✅ Confidential clients cannot exchange auth codes without secret');
    console.log('✅ Confidential clients cannot refresh tokens without secret');
    console.log('✅ Proper error codes returned (invalid_client)');
    console.log('✅ No authentication bypass vulnerability');

  } catch (error) {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ Test FAILED');
    console.log('═══════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testConfidentialClientBypass().catch(console.error);
