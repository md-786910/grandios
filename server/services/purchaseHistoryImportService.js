const XLSX = require("xlsx");
const path = require("path");
const Customer = require("../models/Customer");
const CustomerPurchaseHistory = require("../models/CustomerPurchaseHistory");
const OldPurchase = require("../models/OldPurchase");
const DiscountOrder = require("../models/DiscountOrder");
const Discount = require("../models/Discount");

const DISCOUNT_RATE = 10; // percent
const PURCHASES_PER_GROUP = 3;

function parseNumber(val) {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}

function round2(n) {
  return n === null || n === undefined ? 0 : Math.round(n * 100) / 100;
}

/**
 * Normalize a name into an order-independent matching key:
 * lowercase, strip diacritics/punctuation, split into tokens, sort, rejoin.
 * "Müller Anna" and "anna mueller!" both → "anna muller" ... (note: ü→u).
 */
function normalizeName(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // remove combining marks (accents)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // punctuation → space
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

/**
 * Split the raw Nachname / Vorname cells, peeling off a trailing customer
 * number used to disambiguate duplicate names (e.g. "Lehner 226" → no=226).
 */
function parseName(lastRaw, firstRaw) {
  let lastName = (lastRaw || "").toString().trim();
  const firstName = (firstRaw || "").toString().trim();
  let etronCustomerNo = null;
  const m = lastName.match(/^(.*?)\s+(\d{2,})$/);
  if (m) {
    lastName = m[1].trim();
    etronCustomerNo = m[2];
  }
  return { firstName, lastName, etronCustomerNo };
}

/**
 * Find the column index of the first EK (purchase) field by reading the
 * header row. Layout is normally col0=Nachname, col1=Vorname, col2=empty
 * spacer, then stride-5 buckets from col3: [EK, EK, EK, Rabatt,
 * Rabatteinlösung] — but some exports omit the spacer column, shifting
 * everything one column left. Detecting from the actual header avoids
 * silently misreading every value when the export format shifts.
 */
function detectStartColumn(headerRow) {
  if (!headerRow) return 3;
  const idx = headerRow.findIndex(
    (h) => String(h || "").trim().toLowerCase() === "ek1",
  );
  return idx >= 0 ? idx : 3;
}

/**
 * Parse a single Excel data row into the customer-wise structure.
 * Stride-5 buckets from `startCol`: [EK, EK, EK, Rabatt, Rabatteinlösung].
 *  - complete bucket (3 purchases)  → redeemable discount group
 *  - partial bucket (1–2 purchases) → pending streak (kept, NOT redeemable)
 */
function parseRow(row, rowNum, startCol = 3) {
  const { firstName, lastName, etronCustomerNo } = parseName(row[0], row[1]);
  if (!firstName && !lastName) return null;

  const purchases = []; // every individual purchase (flat)
  const discountGroups = []; // complete groups of 3
  const pendingPurchases = []; // 1–2 purchase trailing streak
  let pendingRabatt = 0;

  let seq = 0; // running EK number
  let col = startCol;
  let outGroupIndex = 0;

  while (col < row.length) {
    const ek = [
      parseNumber(row[col]),
      parseNumber(row[col + 1]),
      parseNumber(row[col + 2]),
    ];
    const rabatt = parseNumber(row[col + 3]);
    const redemption = parseNumber(row[col + 4]);

    const present = ek
      .map((amount, i) => ({ label: `EK${seq + i + 1}`, amount }))
      .filter((p) => p.amount !== null && p.amount !== 0);

    if (present.length || rabatt || redemption) {
      const complete = present.length === PURCHASES_PER_GROUP;
      const redeemed = redemption !== null && redemption < 0;

      if (complete) {
        const totalAmount = round2(present.reduce((s, p) => s + p.amount, 0));
        discountGroups.push({
          groupIndex: outGroupIndex++,
          purchases: present,
          totalAmount,
          discountRate: DISCOUNT_RATE,
          discountAmount: round2(rabatt || 0),
          rabatteinloesung: redeemed ? round2(redemption) : null,
          status: redeemed ? "redeemed" : "available",
          redeemedAmount: redeemed ? round2(Math.abs(redemption)) : 0,
        });
        present.forEach((p) => purchases.push({ ...p, status: redeemed ? "redeemed" : "available" }));
      } else {
        present.forEach((p) => {
          pendingPurchases.push(p);
          purchases.push({ ...p, status: "pending" });
        });
        // Compute the projected accrual directly (DISCOUNT_RATE% of the
        // pending amount) rather than trusting the sheet's own Rabatt cell —
        // that cell is usually pre-filled by the same formula but isn't
        // guaranteed to exist (e.g. a dangling trailing EK column with no
        // Rabatt column after it).
        const presentTotal = present.reduce((s, p) => s + p.amount, 0);
        pendingRabatt += presentTotal * (DISCOUNT_RATE / 100);
      }
    }

    seq += PURCHASES_PER_GROUP;
    col += 5;
  }

  const totalGranted = round2(
    discountGroups.reduce((s, g) => s + g.discountAmount, 0),
  );
  const totalRedeemed = round2(
    discountGroups.reduce((s, g) => s + g.redeemedAmount, 0),
  );
  const totalPurchaseAmount = round2(
    purchases.reduce((s, p) => s + (p.amount || 0), 0),
  );

  return {
    row: rowNum,
    firstName,
    lastName,
    etronCustomerNo,
    purchases,
    discountGroups,
    pendingPurchases,
    pendingRabatt: round2(pendingRabatt),
    carryoverPurchases: pendingPurchases.map((p) => p.amount),
    totalPurchaseAmount,
    bonus: {
      totalGranted,
      totalRedeemed,
      walletBalance: round2(totalGranted - totalRedeemed),
    },
  };
}

/**
 * Recompute a customer's redeemable bonus purely from their DiscountOrders so
 * the import is idempotent and consistent with WAWI-created groups:
 *   wallet  = Σ discount of available groups
 *   granted = Σ discount of all groups
 *   redeemed= Σ discount of redeemed groups
 */
async function recomputeCustomerBonus(customerId) {
  const groups = await DiscountOrder.find({ customerId }).lean();
  let granted = 0;
  let redeemed = 0;
  let available = 0;
  for (const g of groups) {
    const d = g.totalDiscount || 0;
    granted += d;
    if (g.status === "redeemed") redeemed += d;
    else available += d;
  }
  granted = round2(granted);
  redeemed = round2(redeemed);
  available = round2(available);

  const customer = await Customer.findByIdAndUpdate(
    customerId,
    {
      $set: {
        wallet: available,
        totalDiscountGranted: granted,
        totalDiscountRedeemed: redeemed,
      },
    },
    { new: true },
  );

  await Discount.findOneAndUpdate(
    { customerId },
    {
      $set: {
        balance: available,
        totalGranted: granted,
        totalRedeemed: redeemed,
        partnerId: customer?.contactId,
        status: 1,
      },
    },
    { upsert: true, new: true },
  );

  return available;
}

/**
 * Build a name → [customers] index for matching.
 */
async function buildCustomerNameIndex() {
  const customers = await Customer.find(
    {},
    "name ref contactId email",
  ).lean();
  const index = new Map();
  for (const c of customers) {
    const key = normalizeName(c.name);
    if (!key) continue;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(c);
  }
  return index;
}

/**
 * Match a parsed Excel row to exactly one Customer by name.
 * Returns { customer } on a unique match, or { reason, candidates } otherwise.
 */
function matchCustomer(parsed, nameIndex) {
  const tieBreak = (pool) => {
    if (!parsed.etronCustomerNo) return null;
    const exact = pool.filter(
      (c) =>
        String(c.ref) === parsed.etronCustomerNo ||
        String(c.contactId) === parsed.etronCustomerNo,
    );
    return exact.length === 1 ? exact[0] : null;
  };
  const asCandidates = (pool) =>
    pool.map((c) => ({
      id: c._id,
      name: c.name,
      ref: c.ref,
      contactId: c.contactId,
    }));

  // Primary: match on the FULL name INCLUDING any disambiguation number, since
  // Etron stores duplicates the same way (e.g. "Monika Lehner 226"). This makes
  // numbered names unique and match directly.
  const fullName = parsed.etronCustomerNo
    ? `${parsed.firstName} ${parsed.lastName} ${parsed.etronCustomerNo}`
    : `${parsed.firstName} ${parsed.lastName}`;
  const full = nameIndex.get(normalizeName(fullName)) || [];
  if (full.length === 1) return { customer: full[0] };
  if (full.length >= 2) {
    const won = tieBreak(full);
    return won
      ? { customer: won }
      : { reason: "ambiguous", candidates: asCandidates(full) };
  }

  // Fallback (full name not found): try the name WITHOUT the number, in case
  // Etron didn't carry the suffix. Disambiguate 2+ via the Etron number.
  const stripped =
    nameIndex.get(normalizeName(`${parsed.firstName} ${parsed.lastName}`)) || [];
  if (stripped.length === 1) return { customer: stripped[0] };
  if (stripped.length >= 2) {
    const won = tieBreak(stripped);
    return won
      ? { customer: won }
      : { reason: "ambiguous", candidates: asCandidates(stripped) };
  }

  return { reason: "no_match", candidates: [] };
}

/**
 * Persist the audit records (CustomerPurchaseHistory + per-EK OldPurchase).
 */
async function storeHistory(customerNo, customer, parsed) {
  const purchaseGroups = parsed.discountGroups.map((g) => ({
    groupIndex: g.groupIndex,
    purchases: g.purchases,
    rabatt: g.discountAmount,
    rabatteinloesung: g.rabatteinloesung,
    isRedeemed: g.status === "redeemed",
  }));

  await CustomerPurchaseHistory.create({
    customerNo,
    customerId: customer ? customer._id : null,
    // Carry the matched customer's email so getCustomerDiscount/getAll can also
    // link this history by email (they query by customer.email OR customer.ref).
    email: customer ? customer.email : undefined,
    lastName: parsed.lastName,
    firstName: parsed.firstName,
    purchaseGroups,
    pendingPurchases: parsed.pendingPurchases,
    pendingRabatt: parsed.pendingRabatt,
    totalPurchaseAmount: parsed.totalPurchaseAmount,
    totalRabatt: parsed.bonus.totalGranted,
    totalRedeemed: parsed.bonus.totalRedeemed,
    groupCount: parsed.discountGroups.length,
    importedAt: parsed.importedAt,
  });

  const oldPurchases = parsed.purchases.map((p, idx) => ({
    customerNo,
    customerId: customer ? customer._id : null,
    purchaseLabel: p.label,
    amount: p.amount,
    groupIndex: Math.floor(idx / PURCHASES_PER_GROUP),
    ekIndex: idx + 1,
    lastName: parsed.lastName,
    firstName: parsed.firstName,
    importedAt: parsed.importedAt,
    source: "excel_import",
    isInDiscountGroup: p.status !== "pending",
  }));
  if (oldPurchases.length) await OldPurchase.insertMany(oldPurchases);
}

/**
 * Import customer bonus history from the name-based Kundendaten Excel file.
 * Matches rows to existing customers BY NAME (never email); seeds redeemable
 * bonus from completed groups of 3 and the pending streak as carryover.
 *
 * @param {string} [filePath]
 * @returns {object} report
 */
async function importPurchaseHistory(filePath, options = {}) {
  const { dryRun = false } = options;
  if (!filePath) {
    filePath = path.join(
      __dirname,
      "..",
      "..",
      "excel",
      "Kundendaten TEST Stand 170826.xlsx",
    );
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets["Kundendaten"];
  if (!sheet) throw new Error('Sheet "Kundendaten" not found in workbook');

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const dataRows = rows.slice(1); // skip header
  const importedAt = new Date();
  const startCol = detectStartColumn(rows[0]);
  if (startCol !== 3) {
    console.warn(
      `⚠️  Detected EK1 at column ${startCol} (expected 3 — export is missing the usual blank spacer column). Parsing with the detected offset.`,
    );
  }

  // --- Reset prior import state so re-running is fully idempotent ---
  // Skipped entirely in dry-run (no writes).
  let prevExcelCustomerIds = [];
  if (!dryRun) {
    prevExcelCustomerIds = (
      await DiscountOrder.distinct("customerId", { source: "excel" })
    ).map((id) => id.toString());
    await DiscountOrder.deleteMany({ source: "excel" });
    await CustomerPurchaseHistory.deleteMany({});
    await OldPurchase.deleteMany({});
    await Customer.updateMany(
      {},
      {
        $set: {
          carryoverPurchases: [],
          streakCount: 0,
          pendingAccruedRabatt: 0,
        },
      },
    );
  }

  const nameIndex = await buildCustomerNameIndex();

  const results = {
    dryRun,
    detectedStartColumn: startCol,
    totalRows: dataRows.length,
    parsed: 0,
    skipped: 0,
    matched: 0,
    unmatched: [],
    ambiguous: [],
    historyGroupsStored: 0,
    availableOldBonus: 0,
    errors: [],
  };

  const touchedCustomerIds = new Set(prevExcelCustomerIds);

  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2; // 1-indexed + header
    try {
      const parsed = parseRow(dataRows[i], rowNum, startCol);
      if (!parsed) {
        results.skipped++;
        continue;
      }
      parsed.importedAt = importedAt;
      results.parsed++;

      const match = matchCustomer(parsed, nameIndex);

      // Audit key. For a matched customer, use the customer's ref so the
      // existing getCustomerDiscount/getAll queries — which look up purchase
      // history by customer.ref / customer.email — find these rows and render
      // them under "Alte Einkäufe". Fall back to the Etron number / row id only
      // when unmatched or the customer has no ref.
      const customerNo =
        (match.customer && match.customer.ref) ||
        parsed.etronCustomerNo ||
        `R${rowNum}`;

      if (!match.customer) {
        const entry = {
          row: rowNum,
          name: `${parsed.firstName} ${parsed.lastName}`.trim(),
          etronCustomerNo: parsed.etronCustomerNo || null,
        };
        if (match.reason === "ambiguous") {
          entry.candidates = match.candidates;
          results.ambiguous.push(entry);
        } else {
          results.unmatched.push(entry);
        }
        // Still keep the parsed history unlinked so nothing is lost.
        if (!dryRun) await storeHistory(customerNo, null, parsed);
        continue;
      }

      const customer = match.customer;
      touchedCustomerIds.add(customer._id.toString());
      results.matched++;
      results.historyGroupsStored += parsed.discountGroups.length;
      results.availableOldBonus = round2(
        results.availableOldBonus + parsed.bonus.walletBalance,
      );

      if (dryRun) {
        // Preview only: write nothing.
        continue;
      }

      // NOTE: We intentionally do NOT create source:'excel' DiscountOrder
      // records. The Excel baseline lives only in CustomerPurchaseHistory /
      // OldPurchase and is rendered by the existing "Alte Einkäufe" UI; its
      // available bonus is already counted via oldRedeemableBonus. Creating
      // DiscountOrders here duplicated every group in BonusDetail.

      // If a post-Stichtag sync already folded this customer's carryover into a
      // WAWI group (its items carry fromExcel:true), do NOT re-seed it — otherwise
      // re-running the import would let those pre-Stichtag purchases be counted a
      // second time and pay the bonus twice. (Excel baseline groups are
      // source:'excel' and were just cleared above, so they don't match here.)
      const carryoverConsumed = await DiscountOrder.exists({
        customerId: customer._id,
        source: "wawi",
        "orders.fromExcel": true,
      });

      await Customer.findByIdAndUpdate(customer._id, {
        $set: {
          carryoverPurchases: carryoverConsumed ? [] : parsed.carryoverPurchases,
          streakCount: carryoverConsumed ? 0 : parsed.pendingPurchases.length,
          pendingAccruedRabatt: carryoverConsumed ? 0 : parsed.pendingRabatt,
          baselineImportedAt: importedAt,
        },
      });

      await storeHistory(customerNo, customer, parsed);
    } catch (err) {
      results.errors.push({ row: rowNum, message: err.message });
    }
  }

  if (dryRun) {
    // availableOldBonus was accumulated above; nothing persisted.
    return results;
  }

  // Recompute wallet/Discount from real (WAWI) DiscountOrders for every affected
  // customer. With no source:'excel' groups, this correctly excludes the Excel
  // baseline (which surfaces via oldRedeemableBonus) and also undoes any wallet
  // inflation left by an earlier run that created Excel DiscountOrders.
  let walletFromWawi = 0;
  for (const id of touchedCustomerIds) {
    try {
      walletFromWawi += (await recomputeCustomerBonus(id)) || 0;
    } catch (err) {
      results.errors.push({ customerId: id, message: err.message });
    }
  }
  results.walletFromWawiGroups = round2(walletFromWawi);

  return results;
}

module.exports = {
  importPurchaseHistory,
  // exported for testing / scripts
  parseRow,
  parseName,
  normalizeName,
  detectStartColumn,
};
