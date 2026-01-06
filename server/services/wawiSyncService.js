/**
 * WAWI Sync Service
 * Syncs customers, orders, and products from WAWI to MongoDB
 */

const Customer = require("../models/Customer");
const Order = require("../models/Order");
const OrderLine = require("../models/OrderLine");
const Product = require("../models/Product");
const ProductAttribute = require("../models/ProductAttribute");
const ProductAttributeValue = require("../models/ProductAttributeValue");
const wawiApiClient = require("./wawiApiClient");

// Sync status tracking
let syncStatus = {
  isRunning: false,
  lastSync: null,
  currentModel: null,
  progress: { current: 0, total: 0 },
  results: { created: 0, updated: 0, errors: 0 },
  error: null,
};

// Customer fields to fetch from WAWI
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
  "write_date",
];

// Order fields to fetch
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

// Order line fields
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

// Product fields
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
  "write_date",
  "product_tmpl_id",
  "product_template_attribute_value_ids",
  "combination_indices",
  "image_512",
];

// Product attribute fields
const ATTRIBUTE_FIELDS = [
  "id",
  "name",
  "display_type",
  "create_variant",
  "sequence",
  "write_date",
];

// Product attribute value fields
const ATTRIBUTE_VALUE_FIELDS = [
  "id",
  "name",
  "attribute_id",
  "html_color",
  "sequence",
  "is_custom",
  "write_date",
];

/**
 * Get current sync status
 */
function getSyncStatus() {
  return { ...syncStatus };
}

/**
 * Reset sync status
 */
function resetSyncStatus() {
  syncStatus = {
    isRunning: false,
    lastSync: null,
    currentModel: null,
    progress: { current: 0, total: 0 },
    results: { created: 0, updated: 0, errors: 0 },
    error: null,
  };
}

/**
 * Sync customers from WAWI to MongoDB
 */
async function syncCustomers(options = {}) {
  const { batchSize = 100, onProgress } = options;

  let offset = 0;
  let totalSynced = 0;
  let created = 0;
  let updated = 0;
  let hasMore = true;

  console.log("[WawiSync] Starting customer sync...");

  while (hasMore) {
    try {
      const result = await wawiApiClient.searchRead("res.partner", {
        fields: CUSTOMER_FIELDS,
        limit: batchSize,
        offset,
        order: "id asc",
      });

      const customers = result.data;
      if (!customers || customers.length === 0) {
        hasMore = false;
        break;
      }

      for (const wawiCustomer of customers) {
        try {
          const customerData = mapWawiCustomer(wawiCustomer);

          const existing = await Customer.findOne({
            contactId: wawiCustomer.id,
          });

          if (existing) {
            await Customer.findByIdAndUpdate(existing._id, {
              ...customerData,
              syncedAt: new Date(),
            });
            updated++;
          } else {
            await Customer.create({
              ...customerData,
              syncedAt: new Date(),
            });
            created++;
          }

          totalSynced++;
        } catch (err) {
          console.error(
            `[WawiSync] Error syncing customer ${wawiCustomer.id}:`,
            err.message
          );
          syncStatus.results.errors++;
        }
      }

      offset += batchSize;
      syncStatus.progress.current = totalSynced;

      if (onProgress) {
        onProgress({ synced: totalSynced, created, updated });
      }

      // If we got less than batchSize, we're done
      if (customers.length < batchSize) {
        hasMore = false;
      }
    } catch (err) {
      console.error("[WawiSync] Batch error:", err.message);
      hasMore = false;
      throw err;
    }
  }

  console.log(
    `[WawiSync] Customer sync complete: ${created} created, ${updated} updated`
  );
  return { total: totalSynced, created, updated };
}

/**
 * Sync orders from WAWI to MongoDB
 */
async function syncOrders(options = {}) {
  const { batchSize = 100, partnerId, onProgress } = options;

  let offset = 0;
  let totalSynced = 0;
  let created = 0;
  let updated = 0;
  let hasMore = true;

  console.log("[WawiSync] Starting order sync...");

  while (hasMore) {
    try {
      const searchOptions = {
        fields: ORDER_FIELDS,
        limit: batchSize,
        offset,
        order: "date_order desc",
      };

      if (partnerId) {
        searchOptions.domain = [["partner_id", "!=", false]];
      }

      const result = await wawiApiClient.searchRead("pos.order", searchOptions);
      const orders = result.data;
      console.log(orders[0]);

      if (!orders || orders.length === 0) {
        hasMore = false;
        break;
      }

      for (const wawiOrder of orders) {
        try {
          // Skip orders without partner
          if (!wawiOrder.partner_id) continue;

          const partnerId = Array.isArray(wawiOrder.partner_id)
            ? wawiOrder.partner_id[0]
            : wawiOrder.partner_id;

          // Find customer in our DB
          const customer = await Customer.findOne({ contactId: partnerId });
          if (!customer) {
            console.log(
              `[WawiSync] Skipping order ${wawiOrder.id}: customer ${partnerId} not found`
            );
            continue;
          }

          // Fetch order lines
          let orderLines = [];
          if (wawiOrder.lines && wawiOrder.lines.length > 0) {
            const linesResult = await wawiApiClient.searchRead(
              "pos.order.line",
              {
                fields: ORDER_LINE_FIELDS,
                domain: [["id", "in", wawiOrder.lines]],
              }
            );
            orderLines = linesResult.data || [];
          }

          const orderData = mapWawiOrder(wawiOrder, customer._id, orderLines);

          const existing = await Order.findOne({ orderId: wawiOrder.id });
          let savedOrder;

          if (existing) {
            savedOrder = await Order.findByIdAndUpdate(
              existing._id,
              {
                ...orderData,
                syncedAt: new Date(),
              },
              { new: true }
            );
            updated++;
          } else {
            savedOrder = await Order.create({
              ...orderData,
              syncedAt: new Date(),
            });
            created++;
          }

          // Sync order lines to separate collection
          if (orderLines.length > 0 && savedOrder) {
            const orderLineIds = await syncOrderLinesToCollection(
              orderLines,
              savedOrder._id,
              wawiOrder.id
            );
            // Update order with references to OrderLine documents
            if (orderLineIds.length > 0) {
              await Order.findByIdAndUpdate(savedOrder._id, {
                orderLines: orderLineIds,
              });
            }
          }

          totalSynced++;
        } catch (err) {
          console.error(
            `[WawiSync] Error syncing order ${wawiOrder.id}:`,
            err.message
          );
          syncStatus.results.errors++;
        }
      }

      offset += batchSize;
      syncStatus.progress.current = totalSynced;

      if (onProgress) {
        onProgress({ synced: totalSynced, created, updated });
      }

      if (orders.length < batchSize) {
        hasMore = false;
      }
    } catch (err) {
      console.error("[WawiSync] Batch error:", err.message);
      hasMore = false;
      throw err;
    }
  }

  console.log(
    `[WawiSync] Order sync complete: ${created} created, ${updated} updated`
  );
  return { total: totalSynced, created, updated };
}

/**
 * Sync products from WAWI to MongoDB
 */
async function syncProducts(options = {}) {
  const { batchSize = 100, onProgress } = options;

  let offset = 0;
  let totalSynced = 0;
  let created = 0;
  let updated = 0;
  let hasMore = true;

  console.log("[WawiSync] Starting product sync...");

  while (hasMore) {
    try {
      const result = await wawiApiClient.searchRead("product.product", {
        fields: PRODUCT_FIELDS,
        limit: batchSize,
        offset,
        order: "id asc",
        domain: [["available_in_pos", "=", true]],
      });

      const products = result.data;

      if (!products || products.length === 0) {
        hasMore = false;
        break;
      }

      for (const wawiProduct of products) {
        try {
          const productData = mapWawiProduct(wawiProduct);

          const existing = await Product.findOne({ productId: wawiProduct.id });

          if (existing) {
            await Product.findByIdAndUpdate(existing._id, {
              ...productData,
              syncedAt: new Date(),
            });
            updated++;
          } else {
            await Product.create({
              ...productData,
              syncedAt: new Date(),
            });
            created++;
          }

          totalSynced++;
        } catch (err) {
          console.error(
            `[WawiSync] Error syncing product ${wawiProduct.id}:`,
            err.message
          );
          syncStatus.results.errors++;
        }
      }

      offset += batchSize;
      syncStatus.progress.current = totalSynced;

      if (onProgress) {
        onProgress({ synced: totalSynced, created, updated });
      }

      if (products.length < batchSize) {
        hasMore = false;
      }
    } catch (err) {
      console.error("[WawiSync] Batch error:", err.message);
      hasMore = false;
      throw err;
    }
  }

  console.log(
    `[WawiSync] Product sync complete: ${created} created, ${updated} updated`
  );
  return { total: totalSynced, created, updated };
}

/**
 * Sync product attributes from WAWI to MongoDB
 */
async function syncProductAttributes(options = {}) {
  const { batchSize = 100, onProgress } = options;

  let offset = 0;
  let totalSynced = 0;
  let created = 0;
  let updated = 0;
  let hasMore = true;

  console.log("[WawiSync] Starting product attribute sync...");

  while (hasMore) {
    try {
      const result = await wawiApiClient.searchRead("product.attribute", {
        fields: ATTRIBUTE_FIELDS,
        limit: batchSize,
        offset,
        order: "id asc",
      });

      const attributes = result.data;

      if (!attributes || attributes.length === 0) {
        hasMore = false;
        break;
      }

      for (const wawiAttribute of attributes) {
        try {
          const attributeData = mapWawiAttribute(wawiAttribute);

          const existing = await ProductAttribute.findOne({
            attributeId: wawiAttribute.id,
          });

          if (existing) {
            await ProductAttribute.findByIdAndUpdate(existing._id, {
              ...attributeData,
              syncedAt: new Date(),
            });
            updated++;
          } else {
            await ProductAttribute.create({
              ...attributeData,
              syncedAt: new Date(),
            });
            created++;
          }

          totalSynced++;
        } catch (err) {
          console.error(
            `[WawiSync] Error syncing attribute ${wawiAttribute.id}:`,
            err.message
          );
          syncStatus.results.errors++;
        }
      }

      offset += batchSize;
      syncStatus.progress.current = totalSynced;

      if (onProgress) {
        onProgress({ synced: totalSynced, created, updated });
      }

      if (attributes.length < batchSize) {
        hasMore = false;
      }
    } catch (err) {
      console.error("[WawiSync] Batch error:", err.message);
      hasMore = false;
      throw err;
    }
  }

  console.log(
    `[WawiSync] Product attribute sync complete: ${created} created, ${updated} updated`
  );
  return { total: totalSynced, created, updated };
}

/**
 * Sync product attribute values from WAWI to MongoDB
 */
async function syncProductAttributeValues(options = {}) {
  const { batchSize = 100, onProgress } = options;

  let offset = 0;
  let totalSynced = 0;
  let created = 0;
  let updated = 0;
  let hasMore = true;

  console.log("[WawiSync] Starting product attribute value sync...");

  while (hasMore) {
    try {
      const result = await wawiApiClient.searchRead("product.attribute.value", {
        fields: ATTRIBUTE_VALUE_FIELDS,
        limit: batchSize,
        offset,
        order: "id asc",
      });

      const values = result.data;

      if (!values || values.length === 0) {
        hasMore = false;
        break;
      }

      for (const wawiValue of values) {
        try {
          // Find the parent attribute in our DB
          const wawiAttributeId = Array.isArray(wawiValue.attribute_id)
            ? wawiValue.attribute_id[0]
            : wawiValue.attribute_id;

          const attribute = await ProductAttribute.findOne({
            attributeId: wawiAttributeId,
          });

          const valueData = mapWawiAttributeValue(wawiValue, attribute?._id);

          const existing = await ProductAttributeValue.findOne({
            valueId: wawiValue.id,
          });

          if (existing) {
            await ProductAttributeValue.findByIdAndUpdate(existing._id, {
              ...valueData,
              syncedAt: new Date(),
            });
            updated++;
          } else {
            await ProductAttributeValue.create({
              ...valueData,
              syncedAt: new Date(),
            });
            created++;
          }

          totalSynced++;
        } catch (err) {
          console.error(
            `[WawiSync] Error syncing attribute value ${wawiValue.id}:`,
            err.message
          );
          syncStatus.results.errors++;
        }
      }

      offset += batchSize;
      syncStatus.progress.current = totalSynced;

      if (onProgress) {
        onProgress({ synced: totalSynced, created, updated });
      }

      if (values.length < batchSize) {
        hasMore = false;
      }
    } catch (err) {
      console.error("[WawiSync] Batch error:", err.message);
      hasMore = false;
      throw err;
    }
  }

  console.log(
    `[WawiSync] Product attribute value sync complete: ${created} created, ${updated} updated`
  );
  return { total: totalSynced, created, updated };
}

/**
 * Run full sync for all models
 */
async function runFullSync(options = {}) {
  if (syncStatus.isRunning) {
    throw new Error("Sync already in progress");
  }

  syncStatus.isRunning = true;
  syncStatus.error = null;
  syncStatus.results = { created: 0, updated: 0, errors: 0 };

  const results = {
    customers: null,
    orders: null,
    products: null,
    productAttributes: null,
    productAttributeValues: null,
    startTime: new Date(),
    endTime: null,
  };

  try {
    // Sync customers first
    syncStatus.currentModel = "customers";
    results.customers = await syncCustomers(options);
    syncStatus.results.created += results.customers.created;
    syncStatus.results.updated += results.customers.updated;

    // Then sync orders
    syncStatus.currentModel = "orders";
    results.orders = await syncOrders(options);
    syncStatus.results.created += results.orders.created;
    syncStatus.results.updated += results.orders.updated;

    // Sync product attributes (must be before products for attribute value linking)
    syncStatus.currentModel = "productAttributes";
    results.productAttributes = await syncProductAttributes(options);
    syncStatus.results.created += results.productAttributes.created;
    syncStatus.results.updated += results.productAttributes.updated;

    // Sync product attribute values
    syncStatus.currentModel = "productAttributeValues";
    results.productAttributeValues = await syncProductAttributeValues(options);
    syncStatus.results.created += results.productAttributeValues.created;
    syncStatus.results.updated += results.productAttributeValues.updated;

    // Finally sync products
    syncStatus.currentModel = "products";
    results.products = await syncProducts(options);
    syncStatus.results.created += results.products.created;
    syncStatus.results.updated += results.products.updated;

    results.endTime = new Date();
    syncStatus.lastSync = results.endTime;

    console.log("[WawiSync] Full sync completed successfully");
  } catch (err) {
    syncStatus.error = err.message;
    console.error("[WawiSync] Full sync failed:", err.message);
    throw err;
  } finally {
    syncStatus.isRunning = false;
    syncStatus.currentModel = null;
  }

  return results;
}

/**
 * Sync order lines to separate OrderLine collection
 * @param {Array} orderLines - Order lines from WAWI
 * @param {ObjectId} orderMongoId - MongoDB Order document ID
 * @param {Number} wawiOrderId - WAWI order ID
 * @returns {Array} Array of OrderLine document IDs
 */
async function syncOrderLinesToCollection(
  orderLines,
  orderMongoId,
  wawiOrderId
) {
  const orderLineIds = [];

  for (const line of orderLines) {
    try {
      const productId = Array.isArray(line.product_id)
        ? line.product_id[0]
        : line.product_id;

      // Find product reference in our DB
      const product = await Product.findOne({ productId });

      const lineData = {
        orderLineId: line.id,
        orderId: orderMongoId,
        wawiOrderId: wawiOrderId,
        productId: productId,
        productRef: product?._id || undefined,
        productName: line.name || "Unknown Product",
        fullProductName: line.full_product_name || line.name,
        quantity: line.qty || 1,
        priceUnit: line.price_unit || 0,
        discount: line.discount || 0,
        priceSubtotal: line.price_subtotal || 0,
        priceSubtotalIncl: line.price_subtotal_incl || 0,
        syncedAt: new Date(),
      };

      const existing = await OrderLine.findOne({ orderLineId: line.id });

      let savedLine;
      if (existing) {
        savedLine = await OrderLine.findByIdAndUpdate(existing._id, lineData, {
          new: true,
        });
      } else {
        savedLine = await OrderLine.create(lineData);
      }

      orderLineIds.push(savedLine._id);
    } catch (err) {
      console.error(
        `[WawiSync] Error syncing order line ${line.id}:`,
        err.message
      );
    }
  }

  return orderLineIds;
}

/**
 * Map WAWI customer to MongoDB schema
 */
function mapWawiCustomer(wawiCustomer) {
  return {
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
  };
}

/**
 * Map WAWI order to MongoDB schema
 */
function mapWawiOrder(wawiOrder, customerId, orderLines) {
  const items = orderLines.map((line) => ({
    orderLineId: line.id,
    productId: Array.isArray(line.product_id)
      ? line.product_id[0]
      : line.product_id,
    productName: line.full_product_name || line.name || "Unknown Product",
    priceUnit: line.price_unit || 0,
    quantity: line.qty || 1,
    discount: line.discount || 0,
    priceSubtotal: line.price_subtotal || 0,
    priceSubtotalIncl: line.price_subtotal_incl || 0,
  }));

  const partnerId = Array.isArray(wawiOrder.partner_id)
    ? wawiOrder.partner_id[0]
    : wawiOrder.partner_id;

  return {
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
    items,
  };
}

/**
 * Map WAWI order state to our schema
 */
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
 * Map WAWI product to MongoDB schema
 */
function mapWawiProduct(wawiProduct) {
  // Get image from base64 field (image_512 from product.product)
  let image = undefined;
  if (wawiProduct.image_512 && wawiProduct.image_512 !== false) {
    image = `data:image/png;base64,${wawiProduct.image_512}`;
  }

  return {
    productId: wawiProduct.id,
    productTemplateId: Array.isArray(wawiProduct.product_tmpl_id)
      ? wawiProduct.product_tmpl_id[0]
      : wawiProduct.product_tmpl_id || undefined,
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
    combinationIndices: wawiProduct.combination_indices || undefined,
    image: image,
  };
}

/**
 * Map WAWI product attribute to MongoDB schema
 */
function mapWawiAttribute(wawiAttribute) {
  return {
    attributeId: wawiAttribute.id,
    name: wawiAttribute.name || "Unknown Attribute",
    displayType: wawiAttribute.display_type || "radio",
    createVariant: wawiAttribute.create_variant || "always",
    sequence: wawiAttribute.sequence || 0,
  };
}

/**
 * Map WAWI product attribute value to MongoDB schema
 */
function mapWawiAttributeValue(wawiValue, attributeMongoId) {
  const wawiAttributeId = Array.isArray(wawiValue.attribute_id)
    ? wawiValue.attribute_id[0]
    : wawiValue.attribute_id;

  return {
    valueId: wawiValue.id,
    attributeId: attributeMongoId || undefined,
    wawiAttributeId: wawiAttributeId,
    name: wawiValue.name || "Unknown Value",
    htmlColor: wawiValue.html_color || undefined,
    sequence: wawiValue.sequence || 0,
    isCustom: wawiValue.is_custom || false,
  };
}

module.exports = {
  getSyncStatus,
  resetSyncStatus,
  syncCustomers,
  syncOrders,
  syncProducts,
  syncProductAttributes,
  syncProductAttributeValues,
  runFullSync,
};
