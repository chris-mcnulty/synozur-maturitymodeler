import crypto from 'crypto';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5000';

// Configuration from environment variables
const CLIENT_ID = process.env.OAUTH_TEST_CLIENT_ID;
const CLIENT_SECRET = process.env.OAUTH_TEST_CLIENT_SECRET;
const REDIRECT_URI = process.env.OAUTH_TEST_REDIRECT_URI || 'http://localhost:3000/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Error: OAUTH_TEST_CLIENT_ID and OAUTH_TEST_CLIENT_SECRET environment variables are required');
  process.exit(1);
}

async function exchangeCodeForTokens(authCode, codeVerifier) {
  console.log('🔄 Exchanging authorization code for tokens...\n');

  // Step 1: Exchange code for tokens
  console.log('1️⃣ Calling token endpoint...');
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    redirect_uri: REDIRECT_URI,
    code_verifier: codeVerifier
  });

  const basicAuth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  
  const tokenRes = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basicAuth}`
    },
    body: tokenParams
  });

  if (!tokenRes.ok) {
    const error = await tokenRes.json();
    throw new Error(`Token exchange failed: ${error.error_description || error.error}`);
  }

  const tokens = await tokenRes.json();
  console.log('✅ Tokens received');
  console.log(`   Access token: ${tokens.access_token.substring(0, 30)}...`);
  console.log(`   Refresh token: ${tokens.refresh_token.substring(0, 30)}...`);
  console.log(`   ID token: ${tokens.id_token.substring(0, 30)}...`);
  console.log(`   Expires in: ${tokens.expires_in} seconds\n`);

  // Step 2: Get user info
  console.log('2️⃣ Fetching user info...');
  const userinfoRes = await fetch(`${BASE_URL}/oauth/userinfo`, {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`
    }
  });

  if (!userinfoRes.ok) {
    throw new Error('Failed to fetch user info');
  }

  const userinfo = await userinfoRes.json();
  console.log('✅ User info received');
  console.log(`   User ID: ${userinfo.sub}`);
  console.log(`   Email: ${userinfo.email}`);
  console.log(`   Name: ${userinfo.name}`);
  console.log(`   Username: ${userinfo.preferred_username}`);
  console.log(`   Tenant ID: ${userinfo.tenant_id || 'none'}\n`);

  // Step 3: Test token refresh
  console.log('3️⃣ Testing refresh token...');
  const refreshParams = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token
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
    console.log(`⚠️  Refresh failed: ${error.error_description || error.error}`);
  } else {
    const refreshedTokens = await refreshRes.json();
    console.log('✅ Token refresh successful');
    console.log(`   New access token: ${refreshedTokens.access_token.substring(0, 30)}...\n`);
  }

  console.log('🎉 OAuth 2.1 flow test completed successfully!\n');
}

// Get authorization code from command line
const authCode = process.argv[2];
const codeVerifier = process.argv[3];

if (!authCode || !codeVerifier) {
  console.error('Usage: node test-oauth-exchange.js <auth_code> <code_verifier>');
  process.exit(1);
}

exchangeCodeForTokens(authCode, codeVerifier).catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
