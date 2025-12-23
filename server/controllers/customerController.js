const Customer = require("../models/Customer");
const Order = require("../models/Order");
const Discount = require("../models/Discount");

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private
exports.getCustomers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;

    const total = await Customer.countDocuments();

    const customers = await Customer.find()
      .collation({ locale: 'de', strength: 2 })
      .sort({ name: 1 })
      .skip(startIndex)
      .limit(limit);

    // Get order counts and totals for each customer
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const orders = await Order.find({ customerId: customer._id });
        const orderCount = orders.length;
        const totalSpent = orders.reduce(
          (sum, order) => sum + order.amountTotal,
          0
        );

        // Get discount info
        const discount = await Discount.findOne({ customerId: customer._id });

        return {
          ...customer.toObject(),
          orderCount,
          totalSpent,
          discountBalance: discount ? discount.balance : 0,
          totalDiscountGranted: discount ? discount.totalGranted : 0,
        };
      })
    );

    res.status(200).json({
      success: true,
      count: customers.length,
      total,
      pagination: {
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      data: customersWithStats,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single customer
// @route   GET /api/customers/:id
// @access  Private
exports.getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Get orders for this customer
    const orders = await Order.find({ customerId: customer._id }).sort({
      orderDate: -1,
    });

    // Get discount info
    const discount = await Discount.findOne({ customerId: customer._id });

    res.status(200).json({
      success: true,
      data: {
        ...customer.toObject(),
        orders,
        orderCount: orders.length,
        totalSpent: orders.reduce((sum, order) => sum + order.amountTotal, 0),
        discountBalance: discount ? discount.balance : 0,
        totalDiscountGranted: discount ? discount.totalGranted : 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create customer
// @route   POST /api/customers
// @access  Private
exports.createCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.create(req.body);

    // Create discount wallet for customer
    await Discount.create({
      customerId: customer._id,
      partnerId: customer.contactId,
    });

    res.status(201).json({
      success: true,
      data: customer,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private
exports.updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private
exports.deleteCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    await customer.deleteOne();

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Search customers
// @route   GET /api/customers/search
// @access  Private
exports.searchCustomers = async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Please provide a search query",
      });
    }

    const customers = await Customer.find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
        { ref: { $regex: q, $options: "i" } },
      ],
    }).collation({ locale: 'de', strength: 2 }).sort({ name: 1 }).limit(20);

    res.status(200).json({
      success: true,
      count: customers.length,
      data: customers,
    });
  } catch (err) {
    next(err);
  }
};
