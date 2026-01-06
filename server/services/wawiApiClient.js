/**
 * WAWI API Client
 * Handles authenticated requests to the WAWI external API
 */

const wawiOAuth = require('./wawiOAuth');

class WawiApiClient {
  constructor() {
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
  }

  /**
   * Gets the base URL (read at request time to ensure env is loaded)
   */
  get baseUrl() {
    return process.env.WAWI_BASE_URL;
  }

  /**
   * Validates that the API is configured
   * @throws {Error} If base URL is not configured
   */
  validateConfig() {
    if (!this.baseUrl) {
      throw new Error('WAWI_BASE_URL environment variable is not configured');
    }
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Makes an authenticated request to the WAWI API with retry logic
   * @param {string} endpoint - API endpoint (without base URL)
   * @param {Object} options - Fetch options
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<Object>} Response data
   */
  async request(endpoint, options = {}, retryCount = 0) {
    this.validateConfig();

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    try {
      const authHeader = await wawiOAuth.getAuthHeader();

      const defaultHeaders = {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      const config = {
        ...options,
        headers: {
          ...defaultHeaders,
          ...options.headers,
        },
      };

      const response = await fetch(url, config);

      // Handle 401 - token expired, refresh and retry
      if (response.status === 401) {
        if (retryCount < this.maxRetries) {
          console.log(`[WawiApiClient] 401 received, refreshing token (attempt ${retryCount + 1}/${this.maxRetries})...`);
          wawiOAuth.clearToken();

          // Wait before retry
          await this.sleep(this.retryDelay * (retryCount + 1));

          // Retry with fresh token
          return this.request(endpoint, options, retryCount + 1);
        }
        console.error('[WawiApiClient] Max retries reached for 401 error');
      }

      // Handle 429 (rate limit) or 5xx errors with retry
      if ((response.status === 429 || response.status >= 500) && retryCount < this.maxRetries) {
        console.log(`[WawiApiClient] ${response.status} received, retrying (attempt ${retryCount + 1}/${this.maxRetries})...`);
        await this.sleep(this.retryDelay * (retryCount + 1));
        return this.request(endpoint, options, retryCount + 1);
      }

      return this.handleResponse(response);
    } catch (error) {
      // Network errors - retry
      if (retryCount < this.maxRetries && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('fetch'))) {
        console.log(`[WawiApiClient] Network error, retrying (attempt ${retryCount + 1}/${this.maxRetries})...`);
        await this.sleep(this.retryDelay * (retryCount + 1));
        return this.request(endpoint, options, retryCount + 1);
      }
      throw new Error(`WAWI API request failed: ${error.message}`);
    }
  }

  /**
   * Handles API response
   * @param {Response} response - Fetch response
   * @returns {Promise<Object>} Parsed response data
   */
  async handleResponse(response) {
    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorMessage =
        typeof data === 'object'
          ? data.message || data.error || JSON.stringify(data)
          : data;

      const error = new Error(`WAWI API Error: ${response.status} - ${errorMessage}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return {
      data,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    };
  }

  /**
   * GET request
   * @param {string} endpoint
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>}
   */
  async get(endpoint, params = {}) {
    const searchParams = new URLSearchParams(params);
    const queryString = searchParams.toString();
    const url = queryString ? `${endpoint}?${queryString}` : endpoint;

    return this.request(url, { method: 'GET' });
  }

  /**
   * POST request
   * @param {string} endpoint
   * @param {Object} body - Request body
   * @returns {Promise<Object>}
   */
  async post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * PUT request
   * @param {string} endpoint
   * @param {Object} body - Request body
   * @returns {Promise<Object>}
   */
  async put(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * PATCH request
   * @param {string} endpoint
   * @param {Object} body - Request body
   * @returns {Promise<Object>}
   */
  async patch(endpoint, body = {}) {
    return this.request(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  /**
   * DELETE request
   * @param {string} endpoint
   * @returns {Promise<Object>}
   */
  async delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  /**
   * Gets current authentication status
   * @returns {Object} Auth status info
   */
  getAuthStatus() {
    return {
      baseUrl: this.baseUrl,
      token: wawiOAuth.getTokenInfo(),
    };
  }

  /**
   * Search and read records from a model
   * @param {string} model - Model name (e.g., 'res.partner', 'pos.order')
   * @param {Object} options - Search options
   * @returns {Promise<Object>}
   */
  async searchRead(model, options = {}) {
    const {
      fields = [],
      domain = [],
      limit = 100,
      offset = 0,
      order = '',
    } = options;

    const params = { model };

    if (fields.length > 0) {
      params.fields = JSON.stringify(fields);
    }
    if (domain.length > 0) {
      params.domain = JSON.stringify(domain);
    }
    if (limit) {
      params.limit = limit;
    }
    if (offset) {
      params.offset = offset;
    }
    if (order) {
      params.order = order;
    }

    return this.get('/search_read', params);
  }

  /**
   * Get customers (res.partner)
   * @param {Object} options - Search options
   * @returns {Promise<Object>}
   */
  async getCustomers(options = {}) {
    const defaultFields = ['id', 'name', 'email', 'phone', 'mobile', 'street', 'city', 'zip'];
    return this.searchRead('res.partner', {
      fields: options.fields || defaultFields,
      ...options,
    });
  }

  /**
   * Get POS orders
   * @param {Object} options - Search options
   * @returns {Promise<Object>}
   */
  async getOrders(options = {}) {
    const defaultFields = ['id', 'name', 'date_order', 'partner_id', 'amount_total', 'state'];
    return this.searchRead('pos.order', {
      fields: options.fields || defaultFields,
      ...options,
    });
  }

  /**
   * Get POS order lines
   * @param {Object} options - Search options
   * @returns {Promise<Object>}
   */
  async getOrderLines(options = {}) {
    const defaultFields = ['id', 'order_id', 'product_id', 'qty', 'price_unit', 'price_subtotal'];
    return this.searchRead('pos.order.line', {
      fields: options.fields || defaultFields,
      ...options,
    });
  }

  /**
   * Get products
   * @param {Object} options - Search options
   * @returns {Promise<Object>}
   */
  async getProducts(options = {}) {
    const defaultFields = ['id', 'name', 'list_price', 'default_code', 'categ_id'];
    return this.searchRead('product.product', {
      fields: options.fields || defaultFields,
      ...options,
    });
  }

  /**
   * Get product attributes
   * @param {Object} options - Search options
   * @returns {Promise<Object>}
   */
  async getProductAttributes(options = {}) {
    const defaultFields = ['id', 'name', 'display_type', 'create_variant', 'sequence'];
    return this.searchRead('product.attribute', {
      fields: options.fields || defaultFields,
      ...options,
    });
  }

  /**
   * Get product attribute values
   * @param {Object} options - Search options
   * @returns {Promise<Object>}
   */
  async getProductAttributeValues(options = {}) {
    const defaultFields = ['id', 'name', 'attribute_id', 'html_color', 'sequence', 'is_custom'];
    return this.searchRead('product.attribute.value', {
      fields: options.fields || defaultFields,
      ...options,
    });
  }

  /**
   * Tests the API connection by acquiring a token
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    try {
      await wawiOAuth.getToken();
      return {
        success: true,
        message: 'Successfully connected to WAWI API',
        tokenInfo: wawiOAuth.getTokenInfo(),
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        tokenInfo: wawiOAuth.getTokenInfo(),
      };
    }
  }
}

// Singleton instance
const wawiApiClient = new WawiApiClient();

module.exports = wawiApiClient;
