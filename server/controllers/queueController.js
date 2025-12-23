const OrderCustomerQueue = require('../models/OrderCustomerQueue');
const DiscountOrder = require('../models/DiscountOrder');
const Discount = require('../models/Discount');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const AppSettings = require('../models/AppSettings');

// @desc    Add order to customer queue
// @route   Called internally when order is created
// @access  Internal
exports.addOrderToQueue = async (orderId, customerId) => {
  try {
    // Find or create queue for customer
    let queue = await OrderCustomerQueue.findOne({ customerId });

    if (!queue) {
      queue = new OrderCustomerQueue({
        customerId,
        orders: []
      });
    }

    // Check if order is already in queue
    const orderExists = queue.orders.some(o => o.orderId.toString() === orderId.toString());
    if (orderExists) {
      return { success: false, message: 'Order already in queue' };
    }

    // Add order to queue
    queue.orders.push({ orderId, addedAt: new Date() });
    await queue.save();

    // Check if we should auto-create discount (always enabled)
    const settings = await AppSettings.getSettings();

    if (queue.orderCount >= settings.ordersRequiredForDiscount) {
      // Auto-create discount group
      const result = await exports.processQueue(customerId);
      return {
        success: true,
        message: 'Order added and discount created',
        discountCreated: true,
        discountResult: result
      };
    }

    return {
      success: true,
      message: 'Order added to queue',
      queueCount: queue.orderCount,
      discountCreated: false
    };
  } catch (err) {
    console.error('Error adding order to queue:', err);
    throw err;
  }
};

// @desc    Process queue and create discount (when 3+ orders)
// @route   Called internally or via API
// @access  Internal/Private
exports.processQueue = async (customerId) => {
  try {
    const queue = await OrderCustomerQueue.findOne({ customerId });

    if (!queue || queue.orderCount < 3) {
      return { success: false, message: 'Not enough orders in queue' };
    }

    const settings = await AppSettings.getSettings();
    const requiredOrders = settings.ordersRequiredForDiscount;

    // Take only the required number of orders (default 3)
    const ordersToProcess = queue.orders.slice(0, requiredOrders);
    const orderIds = ordersToProcess.map(o => o.orderId);

    // Get order details
    const orders = await Order.find({ _id: { $in: orderIds } });

    if (orders.length === 0) {
      return { success: false, message: 'No valid orders found' };
    }

    // Get customer
    const customer = await Customer.findById(customerId);

    if (!customer) {
      return { success: false, message: 'Customer not found' };
    }

    // Calculate discount for each order
    // Each order gets a unique bundleIndex (single orders, not bundles) for automatic creation
    const discountRate = settings.discountRate;
    const orderItems = orders.map((order, index) => {
      const eligibleAmount = order.items
        .filter(item => item.discountEligible)
        .reduce((sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity), 0);

      const discountAmount = (eligibleAmount * discountRate) / 100;

      return {
        orderId: order._id,
        orderLineId: order.orderId,
        amount: eligibleAmount,
        discountRate,
        discountAmount,
        bundleIndex: index  // Each order is a separate item (single order, not bundle)
      };
    });

    // Create discount order group
    const discountOrder = await DiscountOrder.create({
      customerId: customer._id,
      partnerId: customer.contactId,
      orders: orderItems,
      status: 'available'
    });

    // Update customer's discount wallet
    let discount = await Discount.findOne({ customerId: customer._id });

    if (!discount) {
      discount = await Discount.create({
        customerId: customer._id,
        partnerId: customer.contactId
      });
    }

    await discount.addDiscount(discountOrder.totalDiscount);

    // Remove processed orders from queue
    queue.orders = queue.orders.filter(
      o => !orderIds.some(id => id.toString() === o.orderId.toString())
    );
    await queue.save();

    return {
      success: true,
      message: 'Discount group created',
      discountOrder,
      totalDiscount: discountOrder.totalDiscount
    };
  } catch (err) {
    console.error('Error processing queue:', err);
    throw err;
  }
};

// @desc    Get all queues
// @route   GET /api/queue
// @access  Private
exports.getQueues = async (req, res, next) => {
  try {
    const queues = await OrderCustomerQueue.find()
      .populate('customerId', 'name email ref')
      .populate('orders.orderId', 'posReference orderDate amountTotal items')
      .sort({ updatedAt: -1 });

    const settings = await AppSettings.getSettings();

    // Get stats
    const totalInQueue = await OrderCustomerQueue.countDocuments();
    const readyForDiscount = await OrderCustomerQueue.countDocuments({
      orderCount: { $gte: settings.ordersRequiredForDiscount }
    });
    const pendingOrders = await OrderCustomerQueue.aggregate([
      { $group: { _id: null, total: { $sum: '$orderCount' } } }
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalCustomersInQueue: totalInQueue,
        readyForDiscount,
        totalOrdersInQueue: pendingOrders[0]?.total || 0,
        ordersRequiredForDiscount: settings.ordersRequiredForDiscount
      },
      data: queues
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get queue for specific customer
// @route   GET /api/queue/:customerId
// @access  Private
exports.getCustomerQueue = async (req, res, next) => {
  try {
    const queue = await OrderCustomerQueue.findOne({ customerId: req.params.customerId })
      .populate('customerId', 'name email ref')
      .populate('orders.orderId', 'posReference orderDate amountTotal items');

    if (!queue) {
      return res.status(200).json({
        success: true,
        data: {
          customerId: req.params.customerId,
          orders: [],
          orderCount: 0,
          status: 'pending'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: queue
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Manually process queue for customer
// @route   POST /api/queue/:customerId/process
// @access  Private
exports.processCustomerQueue = async (req, res, next) => {
  try {
    const result = await exports.processQueue(req.params.customerId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

// @desc    Remove order from queue
// @route   DELETE /api/queue/:customerId/orders/:orderId
// @access  Private
exports.removeOrderFromQueue = async (req, res, next) => {
  try {
    const queue = await OrderCustomerQueue.findOne({ customerId: req.params.customerId });

    if (!queue) {
      return res.status(404).json({
        success: false,
        message: 'Queue not found'
      });
    }

    // Remove order from queue
    queue.orders = queue.orders.filter(
      o => o.orderId.toString() !== req.params.orderId
    );
    await queue.save();

    res.status(200).json({
      success: true,
      data: queue
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Clear customer queue
// @route   DELETE /api/queue/:customerId
// @access  Private
exports.clearCustomerQueue = async (req, res, next) => {
  try {
    await OrderCustomerQueue.findOneAndDelete({ customerId: req.params.customerId });

    res.status(200).json({
      success: true,
      message: 'Queue cleared'
    });
  } catch (err) {
    next(err);
  }
};
