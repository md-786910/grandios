/**
 * Sync ALL customers from WAWI/Etron into MongoDB (customers only).
 *
 * Pages through every res.partner with customer_rank > 0 and upserts them
 * (by contactId / email). Creates NO orders and NO discount groups, so it is
 * safe to run before the Stichtag is set and is the prerequisite for the
 * name-based bonus import to find matches.
 *
 * Usage: node server/scripts/syncAllCustomers.js
 */

require("dotenv").config();
if (process.env.DNS_FIX) {
  const dns = require("dns");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  dns.setDefaultResultOrder("ipv4first");
}

const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const { syncCustomers } = require("../services/wawiSyncService");

async function safeCount() {
  try {
    return await Customer.estimatedDocumentCount();
  } catch (err) {
    return `unavailable (${err.message})`;
  }
}

async function run() {
  console.log("═══════════════════════════════════════");
  console.log("👥 SYNC ALL CUSTOMERS FROM WAWI (customers only)");
  console.log("═══════════════════════════════════════");
  console.log("DB:", (process.env.MONGODB_URI || "").replace(/\/\/[^@]*@/, "//***@"));

  try {
    console.log("\n🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected!");

    console.log("Customers before:", await safeCount());

    console.log("\n🔄 Pulling customers from WAWI (customer_rank > 0)...");
    const start = Date.now();
    let lastLogged = 0;
    const result = await syncCustomers({
      batchSize: 100,
      onProgress: ({ synced, created, updated }) => {
        if (synced - lastLogged >= 200) {
          console.log(`  ⏳ ${synced} synced (${created} new, ${updated} updated)`);
          lastLogged = synced;
        }
      },
    });
    const secs = ((Date.now() - start) / 1000).toFixed(1);

    console.log("\n═══════════════════════════════════════");
    console.log("📈 CUSTOMER SYNC RESULT");
    console.log("═══════════════════════════════════════");
    console.log(`Total synced:  ${result.total}`);
    console.log(`Created:       ${result.created}`);
    console.log(`Updated:       ${result.updated}`);
    console.log(`Duration:      ${secs}s`);
    console.log("Customers after:", await safeCount());

    console.log("\n✅ Done. Next: node server/scripts/importBonusFromExcel.js --dry-run\n");
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

run();
