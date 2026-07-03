const Order = require("../models/Order");
const Customer = require("../models/Customer");
const DiscountOrder = require("../models/DiscountOrder");
const OldPurchase = require("../models/OldPurchase");

/**
 * Build a single continuous purchase feed: WAWI/Etron orders on TOP (newest
 * first), then ALL sheet purchases (one row per EK, from OldPurchase) below.
 * Paginated at the DB level across the two ordered blocks.
 *
 * Shared by orderController.getOrders (Einkäufe list) and
 * dashboardController.getRecentOrders (Overview feed) so the two feeds stay
 * consistent; they differ only in the filters they pass in (e.g. the Dashboard
 * scopes the WAWI block to post-Stichtag orders).
 *
 * @param {Object}  opts
 * @param {Object}  opts.orderFilter   Mongo filter for the WAWI Order block.
 * @param {Object}  opts.sheetFilter   Mongo filter for the OldPurchase block.
 * @param {number}  opts.page          1-based page.
 * @param {number}  opts.limit         page size.
 * @param {boolean} [opts.withDiscountStatus=false]  compute discountStatus for WAWI rows.
 * @returns {Promise<{data: Array, total: number, pagination: Object}>}
 */
async function buildPurchaseFeed({
  orderFilter = {},
  sheetFilter = {},
  page = 1,
  limit = 10,
  withDiscountStatus = false,
}) {
  const startIndex = (page - 1) * limit;

  const wawiTotal = await Order.countDocuments(orderFilter);
  const sheetTotal = await OldPurchase.countDocuments(sheetFilter);
  const total = wawiTotal + sheetTotal;

  // ---- WAWI block (top) ----
  let wawiRows = [];
  if (startIndex < wawiTotal) {
    const orders = await Order.find(orderFilter)
      .populate("customerId", "name email ref contactId")
      .sort({ orderDate: -1 })
      .skip(startIndex)
      .limit(Math.min(limit, wawiTotal - startIndex));

    let discountStatusMap = {};
    if (withDiscountStatus) {
      const orderIds = orders.map((o) => o._id);
      const discountOrders = await DiscountOrder.find({
        "orders.orderId": { $in: orderIds },
      });
      discountOrders.forEach((dg) => {
        dg.orders.forEach((o) => {
          if (!o.orderId) return; // Excel/carryover items have no WAWI orderId
          discountStatusMap[o.orderId.toString()] = dg.status;
        });
      });
    }

    wawiRows = orders.map((order) => ({
      ...order.toObject(),
      source: "wawi",
      discountStatus: withDiscountStatus
        ? discountStatusMap[order._id.toString()] || null
        : null,
    }));
  }

  // ---- Sheet block (below) ----
  let sheetRows = [];
  const remaining = limit - wawiRows.length;
  if (remaining > 0 && sheetTotal > 0) {
    const sheetSkip = Math.max(0, startIndex - wawiTotal);
    const sheetDocs = await OldPurchase.find(sheetFilter)
      .sort({ lastName: 1, firstName: 1, ekIndex: 1 })
      .skip(sheetSkip)
      .limit(remaining)
      .lean();

    // Resolve the current customer by ref (customerNo) rather than the
    // possibly-stale customerId, so the name + bonus link stay correct.
    const refs = [...new Set(sheetDocs.map((d) => d.customerNo).filter(Boolean))];
    const custs = refs.length
      ? await Customer.find({ ref: { $in: refs } }, "name contactId ref").lean()
      : [];
    const refMap = custs.reduce((m, c) => {
      m[c.ref] = c;
      return m;
    }, {});

    sheetRows = sheetDocs.map((d) => {
      const cust = refMap[d.customerNo];
      const fullName = `${d.firstName || ""} ${d.lastName || ""}`.trim();
      return {
        _id: d._id,
        source: "sheet",
        fromSheet: true,
        posReference: d.purchaseLabel,
        customerId: cust
          ? { _id: cust._id, name: cust.name, contactId: cust.contactId, ref: cust.ref }
          : { name: fullName || d.customerNo, contactId: d.customerNo },
        orderDate: null, // no real date → UI shows "Aus Tabelle"
        amountTotal: d.amount,
        isInDiscountGroup: d.isInDiscountGroup,
        discountStatus: null,
      };
    });
  }

  return {
    data: [...wawiRows, ...sheetRows],
    total,
    pagination: {
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}

module.exports = { buildPurchaseFeed };
