/**
 * Cascading Sync Service
 * Syncs data in a cascading flow:
 * Customer → Orders → Order Lines → Products → Attributes/Values
 * Auto-creates discount groups when customer has 3+ orders
 */

const Customer = require("../models/Customer");
const Order = require("../models/Order");
const OrderLine = require("../models/OrderLine");
const Product = require("../models/Product");
const ProductAttribute = require("../models/ProductAttribute");
const ProductAttributeValue = require("../models/ProductAttributeValue");
const Discount = require("../models/Discount");
const DiscountOrder = require("../models/DiscountOrder");
const NotesHistory = require("../models/NotesHistory");
const wawiApiClient = require("./wawiApiClient");

// Field definitions for WAWI API
const CUSTOMER_FIELDS = [
  "id",
  "name",
  "email",
  "phone",
  "mobile",
  "street",
  "street2",
  "zip",
  "city",
  "country_id",
  "ref",
  "company_type",
  "customer_rank",
  "write_date",
];

const ORDER_FIELDS = [
  "id",
  "name",
  "pos_reference",
  "note",
  "partner_id",
  "date_order",
  "amount_total",
  "amount_paid",
  "amount_tax",
  "state",
  "cashier",
  "is_invoiced",
  "is_refunded",
  "lines",
  "write_date",
];

const ORDER_LINE_FIELDS = [
  "id",
  "order_id",
  "product_id",
  "name",
  "full_product_name",
  "qty",
  "price_unit",
  "discount",
  "price_subtotal",
  "price_subtotal_incl",
];

const PRODUCT_FIELDS = [
  "id",
  "name",
  "default_code",
  "barcode",
  "list_price",
  "standard_price",
  "categ_id",
  "active",
  "available_in_pos",
  "type",
  "description_sale",
  "product_tmpl_id",
  "product_template_attribute_value_ids",
  "combination_indices",
  "image_512",
];

// Lightweight fields without image_512 for per-customer sync (faster, avoids 504)
const PRODUCT_FIELDS_LIGHT = PRODUCT_FIELDS.filter((f) => f !== "image_512");

const ATTRIBUTE_FIELDS = [
  "id",
  "name",
  "display_type",
  "create_variant",
  "sequence",
];

const ATTRIBUTE_VALUE_FIELDS = [
  "id",
  "name",
  "attribute_id",
  "html_color",
  "sequence",
  "is_custom",
];

// Sync status
let cascadeStatus = {
  isRunning: false,
  currentStep: null,
  progress: {
    customers: 0,
    orders: 0,
    orderLines: 0,
    products: 0,
    discountGroups: 0,
  },
  skipped: 0,
  skippedOrders: 0,
  skippedOrderLines: 0,
  errors: [],
};

/**
 * Process items concurrently with a concurrency limit.
 * Each item is processed by fn(item). Errors are caught per-item
 * so one failure does not block others.
 *
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function(item) => result
 * @param {number} concurrency - Max concurrent promises (default: 5)
 * @returns {Array<{status, value?, reason?}>} - Promise.allSettled results
 */
async function processBatch(items, fn, concurrency = 5) {
  const results = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(chunk.map(fn));
    results.push(...chunkResults);
  }
  return results;
}

/**
 * Retry an async function up to N times with delay between attempts
 */
async function withRetry(fn, retries = 1, delayMs = 1000) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries) throw err;
      console.log(`[CascadeSync] Retrying after error: ${err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/**
 * Get all local order IDs (WAWI orderId) for a customer.
 * Used to compare against WAWI and find missing orders.
 */
async function getLocalOrderIds(customerId) {
  const orders = await Order.find({ customerId }).select("orderId").lean();
  return new Set(orders.map((o) => o.orderId));
}

/**
 * Get cascade sync status
 */
function getCascadeStatus() {
  return { ...cascadeStatus };
}

/**
 * Sync a single customer with all related data
 * @param {Number} contactId - WAWI contact ID
 * @param {Object} options - Sync options
 * @param {Array|null} options.prefetchedOrders - Pre-fetched orders to process directly
 */
async function syncCustomerWithRelatedData(contactId, options = {}) {
  const { prefetchedOrders = null } = options;
  cascadeStatus.currentStep = "customer";

  try {
    // 1. Fetch customer from WAWI
    const customerResult = await wawiApiClient.searchRead("res.partner", {
      fields: CUSTOMER_FIELDS,
      domain: [["id", "=", contactId]],
      limit: 1,
    });

    if (!customerResult.data || customerResult.data.length === 0) {
      throw new Error(`Customer ${contactId} not found in WAWI`);
    }

    const wawiCustomer = customerResult.data[0];
    const customer = await upsertCustomer(wawiCustomer);
    cascadeStatus.progress.customers++;

    // 2. Sync orders (uses ID comparison to only fetch missing orders from WAWI)
    cascadeStatus.currentStep = "orders";
    const orders = await syncCustomerOrders(customer, contactId, {
      prefetchedOrders,
      forceRefresh: true,
    });

    // 4. Check and create discount group if needed
    cascadeStatus.currentStep = "discount";
    const newDiscountGroups = await checkAndCreateDiscountGroup(
      customer,
      orders,
    );

    return {
      customer,
      ordersCount: orders.length,
      newDiscountGroups: newDiscountGroups || 0,
      success: true,
    };
  } catch (error) {
    cascadeStatus.errors.push({ contactId, error: error.message });
    throw error;
  }
}

/**
 * Sync all orders for a customer
 * Uses ID comparison to guarantee no data is missed from WAWI.
 * @param {Object} customer - Local customer document
 * @param {Number} partnerId - WAWI partner/contact ID
 * @param {Object} options - Sync options
 * @param {Array|null} options.prefetchedOrders - Pre-fetched orders to process directly (skips WAWI API call)
 */
async function syncCustomerOrders(customer, partnerId, options = {}) {
  const { prefetchedOrders = null, forceRefresh = false } = options;
  const batchSize = 50;

  if (prefetchedOrders) {
    // Use pre-fetched orders directly (from incremental sync) - no API calls needed
    await processBatch(
      prefetchedOrders,
      async (wawiOrder) => {
        try {
          await withRetry(async () => {
            const order = await upsertOrder(wawiOrder, customer._id);
            cascadeStatus.progress.orders++;

            if (wawiOrder.lines && wawiOrder.lines.length > 0) {
              await syncOrderLinesWithProducts(wawiOrder.lines, order, {
                forceRefresh,
              });
            }
          });
        } catch (err) {
          console.error(
            `[CascadeSync] Error syncing order ${wawiOrder.id} (after retry):`,
            err.message,
          );
          cascadeStatus.errors.push({
            orderId: wawiOrder.id,
            error: err.message,
          });
        }
      },
      10,
    );
  } else {
    // Step 1: Fetch all order IDs from WAWI for this customer (lightweight)
    let allWawiOrderIds = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const idsResult = await wawiApiClient.searchRead("pos.order", {
        fields: ["id"],
        domain: [["partner_id", "=", partnerId]],
        order: "id asc",
        limit: 500,
        offset,
      });

      const batch = idsResult.data || [];
      if (batch.length === 0) break;
      allWawiOrderIds = allWawiOrderIds.concat(batch.map((o) => o.id));
      offset += batch.length;
      if (batch.length < 500) hasMore = false;
    }

    // Step 2: Compare with local DB to find missing orders
    const localOrderIds = await getLocalOrderIds(customer._id);
    const missingOrderIds = allWawiOrderIds.filter(
      (id) => !localOrderIds.has(id),
    );

    if (missingOrderIds.length === 0) {
      console.log(
        `[CascadeSync] Customer ${partnerId}: all ${allWawiOrderIds.length} orders already synced`,
      );
      cascadeStatus.skippedOrders++;
    } else {
      console.log(
        `[CascadeSync] Customer ${partnerId}: ${missingOrderIds.length} new orders out of ${allWawiOrderIds.length} total`,
      );

      // Step 3: Fetch full details only for missing orders (in batches)
      for (let i = 0; i < missingOrderIds.length; i += batchSize) {
        const batchIds = missingOrderIds.slice(i, i + batchSize);
        const ordersResult = await wawiApiClient.searchRead("pos.order", {
          fields: ORDER_FIELDS,
          domain: [["id", "in", batchIds]],
          order: "date_order desc",
        });

        const orders = ordersResult.data || [];
        await processBatch(
          orders,
          async (wawiOrder) => {
            try {
              await withRetry(async () => {
                const order = await upsertOrder(wawiOrder, customer._id);
                cascadeStatus.progress.orders++;

                if (wawiOrder.lines && wawiOrder.lines.length > 0) {
                  await syncOrderLinesWithProducts(wawiOrder.lines, order, {
                    forceRefresh,
                  });
                }
              });
            } catch (err) {
              console.error(
                `[CascadeSync] Error syncing order ${wawiOrder.id} (after retry):`,
                err.message,
              );
              cascadeStatus.errors.push({
                orderId: wawiOrder.id,
                error: err.message,
              });
            }
          },
          10,
        );
      }
    }
  }

  // Return ALL local orders for this customer (not just newly synced)
  // because checkAndCreateDiscountGroup() needs the complete list
  const allLocalOrders = await Order.find({ customerId: customer._id });
  return allLocalOrders;
}

/**
 * Sync order lines and their products
 */
async function syncOrderLinesWithProducts(lineIds, order, options = {}) {
  cascadeStatus.currentStep = "orderLines";
  const { forceRefresh = false } = options;

  // Always fetch order lines from WAWI to ensure data is up-to-date
  const linesResult = await wawiApiClient.searchRead("pos.order.line", {
    fields: ORDER_LINE_FIELDS,
    domain: [["id", "in", lineIds]],
  });

  const lines = linesResult.data || [];
  const orderLineIds = [];
  const productIdsToSync = new Set();

  // Step 1: Collect all product IDs first
  for (const line of lines) {
    const productId = Array.isArray(line.product_id)
      ? line.product_id[0]
      : line.product_id;
    if (productId) {
      productIdsToSync.add(productId);
    }
  }

  // Step 2: Sync all products FIRST in parallel (so productRef can be set correctly)
  cascadeStatus.currentStep = "products";
  await processBatch(
    Array.from(productIdsToSync),
    async (productId) => {
      await syncProductWithAttributes(productId, forceRefresh);
    },
    10,
  );

  // Step 3: Now create/update order lines in parallel with correct productRef
  cascadeStatus.currentStep = "orderLines";
  const lineResults = await Promise.allSettled(
    lines.map(async (line) => {
      try {
        const orderLine = await upsertOrderLine(line, order);
        cascadeStatus.progress.orderLines++;
        return orderLine._id;
      } catch (err) {
        console.error(
          `[CascadeSync] Error syncing order line ${line.id}:`,
          err.message,
        );
        return null;
      }
    }),
  );

  for (const result of lineResults) {
    if (result.status === "fulfilled" && result.value) {
      orderLineIds.push(result.value);
    }
  }

  // Update order with line references
  if (orderLineIds.length > 0) {
    // Get eligible discount amount
    const discountAmount = await getOrderEligibleAmount(order._id);
    await Order.findByIdAndUpdate(order._id, {
      orderLines: orderLineIds,
      amountTotalBonusApplied: discountAmount,
    });
  }
}

/**
 * Sync a product with its attributes and values
 */
async function syncProductWithAttributes(productId, forceRefresh = false) {
  try {
    // Check if product already exists and was synced recently (within 1 hour)
    // Skip cache on forceRefresh (full/manual sync)
    if (!forceRefresh) {
      const existingProduct = await Product.findOne({ productId });
      if (existingProduct && existingProduct.syncedAt) {
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (existingProduct.syncedAt > hourAgo) {
          return existingProduct; // Skip if recently synced
        }
      }
    }

    // Fetch product from WAWI
    const productResult = await wawiApiClient.searchRead("product.product", {
      fields: PRODUCT_FIELDS,
      domain: [["id", "=", productId]],
      limit: 1,
    });

    if (!productResult.data || productResult.data.length === 0) {
      return null;
    }

    const wawiProduct = productResult.data[0];
    const product = await upsertProduct(wawiProduct);
    cascadeStatus.progress.products++;

    // Sync product attribute values if present
    if (wawiProduct.product_template_attribute_value_ids?.length > 0) {
      await syncProductAttributeValues(
        wawiProduct.product_template_attribute_value_ids,
        product,
      );
    }

    return product;
  } catch (err) {
    console.error(
      `[CascadeSync] Error syncing product ${productId}:`,
      err.message,
    );
    return null;
  }
}

/**
 * Sync product attribute values
 */
async function syncProductAttributeValues(valueIds, product) {
  try {
    // Fetch attribute values from WAWI
    const valuesResult = await wawiApiClient.searchRead(
      "product.template.attribute.value",
      {
        fields: ["id", "name", "attribute_id", "product_attribute_value_id"],
        domain: [["id", "in", valueIds]],
      },
    );

    const values = valuesResult.data || [];
    const attributeValues = [];

    for (const value of values) {
      const attributeId = Array.isArray(value.attribute_id)
        ? value.attribute_id[0]
        : value.attribute_id;
      const attributeName = Array.isArray(value.attribute_id)
        ? value.attribute_id[1]
        : "";

      // Ensure attribute exists
      await ensureAttribute(attributeId, attributeName);

      // Ensure attribute value exists
      const valueId = Array.isArray(value.product_attribute_value_id)
        ? value.product_attribute_value_id[0]
        : value.product_attribute_value_id;

      if (valueId) {
        await ensureAttributeValue(valueId, attributeId, value.name);
      }

      attributeValues.push({
        wawiAttributeId: attributeId,
        attributeName,
        wawiValueId: valueId,
        valueName: value.name,
      });
    }

    // Update product with attribute values
    if (attributeValues.length > 0) {
      await Product.findByIdAndUpdate(product._id, {
        attributeValues,
      });
    }
  } catch (err) {
    console.error(
      `[CascadeSync] Error syncing product attributes:`,
      err.message,
    );
  }
}

/**
 * Ensure attribute exists in database
 */
async function ensureAttribute(attributeId, name) {
  const existing = await ProductAttribute.findOne({ attributeId });
  if (!existing && attributeId) {
    await ProductAttribute.create({
      attributeId,
      name: name || "Unknown Attribute",
      syncedAt: new Date(),
    });
  }
  return existing;
}

/**
 * Ensure attribute value exists in database
 */
async function ensureAttributeValue(valueId, attributeId, name) {
  const existing = await ProductAttributeValue.findOne({ valueId });
  if (!existing && valueId) {
    const attribute = await ProductAttribute.findOne({ attributeId });
    await ProductAttributeValue.create({
      valueId,
      attributeId: attribute?._id,
      wawiAttributeId: attributeId,
      name: name || "Unknown Value",
      syncedAt: new Date(),
    });
  }
  return existing;
}

/**
 * Check if an order line should be excluded from the bonus-eligible amount.
 * Excludes: items marked ineligible, true payment vouchers / gift cards
 * (Gutschein / Voucher / Gift), and Sale items (positive items with a
 * per-line discount).
 *
 * Does NOT exclude negative adjustment lines (Sonderrabatt, Bonus Kundenkarte,
 * credit notes) — those are summed as deductions so the eligible amount
 * reflects what the customer actually paid. Excluding them (they are negative)
 * would inflate the base and over-credit the bonus.
 */

function isItemExcludedFromEligibleAmount(item) {
  if (item.discountEligible === false) return true;
  const name = (item.productName || item.fullProductName || "").toLowerCase();
  if (
    name.includes("gutschein") ||
    name.includes("voucher") ||
    name.includes("gift")
  ) {
    return true;
  }

  // Sale items: positive lines that already carry a per-line discount
  if ((item.discount || 0) > 0 && (item.priceSubtotalIncl || 0) > 0) {
    return true;
  }

  return false;
}

/**
 * Get eligible bonus amount for an order.
 * Sums signed priceSubtotalIncl across non-excluded lines so that
 * Sonderrabatt, returned items and similar negative adjustments reduce
 * the eligible amount. May return a negative value for pure-return receipts.
 */
async function getOrderEligibleAmount(orderId) {
  const orderLines = await OrderLine.find({ orderId });
  let eligibleAmount = 0;
  for (const line of orderLines) {
    if (isItemExcludedFromEligibleAmount(line)) {
      continue;
    }
    eligibleAmount +=
      line.priceSubtotalIncl || line.priceUnit * (line.quantity || 1);
  }
  // Previously clamped to 0 (Math.max(0, eligibleAmount)) which hid pure-return
  // receipts from the bonus program entirely. Returning the signed total lets
  // checkAndCreateDiscountGroup route negative orders into a balance deduction.
  return eligibleAmount;
}

/**
 * Check and create discount group when customer has 3+ eligible orders
 */
async function checkAndCreateDiscountGroup(customer, orders) {
  const ORDERS_FOR_DISCOUNT = 3;
  const DISCOUNT_RATE = 0.1; // 10% discount

  // Get orders not yet in a discount group
  const existingGroups = await DiscountOrder.find({ customerId: customer._id });
  const ordersInGroups = new Set();
  existingGroups.forEach((group) => {
    group.orders.forEach((o) => ordersInGroups.add(o.orderId.toString()));
  });

  // Recompute stored amounts for existing non-redeemed groups so the eligible
  // base / discount stay consistent with the current calculation (e.g. after
  // the Sonderrabatt/Bonus Kundenkarte netting fix). Redeemed groups are left
  // untouched to preserve historical payouts.
  for (const group of existingGroups) {
    if (group.status === "redeemed") continue;

    const oldTotal = group.totalDiscount || 0;
    for (const line of group.orders) {
      const amount = await getOrderEligibleAmount(line.orderId);
      line.amount = amount;
      line.discountAmount = amount * (line.discountRate || DISCOUNT_RATE);
    }
    await group.save(); // pre-save hook recomputes totalDiscount / totalAmount
    const newTotal = group.totalDiscount || 0;

    const delta = newTotal - oldTotal;
    if (Math.abs(delta) >= 0.005) {
      await Customer.findByIdAndUpdate(customer._id, {
        $inc: { wallet: delta, totalDiscountGranted: delta },
      });
      await Discount.findOneAndUpdate(
        { customerId: customer._id },
        {
          $inc: { balance: delta, totalGranted: delta },
          partnerId: customer.contactId,
          status: 1,
        },
        { upsert: true, new: true },
      );
      console.log(
        `[CascadeSync] Recomputed group ${group._id} for ${customer.name}: €${oldTotal.toFixed(2)} → €${newTotal.toFixed(2)} (Δ €${delta.toFixed(2)})`,
      );
    }
  }

  // Filter eligible orders (not in any group, has eligible items).
  // Pure-return receipts (negative eligible amount) bypass bundling and
  // accrue a pending bonus deduction on the customer, applied at the next
  // manual redemption (wallet/balance are NOT touched here).
  //
  // Previous logic skipped any order with amountTotal<=0 or eligibleAmount<=0,
  // which silently dropped pure-return receipts from the bonus program:
  //   if (!order || !order.amountTotal || order.amountTotal <= 0) continue;
  //   const eligibleAmount = await getOrderEligibleAmount(order._id);
  //   if (eligibleAmount <= 0) continue;
  const eligibleOrders = [];
  const orderEligibleAmounts = new Map();
  for (const order of orders) {
    if (!order) continue;
    // Skip if already in a discount group
    if (ordersInGroups.has(order._id.toString())) continue;

    // Calculate eligible amount from individual items (signed; excludes Sale items, vouchers, etc.)
    const eligibleAmount = await getOrderEligibleAmount(order._id);

    if (eligibleAmount > 0) {
      eligibleOrders.push(order);
      orderEligibleAmounts.set(order._id.toString(), eligibleAmount);
      continue;
    }

    if (eligibleAmount < 0 && !order.bonusDeductionApplied) {
      // Pure-return receipt: do NOT touch wallet/balance here. Accumulate the
      // bonus owed back on the customer; it is subtracted at the next manual
      // redemption (see redeemDiscountGroup).
      console.log({ eligibleAmount });
      const returnAmount = Math.abs(eligibleAmount);
      const deduction = returnAmount * DISCOUNT_RATE;

      const updatedCustomer = await Customer.findByIdAndUpdate(
        customer._id,
        { $inc: { pendingReturnDeduction: deduction } },
        { new: true },
      );

      await Order.findByIdAndUpdate(order._id, {
        bonusDeductionApplied: true,
      });

      // System-generated audit entry so the origin of the deduction is traceable
      const newPending = updatedCustomer?.pendingReturnDeduction || deduction;
      await NotesHistory.create({
        customerId: customer._id,
        notes: `Rückgabe erfasst: Beleg ${order.posReference || order.orderId} über −€${returnAmount.toFixed(2)}. Offener Bonusabzug erhöht um €${deduction.toFixed(2)} auf €${newPending.toFixed(2)}.`,
        changedByName: "System",
        source: "system",
      });

      console.log(
        `[CascadeSync] Accrued return deduction for customer ${customer.name}: +€${deduction.toFixed(2)} pending (return €${returnAmount.toFixed(2)})`,
      );
    }
  }
  // console.log({ eligibleOrders });
  // Sort by date oldest first so groups are created chronologically
  // (oldest purchases get grouped first, newest remain ungrouped until enough accumulate)
  eligibleOrders.sort((a, b) => new Date(a.orderDate) - new Date(b.orderDate));

  // Create discount groups for every 3 orders
  let groupsCreated = 0;
  while (eligibleOrders.length >= ORDERS_FOR_DISCOUNT) {
    const groupOrders = eligibleOrders.splice(0, ORDERS_FOR_DISCOUNT);
    // Sort within group: newest first for display (bundleIndex 0 = newest)
    groupOrders.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));

    const discountOrderItems = groupOrders.map((order, index) => {
      const eligibleAmount =
        orderEligibleAmounts.get(order._id.toString()) ?? 0;
      return {
        orderId: order._id,
        amount: eligibleAmount,
        discountRate: DISCOUNT_RATE,
        discountAmount: eligibleAmount * DISCOUNT_RATE,
        bundleIndex: index,
      };
    });

    // console.log({ discountOrderItems });
    // Create discount group
    const discountGroup = await DiscountOrder.create({
      customerId: customer._id,
      partnerId: customer.contactId,
      orders: discountOrderItems,
      status: "available",
      notes: `Auto-created from ${ORDERS_FOR_DISCOUNT} orders sync`,
    });

    groupsCreated++;
    cascadeStatus.progress.discountGroups++;
    console.log(
      `[CascadeSync] Created discount group for customer ${customer.name}: €${discountGroup.totalDiscount.toFixed(2)}`,
    );

    // Also update customer wallet
    const totalDiscount = discountOrderItems.reduce(
      (sum, o) => sum + o.discountAmount,
      0,
    );
    await Customer.findByIdAndUpdate(customer._id, {
      $inc: {
        wallet: totalDiscount,
        totalDiscountGranted: totalDiscount,
      },
    });

    // Create/update Discount record
    await Discount.findOneAndUpdate(
      { customerId: customer._id },
      {
        $inc: { balance: totalDiscount, totalGranted: totalDiscount },
        partnerId: customer.contactId,
        status: 1,
      },
      { upsert: true, new: true },
    );
  }

  return groupsCreated;
}

/**
 * Run full cascading sync for all customers
 * Continues even if individual items fail - logs errors and moves on
 */
async function runFullCascadeSync(options = {}) {
  const { batchSize = 50, onProgress } = options;

  if (cascadeStatus.isRunning) {
    throw new Error("Cascade sync already in progress");
  }

  cascadeStatus = {
    isRunning: true,
    currentStep: "starting",
    progress: {
      customers: 0,
      orders: 0,
      orderLines: 0,
      products: 0,
      discountGroups: 0,
    },
    skipped: 0,
    skippedOrders: 0,
    skippedOrderLines: 0,
    errors: [],
    startTime: new Date(),
  };

  let offset = 0;
  let hasMore = true;
  let consecutiveErrors = 0;
  let batchRetries = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;

  console.log("[CascadeSync] Starting full cascade sync...");

  try {
    // First sync all attributes and values (they're needed for products)
    cascadeStatus.currentStep = "attributes";
    try {
      await syncAllAttributes();
      await syncAllAttributeValues();
      consecutiveErrors = 0;
    } catch (err) {
      console.error(
        "[CascadeSync] Error syncing attributes, continuing...",
        err.message,
      );
      cascadeStatus.errors.push({ step: "attributes", error: err.message });
    }

    // Then sync customers with their data
    while (hasMore) {
      try {
        const result = await wawiApiClient.searchRead("res.partner", {
          fields: CUSTOMER_FIELDS,
          limit: batchSize,
          offset,
          order: "id asc",
          domain: [["customer_rank", ">", 0]],
        });

        consecutiveErrors = 0; // Reset on successful API call
        batchRetries = 0;

        const customers = result.data || [];
        if (customers.length === 0) {
          hasMore = false;
          break;
        }

        await processBatch(
          customers,
          async (wawiCustomer) => {
            try {
              // Upsert customer from already-fetched data (avoid re-fetching from WAWI)
              const customer = await upsertCustomer(wawiCustomer);
              cascadeStatus.progress.customers++;

              // Sync orders (uses ID comparison - only fetches missing orders)
              cascadeStatus.currentStep = "orders";
              const orders = await syncCustomerOrders(
                customer,
                wawiCustomer.id,
                { forceRefresh: true },
              );

              // Check discount groups
              cascadeStatus.currentStep = "discount";
              await checkAndCreateDiscountGroup(customer, orders);

              consecutiveErrors = 0;
            } catch (err) {
              console.error(
                `[CascadeSync] Error syncing customer ${wawiCustomer.id}:`,
                err.message,
              );
              cascadeStatus.errors.push({
                customerId: wawiCustomer.id,
                error: err.message,
              });
              cascadeStatus.skipped++;

              if (
                err.message.includes("401") ||
                err.message.includes("Unauthorized")
              ) {
                consecutiveErrors++;
                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                  console.error(
                    "[CascadeSync] Too many consecutive auth errors, pausing sync...",
                  );
                  await new Promise((resolve) => setTimeout(resolve, 5000));
                  consecutiveErrors = 0;
                }
              }
            }
          },
          5,
        );

        offset += batchSize;

        if (onProgress) {
          onProgress(cascadeStatus.progress);
        }

        if (customers.length < batchSize) {
          hasMore = false;
        }
      } catch (err) {
        console.error(
          `[CascadeSync] Batch error at offset ${offset}:`,
          err.message,
        );
        cascadeStatus.errors.push({ batch: offset, error: err.message });
        batchRetries++;
        consecutiveErrors++;

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(
            "[CascadeSync] Too many consecutive errors, stopping sync",
          );
          break;
        }

        // Retry same batch up to 2 times before skipping
        if (batchRetries >= 2) {
          console.error(
            `[CascadeSync] Skipping batch at offset ${offset} after ${batchRetries} retries`,
          );
          offset += batchSize;
          batchRetries = 0;
        } else {
          console.log(
            `[CascadeSync] Retrying batch at offset ${offset} (attempt ${batchRetries + 1})`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    cascadeStatus.currentStep = "completed";
    cascadeStatus.endTime = new Date();
    console.log("[CascadeSync] Full cascade sync completed:", {
      ...cascadeStatus.progress,
      skippedOrders: cascadeStatus.skippedOrders,
      skippedOrderLines: cascadeStatus.skippedOrderLines,
      errors: cascadeStatus.errors.length,
      skipped: cascadeStatus.skipped,
    });
  } catch (err) {
    cascadeStatus.error = err.message;
    console.error("[CascadeSync] Sync failed:", err.message);
    // Don't throw - let the sync complete what it can
  } finally {
    cascadeStatus.isRunning = false;
  }

  return cascadeStatus;
}

/**
 * Sync all product attributes
 */
async function syncAllAttributes() {
  let offset = 0;
  let hasMore = true;
  let totalSynced = 0;
  const batchSize = 500;

  while (hasMore) {
    const result = await wawiApiClient.searchRead("product.attribute", {
      fields: ATTRIBUTE_FIELDS,
      limit: batchSize,
      offset,
      order: "id asc",
    });

    const batch = result.data || [];
    if (batch.length === 0) break;

    for (const attr of batch) {
      await ProductAttribute.findOneAndUpdate(
        { attributeId: attr.id },
        {
          attributeId: attr.id,
          name: attr.name || "Unknown",
          displayType: attr.display_type || "radio",
          createVariant: attr.create_variant || "always",
          sequence: attr.sequence || 0,
          syncedAt: new Date(),
        },
        { upsert: true },
      );
    }

    totalSynced += batch.length;
    offset += batch.length;
    if (batch.length < batchSize) hasMore = false;
  }

  console.log(`[CascadeSync] Synced ${totalSynced} product attributes`);
}

/**
 * Sync all product attribute values
 */
async function syncAllAttributeValues() {
  let offset = 0;
  let hasMore = true;
  let totalSynced = 0;
  const batchSize = 1000;

  while (hasMore) {
    const result = await wawiApiClient.searchRead("product.attribute.value", {
      fields: ATTRIBUTE_VALUE_FIELDS,
      limit: batchSize,
      offset,
      order: "id asc",
    });

    const batch = result.data || [];
    if (batch.length === 0) break;

    for (const val of batch) {
      const attributeId = Array.isArray(val.attribute_id)
        ? val.attribute_id[0]
        : val.attribute_id;

      const attribute = await ProductAttribute.findOne({ attributeId });

      await ProductAttributeValue.findOneAndUpdate(
        { valueId: val.id },
        {
          valueId: val.id,
          attributeId: attribute?._id,
          wawiAttributeId: attributeId,
          name: val.name || "Unknown",
          htmlColor: val.html_color || undefined,
          sequence: val.sequence || 0,
          isCustom: val.is_custom || false,
          syncedAt: new Date(),
        },
        { upsert: true },
      );
    }

    totalSynced += batch.length;
    offset += batch.length;
    if (batch.length < batchSize) hasMore = false;
  }

  console.log(`[CascadeSync] Synced ${totalSynced} attribute values`);
}

// Helper functions
async function upsertCustomer(wawiCustomer) {
  const customerData = {
    contactId: wawiCustomer.id,
    ref: wawiCustomer.ref || `WAWI-${wawiCustomer.id}`,
    name: wawiCustomer.name || "Unknown",
    email: wawiCustomer.email || undefined,
    phone: wawiCustomer.phone || undefined,
    mobile: wawiCustomer.mobile || undefined,
    address: {
      street: wawiCustomer.street || undefined,
      street2: wawiCustomer.street2 || undefined,
      postalCode: wawiCustomer.zip || undefined,
      city: wawiCustomer.city || undefined,
      country: Array.isArray(wawiCustomer.country_id)
        ? wawiCustomer.country_id[1]
        : undefined,
    },
    companyType: wawiCustomer.company_type || "person",
    syncedAt: new Date(),
  };

  // Match by contactId or email
  const findQuery = [{ contactId: wawiCustomer.id }];
  if (wawiCustomer.email) {
    findQuery.push({ email: wawiCustomer.email.toLowerCase() });
  }

  return Customer.findOneAndUpdate({ $or: findQuery }, customerData, {
    upsert: true,
    new: true,
  });
}

async function upsertOrder(wawiOrder, customerId) {
  const partnerId = Array.isArray(wawiOrder.partner_id)
    ? wawiOrder.partner_id[0]
    : wawiOrder.partner_id;

  const orderData = {
    orderId: wawiOrder.id,
    posReference: wawiOrder.pos_reference || wawiOrder.name,
    customerId,
    partnerId,
    orderDate: wawiOrder.date_order
      ? new Date(wawiOrder.date_order)
      : new Date(),
    amountTotal: wawiOrder.amount_total || 0,
    amountPaid: wawiOrder.amount_paid || 0,
    amountTax: wawiOrder.amount_tax || 0,
    state: mapOrderState(wawiOrder.state),
    cashier: wawiOrder.cashier || undefined,
    isInvoiced: wawiOrder.is_invoiced || false,
    isRefunded: wawiOrder.is_refunded || false,
    syncedAt: new Date(),
  };

  return Order.findOneAndUpdate({ orderId: wawiOrder.id }, orderData, {
    upsert: true,
    new: true,
  });
}

async function upsertOrderLine(line, order) {
  const productId = Array.isArray(line.product_id)
    ? line.product_id[0]
    : line.product_id;

  const product = await Product.findOne({ productId });

  const lineData = {
    orderLineId: line.id,
    orderId: order._id,
    wawiOrderId: order.orderId,
    productId,
    productRef: product?._id,
    productName: line.name || "Unknown Product",
    fullProductName: line.full_product_name || line.name,
    quantity: line.qty || 1,
    priceUnit: line.price_unit || 0,
    discount: line.discount || 0,
    priceSubtotal: line.price_subtotal || 0,
    priceSubtotalIncl: line.price_subtotal_incl || 0,
    syncedAt: new Date(),
  };

  return OrderLine.findOneAndUpdate({ orderLineId: line.id }, lineData, {
    upsert: true,
    new: true,
  });
}

async function upsertProduct(wawiProduct) {
  const templateId = Array.isArray(wawiProduct.product_tmpl_id)
    ? wawiProduct.product_tmpl_id[0]
    : wawiProduct.product_tmpl_id;

  // Get image from base64 field (image_512 from product.product)
  let image = undefined;
  if (wawiProduct.image_512 && wawiProduct.image_512 !== false) {
    image = `data:image/png;base64,${wawiProduct.image_512}`;
  }

  const productData = {
    productId: wawiProduct.id,
    productTemplateId: templateId,
    name: wawiProduct.name || "Unknown Product",
    defaultCode: wawiProduct.default_code || undefined,
    barcode: wawiProduct.barcode || undefined,
    listPrice: wawiProduct.list_price || 0,
    standardPrice: wawiProduct.standard_price || 0,
    categoryId: Array.isArray(wawiProduct.categ_id)
      ? wawiProduct.categ_id[0]
      : undefined,
    categoryName: Array.isArray(wawiProduct.categ_id)
      ? wawiProduct.categ_id[1]
      : undefined,
    active: wawiProduct.active !== false,
    availableInPos: wawiProduct.available_in_pos !== false,
    type: wawiProduct.type || "product",
    description: wawiProduct.description_sale || undefined,
    image: image,
    combinationIndices: wawiProduct.combination_indices || undefined,
    syncedAt: new Date(),
  };

  return Product.findOneAndUpdate({ productId: wawiProduct.id }, productData, {
    upsert: true,
    new: true,
  });
}

function mapOrderState(wawiState) {
  const stateMap = {
    draft: "pending",
    paid: "paid",
    done: "completed",
    invoiced: "invoiced",
    cancel: "refunded",
  };
  return stateMap[wawiState] || "pending";
}

/**
 * Incremental sync - syncs only recent orders (from last sync or last 24 hours)
 * This is designed for cron jobs to run frequently without duplicates
 * Continues even if individual items fail
 */
async function runIncrementalSync(options = {}) {
  const { hoursBack = 24, onProgress } = options;

  if (cascadeStatus.isRunning) {
    console.log("[CascadeSync] Sync already in progress, skipping...");
    return null;
  }

  cascadeStatus = {
    isRunning: true,
    currentStep: "incremental",
    progress: {
      customers: 0,
      orders: 0,
      orderLines: 0,
      products: 0,
      discountGroups: 0,
    },
    skipped: 0,
    skippedOrders: 0,
    skippedOrderLines: 0,
    errors: [],
    startTime: new Date(),
  };

  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  console.log(
    `[CascadeSync] Starting incremental sync (last ${hoursBack} hours)...`,
  );

  try {
    // Calculate the cutoff date
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursBack);
    const cutoffStr = cutoffDate
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    // Fetch recent orders from WAWI (paginated)
    cascadeStatus.currentStep = "fetching_orders";
    let allRecentOrders = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let ordersResult;
      try {
        ordersResult = await wawiApiClient.searchRead("pos.order", {
          fields: ORDER_FIELDS,
          domain: [["write_date", ">=", cutoffStr]],
          order: "write_date desc",
          limit: 500,
          offset,
        });
      } catch (err) {
        console.error("[CascadeSync] Error fetching orders:", err.message);
        cascadeStatus.errors.push({
          step: "fetching_orders",
          error: err.message,
        });
        cascadeStatus.currentStep = "failed";
        cascadeStatus.isRunning = false;
        return cascadeStatus;
      }

      const batch = ordersResult.data || [];
      if (batch.length === 0) break;
      allRecentOrders = allRecentOrders.concat(batch);
      offset += batch.length;
      if (batch.length < 500) hasMore = false;
    }

    console.log(
      `[CascadeSync] Found ${allRecentOrders.length} orders modified in last ${hoursBack} hours`,
    );

    if (allRecentOrders.length === 0) {
      cascadeStatus.currentStep = "completed";
      cascadeStatus.isRunning = false;
      return cascadeStatus;
    }

    // Group orders by customer ID
    const ordersByCustomer = new Map();
    for (const order of allRecentOrders) {
      const customerId = Array.isArray(order.partner_id)
        ? order.partner_id[0]
        : order.partner_id;
      if (!customerId) continue;
      if (!ordersByCustomer.has(customerId)) {
        ordersByCustomer.set(customerId, []);
      }
      ordersByCustomer.get(customerId).push(order);
    }

    console.log(
      `[CascadeSync] Processing ${ordersByCustomer.size} unique customers with pre-fetched orders...`,
    );

    // Process each customer with their pre-fetched orders in parallel (no redundant API calls)
    const customerEntries = Array.from(ordersByCustomer.entries());
    await processBatch(
      customerEntries,
      async ([customerId, customerOrders]) => {
        try {
          cascadeStatus.currentStep = `customer_${customerId}`;
          await syncCustomerWithRelatedData(customerId, {
            prefetchedOrders: customerOrders,
          });
          consecutiveErrors = 0;

          if (onProgress) {
            onProgress(cascadeStatus.progress);
          }
        } catch (err) {
          console.error(
            `[CascadeSync] Error syncing customer ${customerId}:`,
            err.message,
          );
          cascadeStatus.errors.push({ customerId, error: err.message });
          cascadeStatus.skipped++;

          if (
            err.message.includes("401") ||
            err.message.includes("Unauthorized")
          ) {
            consecutiveErrors++;
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
              console.error(
                "[CascadeSync] Too many consecutive auth errors, pausing...",
              );
              await new Promise((resolve) => setTimeout(resolve, 5000));
              consecutiveErrors = 0;
            }
          }
        }
      },
      5,
    );

    cascadeStatus.currentStep = "completed";
    cascadeStatus.endTime = new Date();
    console.log("[CascadeSync] Incremental sync completed:", {
      ...cascadeStatus.progress,
      skippedOrders: cascadeStatus.skippedOrders,
      skippedOrderLines: cascadeStatus.skippedOrderLines,
      errors: cascadeStatus.errors.length,
      skipped: cascadeStatus.skipped,
    });

    return cascadeStatus;
  } catch (err) {
    cascadeStatus.error = err.message;
    console.error("[CascadeSync] Incremental sync failed:", err.message);
    // Don't throw - return status with error info
    return cascadeStatus;
  } finally {
    cascadeStatus.isRunning = false;
  }
}

/**
 * Sync a single customer by their WAWI contact ID or email
 * Creates customer if not exists, updates if exists
 * Returns the synced customer with order count
 */
async function syncOrCreateCustomer(identifier) {
  let contactId = identifier;

  // If identifier is an email, find customer in WAWI first
  if (typeof identifier === "string" && identifier.includes("@")) {
    const result = await wawiApiClient.searchRead("res.partner", {
      fields: ["id"],
      domain: [
        ["email", "=", identifier],
        ["customer_rank", ">", 0],
      ],
      limit: 1,
    });
    if (!result.data || result.data.length === 0) {
      throw new Error(`Customer with email ${identifier} not found in WAWI`);
    }
    contactId = result.data[0].id;
  }

  return syncCustomerWithRelatedData(contactId);
}

module.exports = {
  getCascadeStatus,
  syncCustomerWithRelatedData,
  syncCustomerOrders,
  syncProductWithAttributes,
  runFullCascadeSync,
  runIncrementalSync,
  syncOrCreateCustomer,
  checkAndCreateDiscountGroup,
  getOrderEligibleAmount,
};
