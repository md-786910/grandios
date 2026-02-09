/**
 * Import customer purchase history from Excel
 * Run: node server/scripts/importPurchaseHistory.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const CustomerPurchaseHistory = require("../models/CustomerPurchaseHistory");
const {
  importPurchaseHistory,
} = require("../services/purchaseHistoryImportService");

async function run() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected!\n");

    const countBefore = await CustomerPurchaseHistory.countDocuments();
    console.log(`Records before import: ${countBefore}\n`);

    console.log("=== Starting Import ===\n");
    const results = await importPurchaseHistory();

    console.log("=== Import Results ===");
    console.log(`Created:  ${results.imported}`);
    console.log(`Updated:  ${results.updated}`);
    console.log(`Skipped:  ${results.skipped}`);
    console.log(`Customers Created: ${results.customersCreated}`);
    console.log(`Errors:   ${results.errors.length}`);

    if (results.errors.length > 0) {
      console.log("\nErrors:");
      results.errors.forEach((e) => console.log(`  Row ${e.row}: ${e.message}`));
    }

    if (results.unmatchedEmails.length > 0) {
      console.log(`\nUnmatched emails: ${results.unmatchedEmails.length}`);
      results.unmatchedEmails.slice(0, 10).forEach((u) =>
        console.log(`  ${u.customerNo} - ${u.email} (row ${u.row})`)
      );
      if (results.unmatchedEmails.length > 10) {
        console.log(`  ... and ${results.unmatchedEmails.length - 10} more`);
      }
    }

    const countAfter = await CustomerPurchaseHistory.countDocuments();
    console.log(`\nRecords after import: ${countAfter}`);

    console.log("\nDone!");
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB");
  }
}

run();
