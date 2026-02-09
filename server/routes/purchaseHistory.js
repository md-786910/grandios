const express = require("express");
const {
  importFromExcel,
  getPurchaseHistories,
  getPurchaseHistory,
  getByCustomerId,
  deleteAll,
  redeemGroup,
} = require("../controllers/purchaseHistoryController");
const { protect } = require("../middleware/auth");

const router = express.Router();

router.use(protect);

router.route("/").get(getPurchaseHistories).delete(deleteAll);

router.post("/import", importFromExcel);

router.get("/customer/:customerId", getByCustomerId);

router.put("/:id/groups/:groupIndex/redeem", redeemGroup);

router.route("/:id").get(getPurchaseHistory);

module.exports = router;
