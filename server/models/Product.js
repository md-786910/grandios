const mongoose = require("mongoose");

// Schema for attribute values on a product
const ProductAttributeLineSchema = new mongoose.Schema(
  {
    attributeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductAttribute",
    },
    wawiAttributeId: Number,
    attributeName: String,
    valueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductAttributeValue",
    },
    wawiValueId: Number,
    valueName: String,
  },
  { _id: false }
);

const ProductSchema = new mongoose.Schema(
  {
    productId: {
      type: Number,
      unique: true,
      required: true,
    },
    productTemplateId: {
      type: Number,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    defaultCode: String,
    barcode: String,
    listPrice: {
      type: Number,
      default: 0,
    },
    standardPrice: {
      type: Number,
      default: 0,
    },
    categoryId: Number,
    categoryName: String,
    active: {
      type: Boolean,
      default: true,
    },
    availableInPos: {
      type: Boolean,
      default: true,
    },
    type: {
      type: String,
      enum: ["consu", "service", "product"],
      default: "product",
    },
    description: String,
    image: String,
    // Product attribute values (for variants)
    attributeValues: [ProductAttributeLineSchema],
    // Combination indices for variant lookup
    combinationIndices: String,
    syncedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

ProductSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    ret.id = ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Product", ProductSchema);
