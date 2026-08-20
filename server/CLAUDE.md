# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GRANDIOS backend API — an Express + MongoDB/Mongoose service. It's less a generic CRUD API and more a loyalty/bonus-calculation engine wrapped around a continuous sync from an external ERP ("WAWI", an Odoo-style API at onretail.eu), with a one-time Excel-import bridge for pre-cutover purchase history.

## Commands

- `npm run dev` — start with nodemon (local development)
- `npm start` — start with plain node
- `npm run seed` — runs `seed.js`: wipes `User`/`Customer`/`Order`/`Discount`/`DiscountOrder` and creates one admin user (`admin@grandios.com`); the customer/order seeding block in that file is commented out, so in practice this only resets the login
- `npm run pm2:start` / `pm2:stop` / `pm2:restart` / `pm2:logs` — via `ecosystem.config.js` (currently `instances: 1`, fork mode — see scheduler note below)
- **No test framework and no lint/format config are set up** (no `test` script in `package.json`, no jest/mocha/eslint/prettier in `node_modules`). Verification for sync/import logic is done via the ad hoc scripts below, run directly against real Mongo/WAWI: `node scripts/<file>.js` (each loads `.env` and connects itself).

Operational/debug scripts (`scripts/`):
- `clearAndFullSync.js` — wipes sync collections (Customer/Order/OrderLine/Product/Discount/DiscountOrder/OrderCustomerQueue), then runs a full cascade sync
- `syncAllCustomers.js` — customers-only sync via the legacy `wawiSyncService` (no orders/discount side effects)
- `syncProductById.js <id>` — fetch/upsert a single product by numeric WAWI id
- `testWawiAuth.js` — sanity-check OAuth config/token acquisition
- `testCascadeSync.js`, `testCascadeAPI.js` — before/after Mongo counts around a cascade sync run
- `testDiscountAPI.js` — dumps a sample customer's orders/orderLines/eligibility mapping
- `testOrderLineSync.js`, `testAttributeSync.js`, `testFullAttributeSync.js` — targeted sync verification for order lines / product attributes
- `importPurchaseHistory.js` / `importBonusFromExcel.js [--dry-run] [--file <path>]` — Excel bonus import (see pipeline below); always dry-run first against production data
- `releaseOrphanedSheetPurchases.js` — repairs stale `OldPurchase.isInDiscountGroup` flags after a bonus group was deleted
- `resetAndReseed.js`, `clearSyncData.js` — broader reset helpers

## Environment (`.env`)

- Mongo: `MONGODB_URI`
- Auth: `JWT_SECRET`, `JWT_EXPIRE`
- WAWI OAuth: `WAWI_BASE_URL`, `WAWI_TOKEN_URL`, `WAWI_CLIENT_ID`, `WAWI_CLIENT_SECRET` — `WAWI_ACCESS_TOKEN`/`WAWI_TOKEN_EXPIRY` are written back into `.env` automatically by `services/wawiOAuth.js`, not meant to be hand-set
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL` (used to build password-reset links)
- `STICHTAG` — a `YYYY-MM-DD` cutover date, see below
- `DNS_FIX` (optional) — if set, forces DNS servers to 8.8.8.8/1.1.1.1 and IPv4-first resolution (`index.js`)

## Architecture

### Big picture: three data eras stitched together

1. **Pre-cutover legacy data**, imported once from Excel spreadsheets → `OldPurchase` (flat per-row audit log) + `CustomerPurchaseHistory` (per-customer aggregate).
2. **Post-cutover live data**, continuously synced from WAWI → `Customer`, `Order`, `OrderLine`, `Product`/`ProductAttribute`/`ProductAttributeValue`.
3. **The bonus/discount layer** on top of both eras: eligible orders get bundled 3-at-a-time into a `DiscountOrder` (a redeemable bundle) → credited to `Discount`/`Customer.wallet` (per-customer balance). Two independent mechanisms do the bundling depending on how the order arrived — see "Bonus/discount business logic" below.

`STICHTAG` (`utils/stichtag.js`) is the runtime-configured dividing line between era 1 and era 2 — it's consulted in `dashboardController.js`, `discountController.js`, `cascadingSyncService.js`, and the import scripts, rather than being a hardcoded constant. Any new "which era does this belong to" logic should read it the same way, not duplicate a cutoff date.

### WAWI sync subsystem

- `services/wawiOAuth.js` — singleton OAuth2 `client_credentials` token cache; persists the token back to `.env`; auto-refreshes on expiry or 401.
- `services/wawiApiClient.js` — generic Odoo-style `searchRead(model, {fields,domain,limit,offset,order})` plus typed wrappers (`getCustomers`, `getOrders`, `getOrderLines`, `getProducts`, `getProductAttribute(Values)`), with retry/backoff on 401/429/5xx.
- **Two sync services coexist — know which one is live before touching sync logic:**
  - `services/wawiSyncService.js` — legacy, flat, independent per-entity syncs (`syncCustomers`/`syncOrders`/`syncProducts`/...), no discount-group logic. Still reachable via the legacy `/api/sync/customers|orders|products|...` endpoints and a couple of scripts, but **not** used by the scheduler.
  - `services/cascadingSyncService.js` (~1500 lines) — the actual production engine. It's the only sync service wired into `services/scheduler.js`, into `/api/sync/cascade/*`, and into discount-related resyncs from `discountController.js`.
- Cascade pipeline per customer: fetch/upsert `Customer` → `syncCustomerOrders` (diff WAWI order ids vs local, upsert only missing) → `syncOrderLinesWithProducts` (sync referenced `Product`/`ProductAttribute(Value)` first, then `OrderLine`, updating the parent `Order`'s totals) → `checkAndCreateDiscountGroup` (bundle every 3 eligible orders into a `DiscountOrder`, credit `Customer.wallet`/`Discount`, and log return-driven `pendingReturnDeduction` adjustments to `NotesHistory`).
- Scheduler (`services/scheduler.js`, started from `index.js`): hourly `runIncrementalSync` (recent orders only) + daily 2:00 AM `runFullCascadeSync` (all customers). Guarded to run only on PM2 instance 0 to avoid duplicate concurrent syncs — currently a no-op safeguard since `ecosystem.config.js` runs a single fork-mode instance, but load-bearing if that ever changes to cluster mode.

### Bonus/discount business logic

**Two independent bundling paths create the same kind of `DiscountOrder`, and they never touch each other — `cascadingSyncService.js` does not read or write `OrderCustomerQueue` at all:**

- **WAWI-synced orders (the normal, production path):** `cascadingSyncService.checkAndCreateDiscountGroup(customer, orders)` runs at the end of every cascade sync (scheduled or manual) and bundles eligible orders directly into `DiscountOrder`s — it never goes through the queue.
- **Manually created orders:** only `orderController.createOrder` (`POST /api/orders`) calls `queueController.addOrderToQueue`, which accumulates on `OrderCustomerQueue` and auto-triggers `processQueue` once `orderCount >= AppSettings.ordersRequiredForDiscount`.

Both paths converge on the same shape of bundling logic (3 eligible units → one `DiscountOrder` at `AppSettings.discountRate`), but read the code path that actually matches how an order entered the system before assuming which one ran.

- Eligibility: `getOrderEligibleAmount` (`cascadingSyncService.js`) sums *signed* `priceSubtotalIncl` across an order's lines, skipping lines `isItemExcludedFromEligibleAmount` (vouchers/gift-cards/bonus-card/Sonderrabatt, and Sale-type lines that already carry a per-line discount). The sign is intentional: a pure-return order yields a negative eligible amount rather than being clamped to 0. `isItemEligibleForBonus`/`orderHasEligibleItems` in `discountController.js`/`queueController.js` implement the equivalent line-level check for the manual/queue path — keep the two in sync if the rule changes.
- Bundling (`checkAndCreateDiscountGroup`): builds a `slots` array — the customer's pre-Stichtag Excel `carryoverPurchases` first (as pseudo-slots, `orderId: null`), then post-Stichtag eligible orders sorted oldest-first — and pulls off every 3 slots into one `DiscountOrder` (`status: 'available'`, `discountRate: 0.1`), crediting `Customer.wallet`/`Discount.balance` by the group's `totalDiscount`. This is also where already-Stichtag-excluded and already-grouped orders are filtered out, and where existing non-redeemed groups get their stored amounts recomputed against the current eligibility logic on every sync.
- Pure-return orders (negative eligible amount) never enter a bundle. Instead they accrue onto `Customer.pendingReturnDeduction` (10% of the return's absolute value) and are flagged `Order.bonusDeductionApplied` so they're not processed twice; a `NotesHistory` entry records the accrual.
- Manual admin path: `createDiscountGroup` (`discountController.js`) lets an admin bundle arbitrary orders/Excel old-purchases by hand, reusing `getOrderEligibleAmount` as the source of truth for "how much of an order counts."
- Redemption: `redeemDiscountGroup` marks a `DiscountOrder` `redeemed` (terminal), calls `Discount.redeemDiscount(totalDiscount)`, then credits `Customer.wallet` with `gross - consumed`, where `consumed` is however much of `pendingReturnDeduction` is applied now (capped at `min(pending, gross)`, optionally partial via `req.body.deductionAmount`) — the remainder stays pending for the next redemption. A `NotesHistory` entry records the before/after wallet balance.
- `AppSettings` (singleton, `key: 'default'`) is the single place `discountRate`/`ordersRequiredForDiscount`/`autoCreateDiscount` live — read from it rather than hardcoding thresholds in new code.

### Excel/legacy import pipeline

`services/purchaseHistoryImportService.js` (driven by `scripts/importBonusFromExcel.js` / `importPurchaseHistory.js` or `POST /api/purchase-history/import`):
1. Reads the `"Kundendaten"` sheet, dynamically detecting the EK1 start column to tolerate export-format drift.
2. Buckets each customer's rows in stride-5 groups of 3 purchases — complete groups become redeemable discount groups, a trailing partial group becomes a pending streak.
3. Matches rows to an existing `Customer` **by normalized name** (never email/id), with numeric-suffix disambiguation.
4. On a non-dry-run, wipes and rebuilds `CustomerPurchaseHistory` + `OldPurchase` + `DiscountOrder{source:'excel'}`, updates the matched `Customer`'s `carryoverPurchases`/`streakCount`/`pendingAccruedRabatt`/`baselineImportedAt`, then recomputes wallets from real WAWI `DiscountOrder`s.

### Read-side merge

`utils/purchaseFeed.js`'s `buildPurchaseFeed` merges live `Order` documents with legacy `OldPurchase` rows into one paginated, chronologically sorted feed, used by the dashboard and order listings. This is why "all orders for a customer" is never a single Mongo query in this codebase — new read endpoints over customer history should go through this helper rather than querying `Order` alone.

### Auth

Single-role system — `User.role` is currently only ever `"admin"`. There's no customer-facing auth; this API is an internal admin tool. JWT via `Authorization: Bearer` (`middleware/auth.js`); password reset emails a `FRONTEND_URL`-based link via `utils/sendEmail.js`/SMTP.

### Dev-only surface

`controllers/testDataController.js` + `routes/test.js` (mounted at `/api/test`) generates and clears fake `"(Test)"`-suffixed customers/orders for UI development. It is mounted unconditionally with no `NODE_ENV` gate — it is live in every environment, including production.

## Notes for future changes

- Before changing sync behavior, confirm whether `cascadingSyncService.js` or the legacy `wawiSyncService.js` is the actual code path in play — check `services/scheduler.js` and the route file, don't assume from the controller name alone.
- `isItemEligibleForBonus`/`getOrderEligibleAmount` define what counts as bonus-eligible and are consulted from more than one controller — grep for all call sites before changing the rule.
- `OrderCustomerQueue` only sees orders created via `POST /api/orders` (manual entry) — WAWI-synced orders bundle directly via `cascadingSyncService.checkAndCreateDiscountGroup` and never touch the queue. Don't assume "check the queue" tells you the full accrual state for a customer.
- `STICHTAG` is a runtime env var, not a constant — new pre/post-cutover logic should read it via `utils/stichtag.js`.
