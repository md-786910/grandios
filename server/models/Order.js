const mongoose = require('mongoose');

// Order Item Schema (embedded)
const OrderItemSchema = new mongoose.Schema({
  orderLineId: Number,
  productId: Number,
  productName: {
    type: String,
    required: true
  },
  priceUnit: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    default: 1
  },
  discount: {
    type: Number,
    default: 0
  },
  priceSubtotal: Number,
  priceSubtotalIncl: Number,
  refundedQty: {
    type: Number,
    default: 0
  },
  image: String,
  color: String,
  material: String,
  discountEligible: {
    type: Boolean,
    default: true
  }
}, { _id: true });

const OrderSchema = new mongoose.Schema({
  orderId: {
    type: Number,
    unique: true,
    sparse: true
  },
  posReference: {
    type: String,
    unique: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  partnerId: Number,
  orderDate: {
    type: Date,
    default: Date.now
  },
  amountTotal: {
    type: Number,
    required: true
  },
  amountPaid: Number,
  amountTax: Number,
  state: {
    type: String,
    enum: ['pending', 'paid', 'invoiced', 'refunded', 'completed'],
    default: 'pending'
  },
  cashier: String,
  isInvoiced: {
    type: Boolean,
    default: false
  },
  isRefunded: {
    type: Boolean,
    default: false
  },
  items: [OrderItemSchema],
  syncedAt: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for total non-discounted items
OrderSchema.virtual('totalNonDiscounted').get(function() {
  return this.items
    .filter(item => item.discountEligible)
    .reduce((sum, item) => sum + (item.priceSubtotalIncl || item.priceUnit * item.quantity), 0);
});

OrderSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Order', OrderSchema);
