const DiscountOrder = require('../models/DiscountOrder');
const Discount = require('../models/Discount');
const Customer = require('../models/Customer');
const Order = require('../models/Order');

// @desc    Get all customer discounts (for Rabatt list page)
// @route   GET /api/discounts
// @access  Private
exports.getDiscounts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;

    const total = await Customer.countDocuments();

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

        const totalOrderValue = orders.reduce((sum, order) => sum + order.amountTotal, 0);
        const availableGroups = discountOrders.filter(d => d.status === 'available');

        return {
          id: customer._id,
          customerNumber: customer.ref,
          customerName: customer.name,
          email: customer.email,
          totalOrderValue,
          totalDiscountGranted: discount ? discount.totalGranted : 0,
          discountBalance: discount ? discount.balance : 0,
          redeemable: availableGroups.length > 0
        };
      })
    );

    // Calculate overall stats
    const allDiscounts = await Discount.find();
    const allOrders = await Order.find();

    const stats = {
      totalCustomers: total,
      totalOrderValue: allOrders.reduce((sum, order) => sum + order.amountTotal, 0),
      totalDiscountGranted: allDiscounts.reduce((sum, d) => sum + d.totalGranted, 0)
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

    // Get customer orders
    const orders = await Order.find({ customerId: customer._id }).sort({ orderDate: -1 });

    // Get discount wallet
    const discount = await Discount.findOne({ customerId: customer._id });

    // Get discount order groups
    const discountOrders = await DiscountOrder.find({ customerId: customer._id })
      .populate('orders.orderId')
      .sort({ createdAt: -1 });

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
        notes: discountOrders.length > 0 ? discountOrders[0].notes : ''
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
    const { orderIds, discountRate = 10 } = req.body;

    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
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

      const discountAmount = (eligibleAmount * discountRate) / 100;

      return {
        orderId: order._id,
        orderLineId: order.orderId,
        amount: eligibleAmount,
        discountRate,
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

    res.status(201).json({
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
