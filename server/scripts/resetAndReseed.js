/**
 * Reset the DB (except users + app config), re-sync all customers from WAWI,
 * then re-import the Excel bonus baseline — in one connection.
 *
 * KEEPS:  User (login), AppSettings (bonus config singleton).
 * CLEARS: Customer, Order, OrderLine, Product, ProductAttribute,
 *         ProductAttributeValue, Discount, DiscountOrder, OrderCustomerQueue,
 *         OldPurchase, CustomerPurchaseHistory, NotesHistory.
 *
 * Reseeds CUSTOMERS + EXCEL ONLY (no products/orders — those flow in later via
 * the cascade sync). Recreating customers fresh also re-links CPH/OldPurchase to
 * the new _ids, resolving the stale-customerId issue.
 *
 * Usage:
 *   node server/scripts/resetAndReseed.js --dry-run   # preview, NO writes
 *   node server/scripts/resetAndReseed.js --yes       # execute (destructive)
 */

require("dotenv").config();
if (process.env.DNS_FIX) {
  const dns = require("dns");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  dns.setDefaultResultOrder("ipv4first");
}

const mongoose = require("mongoose");

// Collections to CLEAR (everything except User + AppSettings).
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const OrderLine = require("../models/OrderLine");
const Product = require("../models/Product");
const ProductAttribute = require("../models/ProductAttribute");
const ProductAttributeValue = require("../models/ProductAttributeValue");
const Discount = require("../models/Discount");
const DiscountOrder = require("../models/DiscountOrder");
const OrderCustomerQueue = require("../models/OrderCustomerQueue");
const OldPurchase = require("../models/OldPurchase");
const CustomerPurchaseHistory = require("../models/CustomerPurchaseHistory");
const NotesHistory = require("../models/NotesHistory");

const { syncCustomers } = require("../services/wawiSyncService");
const {
  importPurchaseHistory,
} = require("../services/purchaseHistoryImportService");

const TO_CLEAR = [
  ["Customer", Customer],
  ["Order", Order],
  ["OrderLine", OrderLine],
  ["Product", Product],
  ["ProductAttribute", ProductAttribute],
  ["ProductAttributeValue", ProductAttributeValue],
  ["Discount", Discount],
  ["DiscountOrder", DiscountOrder],
  ["OrderCustomerQueue", OrderCustomerQueue],
  ["OldPurchase", OldPurchase],
  ["CustomerPurchaseHistory", CustomerPurchaseHistory],
  ["NotesHistory", NotesHistory],
];

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CONFIRMED = args.includes("--yes");
const CLEAR_ONLY = args.includes("--clear-only");

async function safeCount(model) {
  try {
    return await model.estimatedDocumentCount();
  } catch (err) {
    return `unavailable (${err.message})`;
  }
}

async function printCounts(label) {
  console.log(`\n── ${label} ──`);
  for (const [name, model] of TO_CLEAR) {
    console.log(`  ${name.padEnd(24)}`, await safeCount(model));
  }
}

async function run() {
  const mask = (process.env.MONGODB_URI || "").replace(/\/\/[^@]*@/, "//***@");
  console.log("═══════════════════════════════════════");
  console.log(
    DRY_RUN
      ? "🔎 RESET & RESEED — DRY RUN (no writes)"
      : "🚨 RESET & RESEED — LIVE (DESTRUCTIVE)",
  );
  console.log("═══════════════════════════════════════");
  console.log("DB:  ", mask);
  console.log("KEEP: User, AppSettings");
  console.log("CLEAR:", TO_CLEAR.map(([n]) => n).join(", "));

  if (!DRY_RUN && !CONFIRMED) {
    console.log(
      "\n⛔ Refusing to run without confirmation.\n" +
        "   Preview first:  node server/scripts/resetAndReseed.js --dry-run\n" +
        "   Then execute:   node server/scripts/resetAndReseed.js --yes\n",
    );
    process.exitCode = 1;
    return;
  }

  try {
    console.log("\n🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected!");

    await printCounts("BEFORE");

    if (DRY_RUN) {
      console.log(
        "\nℹ️  Dry run — nothing was cleared, synced, or imported." +
          "\n   Re-run with --yes to: clear the collections above → sync customers → import Excel.\n",
      );
      return;
    }

    // ── Step 1: clear ──
    const step1Label = CLEAR_ONLY
      ? "=== Clearing collections (keeping User + AppSettings) ==="
      : "=== Step 1/3: Clearing collections (keeping User + AppSettings) ===";
    console.log(`\n${step1Label}`);
    for (const [name, model] of TO_CLEAR) {
      const res = await model.deleteMany({});
      console.log(`  cleared ${name}: ${res.deletedCount}`);
    }

    if (CLEAR_ONLY) {
      await printCounts("AFTER");
      console.log(
        "\n✅ Cleanup complete (User + AppSettings kept)." +
          "\n   Next (manual): node server/scripts/syncAllCustomers.js" +
          "\n            then: node server/scripts/importBonusFromExcel.js --dry-run  (then without --dry-run)\n",
      );
      return;
    }

    // ── Step 2: sync all customers from WAWI ──
    console.log("\n=== Step 2/3: Syncing all customers from WAWI ===");
    const t0 = Date.now();
    let lastLogged = 0;
    const sync = await syncCustomers({
      batchSize: 100,
      onProgress: ({ synced, created, updated }) => {
        if (synced - lastLogged >= 200) {
          console.log(`  ⏳ ${synced} synced (${created} new, ${updated} updated)`);
          lastLogged = synced;
        }
      },
    });
    console.log(
      `  ✓ Customers: total ${sync.total}, created ${sync.created}, updated ${sync.updated} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );

    // ── Step 3: import Excel bonus baseline ──
    console.log("\n=== Step 3/3: Importing Excel bonus baseline ===");
    const t1 = Date.now();
    const r = await importPurchaseHistory(undefined, { dryRun: false });
    console.log(
      `  ✓ Import: matched ${r.matched}, unmatched ${r.unmatched.length}, ambiguous ${r.ambiguous.length}, ` +
        `history groups ${r.historyGroupsStored}, available old bonus €${r.availableOldBonus} (${((Date.now() - t1) / 1000).toFixed(1)}s)`,
    );
    if (r.unmatched.length) {
      console.log(`  ⚠️  Unmatched (first 15 of ${r.unmatched.length}):`);
      r.unmatched
        .slice(0, 15)
        .forEach((u) => console.log(`     row ${u.row}: ${u.name}`));
    }
    if (r.ambiguous.length) {
      console.log(`  ⚠️  Ambiguous (first 15 of ${r.ambiguous.length}):`);
      r.ambiguous
        .slice(0, 15)
        .forEach((a) =>
          console.log(`     row ${a.row}: ${a.name} → ${a.candidates.length} candidates`),
        );
    }

    await printCounts("AFTER");

    console.log("\n🎁 Sample seeded customers:");
    const samples = await Customer.find({ baselineImportedAt: { $ne: null } })
      .select("name wallet totalDiscountGranted totalDiscountRedeemed streakCount")
      .limit(5)
      .lean()
      .catch(() => []);
    samples.forEach((c) =>
      console.log(
        `   ${c.name}: wallet €${(c.wallet || 0).toFixed(2)} (granted €${(c.totalDiscountGranted || 0).toFixed(2)}, redeemed €${(c.totalDiscountRedeemed || 0).toFixed(2)}, streak ${c.streakCount || 0})`,
      ),
    );

    console.log("\n✅ Reset & reseed complete.\n");
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
