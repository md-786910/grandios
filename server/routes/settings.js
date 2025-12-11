const express = require('express');
const {
  getSettings,
  updateSettings,
  getDiscountSettings,
  updateDiscountSettings
} = require('../controllers/settingsController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.route('/')
  .get(getSettings)
  .put(updateSettings);

router.route('/discount')
  .get(getDiscountSettings)
  .put(updateDiscountSettings);

module.exports = router;
