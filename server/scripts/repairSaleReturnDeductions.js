/**
 * Audit and repair bonus deductions incorrectly created for returned Sale items.
 *
 * Dry-run (default): node scripts/repairSaleReturnDeductions.js
 * One receipt:       node scripts/repairSaleReturnDeductions.js --receipt=26-002125
 * Apply findings:    node scripts/repairSaleReturnDeductions.js --apply
 *
 * Run a Mongo backup before using --apply. The repair is guarded by the exact
 * customer balances observed during the audit and records a system note before
 * attempting each update, preventing an interrupted run from applying twice.
 */

require("dotenv").config();

const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Order = require("../models/Order");
const OrderLine = require("../models/OrderLine");
const NotesHistory = require("../models/NotesHistory");

const DISCOUNT_RATE = 0.1;
const CENT_TOLERANCE = 0.005;
const ORDER_MARKER_PREFIX = "SALE-RETURN-CORRECTION-ORDER:";

function argumentValue(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function lineAmount(line) {
  return line.priceSubtotalIncl || line.priceUnit * (line.quantity || 1) || 0;
}

function isVoucher(line) {
  const name = (line.productName || line.fullProductName || "").toLowerCase();
  return (
    name.includes("gutschein") ||
    name.includes("voucher") ||
    name.includes("gift")
  );
}

function calculateEligibleAmount(lines, includeDiscountedReturns) {
  return lines.reduce((total, line) => {
    const amount = lineAmount(line);
    if (line.discountEligible === false || isVoucher(line)) return total;
    if ((line.discount || 0) > 0 && (!includeDiscountedReturns || amount > 0)) {
      return total;
    }
    return total + amount;
  }, 0);
}

function money(value) {
  return `€${Number(value || 0).toFixed(2)}`;
}

async function loadPreviouslyHandledOrderIds() {
  const notes = await NotesHistory.find({
    source: "system",
    notes: { $regex: ORDER_MARKER_PREFIX },
  })
    .select("notes")
    .lean();
  const handled = new Set();
  const marker = new RegExp(`${ORDER_MARKER_PREFIX}([a-f0-9]{24})`, "gi");
  for (const note of notes) {
    for (const match of note.notes.matchAll(marker)) handled.add(match[1]);
  }
  return handled;
}

async function audit() {
  const receipt = argumentValue("receipt");
  const customerFilter = argumentValue("customer");
  const orderQuery = { bonusDeductionApplied: true };
  if (receipt) orderQuery.posReference = new RegExp(escapeRegExp(receipt), "i");

  const orders = await Order.find(orderQuery).lean();
  const handledOrderIds = await loadPreviouslyHandledOrderIds();
  const candidates = orders.filter(
    (order) => !handledOrderIds.has(String(order._id)),
  );
  const lines = await OrderLine.find({
    orderId: { $in: candidates.map((order) => order._id) },
  }).lean();
  const linesByOrder = new Map();
  for (const line of lines) {
    const key = String(line.orderId);
    if (!linesByOrder.has(key)) linesByOrder.set(key, []);
    linesByOrder.get(key).push(line);
  }

  const customerIds = [...new Set(candidates.map((order) => String(order.customerId)))];
  const customers = await Customer.find({ _id: { $in: customerIds } }).lean();
  const customersById = new Map(
    customers.map((customer) => [String(customer._id), customer]),
  );
  const findings = [];

  for (const order of candidates) {
    const customer = customersById.get(String(order.customerId));
    if (!customer) continue;
    if (
      customerFilter &&
      !String(customer._id).includes(customerFilter) &&
      !(customer.name || "").toLowerCase().includes(customerFilter.toLowerCase())
    ) {
      continue;
    }

    const orderLines = linesByOrder.get(String(order._id)) || [];
    const hasDiscountedReturn = orderLines.some(
      (line) => (line.discount || 0) > 0 && lineAmount(line) < 0,
    );
    if (!hasDiscountedReturn) continue;

    const oldEligibleAmount = calculateEligibleAmount(orderLines, true);
    const correctedEligibleAmount = calculateEligibleAmount(orderLines, false);
    const oldDeduction = oldEligibleAmount < 0 ? Math.abs(oldEligibleAmount) * DISCOUNT_RATE : 0;
    const correctedDeduction =
      correctedEligibleAmount < 0
        ? Math.abs(correctedEligibleAmount) * DISCOUNT_RATE
        : 0;
    const excessDeduction = oldDeduction - correctedDeduction;
    if (excessDeduction < CENT_TOLERANCE) continue;

    findings.push({
      customer,
      order,
      oldEligibleAmount,
      correctedEligibleAmount,
      excessDeduction,
    });
  }

  return findings;
}

function groupByCustomer(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = String(finding.customer._id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(finding);
  }
  return groups;
}

async function applyCustomerRepair(findings) {
  const customer = findings[0].customer;
  const excess = findings.reduce((sum, finding) => sum + finding.excessDeduction, 0);
  const pendingBefore = customer.pendingReturnDeduction || 0;
  const consumedBefore = customer.totalReturnDeduction || 0;
  const walletBefore = customer.wallet || 0;
  const pendingReduction = Math.min(pendingBefore, excess);
  const consumedRestore = excess - pendingReduction;

  if (consumedRestore > consumedBefore + CENT_TOLERANCE) {
    throw new Error(
      `${customer.name}: correction ${money(excess)} exceeds traceable pending/consumed deductions`,
    );
  }

  const orderMarkers = findings
    .map((finding) => `[${ORDER_MARKER_PREFIX}${finding.order._id}]`)
    .join(" ");
  const receipts = findings
    .map((finding) => finding.order.posReference || finding.order.orderId)
    .join(", ");
  const preparedNote = await NotesHistory.create({
    customerId: customer._id,
    notes: `${orderMarkers} Korrektur vorbereitet: Rückgaben reduzierter Artikel (${receipts}), ${money(excess)}.`,
    changedByName: "System",
    source: "system",
  });

  const result = await Customer.updateOne(
    {
      _id: customer._id,
      pendingReturnDeduction: pendingBefore,
      totalReturnDeduction: consumedBefore,
      wallet: walletBefore,
    },
    {
      $set: {
        pendingReturnDeduction: Math.max(0, pendingBefore - pendingReduction),
        totalReturnDeduction: Math.max(0, consumedBefore - consumedRestore),
        wallet: walletBefore + consumedRestore,
      },
    },
  );

  if (result.modifiedCount !== 1) {
    preparedNote.notes += " NICHT ANGEWENDET: Kontostand hat sich seit dem Audit geändert.";
    await preparedNote.save();
    throw new Error(`${customer.name}: balances changed during repair; no update applied`);
  }

  preparedNote.notes = `${orderMarkers} Bonusabzug korrigiert: Rückgaben reduzierter Artikel (${receipts}). Offener Bonusabzug ${money(pendingBefore)} → ${money(pendingBefore - pendingReduction)}; wiederhergestelltes Guthaben ${money(consumedRestore)}.`;
  await preparedNote.save();
}

async function run() {
  const apply = process.argv.includes("--apply");
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  await mongoose.connect(process.env.MONGODB_URI);

  const findings = await audit();
  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`Affected return receipts: ${findings.length}`);
  for (const finding of findings) {
    console.log(
      `${finding.customer.name} | ${finding.order.posReference || finding.order.orderId} | eligible ${money(finding.oldEligibleAmount)} -> ${money(finding.correctedEligibleAmount)} | correction ${money(finding.excessDeduction)} | pending ${money(finding.customer.pendingReturnDeduction)}`,
    );
  }

  if (!apply) {
    console.log("No data changed. Run again with --apply only after reviewing the audit and completing a backup.");
    return;
  }

  let repaired = 0;
  for (const customerFindings of groupByCustomer(findings).values()) {
    await applyCustomerRepair(customerFindings);
    repaired += customerFindings.length;
  }
  console.log(`Repaired return receipts: ${repaired}`);
}

run()
  .catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
