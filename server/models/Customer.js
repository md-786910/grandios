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
  companyType: String,
  syncedAt: Date
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
