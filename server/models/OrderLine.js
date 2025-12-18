/**
 * OrderLine Model
 * Stores POS order lines synced from WAWI
 * References Order model for relational queries
 */

const mongoose = require('mongoose');

const OrderLineSchema = new mongoose.Schema(
  {
    orderLineId: {
      type: Number,
      unique: true,
      required: true,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    wawiOrderId: {
      type: Number,
      required: true,
      index: true,
    },
    productId: {
      type: Number,
      index: true,
    },
    productRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    },
    productName: {
      type: String,
      required: true,
    },
    fullProductName: String,
    quantity: {
      type: Number,
      default: 1,
    },
    priceUnit: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    priceSubtotal: {
      type: Number,
      default: 0,
    },
    priceSubtotalIncl: {
      type: Number,
      default: 0,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for common queries
OrderLineSchema.index({ orderId: 1, orderLineId: 1 });
OrderLineSchema.index({ productId: 1, orderId: 1 });

module.exports = mongoose.model('OrderLine', OrderLineSchema);
