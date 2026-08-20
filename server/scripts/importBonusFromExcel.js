/**
 * Import customer bonus baseline from the name-based Kundendaten Excel file.
 *
 * Matches Excel rows to existing (WAWI-synced) customers BY NAME, seeds the
 * redeemable bonus from completed groups of 3, and stores the in-progress
 * streak as carryover for the post-Stichtag sync.
 *
 * Usage:
 *   node server/scripts/importBonusFromExcel.js --dry-run   # preview, NO writes
 *   node server/scripts/importBonusFromExcel.js             # real import (destructive)
 *   node server/scripts/importBonusFromExcel.js --file "C:/path/to/file.xlsx"
 *
 * The real run CLEARS CustomerPurchaseHistory + OldPurchase + source:'excel'
 * DiscountOrders, resets carryover fields on all customers, and recomputes
 * wallets for matched customers. Run --dry-run first.
 */

require("dotenv").config();
if (process.env.DNS_FIX) {
  const dns = require("dns");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  dns.setDefaultResultOrder("ipv4first");
}

const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const CustomerPurchaseHistory = require("../models/CustomerPurchaseHistory");
const OldPurchase = require("../models/OldPurchase");
const DiscountOrder = require("../models/DiscountOrder");
const {
  importPurchaseHistory,
} = require("../services/purchaseHistoryImportService");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const fileFlagIdx = args.indexOf("--file");
const filePath = fileFlagIdx >= 0 ? args[fileFlagIdx + 1] : undefined;

// Counts can hit the `aggregate` command (countDocuments). On a locked-down
// mongod that may be rejected — degrade gracefully instead of aborting.
async function safeCount(promiseFactory) {
  try {
    return await promiseFactory();
  } catch (err) {
    return `unavailable (${err.message})`;
  }
}

async function printCounts(label) {
  console.log(`\n── ${label} ──`);
  console.log("  Customers:               ", await safeCount(() => Customer.estimatedDocumentCount()));
  console.log("  CustomerPurchaseHistory: ", await safeCount(() => CustomerPurchaseHistory.estimatedDocumentCount()));
  console.log("  OldPurchase:             ", await safeCount(() => OldPurchase.estimatedDocumentCount()));
  console.log("  DiscountOrder (total):   ", await safeCount(() => DiscountOrder.estimatedDocumentCount()));
  console.log("  DiscountOrder source=excel:", await safeCount(() => DiscountOrder.countDocuments({ source: "excel" })));
}

async function run() {
  console.log("═══════════════════════════════════════");
  console.log(DRY_RUN ? "🔎 BONUS IMPORT — DRY RUN (no writes)" : "🚀 BONUS IMPORT — LIVE (writes data)");
  console.log("═══════════════════════════════════════");
  console.log("DB:  ", (process.env.MONGODB_URI || "").replace(/\/\/[^@]*@/, "//***@"));
  console.log("File:", filePath || "(default) excel/TEST KUNDEN DATEN.xlsx");

  try {
    console.log("\n🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected!");

    await printCounts("BEFORE");

    const start = Date.now();
    const r = await importPurchaseHistory(filePath, { dryRun: DRY_RUN });
    const secs = ((Date.now() - start) / 1000).toFixed(1);

    console.log("\n═══════════════════════════════════════");
    console.log(DRY_RUN ? "📋 DRY-RUN RESULT" : "📈 IMPORT RESULT");
    console.log("═══════════════════════════════════════");
    console.log(`Detected EK1 column:   ${r.detectedStartColumn}${r.detectedStartColumn !== 3 ? "  (⚠️ non-default — export format differs from the usual layout)" : ""}`);
    console.log(`Rows in file:          ${r.totalRows}`);
    console.log(`Parsed (named):        ${r.parsed}`);
    console.log(`Empty rows skipped:    ${r.skipped}`);
    console.log(`Matched customers:     ${r.matched}`);
    console.log(`Unmatched (0 found):   ${r.unmatched.length}`);
    console.log(`Ambiguous (2+ found):  ${r.ambiguous.length}`);
    console.log(`Bonus groups (Alte Einkäufe): ${r.historyGroupsStored}`);
    console.log(`Available old bonus:   €${r.availableOldBonus}`);
    if (!DRY_RUN) console.log(`Wallet from WAWI groups: €${r.walletFromWawiGroups ?? 0}`);
    console.log(`Errors:                ${r.errors.length}`);
    console.log(`Duration:              ${secs}s`);

    if (r.unmatched.length) {
      console.log(`\n⚠️  Sample UNMATCHED (first 15 of ${r.unmatched.length}):`);
      r.unmatched.slice(0, 15).forEach((u) =>
        console.log(`   row ${u.row}: ${u.name}${u.etronCustomerNo ? " #" + u.etronCustomerNo : ""}`),
      );
    }
    if (r.ambiguous.length) {
      console.log(`\n⚠️  Sample AMBIGUOUS (first 15 of ${r.ambiguous.length}):`);
      r.ambiguous.slice(0, 15).forEach((a) =>
        console.log(`   row ${a.row}: ${a.name} → ${a.candidates.length} candidates`),
      );
    }
    if (r.errors.length) {
      console.log(`\n❌ Sample ERRORS (first 10 of ${r.errors.length}):`);
      r.errors.slice(0, 10).forEach((e, i) =>
        console.log(`   ${i + 1}. row ${e.row ?? "?"}: ${e.message}`),
      );
    }

    if (!DRY_RUN) {
      await printCounts("AFTER");
      console.log("\n🎁 Sample seeded customers:");
      const samples = await Customer.find({ baselineImportedAt: { $ne: null } })
        .select("name wallet totalDiscountGranted totalDiscountRedeemed streakCount")
        .limit(5)
        .lean()
        .catch(() => []);
      samples.forEach((c) =>
        console.log(`   ${c.name}: wallet €${(c.wallet || 0).toFixed(2)} (granted €${(c.totalDiscountGranted || 0).toFixed(2)}, redeemed €${(c.totalDiscountRedeemed || 0).toFixed(2)}, streak ${c.streakCount || 0})`),
      );
    } else {
      console.log("\nℹ️  Dry run only — nothing was written. Re-run without --dry-run to apply.");
    }

    console.log("\n✅ Done.\n");
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
