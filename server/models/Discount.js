const mongoose = require('mongoose');

// Customer Discount Wallet
const DiscountSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    unique: true
  },
  partnerId: Number,
  discountRef: Number,
  balance: {
    type: Number,
    default: 0
  },
  status: {
    type: Number,
    enum: [0, 1], // 0 = pending, 1 = active
    default: 1
  },
  totalGranted: {
    type: Number,
    default: 0
  },
  totalRedeemed: {
    type: Number,
    default: 0
  },
  createdBy: Number,
  updatedBy: Number
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Method to add discount to wallet
DiscountSchema.methods.addDiscount = function(amount) {
  this.balance += amount;
  this.totalGranted += amount;
  return this.save();
};

// Method to redeem discount from wallet
DiscountSchema.methods.redeemDiscount = function(amount) {
  if (this.balance < amount) {
    throw new Error('Insufficient balance');
  }
  this.balance -= amount;
  this.totalRedeemed += amount;
  return this.save();
};

DiscountSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Discount', DiscountSchema);
