const path = require("path");
const CustomerPurchaseHistory = require("../models/CustomerPurchaseHistory");
const Customer = require("../models/Customer");
const {
  importPurchaseHistory,
} = require("../services/purchaseHistoryImportService");

// @desc    Import customer purchase history from Excel
// @route   POST /api/purchase-history/import
// @access  Private
exports.importFromExcel = async (req, res, next) => {
  try {
    const filePath = path.join(
      __dirname,
      "..",
      "..",
      "task",
      "Kundendaten Testversion.xlsx"
    );

    const results = await importPurchaseHistory(filePath);

    res.status(200).json({
      success: true,
      message: `Import completed. ${results.imported} created, ${results.updated} updated, ${results.skipped} skipped, ${results.customersCreated} customers created.`,
      data: results,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get all customer purchase histories
// @route   GET /api/purchase-history
// @access  Private
exports.getPurchaseHistories = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || "";
    const startIndex = (page - 1) * limit;

    const query = {};
    if (search) {
      const searchRegex = new RegExp(search, "i");
      query.$or = [
        { customerNo: searchRegex },
        { lastName: searchRegex },
        { firstName: searchRegex },
        { email: searchRegex },
      ];
    }

    const total = await CustomerPurchaseHistory.countDocuments(query);
    const records = await CustomerPurchaseHistory.find(query)
      .populate("customerId", "name email contactId ref")
      .skip(startIndex)
      .limit(limit)
      .sort({ customerNo: 1 });

    res.status(200).json({
      success: true,
      count: records.length,
      total,
      pagination: {
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      data: records,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get single customer purchase history by id or customerNo
// @route   GET /api/purchase-history/:id
// @access  Private
exports.getPurchaseHistory = async (req, res, next) => {
  try {
    let record;
    if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      record = await CustomerPurchaseHistory.findById(req.params.id).populate(
        "customerId",
        "name email contactId ref wallet address"
      );
    }
    if (!record) {
      record = await CustomerPurchaseHistory.findOne({
        customerNo: req.params.id,
      }).populate("customerId", "name email contactId ref wallet address");
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Purchase history not found",
      });
    }

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get purchase history for a specific customer
// @route   GET /api/purchase-history/customer/:customerId
// @access  Private
exports.getByCustomerId = async (req, res, next) => {
  try {
    const record = await CustomerPurchaseHistory.findOne({
      customerId: req.params.customerId,
    }).populate("customerId", "name email contactId ref");

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "No purchase history found for this customer",
      });
    }

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete all purchase history records
// @route   DELETE /api/purchase-history
// @access  Private
exports.deleteAll = async (req, res, next) => {
  try {
    const result = await CustomerPurchaseHistory.deleteMany({});

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} records`,
      data: { deletedCount: result.deletedCount },
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Redeem a purchase history group
// @route   PUT /api/purchase-history/:id/groups/:groupIndex/redeem
// @access  Private
exports.redeemGroup = async (req, res, next) => {
  try {
    const record = await CustomerPurchaseHistory.findById(req.params.id);

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "Purchase history not found",
      });
    }

    const groupIndex = parseInt(req.params.groupIndex, 10);
    const group = record.purchaseGroups.find(
      (g) => g.groupIndex === groupIndex,
    );

    if (!group) {
      return res.status(404).json({
        success: false,
        message: "Purchase group not found",
      });
    }

    if (group.rabatteinloesung !== null && group.rabatteinloesung < 0) {
      return res.status(400).json({
        success: false,
        message: "Group already redeemed",
      });
    }

    // Mark as redeemed: set rabatteinloesung to negative rabatt value
    group.rabatteinloesung = -Math.abs(group.rabatt);
    group.isRedeemed = true;

    // Update totals
    record.totalRedeemed =
      record.purchaseGroups.reduce(
        (sum, g) => sum + Math.abs(g.rabatteinloesung || 0),
        0,
      );

    await record.save();

    // Update customer wallet if linked
    if (record.customerId) {
      const customer = await Customer.findById(record.customerId);
      if (customer) {
        customer.wallet = (customer.wallet || 0) + group.rabatt;
        customer.totalDiscountRedeemed =
          (customer.totalDiscountRedeemed || 0) + group.rabatt;
        await customer.save();
      }
    }

    res.status(200).json({
      success: true,
      data: record,
    });
  } catch (err) {
    next(err);
  }
};
