const express = require('express');
const {
  getStats,
  getRecentOrders
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/stats', getStats);
router.get('/recent-orders', getRecentOrders);

module.exports = router;
