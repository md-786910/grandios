const DiscountOrder = require("../models/DiscountOrder");
const Discount = require("../models/Discount");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const OrderLine = require("../models/OrderLine");
const Product = require("../models/Product");
const OrderCustomerQueue = require("../models/OrderCustomerQueue");
const AppSettings = require("../models/AppSettings");

// Helper to get order items from either orderLines (WAWI) or items (legacy)
function getOrderItems(order) {
  // If order has populated orderLines, use them
  if (order.orderLines && order.orderLines.length > 0) {
    return order.orderLines.map((line) => ({
      orderLineId: line.orderLineId || line._id,
      productId: line.productId,
      productName: line.fullProductName || line.productName,
      priceUnit: line.priceUnit || 0,
      priceSubtotalIncl:
        line.priceSubtotalIncl || line.priceUnit * (line.quantity || 1),
      quantity: line.quantity || 1,
      discount: line.discount || 0,
      discountEligible: line.discountEligible !== false,
      image: line.productRef?.image || null,
    }));
  }
  // Fallback to legacy items
  return order.items || [];
}

// @desc    Get all customer discounts (for Rabatt list page)
// @route   GET /api/discounts
// @access  Private
// Only shows customers who have discount groups created (3+ orders)
exports.getDiscounts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || "";
    const startIndex = (page - 1) * limit;
    const settings = await AppSettings.getSettings();

    // Get unique customer IDs that have at least one discount group
    const customersWithDiscountGroups = await DiscountOrder.distinct(
      "customerId"
    );

    // Build query filter
    const query = { _id: { $in: customersWithDiscountGroups } };

    // Add search filter if provided
    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        // { ref: searchRegex },
      ];
      // Also search by contactId (numeric)
      const numericSearch = parseInt(search, 10);
      if (!isNaN(numericSearch)) {
        query.$or.push({ contactId: numericSearch });
      }
    }

    // Total count of customers matching the filter
    const total = await Customer.countDocuments(query);

    // Get customers who have discount groups, with pagination
    const customers = await Customer.find(query)
      .skip(startIndex)
      .limit(limit)
      .sort({ createdAt: -1 });

    // Get stats for each customer
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const orders = await Order.find({ customerId: customer._id });
        const discount = await Discount.findOne({ customerId: customer._id });
        const discountOrders = await DiscountOrder.find({
          customerId: customer._id,
        });
        const queue = await OrderCustomerQueue.findOne({
          customerId: customer._id,
        });

        const totalOrderValue = orders.reduce(
          (sum, order) => sum + order.amountTotal,
          0
        );
        const availableGroups = discountOrders.filter(
          (d) => d.status === "available"
        );

        return {
          id: customer._id,
          customerId: customer._id,
          customerNumber: customer.contactId,
          customerRef: customer.ref,
          customerName: customer.name,
          email: customer.email,
          totalOrderValue,
          totalDiscountGranted: discount ? discount.totalGranted : 0,
          discountBalance: discount ? discount.balance : 0,
          redeemable: availableGroups.length > 0,
          discountGroupCount: discountOrders.length,
          // Queue information
          queueCount: queue ? queue.orderCount : 0,
          queueStatus: queue ? queue.status : "pending",
          readyForDiscount: queue
            ? queue.orderCount >= settings.ordersRequiredForDiscount
            : false,
          ordersRequiredForDiscount: settings.ordersRequiredForDiscount,
        };
      })
    );

    // Calculate overall stats (only for customers with discount groups)
    const allDiscounts = await Discount.find({
      customerId: { $in: customersWithDiscountGroups },
    });
    const allOrders = await Order.find({
      customerId: { $in: customersWithDiscountGroups },
    });
    const allQueues = await OrderCustomerQueue.find({
      customerId: { $in: customersWithDiscountGroups },
    });
    const allDiscountOrders = await DiscountOrder.find();

    const stats = {
      totalCustomers: total,
      totalOrderValue: allOrders.reduce(
        (sum, order) => sum + order.amountTotal,
        0
      ),
      totalDiscountGranted: allDiscounts.reduce(
        (sum, d) => sum + d.totalGranted,
        0
      ),
      totalDiscountGroups: allDiscountOrders.length,
      // Queue stats
      totalInQueue: allQueues.reduce((sum, q) => sum + q.orderCount, 0),
      customersReadyForDiscount: allQueues.filter(
        (q) => q.orderCount >= settings.ordersRequiredForDiscount
      ).length,
      ordersRequiredForDiscount: settings.ordersRequiredForDiscount,
      discountRate: settings.discountRate,
    };

    res.status(200).json({
      success: true,
      count: customers.length,
      total,
      stats,
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

// @desc    Get customer discount details (for Rabatt detail page)
// @route   GET /api/discounts/:customerId
// @access  Private
exports.getCustomerDiscount = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const settings = await AppSettings.getSettings();

    // Get customer orders with orderLines populated
    const orders = await Order.find({ customerId: customer._id })
      .populate({
        path: "orderLines",
        populate: {
          path: "productRef",
          select: "name image listPrice defaultCode",
        },
      })
      .sort({ orderDate: -1 });

    // Transform orders to include items from orderLines
    const ordersWithItems = orders.map((order) => {
      const orderObj = order.toObject();
      // Add items array from orderLines for frontend compatibility
      orderObj.items = getOrderItems(order);
      return orderObj;
    });

    // Get discount wallet
    const discount = await Discount.findOne({ customerId: customer._id });

    // Get discount order groups
    const discountOrders = await DiscountOrder.find({
      customerId: customer._id,
    })
      .populate("orders.orderId")
      .sort({ createdAt: -1 });

    // Get queue information
    const queue = await OrderCustomerQueue.findOne({
      customerId: customer._id,
    }).populate("orders.orderId", "posReference orderDate amountTotal items");

    // Calculate stats
    const totalOrderValue = orders.reduce(
      (sum, order) => sum + order.amountTotal,
      0
    );
    const totalItems = ordersWithItems.reduce(
      (sum, order) => sum + (order.items?.length || 0),
      0
    );

    res.status(200).json({
      success: true,
      data: {
        customer: {
          id: customer._id,
          customerNumber: customer.contactId,
          customerRef: customer.ref,
          customerName: customer.name,
          email: customer.email,
          phone: customer.phone || customer.mobile,
          address: customer.address,
        },
        stats: {
          totalOrderValue,
          totalDiscountGranted: discount ? discount.totalGranted : 0,
          discountBalance: discount ? discount.balance : 0,
          orderCount: orders.length,
          itemCount: totalItems,
        },
        orders: ordersWithItems,
        discountGroups: discountOrders,
        notes: customer.notes || "",
        // Queue information
        queue: queue
          ? {
              orderCount: queue.orderCount,
              status: queue.status,
              orders: queue.orders,
              readyForDiscount:
                queue.orderCount >= settings.ordersRequiredForDiscount,
            }
          : {
              orderCount: 0,
              status: "pending",
              orders: [],
              readyForDiscount: false,
            },
        settings: {
          discountRate: settings.discountRate,
          ordersRequiredForDiscount: settings.ordersRequiredForDiscount,
        },
        draftDiscountItems: customer.draftDiscountItems || [],
      },
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
    const { orderIds, discountRate, manualOverride } = req.body;
    const settings = await AppSettings.getSettings();
    const effectiveDiscountRate = discountRate || settings.discountRate;

    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Handle both old format (array of IDs) and new format (array of {orderId, bundleIndex})
    let ordersWithBundles;
    if (orderIds.length > 0 && typeof orderIds[0] === "object") {
      // New format: [{orderId, bundleIndex}, ...]
      ordersWithBundles = orderIds;
    } else {
      // Old format: [id1, id2, id3] - each order is its own bundle
      ordersWithBundles = orderIds.map((id, index) => ({
        orderId: id,
        bundleIndex: index,
      }));
    }

    // Validate at least one order is provided (manual creation allows any number)
    if (ordersWithBundles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one order is required",
      });
    }

    // Get all order IDs
    const allOrderIds = ordersWithBundles.map((o) => o.orderId);

    // Check if any orders are already in a discount group
    const existingGroups = await DiscountOrder.find({
      customerId: customer._id,
    });
    const usedOrderIds = new Set();
    const orderToGroupMap = new Map(); // Map orderId to group for removal
    existingGroups.forEach((group) => {
      group.orders.forEach((o) => {
        const orderIdStr = o.orderId.toString();
        usedOrderIds.add(orderIdStr);
        orderToGroupMap.set(orderIdStr, group);
      });
    });

    const alreadyUsedOrders = allOrderIds.filter((id) =>
      usedOrderIds.has(id.toString())
    );

    if (alreadyUsedOrders.length > 0) {
      // If manual override is enabled, remove orders from existing groups
      if (manualOverride) {
        // Group orders by their existing discount group
        const groupsToUpdate = new Map();
        for (const orderId of alreadyUsedOrders) {
          const group = orderToGroupMap.get(orderId.toString());
          if (group && group.status !== "redeemed") {
            if (!groupsToUpdate.has(group._id.toString())) {
              groupsToUpdate.set(group._id.toString(), {
                group,
                orderIdsToRemove: [],
              });
            }
            groupsToUpdate
              .get(group._id.toString())
              .orderIdsToRemove.push(orderId.toString());
          }
        }

        // Update or delete existing groups
        for (const [, { group, orderIdsToRemove }] of groupsToUpdate) {
          const remainingOrders = group.orders.filter(
            (o) => !orderIdsToRemove.includes(o.orderId.toString())
          );

          if (remainingOrders.length === 0) {
            // Delete group if no orders remain
            await DiscountOrder.findByIdAndDelete(group._id);
          } else {
            // Update group with remaining orders and recalculate discount
            const newTotalDiscount = remainingOrders.reduce(
              (sum, o) => sum + (o.discountAmount || 0),
              0
            );
            await DiscountOrder.findByIdAndUpdate(group._id, {
              orders: remainingOrders,
              totalDiscount: newTotalDiscount,
            });
          }
        }
      } else {
        return res.status(400).json({
          success: false,
          message: "Some orders are already in a discount group",
        });
      }
    }

    // Get orders with orderLines populated
    const orders = await Order.find({ _id: { $in: allOrderIds } }).populate({
      path: "orderLines",
      populate: {
        path: "productRef",
        select: "name image listPrice",
      },
    });

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid orders found",
      });
    }

    // Create a map of orderId -> bundleIndex
    const bundleMap = {};
    ordersWithBundles.forEach((o) => {
      bundleMap[o.orderId.toString()] = o.bundleIndex;
    });

    // Calculate discount for each order
    const orderItems = orders.map((order) => {
      const items = getOrderItems(order);
      const eligibleAmount = items
        .filter((item) => item.discountEligible)
        .reduce(
          (sum, item) =>
            sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity),
          0
        );

      const discountAmount = (eligibleAmount * effectiveDiscountRate) / 100;

      return {
        orderId: order._id,
        orderLineId: order.orderId,
        amount: eligibleAmount,
        discountRate: effectiveDiscountRate,
        discountAmount,
        bundleIndex: bundleMap[order._id.toString()] || 0,
      };
    });

    // Create discount order group
    const discountOrder = await DiscountOrder.create({
      customerId: customer._id,
      partnerId: customer.contactId,
      orders: orderItems,
      status: "available",
    });

    // Update customer's discount wallet
    let discount = await Discount.findOne({ customerId: customer._id });

    if (!discount) {
      discount = await Discount.create({
        customerId: customer._id,
        partnerId: customer.contactId,
      });
    }

    await discount.addDiscount(discountOrder.totalDiscount);

    // Update customer's total discount granted and clear draft items
    customer.totalDiscountGranted =
      (customer.totalDiscountGranted || 0) + discountOrder.totalDiscount;
    customer.draftDiscountItems = []; // Clear draft items after creating group
    await customer.save();

    res.status(201).json({
      success: true,
      data: discountOrder,
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
        message: "Discount group not found",
      });
    }

    // Cannot edit redeemed groups
    if (discountOrder.status === "redeemed") {
      return res.status(400).json({
        success: false,
        message: "Cannot edit a redeemed discount group",
      });
    }

    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Handle both old format (array of IDs) and new format (array of {orderId, bundleIndex})
    let ordersWithBundles;
    if (orderIds.length > 0 && typeof orderIds[0] === "object") {
      // New format: [{orderId, bundleIndex}, ...]
      ordersWithBundles = orderIds;
    } else {
      // Old format: [id1, id2, id3] - each order is its own bundle
      ordersWithBundles = orderIds.map((id, index) => ({
        orderId: id,
        bundleIndex: index,
      }));
    }

    // Validate at least one order is provided (manual editing allows any number)
    if (ordersWithBundles.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one order is required",
      });
    }

    // Get all order IDs
    const allOrderIds = ordersWithBundles.map((o) => o.orderId);

    // Get current orders in this group
    const currentOrderIds = discountOrder.orders.map((o) =>
      o.orderId.toString()
    );

    // Check if any of the new orders are already in OTHER discount groups
    const otherGroups = await DiscountOrder.find({
      customerId: customer._id,
      _id: { $ne: discountOrder._id },
    });
    const usedOrderIds = new Set();
    otherGroups.forEach((group) => {
      group.orders.forEach((o) => {
        usedOrderIds.add(o.orderId.toString());
      });
    });

    const alreadyUsedOrders = allOrderIds.filter((id) =>
      usedOrderIds.has(id.toString())
    );
    if (alreadyUsedOrders.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Some orders are already in another discount group",
      });
    }

    // Store old discount amount for wallet adjustment
    const oldTotalDiscount = discountOrder.totalDiscount;

    // Get new orders with orderLines populated
    const orders = await Order.find({ _id: { $in: allOrderIds } }).populate({
      path: "orderLines",
      populate: {
        path: "productRef",
        select: "name image listPrice",
      },
    });

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid orders found",
      });
    }

    // Create a map of orderId -> bundleIndex
    const bundleMap = {};
    ordersWithBundles.forEach((o) => {
      bundleMap[o.orderId.toString()] = o.bundleIndex;
    });

    // Calculate discount for each order
    const orderItems = orders.map((order) => {
      const items = getOrderItems(order);
      const eligibleAmount = items
        .filter((item) => item.discountEligible)
        .reduce(
          (sum, item) =>
            sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity),
          0
        );

      const discountAmount = (eligibleAmount * effectiveDiscountRate) / 100;

      return {
        orderId: order._id,
        orderLineId: order.orderId,
        amount: eligibleAmount,
        discountRate: effectiveDiscountRate,
        discountAmount,
        bundleIndex: bundleMap[order._id.toString()] || 0,
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
      customer.totalDiscountGranted =
        (customer.totalDiscountGranted || 0) + discountDifference;
      await customer.save();
    }

    res.status(200).json({
      success: true,
      data: discountOrder,
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
        message: "Discount group not found",
      });
    }

    if (discountOrder.status === "redeemed") {
      return res.status(400).json({
        success: false,
        message: "Discount already redeemed",
      });
    }

    // Update status to redeemed
    discountOrder.status = "redeemed";
    discountOrder.redeemedAt = new Date();
    await discountOrder.save();

    // Update customer wallet
    const discount = await Discount.findOne({
      customerId: discountOrder.customerId,
    });

    if (discount) {
      await discount.redeemDiscount(discountOrder.totalDiscount);
    }

    // Update customer's wallet and total redeemed amount
    const customer = await Customer.findById(discountOrder.customerId);
    if (customer) {
      // Add redeemed discount to customer wallet
      customer.wallet = (customer.wallet || 0) + discountOrder.totalDiscount;
      // Track total redeemed amount
      customer.totalDiscountRedeemed =
        (customer.totalDiscountRedeemed || 0) + discountOrder.totalDiscount;
      await customer.save();
    }

    res.status(200).json({
      success: true,
      data: discountOrder,
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

    // Update notes on the customer
    const customer = await Customer.findByIdAndUpdate(
      req.params.customerId,
      { notes },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    res.status(200).json({
      success: true,
      data: { notes: customer.notes },
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
        message: "Discount group not found",
      });
    }

    // If not yet redeemed, remove from wallet
    if (discountOrder.status === "available") {
      const discount = await Discount.findOne({
        customerId: discountOrder.customerId,
      });

      if (discount) {
        discount.balance -= discountOrder.totalDiscount;
        discount.totalGranted -= discountOrder.totalDiscount;
        await discount.save();
      }
    }

    await discountOrder.deleteOne();

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Save draft discount items for a customer
// @route   PUT /api/discounts/:customerId/draft
// @access  Private
exports.saveDraftItems = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const { draftItems } = req.body;

    // Save draft items to customer
    customer.draftDiscountItems = draftItems || [];
    await customer.save();

    res.status(200).json({
      success: true,
      data: customer.draftDiscountItems,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Clear draft discount items for a customer
// @route   DELETE /api/discounts/:customerId/draft
// @access  Private
exports.clearDraftItems = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    customer.draftDiscountItems = [];
    await customer.save();

    res.status(200).json({
      success: true,
      message: "Draft items cleared",
    });
  } catch (err) {
    next(err);
  }
};
