/**
 * WAWI External API Controller
 * Handles interactions with the external WAWI API
 */

const { wawiApiClient, wawiOAuth } = require("../services");

// @desc    Test WAWI API connection
// @route   GET /api/wawi/test
// @access  Private
exports.testConnection = async (req, res, next) => {
  try {
    const result = await wawiApiClient.testConnection();

    res.status(result.success ? 200 : 503).json({
      success: result.success,
      message: result.message,
      data: result.tokenInfo,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get WAWI auth status
// @route   GET /api/wawi/status
// @access  Private
exports.getAuthStatus = async (req, res, next) => {
  try {
    const status = wawiApiClient.getAuthStatus();

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Refresh WAWI token manually
// @route   POST /api/wawi/refresh-token
// @access  Private
exports.refreshToken = async (req, res, next) => {
  try {
    wawiOAuth.clearToken();
    await wawiOAuth.getToken();

    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: wawiOAuth.getTokenInfo(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Proxy GET request to WAWI API
// @route   GET /api/wawi/proxy/*
// @access  Private
exports.proxyGet = async (req, res, next) => {
  try {
    const endpoint = req.params[0];
    const result = await wawiApiClient.get(endpoint, req.query);

    res.status(result.status).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        data: err.data,
      });
    }
    next(err);
  }
};

// @desc    Proxy POST request to WAWI API
// @route   POST /api/wawi/proxy/*
// @access  Private
exports.proxyPost = async (req, res, next) => {
  try {
    const endpoint = req.params[0];
    const result = await wawiApiClient.post(endpoint, req.body);

    res.status(result.status).json({
      success: true,
      data: result.data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        data: err.data,
      });
    }
    next(err);
  }
};

// @desc    Get customers from WAWI API (res.partner)
// @route   GET /api/wawi/customers
// @access  Private
exports.getCustomers = async (req, res, next) => {
  try {
    const { limit = 100, offset = 0, search } = req.query;

    const options = {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    };

    if (search) {
      options.domain = [["name", "ilike", search]];
    }

    const result = await wawiApiClient.getCustomers(options);

    res.status(200).json({
      success: true,
      count: result.data.length,
      data: result.data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        data: err.data,
      });
    }
    next(err);
  }
};

// @desc    Get single customer from WAWI API
// @route   GET /api/wawi/customers/:id
// @access  Private
exports.getCustomerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await wawiApiClient.getCustomers({
      domain: [["id", "=", parseInt(id, 10)]],
      limit: 1,
    });

    if (!result.data || result.data.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Customer not found",
      });
    }

    res.status(200).json({
      success: true,
      data: result.data[0],
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        data: err.data,
      });
    }
    next(err);
  }
};

// @desc    Get orders from WAWI API (pos.order)
// @route   GET /api/wawi/orders
// @access  Private
exports.getOrders = async (req, res, next) => {
  try {
    const { limit = 100, offset = 0, partner_id } = req.query;

    const options = {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      order: "date_order desc",
    };

    if (partner_id) {
      options.domain = [["partner_id", "=", parseInt(partner_id, 10)]];
    }

    const result = await wawiApiClient.getOrders(options);

    res.status(200).json({
      success: true,
      count: result.data.length,
      data: result.data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        data: err.data,
      });
    }
    next(err);
  }
};

// @desc    Get products from WAWI API
// @route   GET /api/wawi/products
// @access  Private
exports.getProducts = async (req, res, next) => {
  try {
    const { limit = 100, offset = 0, search } = req.query;

    const options = {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    };

    if (search) {
      options.domain = [["name", "ilike", search]];
    }

    const result = await wawiApiClient.getProducts(options);

    res.status(200).json({
      success: true,
      count: result.data.length,
      data: result.data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        data: err.data,
      });
    }
    next(err);
  }
};

// @desc    Generic search_read for any model
// @route   GET /api/wawi/search/:model
// @access  Private
exports.searchModel = async (req, res, next) => {
  try {
    const { model } = req.params;
    const { limit = 100, offset = 0, fields, domain, order } = req.query;

    const options = {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    };

    if (fields) {
      options.fields = JSON.parse(fields);
    }
    if (domain) {
      options.domain = JSON.parse(domain);
    }
    if (order) {
      options.order = order;
    }

    const result = await wawiApiClient.searchRead(model, options);

    res.status(200).json({
      success: true,
      count: result.data.length,
      data: result.data,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        success: false,
        error: err.message,
        data: err.data,
      });
    }
    next(err);
  }
};
