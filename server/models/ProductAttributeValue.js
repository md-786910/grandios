/**
 * ProductAttributeValue Model
 * Stores product attribute values synced from WAWI
 */

const mongoose = require('mongoose');

const ProductAttributeValueSchema = new mongoose.Schema(
  {
    valueId: {
      type: Number,
      unique: true,
      required: true,
      index: true,
    },
    attributeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductAttribute',
      required: true,
    },
    wawiAttributeId: {
      type: Number,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    htmlColor: {
      type: String,
    },
    sequence: {
      type: Number,
      default: 0,
    },
    isCustom: {
      type: Boolean,
      default: false,
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

// Compound index for attribute lookups
ProductAttributeValueSchema.index({ wawiAttributeId: 1, name: 1 });

module.exports = mongoose.model('ProductAttributeValue', ProductAttributeValueSchema);
