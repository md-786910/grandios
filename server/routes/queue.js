const express = require('express');
const {
  getQueues,
  getCustomerQueue,
  processCustomerQueue,
  removeOrderFromQueue,
  clearCustomerQueue
} = require('../controllers/queueController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

router.get('/', getQueues);
router.get('/:customerId', getCustomerQueue);
router.post('/:customerId/process', processCustomerQueue);
router.delete('/:customerId/orders/:orderId', removeOrderFromQueue);
router.delete('/:customerId', clearCustomerQueue);

module.exports = router;
