const DiscountOrder = require('../models/DiscountOrder');
const Discount = require('../models/Discount');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const OrderCustomerQueue = require('../models/OrderCustomerQueue');
const AppSettings = require('../models/AppSettings');

// @desc    Get all customer discounts (for Rabatt list page)
// @route   GET /api/discounts
// @access  Private
exports.getDiscounts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;

    const total = await Customer.countDocuments();
    const settings = await AppSettings.getSettings();

    const customers = await Customer.find()
      .skip(startIndex)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Get stats for each customer
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const orders = await Order.find({ customerId: customer._id });
        const discount = await Discount.findOne({ customerId: customer._id });
        const discountOrders = await DiscountOrder.find({ customerId: customer._id });
        const queue = await OrderCustomerQueue.findOne({ customerId: customer._id });

        const totalOrderValue = orders.reduce((sum, order) => sum + order.amountTotal, 0);
        const availableGroups = discountOrders.filter(d => d.status === 'available');

        return {
          id: customer._id,
          customerId: customer._id,
          customerNumber: customer.ref,
          customerName: customer.name,
          email: customer.email,
          totalOrderValue,
          totalDiscountGranted: discount ? discount.totalGranted : 0,
          discountBalance: discount ? discount.balance : 0,
          redeemable: availableGroups.length > 0,
          // Queue information
          queueCount: queue ? queue.orderCount : 0,
          queueStatus: queue ? queue.status : 'pending',
          readyForDiscount: queue ? queue.orderCount >= settings.ordersRequiredForDiscount : false,
          ordersRequiredForDiscount: settings.ordersRequiredForDiscount
        };
      })
    );

    // Calculate overall stats
    const allDiscounts = await Discount.find();
    const allOrders = await Order.find();
    const allQueues = await OrderCustomerQueue.find();

    const stats = {
      totalCustomers: total,
      totalOrderValue: allOrders.reduce((sum, order) => sum + order.amountTotal, 0),
      totalDiscountGranted: allDiscounts.reduce((sum, d) => sum + d.totalGranted, 0),
      // Queue stats
      totalInQueue: allQueues.reduce((sum, q) => sum + q.orderCount, 0),
      customersReadyForDiscount: allQueues.filter(q => q.orderCount >= settings.ordersRequiredForDiscount).length,
      ordersRequiredForDiscount: settings.ordersRequiredForDiscount,
      discountRate: settings.discountRate
    };

    res.status(200).json({
      success: true,
      count: customers.length,
      total,
      stats,
      pagination: {
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      data: customersWithStats
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get customer discount details (for Rabatt detail page)
// @route   GET /api/discounts/:customerId
// @access  Private
exports.getCustomerDiscount = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const settings = await AppSettings.getSettings();

    // Get customer orders
    const orders = await Order.find({ customerId: customer._id }).sort({ orderDate: -1 });

    // Get discount wallet
    const discount = await Discount.findOne({ customerId: customer._id });

    // Get discount order groups
    const discountOrders = await DiscountOrder.find({ customerId: customer._id })
      .populate('orders.orderId')
      .sort({ createdAt: -1 });

    // Get queue information
    const queue = await OrderCustomerQueue.findOne({ customerId: customer._id })
      .populate('orders.orderId', 'posReference orderDate amountTotal items');

    // Calculate stats
    const totalOrderValue = orders.reduce((sum, order) => sum + order.amountTotal, 0);
    const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0);

    res.status(200).json({
      success: true,
      data: {
        customer: {
          id: customer._id,
          customerNumber: customer.ref,
          customerName: customer.name,
          email: customer.email,
          phone: customer.phone || customer.mobile,
          address: customer.address
        },
        stats: {
          totalOrderValue,
          totalDiscountGranted: discount ? discount.totalGranted : 0,
          discountBalance: discount ? discount.balance : 0,
          orderCount: orders.length,
          itemCount: totalItems
        },
        orders,
        discountGroups: discountOrders,
        notes: discountOrders.length > 0 ? discountOrders[0].notes : '',
        // Queue information
        queue: queue ? {
          orderCount: queue.orderCount,
          status: queue.status,
          orders: queue.orders,
          readyForDiscount: queue.orderCount >= settings.ordersRequiredForDiscount
        } : {
          orderCount: 0,
          status: 'pending',
          orders: [],
          readyForDiscount: false
        },
        settings: {
          discountRate: settings.discountRate,
          ordersRequiredForDiscount: settings.ordersRequiredForDiscount
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create discount order group (combine orders)
// @route   POST /api/discounts/:customerId/groups
// @access  Private
exports.createDiscountGroup = async (req, res, next) => {
  try {
    const { orderIds, discountRate } = req.body;
    const settings = await AppSettings.getSettings();
    const effectiveDiscountRate = discountRate || settings.discountRate;

    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Validate exact order count for group
    if (orderIds.length !== settings.ordersRequiredForDiscount) {
      return res.status(400).json({
        success: false,
        message: `Exactly ${settings.ordersRequiredForDiscount} orders required per discount group`
      });
    }

    // Check if any orders are already in a discount group
    const existingGroups = await DiscountOrder.find({ customerId: customer._id });
    const usedOrderIds = new Set();
    existingGroups.forEach(group => {
      group.orders.forEach(o => {
        usedOrderIds.add(o.orderId.toString());
      });
    });

    const alreadyUsedOrders = orderIds.filter(id => usedOrderIds.has(id.toString()));
    if (alreadyUsedOrders.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some orders are already in a discount group'
      });
    }

    // Get orders
    const orders = await Order.find({ _id: { $in: orderIds } });

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid orders found'
      });
    }

    // Calculate discount for each order
    const orderItems = orders.map(order => {
      const eligibleAmount = order.items
        .filter(item => item.discountEligible)
        .reduce((sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity), 0);

      const discountAmount = (eligibleAmount * effectiveDiscountRate) / 100;

      return {
        orderId: order._id,
        orderLineId: order.orderId,
        amount: eligibleAmount,
        discountRate: effectiveDiscountRate,
        discountAmount
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

    // Update customer's total discount granted
    customer.totalDiscountGranted = (customer.totalDiscountGranted || 0) + discountOrder.totalDiscount;
    await customer.save();

    res.status(201).json({
      success: true,
      data: discountOrder
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update discount order group (edit orders in group)
// @route   PUT /api/discounts/:customerId/groups/:groupId
// @access  Private
exports.updateDiscountGroup = async (req, res, next) => {
  try {
    const { orderIds, discountRate } = req.body;
    const settings = await AppSettings.getSettings();
    const effectiveDiscountRate = discountRate || settings.discountRate;

    const discountOrder = await DiscountOrder.findById(req.params.groupId);

    if (!discountOrder) {
      return res.status(404).json({
        success: false,
        message: 'Discount group not found'
      });
    }

    // Cannot edit redeemed groups
    if (discountOrder.status === 'redeemed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit a redeemed discount group'
      });
    }

    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Validate exact order count
    if (orderIds.length !== settings.ordersRequiredForDiscount) {
      return res.status(400).json({
        success: false,
        message: `Exactly ${settings.ordersRequiredForDiscount} orders required per discount group`
      });
    }

    // Get current orders in this group
    const currentOrderIds = discountOrder.orders.map(o => o.orderId.toString());

    // Check if any of the new orders are already in OTHER discount groups
    const otherGroups = await DiscountOrder.find({
      customerId: customer._id,
      _id: { $ne: discountOrder._id }
    });
    const usedOrderIds = new Set();
    otherGroups.forEach(group => {
      group.orders.forEach(o => {
        usedOrderIds.add(o.orderId.toString());
      });
    });

    const alreadyUsedOrders = orderIds.filter(id => usedOrderIds.has(id.toString()));
    if (alreadyUsedOrders.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Some orders are already in another discount group'
      });
    }

    // Store old discount amount for wallet adjustment
    const oldTotalDiscount = discountOrder.totalDiscount;

    // Get new orders
    const orders = await Order.find({ _id: { $in: orderIds } });

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid orders found'
      });
    }

    // Calculate discount for each order
    const orderItems = orders.map(order => {
      const eligibleAmount = order.items
        .filter(item => item.discountEligible)
        .reduce((sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity), 0);

      const discountAmount = (eligibleAmount * effectiveDiscountRate) / 100;

      return {
        orderId: order._id,
        orderLineId: order.orderId,
        amount: eligibleAmount,
        discountRate: effectiveDiscountRate,
        discountAmount
      };
    });

    // Update the discount order group
    discountOrder.orders = orderItems;
    await discountOrder.save();

    // Calculate new total discount
    const newTotalDiscount = discountOrder.totalDiscount;
    const discountDifference = newTotalDiscount - oldTotalDiscount;

    // Update customer's discount wallet
    const discount = await Discount.findOne({ customerId: customer._id });

    if (discount && discountDifference !== 0) {
      discount.balance += discountDifference;
      discount.totalGranted += discountDifference;
      await discount.save();
    }

    // Update customer's total discount granted
    if (discountDifference !== 0) {
      customer.totalDiscountGranted = (customer.totalDiscountGranted || 0) + discountDifference;
      await customer.save();
    }

    res.status(200).json({
      success: true,
      data: discountOrder
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Redeem discount group (Tilgen -> Eingelöst)
// @route   PUT /api/discounts/:customerId/groups/:groupId/redeem
// @access  Private
exports.redeemDiscountGroup = async (req, res, next) => {
  try {
    const discountOrder = await DiscountOrder.findById(req.params.groupId);

    if (!discountOrder) {
      return res.status(404).json({
        success: false,
        message: 'Discount group not found'
      });
    }

    if (discountOrder.status === 'redeemed') {
      return res.status(400).json({
        success: false,
        message: 'Discount already redeemed'
      });
    }

    // Update status to redeemed
    discountOrder.status = 'redeemed';
    discountOrder.redeemedAt = new Date();
    await discountOrder.save();

    // Update customer wallet
    const discount = await Discount.findOne({ customerId: discountOrder.customerId });

    if (discount) {
      await discount.redeemDiscount(discountOrder.totalDiscount);
    }

    // Update customer's wallet and total redeemed amount
    const customer = await Customer.findById(discountOrder.customerId);
    if (customer) {
      // Add redeemed discount to customer wallet
      customer.wallet = (customer.wallet || 0) + discountOrder.totalDiscount;
      // Track total redeemed amount
      customer.totalDiscountRedeemed = (customer.totalDiscountRedeemed || 0) + discountOrder.totalDiscount;
      await customer.save();
    }

    res.status(200).json({
      success: true,
      data: discountOrder
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update customer notes
// @route   PUT /api/discounts/:customerId/notes
// @access  Private
exports.updateNotes = async (req, res, next) => {
  try {
    const { notes } = req.body;

    // Update notes on the latest discount order or create one
    let discountOrder = await DiscountOrder.findOne({ customerId: req.params.customerId })
      .sort({ createdAt: -1 });

    if (discountOrder) {
      discountOrder.notes = notes;
      await discountOrder.save();
    }

    res.status(200).json({
      success: true,
      data: { notes }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete discount group
// @route   DELETE /api/discounts/:customerId/groups/:groupId
// @access  Private
exports.deleteDiscountGroup = async (req, res, next) => {
  try {
    const discountOrder = await DiscountOrder.findById(req.params.groupId);

    if (!discountOrder) {
      return res.status(404).json({
        success: false,
        message: 'Discount group not found'
      });
    }

    // If not yet redeemed, remove from wallet
    if (discountOrder.status === 'available') {
      const discount = await Discount.findOne({ customerId: discountOrder.customerId });

      if (discount) {
        discount.balance -= discountOrder.totalDiscount;
        discount.totalGranted -= discountOrder.totalDiscount;
        await discount.save();
      }
    }

    await discountOrder.deleteOne();

    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (err) {
    next(err);
  }
};
