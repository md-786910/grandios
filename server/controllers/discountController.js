const DiscountOrder = require("../models/DiscountOrder");
const Discount = require("../models/Discount");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const OrderLine = require("../models/OrderLine");
const Product = require("../models/Product");
const OrderCustomerQueue = require("../models/OrderCustomerQueue");
const AppSettings = require("../models/AppSettings");
const NotesHistory = require("../models/NotesHistory");
const CustomerPurchaseHistory = require("../models/CustomerPurchaseHistory");
const OldPurchase = require("../models/OldPurchase");
const cascadeSyncService = require("../services/cascadingSyncService");

// Helper to get order items from either orderLines (WAWI) or items (legacy)
function getOrderItems(order) {
  // If order has populated orderLines, use them
  if (order.orderLines && order.orderLines.length > 0) {
    return order.orderLines.map((line) => {
      const item = {
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
      };
      // Override discountEligible based on full eligibility check
      // (excludes negative amounts, Bonus Kundenkarte, vouchers, sale items)
      if (!isItemEligibleForBonus(item)) {
        item.discountEligible = false;
      }
      return item;
    });
  }
  // Fallback to legacy items
  return order.items || [];
}

// Helper to check if an item is eligible for bonus calculation
// Excludes: items marked as not eligible, Sale items (with existing discount), vouchers,
// and "Bonus Kundenkarte" products. Negative-amount lines (returns / Sonderrabatt)
// remain eligible so they net against purchases in the signed sum.
function isItemEligibleForBonus(item) {
  // Must be discount eligible
  if (!item?.discountEligible) return false;
  // Previously short-circuited on any negative amount, which dropped returns
  // and Sonderrabatt entirely; we now let them through so they net in the
  // signed sum used by getOrderEligibleAmount and the Einkäufe detail view.
  // if ((item.priceSubtotalIncl || 0) < 0 || (item.priceUnit || 0) < 0)
  //   return false;
  // Exclude items with existing discounts (Sale items) — only when positive,
  // so a refunded sale item (negative qty + negative amount) can still net.
  if (item.discount && item.discount > 0 && (item.priceSubtotalIncl || 0) > 0)
    return false;
  // Exclude vouchers and Bonus Kundenkarte (check product name)
  const lowerName = (item.productName || "").toLowerCase();
  if (
    lowerName.includes("gutschein") ||
    lowerName.includes("voucher") ||
    lowerName.includes("gift") ||
    lowerName.includes("bonus kundenkarte") ||
    lowerName.includes("sonderrabatt")
  ) {
    return false;
  }
  return true;
}

// Helper to check if an order has at least one bonus-eligible item
function orderHasEligibleItems(order) {
  const items = getOrderItems(order);
  return items.some((item) => isItemEligibleForBonus(item));
}

// @desc    Get all customer discounts (for Bonus list page)
// @route   GET /api/discounts
// @access  Private
exports.getDiscounts = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || "";
    const startIndex = (page - 1) * limit;
    const settings = await AppSettings.getSettings();

    // Build query filter - show all customers
    const query = {};

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

    // Get customers matching current query, with pagination
    const customers = await Customer.find(query)
      .collation({ locale: "de", strength: 2 })
      .skip(startIndex)
      .limit(limit)
      .sort({ name: 1, _id: 1 });

    // Get stats for each customer
    const customersWithStats = await Promise.all(
      customers.map(async (customer) => {
        const orders = await Order.find({ customerId: customer._id }).populate({
          path: "orderLines",
          select: "priceSubtotalIncl priceUnit quantity discountEligible",
        });
        const discount = await Discount.findOne({ customerId: customer._id });
        const discountOrders = await DiscountOrder.find({
          customerId: customer._id,
        });
        const queue = await OrderCustomerQueue.findOne({
          customerId: customer._id,
        });

        // Fetch old purchase history for this customer
        const purchaseHistoryQuery = [];
        if (customer.email)
          purchaseHistoryQuery.push({ email: customer.email.toLowerCase() });
        if (customer.ref)
          purchaseHistoryQuery.push({ customerNo: customer.ref });
        let oldRedeemableBonus = 0;
        if (purchaseHistoryQuery.length > 0) {
          const ph = await CustomerPurchaseHistory.findOne(
            { $or: purchaseHistoryQuery },
            { purchaseGroups: 1 },
          ).lean();
          if (ph && ph.purchaseGroups) {
            oldRedeemableBonus = ph.purchaseGroups
              .filter((g) => g.rabatt > 0 && g.rabatteinloesung == null)
              .reduce((sum, g) => sum + g.rabatt, 0);
          }
        }

        const totalOrderValue = orders.reduce(
          (sum, order) => sum + order.amountTotal,
          0,
        );
        const availableGroups = discountOrders.filter(
          (d) => d.status === "available",
        );

        // Calculate redeemable and pending bonus amounts
        const redeemableBonus =
          discountOrders.reduce((acc, group) => {
            if (group.status === "redeemed") return acc;
            const uniqueBundles = new Set(
              group.orders?.map((o) => Number(o.bundleIndex ?? 0)),
            ).size;
            return uniqueBundles >= 3 ? acc + (group.totalDiscount || 0) : acc;
          }, 0) + oldRedeemableBonus;

        // Get all order IDs that are already in groups
        const ordersInGroups = new Set(
          discountOrders.flatMap(
            (g) => g.orders?.map((o) => o.orderId?.toString()) || [],
          ),
        );

        // Calculate bonus from orders NOT in any group yet
        const availableOrdersBonus = orders.reduce((acc, order) => {
          const orderId = order._id?.toString();
          // Skip if order is already in a group
          if (ordersInGroups.has(orderId)) return acc;

          // Calculate potential bonus from discount-eligible items using getOrderItems
          const items = getOrderItems(order);
          const eligibleItems = items.filter((i) => isItemEligibleForBonus(i));
          const eligibleAmount = eligibleItems.reduce(
            (sum, item) =>
              sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity),
            0,
          );
          const orderBonus = (eligibleAmount * settings.discountRate) / 100;
          return acc + orderBonus;
        }, 0);

        const pendingBonus =
          discountOrders.reduce((acc, group) => {
            if (group.status === "redeemed") return acc;
            const uniqueBundles = new Set(
              group.orders?.map((o) => Number(o.bundleIndex ?? 0)),
            ).size;
            return uniqueBundles < 3 ? acc + (group.totalDiscount || 0) : acc;
          }, 0) + availableOrdersBonus; // Add available orders bonus to pending

        return {
          id: customer._id,
          customerId: customer._id,
          customerNumber: customer.contactId,
          customerRef: customer.ref,
          customerName: customer.name,
          email: customer.email,
          totalOrderValue,
          totalDiscountGranted: discount ? discount.totalGranted : 0,
          totalBonusRedeemed: discount ? discount.totalRedeemed : 0,
          discountBalance: discount ? discount.balance : 0,
          redeemable: availableGroups.length > 0,
          discountGroupCount: discountOrders.length,
          // Bonus amounts for display
          redeemableBonus,
          pendingBonus,
          // Queue information
          queueCount: queue ? queue.orderCount : 0,
          queueStatus: queue ? queue.status : "pending",
          readyForDiscount: queue
            ? queue.orderCount >= settings.ordersRequiredForDiscount
            : false,
          ordersRequiredForDiscount: settings.ordersRequiredForDiscount,
        };
      }),
    );

    // Calculate overall stats for all customers matching current query
    const customerIds = await Customer.find(query).distinct("_id");
    const allDiscounts = await Discount.find({
      customerId: { $in: customerIds },
    });
    const allOrders = await Order.find({
      customerId: { $in: customerIds },
    });
    const allQueues = await OrderCustomerQueue.find({
      customerId: { $in: customerIds },
    });
    const allDiscountOrders = await DiscountOrder.find({
      customerId: { $in: customerIds },
    });

    const stats = {
      totalCustomers: total,
      totalOrderValue: allOrders.reduce(
        (sum, order) => sum + order.amountTotal,
        0,
      ),
      totalDiscountGranted: allDiscounts.reduce(
        (sum, d) => sum + d.totalGranted,
        0,
      ),
      totalDiscountGroups: allDiscountOrders.length,
      // Queue stats
      totalInQueue: allQueues.reduce((sum, q) => sum + q.orderCount, 0),
      customersReadyForDiscount: allQueues.filter(
        (q) => q.orderCount >= settings.ordersRequiredForDiscount,
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

// @desc    Get customer discount details (for Bonus detail page)
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

    // Get customer orders with orderLines populated.
    // When a Stichtag is set, pre-cutoff Etron orders are owned by the Excel
    // baseline and must NOT be selectable for the bonus program — exclude them
    // here so they mirror the auto-sync's orderDate>=stichtag rule. (No Stichtag
    // set ⇒ no filter ⇒ existing behavior unchanged.)
    const orderQuery = { customerId: customer._id, amountTotal: { $gt: 0 } };
    if (settings.stichtag) {
      orderQuery.orderDate = { $gte: new Date(settings.stichtag) };
    }
    const orders = await Order.find(orderQuery)
      .populate({
        path: "orderLines",
        populate: {
          path: "productRef",
          select: "name image listPrice defaultCode",
        },
      })
      .sort({ orderDate: -1 });

    // Transform orders to include items from orderLines
    // Filter out orders that have no bonus-eligible items
    const ordersWithItems = orders
      .map((order) => {
        const orderObj = order.toObject();
        // Add items array from orderLines for frontend compatibility
        orderObj.items = getOrderItems(order);
        return orderObj;
      })
      .filter((order) => {
        // Exclude orders where no items are eligible for bonus
        const hasEligible = order.items.some((item) => item.discountEligible);
        return hasEligible;
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

    // Get old purchase history (imported from Excel) by email or customerRef
    const purchaseHistoryQuery = [];
    if (customer.email) {
      purchaseHistoryQuery.push({ email: customer.email.toLowerCase() });
    }
    if (customer.ref) {
      purchaseHistoryQuery.push({ customerNo: customer.ref });
    }
    let purchaseHistory = null;
    if (purchaseHistoryQuery.length > 0) {
      const rawHistory = await CustomerPurchaseHistory.findOne(
        { $or: purchaseHistoryQuery },
        {
          customerNo: 1,
          remarks: 1,
          purchaseGroups: 1,
          totalPurchaseAmount: 1,
          totalRabatt: 1,
          totalRedeemed: 1,
        },
      ).lean();
      if (rawHistory) {
        const filtered = rawHistory.purchaseGroups.filter((g) => g.rabatt > 0);
        purchaseHistory = {
          ...rawHistory,
          purchaseGroups: filtered,
          groupCount: filtered.length,
        };
      }
    }

    // Get individual old purchases (each EK purchase as separate record)
    // Only get purchases that are NOT part of discount groups
    let oldPurchases = [];
    if (purchaseHistoryQuery.length > 0) {
      oldPurchases = await OldPurchase.find({
        $or: purchaseHistoryQuery,
        isInDiscountGroup: false, // Only single purchases, not in discount groups
      })
        .sort({ groupIndex: 1, ekIndex: 1 })
        .lean();
    }

    // Calculate stats
    const totalOrderValue = orders.reduce(
      (sum, order) => sum + order.amountTotal,
      0,
    );
    const totalItems = ordersWithItems.reduce(
      (sum, order) => sum + (order.items?.length || 0),
      0,
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
          pendingReturnDeduction: customer.pendingReturnDeduction || 0,
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
        purchaseHistory: purchaseHistory || null,
        oldPurchases: oldPurchases || [],
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

    // Split selections into real WAWI orders and Excel "old single purchases"
    // (the latter carry oldPurchaseId + no orderId, and have no WAWI Order doc).
    const realBundles = ordersWithBundles.filter((o) => o.orderId);
    const oldBundles = ordersWithBundles.filter(
      (o) => !o.orderId && o.oldPurchaseId,
    );

    // Get all real order IDs (old purchases are handled separately)
    const allOrderIds = realBundles.map((o) => o.orderId);

    // Check if any orders are already in a discount group
    const existingGroups = await DiscountOrder.find({
      customerId: customer._id,
    });
    const usedOrderIds = new Set();
    const orderToGroupMap = new Map(); // Map orderId to group for removal
    existingGroups.forEach((group) => {
      group.orders.forEach((o) => {
        // Excel baseline / carryover items have no WAWI orderId — skip them.
        if (!o.orderId) return;
        const orderIdStr = o.orderId.toString();
        usedOrderIds.add(orderIdStr);
        orderToGroupMap.set(orderIdStr, group);
      });
    });

    const alreadyUsedOrders = allOrderIds.filter((id) =>
      usedOrderIds.has(id.toString()),
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
            // Keep Excel/carryover items (no orderId); only drop the requested ones.
            (o) => !o.orderId || !orderIdsToRemove.includes(o.orderId.toString()),
          );

          if (remainingOrders.length === 0) {
            // Delete group if no orders remain
            await DiscountOrder.findByIdAndDelete(group._id);
          } else {
            // Update group with remaining orders and recalculate discount
            const newTotalDiscount = remainingOrders.reduce(
              (sum, o) => sum + (o.discountAmount || 0),
              0,
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

    // Get real orders with orderLines populated
    const orders = allOrderIds.length
      ? await Order.find({ _id: { $in: allOrderIds } }).populate({
          path: "orderLines",
          populate: {
            path: "productRef",
            select: "name image listPrice",
          },
        })
      : [];

    // Stichtag guard: a pre-cutoff Etron order is owned by the Excel baseline
    // and must never be grouped for bonus (mirrors the auto-sync rule).
    if (settings.stichtag) {
      const cutoff = new Date(settings.stichtag);
      const preCutoff = orders.find(
        (o) => o.orderDate && new Date(o.orderDate) < cutoff,
      );
      if (preCutoff) {
        return res.status(400).json({
          success: false,
          message:
            "Ein Einkauf liegt vor dem Stichtag und kann nicht gruppiert werden.",
        });
      }
    }

    // Create a map of orderId -> bundleIndex (real orders only)
    const bundleMap = {};
    realBundles.forEach((o) => {
      bundleMap[o.orderId.toString()] = o.bundleIndex;
    });

    // Calculate discount for each real order using the shared eligible-amount
    // source of truth, so manual and auto-created groups always agree.
    const orderItems = await Promise.all(
      orders.map(async (order) => {
        const eligibleAmount = await cascadeSyncService.getOrderEligibleAmount(
          order._id,
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
      }),
    );

    // Build items for any selected Excel old single purchases. These have no
    // WAWI Order — mirror the carryover pseudo-order shape (orderId null +
    // fromExcel + label + amount). Validate they aren't already consumed.
    const oldOrderItems = [];
    let consumedOldIds = [];
    if (oldBundles.length) {
      const oldIds = oldBundles.map((o) => o.oldPurchaseId);
      const oldDocs = await OldPurchase.find({
        _id: { $in: oldIds },
        customerId: customer._id,
      });
      const oldById = new Map(oldDocs.map((d) => [d._id.toString(), d]));
      for (const b of oldBundles) {
        const doc = oldById.get(String(b.oldPurchaseId));
        if (!doc) {
          return res.status(400).json({
            success: false,
            message: "Ein ausgewählter Alt-Einkauf wurde nicht gefunden.",
          });
        }
        if (doc.isInDiscountGroup) {
          return res.status(400).json({
            success: false,
            message: "Ein Alt-Einkauf ist bereits in einer Bonusgruppe.",
          });
        }
        const amount = doc.amount || 0;
        oldOrderItems.push({
          orderId: null,
          fromExcel: true,
          label: doc.purchaseLabel,
          amount,
          discountRate: effectiveDiscountRate,
          discountAmount: (amount * effectiveDiscountRate) / 100,
          bundleIndex: b.bundleIndex || 0,
        });
        consumedOldIds.push(doc._id);
      }
    }

    const groupItems = [...orderItems, ...oldOrderItems];
    if (groupItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid orders found",
      });
    }

    // Create discount order group
    const discountOrder = await DiscountOrder.create({
      customerId: customer._id,
      partnerId: customer.contactId,
      orders: groupItems,
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

    // Consume-once: mark the selected old purchases as used and remove their
    // amounts from the customer's carryover so the auto-sync can't reuse them.
    if (consumedOldIds.length) {
      await OldPurchase.updateMany(
        { _id: { $in: consumedOldIds } },
        { $set: { isInDiscountGroup: true } },
      );
      let carry = Array.isArray(customer.carryoverPurchases)
        ? [...customer.carryoverPurchases]
        : [];
      let removedBonus = 0;
      for (const item of oldOrderItems) {
        const idx = carry.findIndex((v) => Math.abs(v - item.amount) < 0.005);
        if (idx >= 0) {
          carry.splice(idx, 1);
          removedBonus += item.discountAmount;
        }
      }
      customer.carryoverPurchases = carry;
      customer.streakCount = carry.length;
      customer.pendingAccruedRabatt = Math.max(
        0,
        Math.round(((customer.pendingAccruedRabatt || 0) - removedBonus) * 100) /
          100,
      );
    }

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

    // Get current orders in this group (Excel/carryover items have no orderId)
    const currentOrderIds = discountOrder.orders
      .filter((o) => o.orderId)
      .map((o) => o.orderId.toString());

    // Check if any of the new orders are already in OTHER discount groups
    const otherGroups = await DiscountOrder.find({
      customerId: customer._id,
      _id: { $ne: discountOrder._id },
    });
    const usedOrderIds = new Set();
    otherGroups.forEach((group) => {
      group.orders.forEach((o) => {
        // Excel baseline / carryover items have no WAWI orderId — skip them.
        if (!o.orderId) return;
        usedOrderIds.add(o.orderId.toString());
      });
    });

    const alreadyUsedOrders = allOrderIds.filter((id) =>
      usedOrderIds.has(id.toString()),
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

    // Calculate discount for each order using the shared eligible-amount
    // source of truth, so manual and auto-created groups always agree.
    const orderItems = await Promise.all(
      orders.map(async (order) => {
        const eligibleAmount = await cascadeSyncService.getOrderEligibleAmount(
          order._id,
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
      }),
    );

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

    // Update customer's wallet and total redeemed amount, applying any pending
    // return deduction to the bonus actually credited to the wallet.
    const customer = await Customer.findById(discountOrder.customerId);
    if (customer) {
      const gross = discountOrder.totalDiscount;
      const pending = customer.pendingReturnDeduction || 0;
      // The admin may choose how much of the open deduction to apply now.
      // Cap it at what is owed (pending) and at what is being paid out (gross);
      // any remainder stays pending for the next redemption.
      const maxDeduction = Math.min(pending, gross);
      let consumed = maxDeduction;
      if (req.body && req.body.deductionAmount !== undefined) {
        const requested = Number(req.body.deductionAmount);
        if (Number.isNaN(requested) || requested < 0) {
          return res.status(400).json({
            success: false,
            message: "Invalid deduction amount",
          });
        }
        if (requested > pending + 0.005) {
          return res.status(400).json({
            success: false,
            message: "Deduction amount cannot exceed the open bonus deduction",
          });
        }
        consumed = Math.min(requested, maxDeduction);
      }
      const credited = gross - consumed; // amount actually given to the customer
      const walletBefore = customer.wallet || 0;

      customer.wallet = walletBefore + credited;
      customer.totalDiscountRedeemed =
        (customer.totalDiscountRedeemed || 0) + gross;
      customer.pendingReturnDeduction = pending - consumed; // carry remainder
      customer.totalReturnDeduction =
        (customer.totalReturnDeduction || 0) + consumed;
      await customer.save();

      // System-generated audit entry with before/after balances
      const deductionClause =
        consumed > 0 ? ` Offener Bonusabzug: −€${consumed.toFixed(2)}.` : "";
      await NotesHistory.create({
        customerId: customer._id,
        notes: `Bonus eingelöst: €${gross.toFixed(2)}.${deductionClause} Gutgeschrieben: €${credited.toFixed(2)}. Bonusguthaben vorher: €${walletBefore.toFixed(2)}, nachher: €${customer.wallet.toFixed(2)}.`,
        changedByName: "System",
        source: "system",
      });
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
      { new: true },
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Create history record
    await NotesHistory.create({
      customerId: customer._id,
      notes: notes || "",
      changedBy: req.user._id,
      changedByName: req.user.name,
    });

    res.status(200).json({
      success: true,
      data: { notes: customer.notes },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get notes history for a customer
// @route   GET /api/discounts/:customerId/notes/history
// @access  Private
exports.getNotesHistory = async (req, res, next) => {
  try {
    const customerId = req.params.customerId;

    // Verify customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Fetch history sorted by most recent first
    const history = await NotesHistory.find({ customerId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      data: {
        history,
        currentNotes: customer.notes,
      },
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

// @desc    Sync recent orders for customer from WAWI
// @route   POST /api/discounts/:customerId/sync
// @access  Private
exports.syncCustomerOrders = async (req, res, next) => {
  try {
    const customer = await Customer.findById(req.params.customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // If no contactId, try to resolve from WAWI by email
    if (!customer.contactId && customer.email) {
      const wawiApiClient = require("../services/wawiApiClient");
      const wawiResult = await wawiApiClient.searchRead("res.partner", {
        fields: ["id"],
        domain: [
          ["email", "=", customer.email],
          ["customer_rank", ">", 0],
        ],
        limit: 1,
      });
      if (wawiResult.data && wawiResult.data.length > 0) {
        customer.contactId = wawiResult.data[0].id;
        await customer.save();
      }
    }

    if (!customer.contactId) {
      return res.status(400).json({
        success: false,
        message: "Customer not found in WAWI. Cannot sync.",
      });
    }

    // Count orders before sync to detect new ones
    const ordersBefore = await Order.countDocuments({
      customerId: customer._id,
    });

    const result = await cascadeSyncService.syncCustomerWithRelatedData(
      customer.contactId,
    );

    // Count orders after sync
    const ordersAfter = await Order.countDocuments({
      customerId: customer._id,
    });
    const newOrdersCount = ordersAfter - ordersBefore;

    res.status(200).json({
      success: true,
      message: `Sync completed. ${result.ordersCount} orders synced.`,
      data: {
        ordersCount: result.ordersCount,
        newOrdersCount,
        totalOrders: ordersAfter,
        newDiscountGroups: result.newDiscountGroups || 0,
      },
    });
  } catch (err) {
    console.error("[DiscountSync] Customer sync failed:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Sync failed",
    });
  }
};
