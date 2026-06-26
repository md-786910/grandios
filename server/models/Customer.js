const mongoose = require('mongoose');

const CustomerSchema = new mongoose.Schema({
  contactId: {
    type: Number,
    unique: true,
    sparse: true
  },
  ref: {
    type: String,
    unique: true
  },
  name: {
    type: String,
    required: [true, 'Please add a customer name']
  },
  email: {
    type: String,
    lowercase: true
  },
  phone: String,
  mobile: String,
  address: {
    street: String,
    street2: String,
    postalCode: String,
    city: String,
    country: String
  },
  avatar: String,
  wallet: {
    type: Number,
    default: 0
  },
  totalDiscountRedeemed: {
    type: Number,
    default: 0
  },
  totalDiscountGranted: {
    type: Number,
    default: 0
  },
  // Bonus € accrued from returns, awaiting subtraction at the next redemption
  pendingReturnDeduction: {
    type: Number,
    default: 0
  },
  // Cumulative bonus € actually deducted at redemption (historical record)
  totalReturnDeduction: {
    type: Number,
    default: 0
  },
  // --- Excel baseline (name-based import) ---
  // Purchase amounts of the in-progress (pre-Stichtag) streak that have NOT yet
  // completed a group of 3. They are prepended to the first post-Stichtag group.
  carryoverPurchases: {
    type: [Number],
    default: []
  },
  // Count of purchases toward the next bonus carried over from the Excel import
  streakCount: {
    type: Number,
    default: 0
  },
  // 10% accrued on the partial streak — kept for reference, NOT redeemable / NOT in wallet
  pendingAccruedRabatt: {
    type: Number,
    default: 0
  },
  baselineImportedAt: Date,
  companyType: String,
  source: {
    type: String,
    enum: ['wawi', 'import', 'manual'],
    default: 'wawi'
  },
  syncedAt: Date,
  notes: {
    type: String,
    default: ''
  },
  draftDiscountItems: [{
    orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
    isBundle: { type: Boolean, default: false }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for orders count
CustomerSchema.virtual('orders', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'customerId'
});

// Virtual for total spent (calculated from orders)
CustomerSchema.virtual('totalSpent').get(function() {
  return this._totalSpent || 0;
});

CustomerSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Customer', CustomerSchema);
