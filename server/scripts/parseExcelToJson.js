/**
 * Parse a Kundendaten Excel file into a standalone JSON file, WITHOUT touching
 * the database. Uses the exact same parsing logic (parseRow/detectStartColumn)
 * as the real importer, so this is safe to run anytime to inspect/verify a
 * sheet before deciding to import it for real.
 *
 * Usage:
 *   node server/scripts/parseExcelToJson.js [--file <path>] [--out <path>]
 *
 * Defaults to the same file importBonusFromExcel.js uses by default, and
 * writes "parsed-customers-<basename>.json" next to it if --out is omitted.
 */

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { parseRow, detectStartColumn } = require("../services/purchaseHistoryImportService");

const args = process.argv.slice(2);
const fileFlagIdx = args.indexOf("--file");
const outFlagIdx = args.indexOf("--out");

const filePath =
  fileFlagIdx >= 0
    ? args[fileFlagIdx + 1]
    : path.join(__dirname, "..", "..", "excel", "Kundendaten GRANDIOS Stand 260826.xlsx");

const defaultOut = path.join(
  path.dirname(filePath),
  `parsed-customers-${path.basename(filePath, path.extname(filePath)).replace(/\s+/g, "").toLowerCase()}.json`,
);
const outPath = outFlagIdx >= 0 ? args[outFlagIdx + 1] : defaultOut;

function round2(n) {
  return n === null || n === undefined ? 0 : Math.round(n * 100) / 100;
}

function run() {
  console.log("═══════════════════════════════════════");
  console.log("📄 PARSE EXCEL TO JSON (no DB, no writes to the app)");
  console.log("═══════════════════════════════════════");
  console.log("File:", filePath);
  console.log("Out: ", outPath);

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets["Kundendaten"];
  if (!sheet) throw new Error('Sheet "Kundendaten" not found in workbook');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const startCol = detectStartColumn(rows[0]);
  const dataRows = rows.slice(1);

  const customers = [];
  let skipped = 0;
  let totalPurchases = 0,
    completeGroups = 0,
    redeemedGroups = 0,
    availableGroups = 0,
    customersWithPending = 0,
    customersWithNumberInName = 0,
    totalGranted = 0,
    totalRedeemed = 0,
    redeemableWallet = 0,
    pendingAccruedNotRedeemable = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2;
    const p = parseRow(dataRows[i], rowNum, startCol);
    if (!p) {
      skipped++;
      continue;
    }

    totalPurchases += p.purchases.length;
    completeGroups += p.discountGroups.length;
    redeemedGroups += p.discountGroups.filter((g) => g.status === "redeemed").length;
    availableGroups += p.discountGroups.filter((g) => g.status === "available").length;
    if (p.pendingPurchases.length) {
      customersWithPending++;
      pendingAccruedNotRedeemable += p.pendingRabatt;
    }
    if (p.etronCustomerNo) customersWithNumberInName++;
    totalGranted += p.bonus.totalGranted;
    totalRedeemed += p.bonus.totalRedeemed;
    redeemableWallet += p.bonus.walletBalance;

    customers.push({
      row: rowNum,
      firstName: p.firstName,
      lastName: p.lastName,
      etronCustomerNo: p.etronCustomerNo,
      purchaseCount: p.purchases.length,
      purchases: p.purchases,
      discountGroups: p.discountGroups,
      pendingPurchases: p.pendingPurchases,
      streakCount: p.pendingPurchases.length,
      pendingAccruedRabatt: round2(p.pendingRabatt),
      carryoverPurchases: p.carryoverPurchases,
      totalPurchaseAmount: p.totalPurchaseAmount,
      bonus: p.bonus,
    });
  }

  const output = {
    meta: {
      source: path.basename(filePath),
      sheet: "Kundendaten",
      detectedStartColumn: startCol,
      totalRawRows: dataRows.length,
      skippedRows: skipped,
      customers: customers.length,
      totalPurchases,
      completeGroups,
      redeemedGroups,
      availableGroups,
      customersWithPending,
      customersWithNumberInName,
      totalGranted: round2(totalGranted),
      totalRedeemed: round2(totalRedeemed),
      redeemableWallet: round2(redeemableWallet),
      pendingAccruedNotRedeemable: round2(pendingAccruedNotRedeemable),
    },
    customers,
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log("\n═══════════════════════════════════════");
  console.log("📈 PARSE RESULT");
  console.log("═══════════════════════════════════════");
  Object.entries(output.meta).forEach(([k, v]) => console.log(`${k}:`.padEnd(28), v));
  console.log(`\n✅ Wrote ${outPath}`);
}

run();
