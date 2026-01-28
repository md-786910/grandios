const express = require('express');
const {
  getDiscounts,
  getCustomerDiscount,
  createDiscountGroup,
  updateDiscountGroup,
  redeemDiscountGroup,
  updateNotes,
  getNotesHistory,
  deleteDiscountGroup,
  saveDraftItems,
  clearDraftItems
} = require('../controllers/discountController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/', getDiscounts);

router.route('/:customerId')
  .get(getCustomerDiscount);

router.route('/:customerId/groups')
  .post(createDiscountGroup);

router.route('/:customerId/groups/:groupId/redeem')
  .put(redeemDiscountGroup);

router.route('/:customerId/groups/:groupId')
  .put(updateDiscountGroup)
  .delete(deleteDiscountGroup);

router.route('/:customerId/notes')
  .put(updateNotes);

router.route('/:customerId/notes/history')
  .get(getNotesHistory);

router.route('/:customerId/draft')
  .put(saveDraftItems)
  .delete(clearDraftItems);

module.exports = router;
