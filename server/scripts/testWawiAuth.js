#!/usr/bin/env node
/**
 * Test script for WAWI OAuth2 Authentication
 * Run: node scripts/testWawiAuth.js
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const wawiOAuth = require('../services/wawiOAuth');
const wawiApiClient = require('../services/wawiApiClient');

async function testAuth() {
  console.log('\n=== WAWI OAuth2 Authentication Test ===\n');

  // Check configuration
  console.log('1. Checking configuration...');
  console.log('   WAWI_BASE_URL:', process.env.WAWI_BASE_URL || 'NOT SET');
  console.log('   WAWI_TOKEN_URL:', process.env.WAWI_TOKEN_URL || 'NOT SET');
  console.log(
    '   WAWI_CLIENT_ID:',
    process.env.WAWI_CLIENT_ID ? `${process.env.WAWI_CLIENT_ID.substring(0, 10)}...` : 'NOT SET'
  );
  console.log('   WAWI_CLIENT_SECRET:', process.env.WAWI_CLIENT_SECRET ? '****' : 'NOT SET');

  // Test token acquisition
  console.log('\n2. Testing token acquisition...');
  try {
    const result = await wawiApiClient.testConnection();

    if (result.success) {
      console.log('   ✓ Token acquired successfully!');
      console.log('   Token Type:', result.tokenInfo.tokenType);
      console.log('   Valid:', result.tokenInfo.isValid);
      console.log('   Expires At:', result.tokenInfo.expiresAt);
      console.log('   Expires In:', result.tokenInfo.expiresIn, 'seconds');
    } else {
      console.log('   ✗ Token acquisition failed:', result.message);
    }
  } catch (error) {
    console.log('   ✗ Error:', error.message);
  }

  // Test token caching
  console.log('\n3. Testing token caching...');
  const firstToken = wawiOAuth.accessToken;
  try {
    await wawiOAuth.getToken();
    const secondToken = wawiOAuth.accessToken;

    if (firstToken === secondToken) {
      console.log('   ✓ Token caching works (same token returned)');
    } else {
      console.log('   ! New token acquired (previous may have been invalid)');
    }
  } catch (error) {
    console.log('   ✗ Error:', error.message);
  }

  // Display final status
  console.log('\n4. Final auth status:');
  const status = wawiApiClient.getAuthStatus();
  console.log('   Base URL:', status.baseUrl);
  console.log('   Token Valid:', status.token.isValid);
  console.log('   Has Token:', status.token.hasToken);

  console.log('\n=== Test Complete ===\n');
}

testAuth().catch(console.error);
