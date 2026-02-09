const mongoose = require("mongoose");

const PurchaseGroupSchema = new mongoose.Schema(
  {
    groupIndex: {
      type: Number,
      required: true,
    },
    purchases: [
      {
        label: String,
        amount: Number,
      },
    ],
    rabatt: {
      type: Number,
      default: 0,
    },
    rabatteinloesung: {
      type: Number,
      default: null,
    },
    isRedeemed: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true }
);

const CustomerPurchaseHistorySchema = new mongoose.Schema(
  {
    customerNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },
    lastName: String,
    firstName: String,
    street: String,
    postalCode: String,
    city: String,
    email: {
      type: String,
      lowercase: true,
    },
    phone: String,
    size: String,
    remarks: String,
    purchaseGroups: [PurchaseGroupSchema],
    totalPurchaseAmount: {
      type: Number,
      default: 0,
    },
    totalRabatt: {
      type: Number,
      default: 0,
    },
    totalRedeemed: {
      type: Number,
      default: 0,
    },
    groupCount: {
      type: Number,
      default: 0,
    },
    importedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

CustomerPurchaseHistorySchema.index({ customerId: 1 });
CustomerPurchaseHistorySchema.index({ email: 1 });

CustomerPurchaseHistorySchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model(
  "CustomerPurchaseHistory",
  CustomerPurchaseHistorySchema
);
