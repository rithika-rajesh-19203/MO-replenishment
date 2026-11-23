# Replenishment Prototype (base: Purchase Order flow)

Open `index.html` in a browser. No build or server. State is saved in localStorage; use **Prototype controls → Reset demo data** to start over.

## Flow
1. **Configure**: Items → item → Locations → ⚙ → Configure Replenishment → *Configure* per location (reorder level, frequency, order type, vendor/source, max stock, MOQ, max OQ, unit multiple).
2. **Trigger**: when *available stock* (on hand − committed, plus yet-to-receive + in-transit if enabled in settings) is **at or below** the reorder level, a task `REPL-xxxxx` is created → Inventory → Inventory Control → Pending Replenishments. Stock changes come from *Adjust Stock*, or from issuing/receiving orders.
3. **Schedule**: Settings (gear icon) → Items → Preferences → Replenishments sets the frequency and time. On each run, pending tasks become **draft** orders, grouped by vendor (or source location) and delivery location. Use *Fast-forward to next run* or *Run scheduler now* in the Prototype controls.
4. **Order**: Purchases → Purchase Orders → draft → Mark as Issued (adds yet-to-receive) → Receive (adds stock on hand).

Qty to replenish = Max Stock − Available, then raised to the MOQ, rounded up to the unit multiple, and capped at the max order qty.

## Code map
- `js/data.js`: seed data + Store (persistence, lookups)
- `js/engine.js`: replenishment rules, scheduler, order stock effects
- `js/views/*.js`: screens (shell, items, inventory, orders, settings)
- `js/app.js`: hash router, UI state, event delegation
