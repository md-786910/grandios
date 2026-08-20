# Grandios Codebase Guidelines & System Map

## Quick Architecture Summary
- **Domain**: Retail customer loyalty and bonus app with 3-purchase 10% rabatt grouping.
- **Backend**: Express + MongoDB/Mongoose in [`server/`](file:///media/lenovo-lp/ssd/leoprinting%20projects/gradios/grandios-app/server).
- **Frontend**: React 19 SPA + Tailwind CSS in [`client/`](file:///media/lenovo-lp/ssd/leoprinting%20projects/gradios/grandios-app/client).
- **Integration**: OAuth2 integration with external WAWI POS/ERP (`res.partner`, `pos.order`, `pos.order.line`, `product.product`).

## Key Principles & Business Invariants
1. **Bonus Rule of 3**: Discount groups are formed by 3 eligible purchases (or 3 purchase slots including carryovers and bundles) yielding a 10% bonus.
2. **Eligibility Filter**: Items with `discount > 0` (sales), gift vouchers, or bonus cards are excluded from rabatt. Negative items (returns/refunds) net against purchases.
3. **Stichtag Cutoff**: Orders before `STICHTAG` come from Excel import (`CustomerPurchaseHistory`/`OldPurchase`); orders on/after `STICHTAG` sync live from WAWI.
4. **Carryover Streaks**: In-progress partial streaks (1-2 purchases) from Excel baseline carry over to the customer's first live WAWI discount group.
5. **Deductions**: Returns on rewarded purchases accrue in `pendingReturnDeduction` and are deducted upon next bonus redemption.
6. **Skills Reference**: See [grandios-system-guide](file:///media/lenovo-lp/ssd/leoprinting%20projects/gradios/grandios-app/.agents/skills/grandios-system-guide/SKILL.md) for detailed workflows.
