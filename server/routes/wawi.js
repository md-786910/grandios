/**
 * WAWI External API Routes
 */

const express = require("express");
const {
  testConnection,
  getAuthStatus,
  refreshToken,
  proxyGet,
  proxyPost,
  getCustomers,
  getCustomerById,
  getOrders,
  getProducts,
  searchModel,
} = require("../controllers/wawiController");
const { protect } = require("../middleware/auth");

const router = express.Router();

// All routes require authentication
router.use(protect);

// WAWI API management routes
router.get("/test", testConnection);
router.get("/status", getAuthStatus);
router.post("/refresh-token", refreshToken);

// Customer routes
router.get("/customers", getCustomers);
router.get("/customers/:id", getCustomerById);

// Order routes
router.get("/orders", getOrders);

// Product routes
router.get("/products", getProducts);

// Generic model search
router.get("/search/:model", searchModel);

// Proxy routes for forwarding requests to WAWI API
router.get("/proxy/*", proxyGet);
router.post("/proxy/*", proxyPost);

module.exports = router;
