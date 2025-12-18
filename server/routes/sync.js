/**
 * Sync Routes
 * API endpoints for WAWI data synchronization
 */

const express = require("express");
const {
  getSyncStatus,
  syncCustomers,
  syncOrders,
  syncProducts,
  syncProductAttributes,
  syncProductAttributeValues,
  runFullSync,
  getCustomers,
  getOrders,
  getOrderById,
  getOrderLines,
  getProducts,
  getProductAttributes,
  getProductAttributeValues,
  // Cascading sync
  getCascadeStatus,
  syncCustomerCascade,
  runCascadeSync,
  runIncrementalSync,
  getSchedulerStatus,
  getDiscountGroups,
} = require("../controllers/syncController");
const { protect } = require("../middleware/auth");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Sync status
router.get("/status", getSyncStatus);

// Trigger sync operations
router.post("/customers", syncCustomers);
router.post("/orders", syncOrders);
router.post("/products", syncProducts);
router.post("/attributes", syncProductAttributes);
router.post("/attribute-values", syncProductAttributeValues);
router.post("/full", runFullSync);

// Get synced data with pagination
router.get("/data/customers", getCustomers);
router.get("/data/orders", getOrders);
router.get("/data/orders/:orderId", getOrderById);
router.get("/data/order-lines", getOrderLines);
router.get("/data/products", getProducts);
router.get("/data/attributes", getProductAttributes);
router.get("/data/attribute-values", getProductAttributeValues);
router.get("/data/discount-groups", getDiscountGroups);

// Cascading sync (Customer → Orders → OrderLines → Products → Attributes → Discount)
router.get("/cascade/status", getCascadeStatus);
router.post("/cascade/customer/:contactId", syncCustomerCascade);
router.post("/cascade/full", runCascadeSync);
router.post("/cascade/incremental", runIncrementalSync);

// Scheduler status
router.get("/scheduler/status", getSchedulerStatus);

module.exports = router;
