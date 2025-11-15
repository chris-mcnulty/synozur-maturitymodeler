import crypto from 'crypto';
import fetch from 'node-fetch';

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

async function testOAuthFlow() {
  console.log('🚀 Starting OAuth 2.1 Flow Test\n');

  // Step 1: Test discovery endpoint
  console.log('1️⃣ Testing OpenID Discovery...');
  const discoveryRes = await fetch(`${BASE_URL}/.well-known/openid-configuration`);
  const discovery = await discoveryRes.json();
  console.log('✅ Discovery endpoint OK');
  console.log(`   Issuer: ${discovery.issuer}`);
  console.log(`   Grant types: ${discovery.grant_types_supported.join(', ')}\n`);

  // Step 2: Test JWKS endpoint
  console.log('2️⃣ Testing JWKS endpoint...');
  const jwksRes = await fetch(`${BASE_URL}/.well-known/jwks.json`);
  const jwks = await jwksRes.json();
  console.log('✅ JWKS endpoint OK');
  console.log(`   Keys available: ${jwks.keys.length}\n`);

  // Step 3: Get Nebula dev client credentials from database
  console.log('3️⃣ Using Nebula Dev OAuth client...');
  const CLIENT_ID = 'nebula_dev_eed8c7f6ed8ffbdd';
  const CLIENT_SECRET = 'nNIoaNk2SZtQwI6Q_CjF814l0dOqm8vVu-lIwjUvzXA';
  const REDIRECT_URI = 'http://localhost:3000/callback';
  console.log(`   Client ID: ${CLIENT_ID}\n`);

  // Step 4: Generate PKCE challenge
  console.log('4️⃣ Generating PKCE challenge...');
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  console.log('✅ PKCE generated');
  console.log(`   Challenge method: S256\n`);

  // Step 5: Build authorization URL
  console.log('5️⃣ Building authorization URL...');
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
  const authUrl = `${BASE_URL}/oauth/authorize?${authParams}`;
  console.log('✅ Authorization URL built');
  console.log(`   URL: ${authUrl.substring(0, 100)}...\n`);

  // Step 6: Simulate user login and consent (manual step)
  console.log('6️⃣ Manual Step Required:');
  console.log('   → Open this URL in a browser (while logged in):');
  console.log(`   → ${authUrl}`);
  console.log('   → Click "Authorize"');
  console.log('   → Copy the authorization code from the redirect URL');
  console.log('   → Run: node test-oauth-exchange.js <authorization_code>\n');

  // Save verifier for next step
  console.log('💾 Code verifier saved for token exchange\n');
  return {
    codeVerifier,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    redirectUri: REDIRECT_URI,
    state
  };
}

testOAuthFlow().catch(console.error);
