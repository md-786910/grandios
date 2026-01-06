const Order = require('../models/Order');
const Customer = require('../models/Customer');
const OrderLine = require('../models/OrderLine');
const Product = require('../models/Product');
const DiscountOrder = require('../models/DiscountOrder');
const { addOrderToQueue } = require('./queueController');

// @desc    Get all orders
// @route   GET /api/orders
// @access  Private
exports.getOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 100;
    const startIndex = (page - 1) * limit;

    // Filter by customer if provided
    const filter = {};
    if (req.query.customerId) {
      filter.customerId = req.query.customerId;
    }

    const total = await Order.countDocuments(filter);

    const orders = await Order.find(filter)
      .populate('customerId', 'name email ref contactId')
      .skip(startIndex)
      .limit(limit)
      .sort({ orderDate: -1 });

    // Get discount status for all orders
    const orderIds = orders.map(o => o._id);
    const discountOrders = await DiscountOrder.find({
      'orders.orderId': { $in: orderIds }
    });

    // Create a map of orderId -> discount status
    const discountStatusMap = {};
    discountOrders.forEach(dg => {
      dg.orders.forEach(o => {
        discountStatusMap[o.orderId.toString()] = dg.status;
      });
    });

    // Add discountStatus to each order
    const ordersWithStatus = orders.map(order => ({
      ...order.toObject(),
      discountStatus: discountStatusMap[order._id.toString()] || null
    }));

    res.status(200).json({
      success: true,
      count: ordersWithStatus.length,
      total,
      pagination: {
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      data: ordersWithStatus
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId', 'name email ref contactId phone mobile address')
      .populate({
        path: 'orderLines',
        populate: {
          path: 'productRef',
          select: 'name image listPrice defaultCode barcode categoryName attributeValues',
        },
      });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get discount status for this order
    const discountOrder = await DiscountOrder.findOne({
      'orders.orderId': order._id
    });

    const orderWithStatus = {
      ...order.toObject(),
      discountStatus: discountOrder ? discountOrder.status : null
    };

    res.status(200).json({
      success: true,
      data: orderWithStatus
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create order
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res, next) => {
  try {
    const order = await Order.create(req.body);

    // Add order to customer queue for automatic discount processing
    let queueResult = null;
    if (order.customerId) {
      try {
        queueResult = await addOrderToQueue(order._id, order.customerId);
      } catch (queueErr) {
        console.error('Error adding order to queue:', queueErr);
        // Don't fail the order creation if queue fails
      }
    }

    res.status(201).json({
      success: true,
      data: order,
      queue: queueResult
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update order
// @route   PUT /api/orders/:id
// @access  Private
exports.updateOrder = async (req, res, next) => {
  try {
    const order = await Order.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update order item
// @route   PUT /api/orders/:id/items/:itemId
// @access  Private
exports.updateOrderItem = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Find item by orderLineId
    const itemId = parseInt(req.params.itemId, 10);
    const item = order.items.find(i => i.orderLineId === itemId);

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Update item fields
    Object.assign(item, req.body);
    await order.save();

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete order item
// @route   DELETE /api/orders/:id/items/:itemId
// @access  Private
exports.deleteOrderItem = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Find item by orderLineId
    const itemId = parseInt(req.params.itemId, 10);
    const itemIndex = order.items.findIndex(i => i.orderLineId === itemId);

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Remove item
    order.items.splice(itemIndex, 1);

    // Recalculate order total
    order.amountTotal = order.items.reduce((sum, i) => sum + (i.priceSubtotalIncl * i.quantity || i.priceUnit * i.quantity), 0);

    await order.save();

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete order
// @route   DELETE /api/orders/:id
// @access  Private
exports.deleteOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    await order.deleteOne();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    next(err);
  }
};
