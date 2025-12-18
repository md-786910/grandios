/**
 * Sync Controller
 * Handles WAWI data synchronization endpoints
 */

const syncService = require('../services/wawiSyncService');
const cascadeSyncService = require('../services/cascadingSyncService');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const OrderLine = require('../models/OrderLine');
const Product = require('../models/Product');
const ProductAttribute = require('../models/ProductAttribute');
const ProductAttributeValue = require('../models/ProductAttributeValue');
const DiscountOrder = require('../models/DiscountOrder');

// @desc    Get sync status
// @route   GET /api/sync/status
// @access  Private
exports.getSyncStatus = async (req, res, next) => {
  try {
    const status = syncService.getSyncStatus();

    // Add counts from database
    const [customerCount, orderCount, orderLineCount, productCount, attributeCount, attributeValueCount] = await Promise.all([
      Customer.countDocuments(),
      Order.countDocuments(),
      OrderLine.countDocuments(),
      Product.countDocuments(),
      ProductAttribute.countDocuments(),
      ProductAttributeValue.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...status,
        dbCounts: {
          customers: customerCount,
          orders: orderCount,
          orderLines: orderLineCount,
          products: productCount,
          productAttributes: attributeCount,
          productAttributeValues: attributeValueCount,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Sync customers from WAWI
// @route   POST /api/sync/customers
// @access  Private
exports.syncCustomers = async (req, res, next) => {
  try {
    const status = syncService.getSyncStatus();
    if (status.isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Sync already in progress',
        data: status,
      });
    }

    // Run sync asynchronously
    syncService.syncCustomers()
      .then(result => console.log('[Sync] Customers completed:', result))
      .catch(err => console.error('[Sync] Customers failed:', err));

    res.status(202).json({
      success: true,
      message: 'Customer sync started',
      data: syncService.getSyncStatus(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Sync orders from WAWI
// @route   POST /api/sync/orders
// @access  Private
exports.syncOrders = async (req, res, next) => {
  try {
    const status = syncService.getSyncStatus();
    if (status.isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Sync already in progress',
        data: status,
      });
    }

    syncService.syncOrders()
      .then(result => console.log('[Sync] Orders completed:', result))
      .catch(err => console.error('[Sync] Orders failed:', err));

    res.status(202).json({
      success: true,
      message: 'Order sync started',
      data: syncService.getSyncStatus(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Sync products from WAWI
// @route   POST /api/sync/products
// @access  Private
exports.syncProducts = async (req, res, next) => {
  try {
    const status = syncService.getSyncStatus();
    if (status.isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Sync already in progress',
        data: status,
      });
    }

    syncService.syncProducts()
      .then(result => console.log('[Sync] Products completed:', result))
      .catch(err => console.error('[Sync] Products failed:', err));

    res.status(202).json({
      success: true,
      message: 'Product sync started',
      data: syncService.getSyncStatus(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Run full sync (customers, orders, products)
// @route   POST /api/sync/full
// @access  Private
exports.runFullSync = async (req, res, next) => {
  try {
    const status = syncService.getSyncStatus();
    if (status.isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Sync already in progress',
        data: status,
      });
    }

    syncService.runFullSync()
      .then(result => console.log('[Sync] Full sync completed:', result))
      .catch(err => console.error('[Sync] Full sync failed:', err));

    res.status(202).json({
      success: true,
      message: 'Full sync started',
      data: syncService.getSyncStatus(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get synced customers with pagination
// @route   GET /api/sync/data/customers
// @access  Private
exports.getCustomers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    const query = {};
    if (search) {
      const searchConditions = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { ref: { $regex: search, $options: 'i' } },
      ];

      // If search is a number, also search by contactId
      const searchNum = parseInt(search, 10);
      if (!isNaN(searchNum)) {
        searchConditions.push({ contactId: searchNum });
      }

      query.$or = searchConditions;
    }

    const [customers, total] = await Promise.all([
      Customer.find(query)
        .sort({ syncedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Customer.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: customers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get synced orders with pagination
// @route   GET /api/sync/data/orders
// @access  Private
exports.getOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const customerId = req.query.customerId;
    const skip = (page - 1) * limit;

    const query = {};
    if (customerId) {
      query.customerId = customerId;
    }

    const [orders, total] = await Promise.all([
      Order.find(query)
        .populate('customerId', 'name email ref contactId')
        .populate({
          path: 'orderLines',
          populate: {
            path: 'productRef',
            select: 'name image listPrice defaultCode',
          },
        })
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single order with order lines
// @route   GET /api/sync/data/orders/:orderId
// @access  Private
exports.getOrderById = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate('customerId', 'name email ref contactId phone mobile address')
      .populate({
        path: 'orderLines',
        populate: {
          path: 'productRef',
          select: 'name image listPrice defaultCode barcode categoryName',
        },
      })
      .lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get synced products with pagination
// @route   GET /api/sync/data/products
// @access  Private
exports.getProducts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    const query = { active: true };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { defaultCode: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
      ];
    }

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Sync product attributes from WAWI
// @route   POST /api/sync/attributes
// @access  Private
exports.syncProductAttributes = async (req, res, next) => {
  try {
    const status = syncService.getSyncStatus();
    if (status.isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Sync already in progress',
        data: status,
      });
    }

    syncService.syncProductAttributes()
      .then(result => console.log('[Sync] Product attributes completed:', result))
      .catch(err => console.error('[Sync] Product attributes failed:', err));

    res.status(202).json({
      success: true,
      message: 'Product attribute sync started',
      data: syncService.getSyncStatus(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Sync product attribute values from WAWI
// @route   POST /api/sync/attribute-values
// @access  Private
exports.syncProductAttributeValues = async (req, res, next) => {
  try {
    const status = syncService.getSyncStatus();
    if (status.isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Sync already in progress',
        data: status,
      });
    }

    syncService.syncProductAttributeValues()
      .then(result => console.log('[Sync] Product attribute values completed:', result))
      .catch(err => console.error('[Sync] Product attribute values failed:', err));

    res.status(202).json({
      success: true,
      message: 'Product attribute value sync started',
      data: syncService.getSyncStatus(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get synced product attributes with pagination
// @route   GET /api/sync/data/attributes
// @access  Private
exports.getProductAttributes = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const search = req.query.search || '';
    const skip = (page - 1) * limit;

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const [attributes, total] = await Promise.all([
      ProductAttribute.find(query)
        .sort({ sequence: 1, name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProductAttribute.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: attributes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get synced product attribute values with pagination
// @route   GET /api/sync/data/attribute-values
// @access  Private
exports.getProductAttributeValues = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const search = req.query.search || '';
    const attributeId = req.query.attributeId;
    const skip = (page - 1) * limit;

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    if (attributeId) {
      query.wawiAttributeId = parseInt(attributeId, 10);
    }

    const [values, total] = await Promise.all([
      ProductAttributeValue.find(query)
        .populate('attributeId', 'name displayType')
        .sort({ sequence: 1, name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProductAttributeValue.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: values,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get synced order lines with pagination
// @route   GET /api/sync/data/order-lines
// @access  Private
exports.getOrderLines = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50;
    const orderId = req.query.orderId;
    const productId = req.query.productId;
    const skip = (page - 1) * limit;

    const query = {};
    if (orderId) {
      query.orderId = orderId;
    }
    if (productId) {
      query.productId = parseInt(productId, 10);
    }

    const [orderLines, total] = await Promise.all([
      OrderLine.find(query)
        .populate('orderId', 'posReference orderDate amountTotal')
        .populate('productRef', 'name defaultCode')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      OrderLine.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: orderLines,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ============================================
// CASCADING SYNC ENDPOINTS
// ============================================

// @desc    Get cascade sync status
// @route   GET /api/sync/cascade/status
// @access  Private
exports.getCascadeStatus = async (req, res, next) => {
  try {
    const status = cascadeSyncService.getCascadeStatus();
    const discountGroupCount = await DiscountOrder.countDocuments();

    res.status(200).json({
      success: true,
      data: {
        ...status,
        discountGroups: discountGroupCount,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Sync single customer with all related data (orders, products, discount)
// @route   POST /api/sync/cascade/customer/:contactId
// @access  Private
exports.syncCustomerCascade = async (req, res, next) => {
  try {
    const { contactId } = req.params;

    if (!contactId) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID is required',
      });
    }

    // Run sync asynchronously
    cascadeSyncService.syncCustomerWithRelatedData(parseInt(contactId, 10))
      .then(result => console.log('[CascadeSync] Customer sync completed:', result))
      .catch(err => console.error('[CascadeSync] Customer sync failed:', err));

    res.status(202).json({
      success: true,
      message: `Cascade sync started for customer ${contactId}`,
      data: cascadeSyncService.getCascadeStatus(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Run full cascade sync (all customers with orders, products, discounts)
// @route   POST /api/sync/cascade/full
// @access  Private
exports.runCascadeSync = async (req, res, next) => {
  try {
    const status = cascadeSyncService.getCascadeStatus();
    if (status.isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Cascade sync already in progress',
        data: status,
      });
    }

    // Run sync asynchronously
    cascadeSyncService.runFullCascadeSync()
      .then(result => console.log('[CascadeSync] Full sync completed:', result))
      .catch(err => console.error('[CascadeSync] Full sync failed:', err));

    res.status(202).json({
      success: true,
      message: 'Full cascade sync started',
      data: cascadeSyncService.getCascadeStatus(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Run incremental sync (recent orders only)
// @route   POST /api/sync/cascade/incremental
// @access  Private
exports.runIncrementalSync = async (req, res, next) => {
  try {
    const status = cascadeSyncService.getCascadeStatus();
    if (status.isRunning) {
      return res.status(409).json({
        success: false,
        error: 'Sync already in progress',
        data: status,
      });
    }

    const hoursBack = parseInt(req.query.hoursBack, 10) || 24;

    // Run sync asynchronously
    cascadeSyncService.runIncrementalSync({ hoursBack })
      .then(result => console.log('[CascadeSync] Incremental sync completed:', result?.progress))
      .catch(err => console.error('[CascadeSync] Incremental sync failed:', err));

    res.status(202).json({
      success: true,
      message: `Incremental sync started (last ${hoursBack} hours)`,
      data: cascadeSyncService.getCascadeStatus(),
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get scheduler status
// @route   GET /api/sync/scheduler/status
// @access  Private
exports.getSchedulerStatus = async (req, res, next) => {
  try {
    const scheduler = require('../services/scheduler');
    const status = scheduler.getSchedulerStatus();

    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get discount groups with pagination
// @route   GET /api/sync/data/discount-groups
// @access  Private
exports.getDiscountGroups = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const customerId = req.query.customerId;
    const status = req.query.status;
    const skip = (page - 1) * limit;

    const query = {};
    if (customerId) {
      query.customerId = customerId;
    }
    if (status) {
      query.status = status;
    }

    const [groups, total] = await Promise.all([
      DiscountOrder.find(query)
        .populate('customerId', 'name email contactId')
        .populate('orders.orderId', 'posReference orderDate amountTotal')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DiscountOrder.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      data: groups,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};
