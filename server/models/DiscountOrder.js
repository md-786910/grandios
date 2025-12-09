const mongoose = require('mongoose');

// Schema for tracking orders in a discount group
const DiscountOrderItemSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  orderLineId: Number,
  amount: {
    type: Number,
    required: true
  },
  discountRate: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  }
}, { _id: true });

const DiscountOrderSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  partnerId: Number,
  ref: {
    type: Number,
    unique: true,
    sparse: true
  },
  orders: [DiscountOrderItemSchema],
  totalAmount: {
    type: Number,
    default: 0
  },
  totalDiscount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['available', 'redeemed'],
    default: 'available'
  },
  notes: String,
  redeemedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Calculate totals before save
DiscountOrderSchema.pre('save', function(next) {
  this.totalAmount = this.orders.reduce((sum, order) => sum + order.amount, 0);
  this.totalDiscount = this.orders.reduce((sum, order) => sum + order.discountAmount, 0);
  next();
});

DiscountOrderSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('DiscountOrder', DiscountOrderSchema);
