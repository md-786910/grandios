const mongoose = require('mongoose');

// Schema for tracking orders in queue per customer
const QueueOrderSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const OrderCustomerQueueSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    unique: true
  },
  orders: [QueueOrderSchema],
  orderCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'ready', 'processed'],
    default: 'pending'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Update orderCount before save
OrderCustomerQueueSchema.pre('save', function(next) {
  this.orderCount = this.orders.length;
  // Auto-update status based on order count
  if (this.orderCount >= 3) {
    this.status = 'ready';
  } else if (this.orderCount === 0) {
    this.status = 'processed';
  } else {
    this.status = 'pending';
  }
  next();
});

OrderCustomerQueueSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('OrderCustomerQueue', OrderCustomerQueueSchema);
