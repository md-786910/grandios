/**
 * Clear all data and run full sync from WAWI
 * This script will:
 * 1. Clear all customers, orders, discounts, and related data
 * 2. Run a full cascade sync to repopulate everything from WAWI
 *
 * Run: node server/scripts/clearAndFullSync.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const cascadeSyncService = require("../services/cascadingSyncService");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const OrderLine = require("../models/OrderLine");
const Product = require("../models/Product");
const ProductAttribute = require("../models/ProductAttribute");
const ProductAttributeValue = require("../models/ProductAttributeValue");
const Discount = require("../models/Discount");
const DiscountOrder = require("../models/DiscountOrder");
const OrderCustomerQueue = require("../models/OrderCustomerQueue");

async function clearAndFullSync() {
  try {
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected!\n");

    // Step 1: Show current counts
    console.log("═══════════════════════════════════════");
    console.log("📊 CURRENT DATABASE COUNTS");
    console.log("═══════════════════════════════════════");
    const beforeCounts = {
      customers: await Customer.countDocuments(),
      orders: await Order.countDocuments(),
      orderLines: await OrderLine.countDocuments(),
      products: await Product.countDocuments(),
      attributes: await ProductAttribute.countDocuments(),
      attributeValues: await ProductAttributeValue.countDocuments(),
      discounts: await Discount.countDocuments(),
      discountOrders: await DiscountOrder.countDocuments(),
      queues: await OrderCustomerQueue.countDocuments(),
    };

    console.log(`Customers:           ${beforeCounts.customers}`);
    console.log(`Orders:              ${beforeCounts.orders}`);
    console.log(`Order Lines:         ${beforeCounts.orderLines}`);
    console.log(`Products:            ${beforeCounts.products}`);
    console.log(`Attributes:          ${beforeCounts.attributes}`);
    console.log(`Attribute Values:    ${beforeCounts.attributeValues}`);
    console.log(`Discounts:           ${beforeCounts.discounts}`);
    console.log(`Discount Orders:     ${beforeCounts.discountOrders}`);
    console.log(`Order Queues:        ${beforeCounts.queues}`);

    // Step 2: Clear all data
    console.log("\n═══════════════════════════════════════");
    console.log("🗑️  CLEARING DATABASE");
    console.log("═══════════════════════════════════════");

    // Clear in order (respecting references)
    console.log("Clearing discount orders...");
    const discountOrderResult = await DiscountOrder.deleteMany({});
    console.log(
      `✓ Deleted ${discountOrderResult.deletedCount} discount orders`,
    );

    console.log("Clearing discounts...");
    const discountResult = await Discount.deleteMany({});
    console.log(`✓ Deleted ${discountResult.deletedCount} discounts`);

    console.log("Clearing order queues...");
    const queueResult = await OrderCustomerQueue.deleteMany({});
    console.log(`✓ Deleted ${queueResult.deletedCount} order queues`);

    console.log("Clearing order lines...");
    const orderLineResult = await OrderLine.deleteMany({});
    console.log(`✓ Deleted ${orderLineResult.deletedCount} order lines`);

    console.log("Clearing orders...");
    const orderResult = await Order.deleteMany({});
    console.log(`✓ Deleted ${orderResult.deletedCount} orders`);

    console.log("Clearing products...");
    const productResult = await Product.deleteMany({});
    console.log(`✓ Deleted ${productResult.deletedCount} products`);

    console.log("Clearing attribute values...");
    const attrValueResult = await ProductAttributeValue.deleteMany({});
    console.log(`✓ Deleted ${attrValueResult.deletedCount} attribute values`);

    console.log("Clearing attributes...");
    const attrResult = await ProductAttribute.deleteMany({});
    console.log(`✓ Deleted ${attrResult.deletedCount} attributes`);

    console.log("Clearing customers...");
    const customerResult = await Customer.deleteMany({});
    console.log(`✓ Deleted ${customerResult.deletedCount} customers`);

    console.log("\n✅ Database cleared successfully!");

    // Step 3: Verify clear
    console.log("\n═══════════════════════════════════════");
    console.log("✔️  VERIFICATION (should all be 0)");
    console.log("═══════════════════════════════════════");
    const afterClearCounts = {
      customers: await Customer.countDocuments(),
      orders: await Order.countDocuments(),
      orderLines: await OrderLine.countDocuments(),
      discountOrders: await DiscountOrder.countDocuments(),
      discounts: await Discount.countDocuments(),
    };

    console.log(`Customers:           ${afterClearCounts.customers}`);
    console.log(`Orders:              ${afterClearCounts.orders}`);
    console.log(`Order Lines:         ${afterClearCounts.orderLines}`);
    console.log(`Discount Orders:     ${afterClearCounts.discountOrders}`);
    console.log(`Discounts:           ${afterClearCounts.discounts}`);

    // Step 4: Run full cascade sync
    console.log("\n═══════════════════════════════════════");
    console.log("🔄 RUNNING FULL SYNC FROM WAWI");
    console.log("═══════════════════════════════════════");
    console.log("This may take several minutes...\n");

    const syncStartTime = Date.now();

    // Track progress
    let lastProgress = { customers: 0, orders: 0, discountGroups: 0 };
    const progressInterval = setInterval(async () => {
      const status = cascadeSyncService.getCascadeStatus();
      if (status.progress) {
        const { customers, orders, discountGroups } = status.progress;
        if (
          customers !== lastProgress.customers ||
          orders !== lastProgress.orders ||
          discountGroups !== lastProgress.discountGroups
        ) {
          console.log(
            `  ⏳ Progress: ${customers} customers, ${orders} orders, ${discountGroups} discount groups`,
          );
          lastProgress = { customers, orders, discountGroups };
        }
      }
    }, 2000);

    const result = await cascadeSyncService.runFullCascadeSync({
      batchSize: 50,
    });

    clearInterval(progressInterval);

    const syncDuration = ((Date.now() - syncStartTime) / 1000).toFixed(1);

    console.log("\n✅ Full sync completed!");
    console.log(`⏱️  Duration: ${syncDuration}s`);

    // Step 5: Show final results
    console.log("\n═══════════════════════════════════════");
    console.log("📈 SYNC RESULTS");
    console.log("═══════════════════════════════════════");
    console.log(`Customers synced:    ${result.progress.customers}`);
    console.log(`Orders synced:       ${result.progress.orders}`);
    console.log(`Order Lines synced:  ${result.progress.orderLines}`);
    console.log(`Products synced:     ${result.progress.products}`);
    console.log(`Discount groups:     ${result.progress.discountGroups}`);
    console.log(`Errors:              ${result.errors?.length || 0}`);
    console.log(`Skipped:             ${result.skipped || 0}`);

    if (result.errors && result.errors.length > 0) {
      console.log("\n⚠️  ERRORS ENCOUNTERED:");
      result.errors.slice(0, 10).forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more errors`);
      }
    }

    // Step 6: Final verification
    console.log("\n═══════════════════════════════════════");
    console.log("📊 FINAL DATABASE COUNTS");
    console.log("═══════════════════════════════════════");
    const finalCounts = {
      customers: await Customer.countDocuments(),
      orders: await Order.countDocuments(),
      orderLines: await OrderLine.countDocuments(),
      products: await Product.countDocuments(),
      discounts: await Discount.countDocuments(),
      discountOrders: await DiscountOrder.countDocuments(),
      queues: await OrderCustomerQueue.countDocuments(),
    };

    console.log(`Customers:           ${finalCounts.customers}`);
    console.log(`Orders:              ${finalCounts.orders}`);
    console.log(`Order Lines:         ${finalCounts.orderLines}`);
    console.log(`Products:            ${finalCounts.products}`);
    console.log(`Discounts:           ${finalCounts.discounts}`);
    console.log(`Discount Orders:     ${finalCounts.discountOrders}`);
    console.log(`Order Queues:        ${finalCounts.queues}`);

    // Show some sample discount groups with bundleIndex info
    console.log("\n═══════════════════════════════════════");
    console.log("🎁 SAMPLE DISCOUNT GROUPS");
    console.log("═══════════════════════════════════════");
    const sampleGroups = await DiscountOrder.find({})
      .limit(3)
      .populate("customerId", "name email")
      .lean();

    if (sampleGroups.length > 0) {
      sampleGroups.forEach((group, idx) => {
        console.log(
          `\nGroup ${idx + 1}: ${group.customerId?.name || "Unknown"}`,
        );
        console.log(`  Orders: ${group.orders?.length || 0}`);
        console.log(`  Total: €${group.totalAmount?.toFixed(2) || "0.00"}`);
        console.log(
          `  Discount: €${group.totalDiscount?.toFixed(2) || "0.00"}`,
        );
        console.log(`  Status: ${group.status}`);
        if (group.orders && group.orders.length > 0) {
          console.log(
            `  Bundle indices: [${group.orders.map((o) => o.bundleIndex ?? "none").join(", ")}]`,
          );
        }
      });
    } else {
      console.log("No discount groups created.");
    }

    console.log("\n═══════════════════════════════════════");
    console.log("✅ CLEAR AND SYNC COMPLETED SUCCESSFULLY!");
    console.log("═══════════════════════════════════════\n");
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB\n");
  }
}

// Run the script
clearAndFullSync();
