/**
 * Full cascade sync from WAWI/Etron — NON-DESTRUCTIVE.
 *
 * Upserts customers, orders, order lines, products and attributes, and creates
 * any discount groups that become complete. Nothing is deleted: the Excel
 * bonus baseline (carryoverPurchases / streakCount / CustomerPurchaseHistory /
 * OldPurchase) is left untouched.
 *
 * For the destructive rebuild-from-scratch variant see clearAndFullSync.js.
 *
 * Run: node server/scripts/fullSync.js
 */

require("dotenv").config();
if (process.env.DNS_FIX) {
  const dns = require("dns");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  dns.setDefaultResultOrder("ipv4first");
}

const mongoose = require("mongoose");
const cascadeSyncService = require("../services/cascadingSyncService");

async function run() {
  console.log("═══════════════════════════════════════");
  console.log("🔄 FULL CASCADE SYNC (no data will be deleted)");
  console.log("═══════════════════════════════════════");
  console.log("DB:", (process.env.MONGODB_URI || "").replace(/\/\/[^@]*@/, "//***@"));

  let progressInterval;

  try {
    console.log("\n🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected!");

    console.log("\n🚀 Starting full cascade sync from WAWI...");
    const started = Date.now();

    progressInterval = setInterval(() => {
      const s = cascadeSyncService.getCascadeStatus();
      if (s && s.isRunning) {
        const p = s.progress || {};
        console.log(
          `  ⏳ ${s.currentStep || "working"} — customers ${p.customers || 0}, orders ${p.orders || 0}, lines ${p.orderLines || 0}, products ${p.products || 0}, groups ${p.discountGroups || 0}`,
        );
      }
    }, 5000);

    const result = await cascadeSyncService.runFullCascadeSync({ batchSize: 50 });

    clearInterval(progressInterval);
    const secs = ((Date.now() - started) / 1000).toFixed(1);

    console.log("\n═══════════════════════════════════════");
    console.log("📈 SYNC RESULT");
    console.log("═══════════════════════════════════════");
    console.log(JSON.stringify(result, null, 2));
    console.log(`\nDuration: ${secs}s`);
    console.log("\n✅ Done — no records were deleted.\n");
  } catch (error) {
    clearInterval(progressInterval);
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

run();
