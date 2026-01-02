require("dotenv").config();
const mongoose = require("mongoose");
const wawiApiClient = require("../services/wawiApiClient");
const Product = require("../models/Product");

const productId = parseInt(process.argv[2]) || 500;

async function syncProduct() {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log(`Fetching product ID ${productId} from WAWI...`);

  const result = await wawiApiClient.searchRead("product.product", {
    fields: ["id", "name", "default_code", "barcode", "list_price", "standard_price",
             "categ_id", "active", "available_in_pos", "type", "description_sale",
             "product_tmpl_id", "combination_indices", "image_512"],
    domain: [["id", "=", productId]],
  });

  if (result.data && result.data.length > 0) {
    const wawiProduct = result.data[0];

    let image = undefined;
    if (wawiProduct.image_512 && wawiProduct.image_512 !== false) {
      image = "data:image/png;base64," + wawiProduct.image_512;
    }

    const productData = {
      productId: wawiProduct.id,
      productTemplateId: Array.isArray(wawiProduct.product_tmpl_id) ? wawiProduct.product_tmpl_id[0] : wawiProduct.product_tmpl_id,
      name: wawiProduct.name || "Unknown Product",
      defaultCode: wawiProduct.default_code || undefined,
      barcode: wawiProduct.barcode || undefined,
      listPrice: wawiProduct.list_price || 0,
      standardPrice: wawiProduct.standard_price || 0,
      categoryId: Array.isArray(wawiProduct.categ_id) ? wawiProduct.categ_id[0] : undefined,
      categoryName: Array.isArray(wawiProduct.categ_id) ? wawiProduct.categ_id[1] : undefined,
      active: wawiProduct.active !== false,
      availableInPos: wawiProduct.available_in_pos !== false,
      type: wawiProduct.type || "product",
      description: wawiProduct.description_sale || undefined,
      combinationIndices: wawiProduct.combination_indices || undefined,
      image: image,
      syncedAt: new Date(),
    };

    const updated = await Product.findOneAndUpdate(
      { productId: wawiProduct.id },
      productData,
      { upsert: true, new: true }
    );

    console.log("Product synced successfully!");
    console.log("Product ID:", updated.productId);
    console.log("Name:", updated.name);
    console.log("Has image:", updated.image ? "YES (" + updated.image.length + " chars)" : "NO");
  } else {
    console.log("Product not found in WAWI");
  }

  await mongoose.disconnect();
}

syncProduct().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
