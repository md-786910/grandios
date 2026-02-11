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
  errors: [],
};

/**
 * Get cascade sync status
 */
function getCascadeStatus() {
  return { ...cascadeStatus };
}

/**
 * Sync a single customer with all related data
 * @param {Number} contactId - WAWI contact ID
 */
async function syncCustomerWithRelatedData(contactId) {
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

    // 2. Sync all orders for this customer
    cascadeStatus.currentStep = "orders";
    const orders = await syncCustomerOrders(customer, contactId);

    // 3. Check and create discount group if needed
    cascadeStatus.currentStep = "discount";
    await checkAndCreateDiscountGroup(customer, orders);

    return {
      customer,
      ordersCount: orders.length,
      success: true,
    };
  } catch (error) {
    cascadeStatus.errors.push({ contactId, error: error.message });
    throw error;
  }
}

/**
 * Sync all orders for a customer
 */
async function syncCustomerOrders(customer, partnerId) {
  const ordersResult = await wawiApiClient.searchRead("pos.order", {
    fields: ORDER_FIELDS,
    domain: [["partner_id", "=", partnerId]],
    order: "date_order desc",
  });

  const orders = ordersResult.data || [];
  const syncedOrders = [];

  for (const wawiOrder of orders) {
    try {
      // Sync order

      // if (wawiOrder.amount_total > 0) {
      const order = await upsertOrder(wawiOrder, customer._id);
      cascadeStatus.progress.orders++;

      // Sync order lines and products
      if (wawiOrder.lines && wawiOrder.lines.length > 0) {
        await syncOrderLinesWithProducts(wawiOrder.lines, order);
      }
      syncedOrders.push(order);
      // }
    } catch (err) {
      console.error(
        `[CascadeSync] Error syncing order ${wawiOrder.id}:`,
        err.message,
      );
      cascadeStatus.errors.push({ orderId: wawiOrder.id, error: err.message });
    }
  }

  return syncedOrders;
}

/**
 * Sync order lines and their products
 */
async function syncOrderLinesWithProducts(lineIds, order) {
  cascadeStatus.currentStep = "orderLines";

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

  // Step 2: Sync all products FIRST (so productRef can be set correctly)
  cascadeStatus.currentStep = "products";
  for (const productId of productIdsToSync) {
    await syncProductWithAttributes(productId);
  }

  // Step 3: Now create/update order lines with correct productRef
  cascadeStatus.currentStep = "orderLines";
  for (const line of lines) {
    try {
      const discount = line.discount || 0;
      if (discount > 0) {
        continue; // Skip syncing this line - it's a discount line, not a product line
      }
      const orderLine = await upsertOrderLine(line, order);
      orderLineIds.push(orderLine._id);
      cascadeStatus.progress.orderLines++;
    } catch (err) {
      console.error(
        `[CascadeSync] Error syncing order line ${line.id}:`,
        err.message,
      );
    }
  }

  // Update order with line references
  if (orderLineIds.length > 0) {
    await Order.findByIdAndUpdate(order._id, { orderLines: orderLineIds });
  }
}

/**
 * Sync a product with its attributes and values
 */
async function syncProductWithAttributes(productId) {
  try {
    // Check if product already exists and was synced recently (within 1 hour)
    const existingProduct = await Product.findOne({ productId });
    if (existingProduct && existingProduct.syncedAt) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (existingProduct.syncedAt > hourAgo) {
        return existingProduct; // Skip if recently synced
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
 * Check if order has any line items with discount > 0
 */
async function orderHasDiscount(orderId) {
  const orderLines = await OrderLine.find({ orderId: orderId });
  return orderLines.some((line) => line.discount && line.discount > 0);
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

  // Filter eligible orders (not in any group, positive amount, no line-item discounts)
  const eligibleOrders = [];
  for (const order of orders) {
    // Skip if already in a discount group
    if (ordersInGroups.has(order._id.toString())) continue;

    // Skip if amount is zero or negative
    if (!order || !order.amountTotal || order.amountTotal <= 0) continue;

    // Skip if order has line items with discounts
    const hasDiscount = await orderHasDiscount(order._id);
    if (hasDiscount) continue;

    eligibleOrders.push(order);
  }

  // Create discount groups for every 3 orders
  while (eligibleOrders.length >= ORDERS_FOR_DISCOUNT) {
    const groupOrders = eligibleOrders.splice(0, ORDERS_FOR_DISCOUNT);

    const discountOrderItems = groupOrders.map((order, index) => ({
      orderId: order._id,
      amount: order.amountTotal,
      discountRate: DISCOUNT_RATE,
      discountAmount: order.amountTotal * DISCOUNT_RATE,
      bundleIndex: index, // Each order is a separate item (not bundled together)
    }));

    // Create discount group
    const discountGroup = await DiscountOrder.create({
      customerId: customer._id,
      partnerId: customer.contactId,
      orders: discountOrderItems,
      status: "available",
      notes: `Auto-created from ${ORDERS_FOR_DISCOUNT} orders sync`,
    });

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
    errors: [],
    startTime: new Date(),
    skipped: 0,
  };

  let offset = 0;
  let hasMore = true;
  let consecutiveErrors = 0;
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

        const customers = result.data || [];
        if (customers.length === 0) {
          hasMore = false;
          break;
        }

        for (const wawiCustomer of customers) {
          try {
            await syncCustomerWithRelatedData(wawiCustomer.id);
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

            // Check for consecutive errors
            if (
              err.message.includes("401") ||
              err.message.includes("Unauthorized")
            ) {
              consecutiveErrors++;
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error(
                  "[CascadeSync] Too many consecutive auth errors, pausing sync...",
                );
                // Wait and try to refresh token
                await new Promise((resolve) => setTimeout(resolve, 5000));
                consecutiveErrors = 0;
              }
            }
          }
        }

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
        consecutiveErrors++;

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(
            "[CascadeSync] Too many consecutive errors, stopping sync",
          );
          break;
        }

        // Wait before retrying next batch
        await new Promise((resolve) => setTimeout(resolve, 3000));
        offset += batchSize; // Skip problematic batch
      }
    }

    cascadeStatus.currentStep = "completed";
    cascadeStatus.endTime = new Date();
    console.log("[CascadeSync] Full cascade sync completed:", {
      ...cascadeStatus.progress,
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
  const result = await wawiApiClient.searchRead("product.attribute", {
    fields: ATTRIBUTE_FIELDS,
    limit: 500,
  });

  for (const attr of result.data || []) {
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
  console.log(
    `[CascadeSync] Synced ${result.data?.length || 0} product attributes`,
  );
}

/**
 * Sync all product attribute values
 */
async function syncAllAttributeValues() {
  const result = await wawiApiClient.searchRead("product.attribute.value", {
    fields: ATTRIBUTE_VALUE_FIELDS,
    limit: 1000,
  });

  for (const val of result.data || []) {
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
  console.log(
    `[CascadeSync] Synced ${result.data?.length || 0} attribute values`,
  );
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
    errors: [],
    startTime: new Date(),
    skipped: 0,
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

    // Fetch recent orders from WAWI
    cascadeStatus.currentStep = "fetching_orders";
    let ordersResult;
    try {
      ordersResult = await wawiApiClient.searchRead("pos.order", {
        fields: ORDER_FIELDS,
        domain: [["write_date", ">=", cutoffStr]],
        order: "write_date desc",
        limit: 500,
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

    const recentOrders = ordersResult.data || [];
    console.log(
      `[CascadeSync] Found ${recentOrders.length} orders modified in last ${hoursBack} hours`,
    );

    if (recentOrders.length === 0) {
      cascadeStatus.currentStep = "completed";
      cascadeStatus.isRunning = false;
      return cascadeStatus;
    }

    // Get unique customer IDs from orders
    const customerIds = [
      ...new Set(
        recentOrders
          .map((o) =>
            Array.isArray(o.partner_id) ? o.partner_id[0] : o.partner_id,
          )
          .filter((id) => id),
      ),
    ];

    console.log(
      `[CascadeSync] Processing ${customerIds.length} unique customers...`,
    );

    // Sync each customer with their related data
    for (const customerId of customerIds) {
      try {
        cascadeStatus.currentStep = `customer_${customerId}`;
        await syncCustomerWithRelatedData(customerId);
        consecutiveErrors = 0; // Reset on success

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

        // Check for auth errors
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
    }

    cascadeStatus.currentStep = "completed";
    cascadeStatus.endTime = new Date();
    console.log("[CascadeSync] Incremental sync completed:", {
      ...cascadeStatus.progress,
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
};
