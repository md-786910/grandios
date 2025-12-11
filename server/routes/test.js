const express = require('express');
const {
  generateTestCustomer,
  generateTestOrders,
  generateCompleteTestData,
  clearTestData
} = require('../controllers/testDataController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.post('/customer', generateTestCustomer);
router.post('/orders/:customerId', generateTestOrders);
router.post('/generate', generateCompleteTestData);
router.delete('/clear', clearTestData);

module.exports = router;
