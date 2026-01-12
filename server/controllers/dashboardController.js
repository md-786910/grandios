const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Discount = require('../models/Discount');

// @desc    Get dashboard stats
// @route   GET /api/dashboard/stats
// @access  Private
exports.getStats = async (req, res, next) => {
  try {
    // Get counts
    const customerCount = await Customer.countDocuments();
    const orderCount = await Order.countDocuments();

    // Get totals
    const orders = await Order.find();
    const discounts = await Discount.find();

    const totalOrderValue = orders.reduce((sum, order) => sum + order.amountTotal, 0);
    const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0);
    const totalDiscountGranted = discounts.reduce((sum, d) => sum + d.totalGranted, 0);

    res.status(200).json({
      success: true,
      data: {
        totalDiscountGranted,
        totalItemsSold: totalItems,
        totalCustomers: customerCount,
        totalOrders: orderCount,
        totalOrderValue
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get recent orders with pagination
// @route   GET /api/dashboard/recent-orders
// @access  Private
exports.getRecentOrders = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;

    const total = await Order.countDocuments();
    const orders = await Order.find()
      .populate('customerId', 'name ref contactId')
      .sort({ orderDate: -1 })
      .skip(startIndex)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: orders.length,
      total,
      pagination: {
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      data: orders
    });
  } catch (err) {
    next(err);
  }
};
