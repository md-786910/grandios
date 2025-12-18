/**
 * WAWI API OAuth2 Client Credentials Service
 * Handles token acquisition, caching, auto-refresh, and .env persistence
 */

const fs = require('fs');
const path = require('path');

class WawiOAuthService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.tokenType = 'Bearer';
    this.envPath = path.join(__dirname, '..', '.env');

    // Buffer time (in seconds) before expiry to trigger refresh
    this.expiryBuffer = 60;

    // Load token from .env if exists
    this.loadTokenFromEnv();
  }

  /**
   * Loads cached token from .env file
   */
  loadTokenFromEnv() {
    if (process.env.WAWI_ACCESS_TOKEN && process.env.WAWI_TOKEN_EXPIRY) {
      const expiry = parseInt(process.env.WAWI_TOKEN_EXPIRY, 10);
      if (expiry > Date.now()) {
        this.accessToken = process.env.WAWI_ACCESS_TOKEN;
        this.tokenExpiry = expiry;
        console.log('[WawiOAuth] Loaded cached token from .env');
      }
    }
  }

  /**
   * Saves token to .env file
   */
  saveTokenToEnv() {
    try {
      let envContent = fs.readFileSync(this.envPath, 'utf8');

      // Update or add WAWI_ACCESS_TOKEN
      if (envContent.includes('WAWI_ACCESS_TOKEN=')) {
        envContent = envContent.replace(
          /WAWI_ACCESS_TOKEN=.*/,
          `WAWI_ACCESS_TOKEN=${this.accessToken}`
        );
      } else {
        envContent += `\nWAWI_ACCESS_TOKEN=${this.accessToken}`;
      }

      // Update or add WAWI_TOKEN_EXPIRY
      if (envContent.includes('WAWI_TOKEN_EXPIRY=')) {
        envContent = envContent.replace(
          /WAWI_TOKEN_EXPIRY=.*/,
          `WAWI_TOKEN_EXPIRY=${this.tokenExpiry}`
        );
      } else {
        envContent += `\nWAWI_TOKEN_EXPIRY=${this.tokenExpiry}`;
      }

      fs.writeFileSync(this.envPath, envContent);
      console.log('[WawiOAuth] Token saved to .env');
    } catch (error) {
      console.error('[WawiOAuth] Failed to save token to .env:', error.message);
    }
  }

  /**
   * Validates required environment variables
   * @throws {Error} If required env vars are missing
   */
  validateConfig() {
    const required = ['WAWI_TOKEN_URL', 'WAWI_CLIENT_ID', 'WAWI_CLIENT_SECRET'];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required WAWI OAuth2 configuration: ${missing.join(', ')}`
      );
    }
  }

  /**
   * Checks if current token is valid and not expired
   * @returns {boolean}
   */
  isTokenValid() {
    if (!this.accessToken || !this.tokenExpiry) {
      return false;
    }

    const now = Date.now();
    const expiryWithBuffer = this.tokenExpiry - this.expiryBuffer * 1000;

    return now < expiryWithBuffer;
  }

  /**
   * Acquires a new access token using client_credentials grant
   * @returns {Promise<string>} Access token
   * @throws {Error} If token acquisition fails
   */
  async acquireToken() {
    this.validateConfig();

    const tokenUrl = process.env.WAWI_TOKEN_URL;
    const clientId = process.env.WAWI_CLIENT_ID;
    const clientSecret = process.env.WAWI_CLIENT_SECRET;

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        throw new Error(
          `OAuth2 token request failed: ${response.status} - ${
            errorData.error_description || errorData.message || 'Unknown error'
          }`
        );
      }

      const data = await response.json();

      // Validate response structure
      if (!data.access_token) {
        throw new Error('OAuth2 response missing access_token');
      }

      // Store token and calculate expiry
      this.accessToken = data.access_token;
      this.tokenType = data.token_type || 'Bearer';

      // Set expiry (default to 1 hour if not provided)
      const expiresIn = data.expires_in || 3600;
      this.tokenExpiry = Date.now() + expiresIn * 1000;

      console.log(
        `[WawiOAuth] Token acquired successfully, expires in ${expiresIn}s`
      );

      // Persist token to .env
      this.saveTokenToEnv();

      return this.accessToken;
    } catch (error) {
      // Clear any stale token on error
      this.clearToken();

      if (error.message.includes('OAuth2')) {
        throw error;
      }

      throw new Error(`OAuth2 token request failed: ${error.message}`);
    }
  }

  /**
   * Gets a valid access token (from cache or acquires new one)
   * @returns {Promise<string>} Valid access token
   */
  async getToken() {
    if (this.isTokenValid()) {
      return this.accessToken;
    }

    return this.acquireToken();
  }

  /**
   * Gets the authorization header value
   * @returns {Promise<string>} Authorization header value (e.g., "Bearer xxx")
   */
  async getAuthHeader() {
    const token = await this.getToken();
    return `${this.tokenType} ${token}`;
  }

  /**
   * Clears the cached token (useful for forced refresh)
   */
  clearToken() {
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Gets token info for debugging
   * @returns {Object} Token info
   */
  getTokenInfo() {
    return {
      hasToken: !!this.accessToken,
      tokenType: this.tokenType,
      isValid: this.isTokenValid(),
      expiresAt: this.tokenExpiry ? new Date(this.tokenExpiry).toISOString() : null,
      expiresIn: this.tokenExpiry
        ? Math.max(0, Math.floor((this.tokenExpiry - Date.now()) / 1000))
        : 0,
    };
  }
}

// Singleton instance
const wawiOAuth = new WawiOAuthService();

module.exports = wawiOAuth;
