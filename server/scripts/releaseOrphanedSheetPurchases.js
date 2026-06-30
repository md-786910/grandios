/**
 * Repair: release orphaned sheet (Excel) purchases.
 *
 * A pending sheet purchase can be left flagged isInDiscountGroup:true with no
 * DiscountOrder actually containing it (e.g. its bonus group was deleted, or
 * edited with older code that dropped sheet items). Such purchases become
 * invisible — filtered out of "Alte Einzelkäufe" and not in any group.
 *
 * For every customer that has pending sheet purchases (CustomerPurchaseHistory
 * .pendingPurchases), this resets each pending purchase's OldPurchase.isInDiscountGroup
 * to whether it is ACTUALLY referenced by one of the customer's DiscountOrders
 * (matched by the EK label among fromExcel items), then rebuilds the customer's
 * carryoverPurchases / streakCount / pendingAccruedRabatt from the OldPurchase
 * rows that are not in a group. Complete Excel groups (whose labels are not in
 * pendingPurchases) are never touched.
 *
 * Idempotent. Usage: node server/scripts/releaseOrphanedSheetPurchases.js
 */

require("dotenv").config();
if (process.env.DNS_FIX) {
  const dns = require("dns");
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
  dns.setDefaultResultOrder("ipv4first");
}

const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const OldPurchase = require("../models/OldPurchase");
const DiscountOrder = require("../models/DiscountOrder");
const CustomerPurchaseHistory = require("../models/CustomerPurchaseHistory");
const AppSettings = require("../models/AppSettings");

async function run() {
  console.log("═══════════════════════════════════════");
  console.log("🩹 RELEASE ORPHANED SHEET PURCHASES");
  console.log("═══════════════════════════════════════");
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected\n");

    const settings = await AppSettings.getSettings();
    const rate = settings.discountRate || 10;

    // Only customers that have pending sheet purchases can be affected.
    const histories = await CustomerPurchaseHistory.find({
      customerId: { $ne: null },
      "pendingPurchases.0": { $exists: true },
    }).lean();

    let customersFixed = 0;
    let purchasesReleased = 0;

    for (const h of histories) {
      const customerId = h.customerId;
      const pendingLabels = (h.pendingPurchases || [])
        .map((p) => p.label)
        .filter(Boolean);
      if (!pendingLabels.length) continue;

      // Labels actually referenced by one of this customer's DiscountOrders.
      const groups = await DiscountOrder.find({ customerId }).lean();
      const referenced = new Set();
      for (const g of groups) {
        for (const o of g.orders || []) {
          if ((o.fromExcel || !o.orderId) && o.label) referenced.add(o.label);
        }
      }

      let releasedHere = 0;
      for (const label of pendingLabels) {
        const shouldBeConsumed = referenced.has(label);
        const res = await OldPurchase.updateOne(
          { customerId, purchaseLabel: label },
          { $set: { isInDiscountGroup: shouldBeConsumed } },
        );
        // Count a release only when we actually flipped a consumed→available one
        if (!shouldBeConsumed && res.modifiedCount > 0) releasedHere++;
      }

      // Rebuild carryover from the now-correct pending OldPurchase rows.
      const pending = await OldPurchase.find({
        customerId,
        isInDiscountGroup: false,
      }).lean();
      const amounts = pending.map((p) => p.amount || 0);
      const pendingRabatt =
        Math.round(amounts.reduce((s, a) => s + (a * rate) / 100, 0) * 100) /
        100;
      await Customer.findByIdAndUpdate(customerId, {
        $set: {
          carryoverPurchases: amounts,
          streakCount: amounts.length,
          pendingAccruedRabatt: pendingRabatt,
        },
      });

      if (releasedHere > 0) {
        customersFixed++;
        purchasesReleased += releasedHere;
      }
    }

    console.log(`Histories scanned:     ${histories.length}`);
    console.log(`Customers repaired:    ${customersFixed}`);
    console.log(`Purchases released:    ${purchasesReleased}`);
    console.log("\n✅ Done.\n");
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected");
  }
}

run();
