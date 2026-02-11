const mongoose = require("mongoose");

const OldPurchaseSchema = new mongoose.Schema(
  {
    customerNo: {
      type: String,
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    purchaseLabel: {
      type: String,
      required: true, // "EK1", "EK2", "EK3", etc.
    },
    amount: {
      type: Number,
      required: true,
    },
    purchaseDate: {
      type: Date,
      default: Date.now,
    },
    groupIndex: {
      type: Number,
      required: true,
      default: 0,
    },
    ekIndex: {
      type: Number,
      required: true, // 1, 2, 3, 4, etc.
    },
    // Customer details for reference
    lastName: String,
    firstName: String,
    email: {
      type: String,
      lowercase: true,
      index: true,
    },
    phone: String,
    // Import tracking
    importedAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      default: "excel_import",
    },
    isInDiscountGroup: {
      type: Boolean,
      default: false, // true if part of a discount group (rabatt > 0)
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for efficient customer queries
OldPurchaseSchema.index({ customerId: 1, groupIndex: 1, ekIndex: 1 });
OldPurchaseSchema.index({ email: 1, groupIndex: 1, ekIndex: 1 });

OldPurchaseSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("OldPurchase", OldPurchaseSchema);
