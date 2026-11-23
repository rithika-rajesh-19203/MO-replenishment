# MO Replenishment — prototype

A clickable prototype of stock replenishment, built on the **ZF Design Cannon**
(copied from File 12). Replenishment can raise a Purchase Order, a Transfer
Order or a Manufacturing Order (against the item's preferred BOM).

```bash
npm run dev      # http://localhost:5183
npm run check    # types + canon boundary rules
npm run canon    # the component library, http://localhost:6012
```

## The flow

| Step | Where |
| --- | --- |
| 1. Configure reorder level, max stock, order type (PO / TO / MO), vendor / source / BOM, order-qty rules per location | Items → an item → Locations → ⚙ → Configure Replenishment |
| 1b. Bulk-configure several items at once (PO / TO only — Manufacturing Order is listed but disabled, since each item has its own BOM) | Items → select rows → ⋯ → Bulk Update Replenishment |
| 2. Stock falls to or below the reorder level → a replenishment task (Pending) | Inventory → Replenishments. **Simulate Replenishment** in the top bar picks an item/location with stock, configures it if needed, and sells enough to cross the reorder level. **Adjust Stock** on an item also triggers it |
| 3. **Create Orders** turns pending tasks into **draft** orders, grouped by vendor/source + location; one MO per task. If a quantity breaks the max / min order quantity or unit multiple, the **Order Constraints** dialog opens (over the Manufacturing Orders list when the selection holds an MO). **Update Quantities** orders at the max and raises a new task for the rest; **Continue Anyway** orders as is | Inventory → Replenishments (row ⌄ or bulk bar). Simulate → *MO quantity exceeds maximum order quantity* sets this up and pre-selects the task |
| 4. Draft → Mark as Issued / Confirmed (Yet to Receive) → Receive / Complete (Stock on Hand) | Purchases → Purchase Orders / Inventory → Transfer Orders / Manufacturing → Manufacturing Orders |

Quantity to replenish = Max Stock − Available, raised to the minimum order
quantity, rounded up to the unit multiple. The maximum order quantity is applied
at order creation, through the Order Constraints dialog.

**Get Started** (book icon in the top bar, open on a first visit) lists every flow above with a quick link, and ticks each step once you have actually done it. Progress is stored separately from the demo data (`src/app/data/guide.ts`).

## Where things live

- `src/app/data/replenishment.ts` — seed data, the rules, the store (localStorage).
- `src/app/screens/` — one file per screen, composed from `@canon` only.
- `src/canon/` — the design system. Rules in `CLAUDE.md`.
- `legacy/` — the first, plain HTML/JS version of this prototype.
