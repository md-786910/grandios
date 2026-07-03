const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Discount = require('../models/Discount');
const CustomerPurchaseHistory = require('../models/CustomerPurchaseHistory');
const OldPurchase = require('../models/OldPurchase');
const { getStichtag } = require('../utils/stichtag');
const { buildPurchaseFeed } = require('../utils/purchaseFeed');

// @desc    Get dashboard stats
// @route   GET /api/dashboard/stats
// @access  Private
exports.getStats = async (req, res, next) => {
  try {
    // Only post-cutoff WAWI orders count (pre-cutoff is owned by the sheet).
    const stichtag = getStichtag();
    const orderMatch = stichtag ? { orderDate: { $gte: stichtag } } : {};

    // Get counts
    const customerCount = await Customer.countDocuments();
    const orderCount = await Order.countDocuments(orderMatch);

    // WAWI totals (post-cutoff)
    const orders = await Order.find(orderMatch);
    const discounts = await Discount.find();

    const wawiOrderValue = orders.reduce((sum, order) => sum + order.amountTotal, 0);
    // Line items live in the OrderLine collection (order.orderLines refs) for
    // WAWI-synced orders; the embedded items[] array is only populated for some
    // legacy orders. Count whichever is present so synced purchases contribute.
    const wawiItems = orders.reduce(
      (sum, order) =>
        sum + (order.items?.length || order.orderLines?.length || 0),
      0,
    );
    const wawiGranted = discounts.reduce((sum, d) => sum + d.totalGranted, 0);

    // Sheet baseline (from the Excel import): granted + purchase value from CPH,
    // and the sheet purchase count from OldPurchase (one row per EK).
    // Only count rows linked to a real (matched) customer, so the totals equal
    // the sum of customers actually shown on the Bonus list (consistent pages).
    const cphAgg = await CustomerPurchaseHistory.aggregate([
      { $match: { customerId: { $ne: null } } },
      {
        $group: {
          _id: null,
          purchases: { $sum: "$totalPurchaseAmount" },
          granted: { $sum: "$totalRabatt" },
        },
      },
    ]);
    const sheetGranted = cphAgg[0]?.granted || 0;
    const sheetPurchaseValue = cphAgg[0]?.purchases || 0;
    const sheetItemCount = await OldPurchase.countDocuments({
      customerId: { $ne: null },
    });

    // Combined = sheet baseline (pre-cutoff) + WAWI (post-cutoff)
    res.status(200).json({
      success: true,
      data: {
        totalDiscountGranted: wawiGranted + sheetGranted,
        totalItemsSold: wawiItems + sheetItemCount,
        totalCustomers: customerCount,
        totalOrders: orderCount,
        totalOrderValue: wawiOrderValue + sheetPurchaseValue
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

    // Overview feed: post-cutoff WAWI orders on top (pre-cutoff is owned by the
    // sheet), then ALL sheet purchases below — same merge as the Einkäufe list.
    const stichtag = getStichtag();
    const orderMatch = stichtag ? { orderDate: { $gte: stichtag } } : {};

    const { data, total, pagination } = await buildPurchaseFeed({
      orderFilter: orderMatch,
      sheetFilter: {},
      page,
      limit,
      withDiscountStatus: false,
    });

    res.status(200).json({
      success: true,
      count: data.length,
      total,
      pagination,
      data
    });
  } catch (err) {
    next(err);
  }
};
