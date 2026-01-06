/**
 * ProductAttribute Model
 * Stores product attributes synced from WAWI
 */

const mongoose = require('mongoose');

const ProductAttributeSchema = new mongoose.Schema(
  {
    attributeId: {
      type: Number,
      unique: true,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    displayType: {
      type: String,
      enum: ['radio', 'select', 'color', 'pills'],
      default: 'radio',
    },
    createVariant: {
      type: String,
      enum: ['always', 'dynamic', 'no_variant'],
      default: 'always',
    },
    sequence: {
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

// Index for faster lookups
ProductAttributeSchema.index({ name: 1 });

module.exports = mongoose.model('ProductAttribute', ProductAttributeSchema);
