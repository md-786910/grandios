const XLSX = require("xlsx");
const path = require("path");
const Customer = require("../models/Customer");
const CustomerPurchaseHistory = require("../models/CustomerPurchaseHistory");

function parseNumber(val) {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

/**
 * Parse a single purchase group from a row.
 * Group 1 (isFirstGroup=true): 6 columns — EK, EK, EK, Rabatt, Rabatteinlösung, Bemerkungen
 * Group 2+: 5 columns — EK, EK, EK, Rabatt, Rabatteinlösung
 */
function parseGroup(row, startCol, ekStart, isFirstGroup) {
  const colCount = isFirstGroup ? 6 : 5;
  const groupCols = row.slice(startCol, startCol + colCount);

  const hasData = groupCols.some(
    (val) => val !== null && val !== undefined && val !== "",
  );
  if (!hasData) return null;

  const purchases = [
    { label: `EK${ekStart}`, amount: parseNumber(row[startCol]) },
    { label: `EK${ekStart + 1}`, amount: parseNumber(row[startCol + 1]) },
    { label: `EK${ekStart + 2}`, amount: parseNumber(row[startCol + 2]) },
  ];

  const rabatt = parseNumber(row[startCol + 3]) || 0;
  const rawRabatteinloesung = parseNumber(row[startCol + 4]);
  // Treat 0 as null (not redeemed), only negative values mean redeemed
  const rabatteinloesung =
    rawRabatteinloesung !== null && rawRabatteinloesung < 0
      ? rawRabatteinloesung
      : null;
  const isRedeemed = rabatteinloesung !== null;

  return {
    purchases,
    rabatt,
    rabatteinloesung,
    isRedeemed,
  };
}

/**
 * Import customer purchase history from the Kundendaten Excel file.
 * @param {string} [filePath] - optional override path to Excel file
 * @returns {object} - { imported, updated, skipped, errors, unmatchedEmails }
 */
async function importPurchaseHistory(filePath) {
  if (!filePath) {
    filePath = path.join(
      __dirname,
      "..",
      "..",
      "task",
      "Kundendaten Testversion.xlsx",
    );
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets["Kundendaten"];

  if (!sheet) {
    throw new Error('Sheet "Kundendaten" not found in workbook');
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const dataRows = rows.slice(1); // skip header row

  const results = {
    imported: 0,
    updated: 0,
    skipped: 0,
    customersCreated: 0,
    errors: [],
    unmatchedEmails: [],
  };

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 2; // 1-indexed + header

    try {
      const customerNo = row[0] ? String(row[0]).trim() : null;
      if (!customerNo) {
        results.skipped++;
        continue;
      }

      const lastName = row[1] ? String(row[1]).trim() : "";
      const firstName = row[2] ? String(row[2]).trim() : "";
      const street = row[3] ? String(row[3]).trim() : "";
      const postalCode = row[4] != null ? String(row[4]).trim() : "";
      const city = row[5] ? String(row[5]).trim() : "";
      const email = row[6] ? String(row[6]).trim().toLowerCase() : "";
      const phone = row[7] ? String(row[7]).trim() : "";
      const size = row[8] != null ? String(row[8]).trim() : "";

      // Parse purchase groups
      const purchaseGroups = [];
      let remarks = null;
      let ekCounter = 1;

      // Group 1: columns 9-14 (6 cols, includes Bemerkungen)
      const group1 = parseGroup(row, 9, ekCounter, true);
      if (group1) {
        group1.groupIndex = 0;
        remarks = row[14] ? String(row[14]).trim() : null;
        purchaseGroups.push(group1);
      }
      ekCounter += 3;

      // Groups 2+: columns 15, 20, 25, ... (5 cols each)
      let colStart = 15;
      let groupIdx = 1;
      while (colStart < row.length) {
        const group = parseGroup(row, colStart, ekCounter, false);
        if (!group) break;
        group.groupIndex = groupIdx;
        purchaseGroups.push(group);
        ekCounter += 3;
        groupIdx++;
        colStart += 5;
      }

      // Calculate summary stats
      let totalPurchaseAmount = 0;
      let totalRabatt = 0;
      let totalRedeemed = 0;

      for (const group of purchaseGroups) {
        for (const p of group.purchases) {
          totalPurchaseAmount += p.amount || 0;
        }
        totalRabatt += group.rabatt || 0;
        totalRedeemed += Math.abs(group.rabatteinloesung || 0);
      }

      // Match to existing customer by email, or create new one
      let customerId = null;
      if (email) {
        const existingCustomer = await Customer.findOne({ email });
        if (existingCustomer) {
          customerId = existingCustomer._id;
        } else {
          // Create new customer from Excel data with source "import"
          const newCustomer = await Customer.create({
            ref: customerNo,
            name: `${firstName} ${lastName}`.trim() || customerNo,
            email,
            phone,
            address: {
              street,
              postalCode,
              city,
            },
            source: "import",
          });
          customerId = newCustomer._id;
          results.customersCreated++;
          results.unmatchedEmails.push({ customerNo, email, row: rowNum, created: true });
        }
      }

      // Upsert by customerNo
      const updateData = {
        customerId,
        lastName,
        firstName,
        street,
        postalCode,
        city,
        email,
        phone,
        size,
        remarks,
        purchaseGroups,
        totalPurchaseAmount,
        totalRabatt,
        totalRedeemed,
        groupCount: purchaseGroups.length,
        importedAt: new Date(),
      };

      // Match by customerNo or email
      const matchQuery = email
        ? { $or: [{ customerNo }, { email }] }
        : { customerNo };
      const existing = await CustomerPurchaseHistory.findOne(matchQuery);

      if (existing) {
        await CustomerPurchaseHistory.updateOne(
          { _id: existing._id },
          { $set: { customerNo, ...updateData } },
        );
        results.updated++;
      } else {
        await CustomerPurchaseHistory.create({ customerNo, ...updateData });
        results.imported++;
      }
    } catch (err) {
      results.errors.push({ row: rowNum, message: err.message });
    }
  }

  return results;
}

module.exports = { importPurchaseHistory };
// if have discount so we can redeem as we do but with this purchase histories
