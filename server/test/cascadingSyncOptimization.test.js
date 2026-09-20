const test = require("node:test");
const assert = require("node:assert/strict");

const cascadeSyncService = require("../services/cascadingSyncService");
const Order = require("../models/Order");
const DiscountOrder = require("../models/DiscountOrder");

const {
  calculateEligibleAmount,
  calculateEligibleAmountsByOrder,
  collectUnavailableOrderIds,
  createConcurrencyLimiter,
  getCascadeAutoGroupCustomerReversal,
  getOrCreatePromise,
  isCascadeAutoCreatedGroup,
  runSingleFlight,
  toDiscountMultiplier,
} = cascadeSyncService._test;

const orderOne = "64b000000000000000000001";
const orderTwo = "64b000000000000000000002";
const orderThree = "64b000000000000000000003";
const orderFour = "64b000000000000000000004";

const representativeLines = [
  {
    orderId: orderOne,
    productName: "Regular item",
    priceSubtotalIncl: 100,
    priceUnit: 100,
    quantity: 1,
    discount: 0,
  },
  {
    orderId: orderOne,
    productName: "Sale item",
    priceSubtotalIncl: 30,
    priceUnit: 30,
    quantity: 1,
    discount: 20,
  },
  {
    orderId: orderOne,
    productName: "Gutschein",
    priceSubtotalIncl: 50,
    priceUnit: 50,
    quantity: 1,
    discount: 0,
  },
  {
    orderId: orderOne,
    productName: "Sonderrabatt",
    priceSubtotalIncl: -10,
    priceUnit: -10,
    quantity: 1,
    discount: 0,
  },
  {
    orderId: orderTwo,
    productName: "Returned item",
    priceSubtotalIncl: -40,
    priceUnit: -40,
    quantity: 1,
    discount: 0,
  },
  {
    orderId: orderTwo,
    productName: "Explicitly excluded",
    priceSubtotalIncl: 25,
    priceUnit: 25,
    quantity: 1,
    discountEligible: false,
  },
];

test("manual optimization is disabled unless explicitly true", () => {
  assert.equal(cascadeSyncService.isManualSyncOptimizationEnabled({}), false);
  assert.equal(
    cascadeSyncService.isManualSyncOptimizationEnabled({
      MANUAL_SYNC_OPTIMIZED: "false",
    }),
    false,
  );
  assert.equal(
    cascadeSyncService.isManualSyncOptimizationEnabled({
      MANUAL_SYNC_OPTIMIZED: "true",
    }),
    true,
  );
});

test("saved draft bundles reserve their purchases from automatic grouping", () => {
  const unavailable = collectUnavailableOrderIds([], [
    { orders: [orderOne, orderTwo, orderThree], isBundle: true },
  ]);
  const automaticCandidates = [orderOne, orderTwo, orderThree, orderFour].filter(
    (id) => !unavailable.has(id),
  );

  assert.deepEqual([...unavailable], [orderOne, orderTwo, orderThree]);
  assert.deepEqual(automaticCandidates, [orderFour]);
  assert.equal(automaticCandidates.length < 3, true);
});

test("ordinary purchases remain available after a draft is cleared", () => {
  const unavailable = collectUnavailableOrderIds([], []);

  assert.equal(unavailable.size, 0);
  assert.equal(
    [orderOne, orderTwo, orderThree].filter((id) => !unavailable.has(id))
      .length,
    3,
  );
});

test("existing groups and draft bundles share the same exclusion set", () => {
  const unavailable = collectUnavailableOrderIds(
    [{ status: "redeemed", orders: [{ orderId: orderOne }] }],
    [{ orders: [orderTwo, orderThree], isBundle: true }],
  );

  assert.deepEqual([...unavailable], [orderOne, orderTwo, orderThree]);
});

test("only cascade-created groups qualify for Customer wallet reversal", () => {
  assert.equal(
    isCascadeAutoCreatedGroup({ notes: "Auto-created from 3 orders sync" }),
    true,
  );
  assert.equal(
    isCascadeAutoCreatedGroup({ notes: "Auto-created (incl. 2 carryover)" }),
    true,
  );
  assert.equal(isCascadeAutoCreatedGroup({ notes: "Manual group" }), false);
  assert.equal(isCascadeAutoCreatedGroup({}), false);

  assert.equal(
    getCascadeAutoGroupCustomerReversal({
      status: "available",
      notes: "Auto-created from 3 orders sync",
      totalDiscount: 23.34,
    }),
    -23.34,
  );
  assert.equal(
    getCascadeAutoGroupCustomerReversal({
      status: "redeemed",
      notes: "Auto-created from 3 orders sync",
      totalDiscount: 23.34,
    }),
    0,
  );
  assert.equal(
    getCascadeAutoGroupCustomerReversal({
      status: "available",
      notes: "Manual group",
      totalDiscount: 23.34,
    }),
    0,
  );
});

test("bulk eligible-amount calculation matches the legacy per-order calculation", () => {
  const amounts = calculateEligibleAmountsByOrder(
    [orderOne, orderTwo],
    representativeLines,
  );
  const legacyOne = calculateEligibleAmount(
    representativeLines.filter((line) => line.orderId === orderOne),
  );
  const legacyTwo = calculateEligibleAmount(
    representativeLines.filter((line) => line.orderId === orderTwo),
  );

  assert.equal(legacyOne, 90);
  assert.equal(legacyTwo, -40);
  assert.equal(amounts.get(orderOne), legacyOne);
  assert.equal(amounts.get(orderTwo), legacyTwo);
});

test("sale purchases and sale returns are both excluded", () => {
  const amount = calculateEligibleAmount([
    {
      productName: "Sale purchase",
      priceSubtotalIncl: 62.93,
      priceUnit: 62.93,
      quantity: 1,
      discount: 20,
    },
    {
      productName: "Sale return",
      priceSubtotalIncl: -62.93,
      priceUnit: 62.93,
      quantity: -1,
      discount: 20,
    },
  ]);

  assert.equal(amount, 0);
});

test("full-price returns remain eligible as signed deductions", () => {
  const amount = calculateEligibleAmount([
    {
      productName: "Full-price return",
      priceSubtotalIncl: -62.93,
      priceUnit: 62.93,
      quantity: -1,
      discount: 0,
    },
  ]);

  assert.equal(amount, -62.93);
});

test("bulk calculation retains zero amounts and duplicate order identifiers", () => {
  const emptyOrder = "64b000000000000000000003";
  const amounts = calculateEligibleAmountsByOrder(
    [orderOne, orderOne, emptyOrder],
    representativeLines,
  );

  assert.equal(amounts.size, 2);
  assert.equal(amounts.get(orderOne), 90);
  assert.equal(amounts.get(emptyOrder), 0);
});

test("discount rate normalization supports automatic and manual group formats", () => {
  assert.equal(toDiscountMultiplier(0.1), 0.1);
  assert.equal(toDiscountMultiplier(10), 0.1);
  assert.equal(toDiscountMultiplier(undefined), 0.1);
  assert.equal(toDiscountMultiplier("invalid"), 0.1);
});

test("manual group sync regression calculates 10% instead of 1000%", () => {
  const eligibleAmounts = [594.1, 99.9, 205.31];
  const eligibleTotal = eligibleAmounts.reduce((sum, amount) => sum + amount, 0);
  const correctedBonus = eligibleAmounts.reduce(
    (sum, amount) => sum + amount * toDiscountMultiplier(10),
    0,
  );
  const inflatedBonus = 8993.1;
  const correctingDelta = correctedBonus - inflatedBonus;

  assert.equal(Math.round(eligibleTotal * 100) / 100, 899.31);
  assert.equal(Math.round(correctedBonus * 100) / 100, 89.93);
  assert.equal(Math.round(correctingDelta * 100) / 100, -8903.17);
});

test("representative business snapshot is unchanged by bulk calculation", () => {
  const snapshot = {
    customer: {
      wallet: 27,
      totalDiscountGranted: 31,
      pendingReturnDeduction: 4,
      carryoverPurchases: [80],
      streakCount: 1,
    },
    orders: [
      { id: orderOne, bonusDeductionApplied: false },
      { id: orderTwo, bonusDeductionApplied: true },
    ],
    groups: [
      {
        status: "available",
        orders: [{ orderId: orderOne, discountRate: 0.1 }],
      },
      {
        status: "redeemed",
        totalDiscount: 18,
      },
    ],
  };
  const originalSnapshot = structuredClone(snapshot);
  const amounts = calculateEligibleAmountsByOrder(
    snapshot.orders.map((order) => order.id),
    representativeLines,
  );

  const availableGroup = snapshot.groups[0];
  const recalculated = availableGroup.orders.map((line) => ({
    ...line,
    amount: amounts.get(line.orderId),
    discountAmount: amounts.get(line.orderId) * line.discountRate,
  }));

  assert.deepEqual(recalculated, [
    {
      orderId: orderOne,
      discountRate: 0.1,
      amount: 90,
      discountAmount: 9,
    },
  ]);
  assert.deepEqual(snapshot, originalSnapshot);
  assert.equal(snapshot.customer.wallet, 27);
  assert.equal(snapshot.customer.pendingReturnDeduction, 4);
  assert.deepEqual(snapshot.customer.carryoverPurchases, [80]);
  assert.equal(snapshot.groups[1].totalDiscount, 18);
});

test("manual product limiter never exceeds configured concurrency", async () => {
  const limit = createConcurrencyLimiter(2);
  let active = 0;
  let maximumActive = 0;
  const tasks = Array.from({ length: 8 }, (_, value) =>
    limit(async () => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return value;
    }),
  );

  assert.deepEqual(await Promise.all(tasks), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(maximumActive, 2);
});

test("product promise cache deduplicates repeated product IDs", async () => {
  const cache = new Map();
  let calls = 0;
  const syncProduct = () => {
    calls++;
    return { productId: 42 };
  };

  const first = getOrCreatePromise(cache, 42, syncProduct);
  const second = getOrCreatePromise(cache, 42, syncProduct);

  assert.strictEqual(first, second);
  assert.deepEqual(await first, { productId: 42 });
  assert.equal(calls, 1);
});

test("single-flight shares simultaneous work and allows a later retry", async () => {
  const inFlight = new Map();
  let calls = 0;
  const task = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { orders: 3, groups: 1, wallet: 12 };
  };

  const first = runSingleFlight(inFlight, "customer-1", task);
  const second = runSingleFlight(inFlight, "customer-1", task);
  assert.deepEqual(await Promise.all([first, second]), [
    { orders: 3, groups: 1, wallet: 12 },
    { orders: 3, groups: 1, wallet: 12 },
  ]);
  assert.equal(calls, 1);

  await runSingleFlight(inFlight, "customer-1", task);
  assert.equal(calls, 2);
});

test("single-flight clears a failed attempt so the next click can retry", async () => {
  const inFlight = new Map();
  await assert.rejects(
    runSingleFlight(inFlight, "customer-1", async () => {
      throw new Error("temporary WAWI failure");
    }),
    /temporary WAWI failure/,
  );
  assert.equal(inFlight.size, 0);
  assert.equal(
    await runSingleFlight(inFlight, "customer-1", async () => "recovered"),
    "recovered",
  );
});

test("sync query indexes are declared on the schemas", () => {
  const orderIndexes = Order.schema.indexes().map(([fields]) => fields);
  const discountOrderIndexes = DiscountOrder.schema
    .indexes()
    .map(([fields]) => fields);

  assert.ok(
    orderIndexes.some(
      (fields) => fields.customerId === 1 && fields.orderDate === -1,
    ),
  );
  assert.ok(
    discountOrderIndexes.some(
      (fields) => fields.customerId === 1 && fields.createdAt === -1,
    ),
  );
});
