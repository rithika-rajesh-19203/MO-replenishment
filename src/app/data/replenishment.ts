import { useSyncExternalStore } from 'react';

/**
 * REPLENISHMENT — the prototype's data and its rules, kept out of the screens.
 *
 * The flow, end to end:
 *   1. An item is configured per location (reorder level, max stock, order
 *      type, vendor or source, order quantity rules).
 *   2. When available stock at a location falls TO or BELOW its reorder level,
 *      a replenishment task is raised (Pending). "Simulate Replenishment" in
 *      the top bar forces this with a simulated sale.
 *   3. Create Orders on Replenishments turns pending tasks into DRAFT orders,
 *      grouped by vendor/source + delivery location (one MO per task).
 *   4. Issuing the order adds Yet to Receive; receiving it adds Stock on Hand.
 *
 * State lives in one module-level object, persisted to localStorage, and the
 * screens subscribe with `useReplenishment()`. Every mutation goes through
 * `commit()`, which saves and notifies.
 */

/* ── Types ────────────────────────────────────────────────────────────────── */

export type OrderType = 'po' | 'to' | 'mo';
export type FreqUnit = 'days' | 'weeks' | 'months';
export type TaskStatus = 'pending' | 'ordered' | 'dismissed';
export type OrderStatus = 'draft' | 'issued' | 'received';

export interface Location { id: string; name: string; primary?: boolean; totalBins?: number }
export interface Vendor { id: string; name: string }
/** A bill of materials — what a Manufacturing Order builds the item from. */
export interface BomComponent { name: string; qty: number; unit: string }
export interface BomOperation { name: string; workCenter: string; minutes: number }
/**
 * A bill of materials. `qty` and `minutes` are PER UNIT produced, so an MO's
 * requirements and estimated time scale with its quantity.
 */
export interface Bom {
  id: string; number: string; name: string; itemId: string;
  components: BomComponent[]; operations: BomOperation[];
}
export interface Item {
  id: string; name: string; sku: string; unit: string;
  salesRate: number; purchaseRate: number;
  returnable?: boolean; binTracked?: boolean; assembly?: boolean; preferredVendorId?: string;
}
export interface Stock { onHand: number; committed: number; yetToReceive: number; inTransit: number }

export interface ReplConfig {
  reorderLevel: number;
  freqValue: number; freqUnit: FreqUnit;
  orderType: OrderType;
  vendorId: string; sourceLocationId: string;
  /** Manufacturing Order only — the BOM the MO is raised against. */
  bomId: string;
  maxStock: number;
  minOrderQty: number | null; maxOrderQty: number | null; unitMultiple: number | null;
}

export interface HistoryEntry { at: string; text: string }
export interface Task {
  id: string; number: string; itemId: string; locId: string;
  orderType: OrderType; vendorId: string; sourceLocationId: string; bomId: string;
  reorderLevel: number; maxStock: number; qty: number;
  status: TaskStatus; createdAt: string; orderId: string | null; history: HistoryEntry[];
  /**
   * The remainder of a task whose order was capped at the maximum order
   * quantity. Its quantity is fixed: stock re-checks do not recompute or
   * auto-dismiss it, because the order that took the rest is still open.
   */
  split?: boolean;
}
export interface OrderLine { itemId: string; qty: number; rate: number; taskId: string | null }
export interface Order {
  id: string; type: OrderType; number: string;
  vendorId: string | null; sourceLocationId: string | null; bomId: string | null; locId: string;
  date: string; status: OrderStatus; createdBy: 'scheduler' | 'manual'; lines: OrderLine[];
}
export interface Settings { freqValue: number; freqUnit: FreqUnit; scheduleAt: string; includeIncoming: boolean }

export interface State {
  locations: Location[]; vendors: Vendor[]; items: Item[]; boms: Bom[];
  stock: Record<string, Record<string, Partial<Stock>>>;
  configs: Record<string, Record<string, ReplConfig>>;
  tasks: Task[]; orders: Order[];
  settings: Settings;
  clock: { now: string; lastRun: string | null };
  counters: { repl: number; po: number; to: number; mo: number };
}

/** What a re-evaluation did, so a screen can say it. */
export type EvalEvent = 'created' | 'updated' | 'dismissed' | 'awaiting' | null;
export interface EvalResult { task: Task | null; event: EvalEvent; avail: number }

/* ── Seed ─────────────────────────────────────────────────────────────────── */

function bom(
  id: string, n: number, name: string, itemId: string,
  comps: [string, number, string][], ops: [string, string, number][],
): Bom {
  return {
    id, number: `BOM-${String(n).padStart(5, '0')}`, name, itemId,
    components: comps.map(([c, qty, unit]) => ({ name: c, qty, unit })),
    operations: ops.map(([o, workCenter, minutes]) => ({ name: o, workCenter, minutes })),
  };
}

function seed(): State {
  const now = new Date(); now.setHours(10, 30, 0, 0);
  const lastRun = new Date(now); lastRun.setHours(5, 0, 0, 0);
  const taskAt = new Date(now); taskAt.setHours(8, 15, 0, 0);
  const oldPo = new Date(now); oldPo.setDate(oldPo.getDate() - 6);

  return {
    locations: [
      { id: 'L1', name: 'Head Office' },
      { id: 'L2', name: 'Location - 2', primary: true },
      { id: 'L3', name: 'Different GST' },
      { id: 'L4', name: 'Head Office Warehouse' },
      { id: 'L5', name: 'Bin Warehouse', totalBins: 14 },
    ],
    vendors: [
      { id: 'V1', name: 'Acme Industrial Supplies' },
      { id: 'V2', name: 'Global Components Pvt Ltd' },
      { id: 'V3', name: 'Sri Lakshmi Traders' },
      { id: 'V4', name: 'Northwind Metals' },
    ],
    boms: [
      bom('B1', 12, '34543 — Standard', 'I1', [['Housing', 1, 'pcs'], ['Fastener kit', 1, 'set'], ['Gasket', 2, 'pcs']], [['Assembly', 'Assembly Line 1', 25]]),
      bom('B2', 13, '34543 — Alternate', 'I1', [['Housing (cast)', 1, 'pcs'], ['Fastener kit', 1, 'set']], [['Machining', 'CNC Bay', 15], ['Assembly', 'Assembly Line 1', 20]]),
      bom('B3', 14, 'Account item 1-blue — Standard', 'I3', [['Blue pigment', 0.2, 'kg'], ['Base resin', 1, 'kg']], [['Mixing', 'Mixing Station', 10]]),
      bom('B4', 15, 'Account item 1-red — Standard', 'I4', [['Red pigment', 0.2, 'kg'], ['Base resin', 1, 'kg'], ['Packaging', 1, 'pcs']], [['Mixing', 'Mixing Station', 10]]),
      bom('B5', 16, 'account item 2-blue — Standard', 'I6', [['Blue pigment', 0.4, 'kg'], ['Base resin', 2, 'kg']], [['Mixing', 'Mixing Station', 12]]),
      bom('B6', 17, 'Replenishment item — Standard', 'I7', [['Sub-assembly A', 1, 'pcs'], ['Sub-assembly B', 1, 'pcs']], [['Assembly', 'Assembly Line 2', 30]]),
      bom('B7', 18, 'Assembly 1 — Standard', 'I8', [['Steel Bolt M8', 4, 'pcs'], ['Copper Wire 2mm', 1.5, 'm']], [['Wiring', 'Assembly Line 2', 18], ['Testing', 'QA Bench', 6]]),
      bom('B8', 19, 'Batch bin item — Standard', 'I10', [['Raw batch', 1, 'kg']], [['Packing', 'Packing Line', 5]]),
      bom('B9', 7, 'Cycle BOM', 'I13', [['Frame', 1, 'pcs'], ['Wheel', 2, 'pcs'], ['Chain', 1, 'pcs']], [['Assembly', 'Assembly Line 1', 100]]),
      bom('B10', 8, 'Manufacturing item BOM', 'I14', [['Steel sheet', 2, 'pcs'], ['Rivets', 12, 'pcs']], [['Pressing', 'Press Shop', 20], ['Finishing', 'Paint Booth', 15]]),
    ],
    items: [
      { id: 'I1', name: '34543', sku: 'SKU-34543', unit: 'pcs', salesRate: 1250, purchaseRate: 900, returnable: true, binTracked: true, preferredVendorId: 'V1' },
      { id: 'I2', name: 'acc check item', sku: 'ACC-CHK', unit: 'pcs', salesRate: 10, purchaseRate: 6 },
      { id: 'I3', name: 'Account item 1-blue', sku: 'AC1-BLU', unit: 'pcs', salesRate: 2, purchaseRate: 1.2 },
      { id: 'I4', name: 'Account item 1-red', sku: 'AC1-RED', unit: 'pcs', salesRate: 2, purchaseRate: 1.2 },
      { id: 'I6', name: 'account item 2-blue', sku: 'AC2-BLU', unit: 'pcs', salesRate: 4, purchaseRate: 2.5 },
      { id: 'I7', name: 'Replenishment item', sku: 'REPL-ITEM', unit: 'pcs', salesRate: 150, purchaseRate: 95, preferredVendorId: 'V1' },
      { id: 'I8', name: 'Assembly 1', sku: 'ASM-1', unit: 'pcs', salesRate: 20, purchaseRate: 12, assembly: true },
      { id: 'I10', name: 'Batch bin item', sku: 'BATCH-BIN', unit: 'pcs', salesRate: 30, purchaseRate: 18, binTracked: true },
      { id: 'I11', name: 'Steel Bolt M8', sku: 'BOLT-M8', unit: 'pcs', salesRate: 4, purchaseRate: 2.5, preferredVendorId: 'V4' },
      { id: 'I12', name: 'Copper Wire 2mm', sku: 'CU-2MM', unit: 'm', salesRate: 45, purchaseRate: 32, preferredVendorId: 'V2' },
      { id: 'I13', name: 'Cycle', sku: 'CYCLE', unit: 'pcs', salesRate: 8500, purchaseRate: 5200, assembly: true },
      { id: 'I14', name: 'Manufacturing item', sku: 'MFG-ITEM', unit: 'pcs', salesRate: 640, purchaseRate: 410, assembly: true },
    ],
    stock: {
      I1: { L1: { onHand: 13 }, L2: { onHand: -2, committed: 10 }, L5: { onHand: 2, inTransit: 1 } },
      I4: { L1: { onHand: 25 } },
      I13: { L1: { onHand: 7 } },
      I14: { L1: { onHand: 2 } },
      I7: { L1: { onHand: 2 }, L2: { onHand: 40 } },
      I11: { L1: { onHand: 120 }, L4: { onHand: 500 } },
      I12: { L1: { onHand: 35 } },
      I2: { L1: { onHand: 8 } },
    },
    configs: {
      I7: {
        L1: {
          reorderLevel: 5, freqValue: 1, freqUnit: 'days', orderType: 'po', vendorId: 'V1', sourceLocationId: '', bomId: '',
          maxStock: 20, minOrderQty: null, maxOrderQty: null, unitMultiple: null,
        },
      },
    },
    tasks: [{
      id: 'T303', number: 'REPL-00303', itemId: 'I7', locId: 'L1', orderType: 'po', vendorId: 'V1', sourceLocationId: '', bomId: '',
      reorderLevel: 5, maxStock: 20, qty: 18, status: 'pending', createdAt: taskAt.toISOString(), orderId: null,
      history: [{ at: taskAt.toISOString(), text: 'Replenishment created: available stock (2.00) is at or below the reorder level (5.00). Quantity to replenish: 18.00.' }],
    }],
    orders: [{
      id: 'O11', type: 'po', number: 'PO-00011', vendorId: 'V2', sourceLocationId: null, bomId: null, locId: 'L1',
      date: oldPo.toISOString(), status: 'received', createdBy: 'manual',
      lines: [{ itemId: 'I12', qty: 50, rate: 32, taskId: null }],
    },
    //  Past Manufacturing Orders, so the list has a history. MFG-00007 onwards
    //  are the replenishment's.
    ...([[6, 'I13', 'B9', 1, 7, 25], [5, 'I13', 'B9', 1, 6, 13], [4, 'I13', 'B9', 1, 4, 13], [3, 'I14', 'B10', 2, 1, 16], [2, 'I13', 'B9', 1, 1, 6], [1, 'I13', 'B9', 1, 1, 6]] as const)
      .map(([n, itemId, bomId, qty, month, day]): Order => ({
        id: `OM${n}`, type: 'mo', number: `MFG-${String(n).padStart(5, '0')}`, vendorId: null, sourceLocationId: null, bomId,
        locId: 'L1', date: new Date(now.getFullYear(), month, day, 10).toISOString(), status: 'received', createdBy: 'manual',
        lines: [{ itemId, qty, rate: 0, taskId: null }],
      })),
    ],
    settings: { freqValue: 1, freqUnit: 'days', scheduleAt: '05:00', includeIncoming: false },
    clock: { now: now.toISOString(), lastRun: lastRun.toISOString() },
    counters: { repl: 303, po: 11, to: 4, mo: 6 },
  };
}

/* ── Store ────────────────────────────────────────────────────────────────── */

//  v3 — BOM components and operations, MFG- numbering. Older saves lack them.
const KEY = 'mo-replenishment-canon-v3';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch { /* private mode, blocked storage */ }
  return seed();
}

let state: State = load();
let version = 0;
const listeners = new Set<() => void>();

/**
 * Rules mutate in place; commit then hands out FRESH top-level collections so a
 * screen's `useMemo([S.tasks])` sees the change. The records inside are shared.
 */
function commit() {
  state = {
    ...state, tasks: [...state.tasks], orders: [...state.orders],
    configs: { ...state.configs }, stock: { ...state.stock }, clock: { ...state.clock },
  };
  version += 1;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

/** Subscribe a component to the store. Re-renders on every commit. */
export function useReplenishment(): State {
  useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => version,
  );
  return state;
}

export function resetDemo() { state = seed(); commit(); }

/* ── Lookups and formatting ───────────────────────────────────────────────── */

export const itemOf = (id: string) => state.items.find((i) => i.id === id)!;
export const locOf = (id: string) => state.locations.find((l) => l.id === id);
export const vendorOf = (id: string | null) => state.vendors.find((v) => v.id === id);
export const orderOf = (id: string | null) => state.orders.find((o) => o.id === id);
export const taskOf = (id: string | null) => state.tasks.find((t) => t.id === id);
export const bomOf = (id: string | null) => state.boms.find((b) => b.id === id);
export const configOf = (itemId: string, locId: string): ReplConfig | null => state.configs[itemId]?.[locId] ?? null;

export function stockOf(itemId: string, locId: string): Stock {
  const s = (state.stock[itemId] ??= {});
  const row = (s[locId] ??= {});
  return {
    onHand: row.onHand ?? 0, committed: row.committed ?? 0,
    yetToReceive: row.yetToReceive ?? 0, inTransit: row.inTransit ?? 0,
  };
}
function bump(itemId: string, locId: string, key: keyof Stock, by: number) {
  const s = (state.stock[itemId] ??= {});
  const row = (s[locId] ??= {});
  row[key] = (row[key] ?? 0) + by;
}

const num2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rupee = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
export const n2 = (n: number) => num2.format(n);
export const money = (n: number) => rupee.format(n);
export const fmtDay = (iso: string) => dayFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => `${dayFmt.format(new Date(iso))}, ${timeFmt.format(new Date(iso))}`;
export const orderTypeLabel = (t: OrderType) => ({ po: 'Purchase Order', to: 'Transfer Order', mo: 'Manufacturing Order' })[t];
export const unitLabel = (value: number, unit: FreqUnit) => (value === 1 ? unit.replace(/s$/, '') : unit);

/* ── The rules ────────────────────────────────────────────────────────────── */

const now = () => state.clock.now;
const uid = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const PREFIX = { repl: 'REPL-', po: 'PO-', to: 'TO-', mo: 'MFG-' } as const;
function nextNumber(kind: keyof State['counters']) {
  state.counters[kind] += 1;
  return PREFIX[kind] + String(state.counters[kind]).padStart(5, '0');
}
const log = (t: Task, text: string) => { t.history.push({ at: now(), text }); };

/** The stock replenishment works from. */
export function available(itemId: string, locId: string) {
  const s = stockOf(itemId, locId);
  let a = s.onHand - s.committed;
  if (state.settings.includeIncoming) a += s.yetToReceive + s.inTransit;
  return a;
}

/**
 * Max Stock − available, raised to the MOQ and rounded up to the unit multiple.
 *
 * NOT capped at the maximum order quantity: the task states the whole need.
 * The cap is applied when the order is created, through the Order Constraints
 * dialog, which raises the capped quantity and a new task for the rest.
 */
export function computeQty(cfg: ReplConfig, avail: number) {
  let q = cfg.maxStock - avail;
  if (q <= 0) return 0;
  const { minOrderQty: min, unitMultiple: um } = cfg;
  if (min && q < min) q = min;
  if (um && um > 0) q = Math.ceil(q / um - 1e-9) * um;
  return Math.round(q * 100) / 100;
}

const pendingFor = (itemId: string, locId: string) =>
  state.tasks.find((t) => t.itemId === itemId && t.locId === locId && t.status === 'pending');

/** An earlier replenishment whose order has not been received — blocks a duplicate. */
const awaitingFor = (itemId: string, locId: string) => state.tasks.find((t) => {
  if (t.itemId !== itemId || t.locId !== locId || t.status !== 'ordered') return false;
  const o = orderOf(t.orderId);
  return Boolean(o && o.status !== 'received');
});

function snapshot(cfg: ReplConfig) {
  return {
    orderType: cfg.orderType, vendorId: cfg.vendorId, sourceLocationId: cfg.sourceLocationId, bomId: cfg.bomId,
    reorderLevel: cfg.reorderLevel, maxStock: cfg.maxStock,
  };
}

/** Re-check one item at one location against its reorder level. Does not commit. */
function evaluate(itemId: string, locId: string): EvalResult {
  const cfg = configOf(itemId, locId);
  const t = pendingFor(itemId, locId);
  const avail = available(itemId, locId);
  if (!cfg) {
    if (t) { t.status = 'dismissed'; log(t, 'Dismissed automatically — replenishment configuration was removed for this location.'); }
    return { task: t ?? null, event: t ? 'dismissed' : null, avail };
  }
  if (avail <= cfg.reorderLevel) {
    const qty = computeQty(cfg, avail);
    //  A maximum stock level at or below available stock leaves nothing to
    //  replenish — the dialog allows that, so no empty task is raised.
    if (!t && qty <= 0) return { task: null, event: null, avail };
    if (!t) {
      const waiting = awaitingFor(itemId, locId);
      if (waiting) return { task: waiting, event: 'awaiting', avail };
      const task: Task = {
        id: uid('T'), number: nextNumber('repl'), itemId, locId, status: 'pending',
        createdAt: now(), orderId: null, history: [], ...snapshot(cfg), qty,
      };
      state.tasks.unshift(task);
      log(task, `Replenishment created: available stock (${n2(avail)}) is at or below the reorder level (${n2(cfg.reorderLevel)}). Quantity to replenish: ${n2(qty)}.`);
      return { task, event: 'created', avail };
    }
    if (t.split) return { task: t, event: null, avail };
    Object.assign(t, snapshot(cfg));
    if (t.qty !== qty) {
      log(t, `Quantity to replenish updated from ${n2(t.qty)} to ${n2(qty)} (available stock: ${n2(avail)}).`);
      t.qty = qty;
      return { task: t, event: 'updated', avail };
    }
    return { task: t, event: null, avail };
  }
  if (t && !t.split) {
    t.status = 'dismissed';
    log(t, `Dismissed automatically — available stock (${n2(avail)}) is back above the reorder level (${n2(cfg.reorderLevel)}).`);
    return { task: t, event: 'dismissed', avail };
  }
  return { task: null, event: null, avail };
}

/**
 * One draft order per order type + vendor/source + delivery location. A
 * Manufacturing Order builds ONE item from ONE BOM, so it never groups: each
 * task is its own MO.
 */
function createOrders(tasks: Task[], by: Order['createdBy']): Order[] {
  const groups = new Map<string, Task[]>();
  tasks.forEach((t) => {
    const party = { po: t.vendorId, to: t.sourceLocationId, mo: t.id }[t.orderType];
    const k = [t.orderType, party, t.locId].join('|');
    groups.set(k, [...(groups.get(k) ?? []), t]);
  });
  return [...groups.values()].map((g) => {
    const f = g[0];
    const o: Order = {
      id: uid('O'), type: f.orderType, number: nextNumber(f.orderType),
      vendorId: f.orderType === 'po' ? f.vendorId : null,
      sourceLocationId: f.orderType === 'to' ? f.sourceLocationId : null,
      bomId: f.orderType === 'mo' ? f.bomId : null,
      locId: f.locId, date: now(), status: 'draft', createdBy: by,
      lines: g.map((t) => ({ itemId: t.itemId, qty: t.qty, rate: f.orderType === 'to' ? 0 : itemOf(t.itemId).purchaseRate, taskId: t.id })),
    };
    state.orders.unshift(o);
    g.forEach((t) => {
      t.status = 'ordered'; t.orderId = o.id;
      log(t, `Draft ${orderTypeLabel(o.type).toLowerCase()} ${o.number} created ${by === 'scheduler' ? 'by the replenishment scheduler' : 'manually'}.`);
    });
    return o;
  });
}

/** Re-check every line's locations. An "awaiting" for this same order is not news, so it is dropped. */
function reevalLines(o: Order): EvalResult[] {
  return o.lines.flatMap((l) => [
    evaluate(l.itemId, o.locId),
    ...(o.type === 'to' && o.sourceLocationId ? [evaluate(l.itemId, o.sourceLocationId)] : []),
  ]).filter((r) => !(r.event === 'awaiting' && r.task?.orderId === o.id));
}

/* ── Actions (each one commits) ───────────────────────────────────────────── */

export function saveConfig(itemId: string, locIds: string[], cfg: ReplConfig): EvalResult[] {
  state.configs[itemId] ??= {};
  const out = locIds.map((l) => { state.configs[itemId][l] = { ...cfg }; return evaluate(itemId, l); });
  commit();
  return out;
}

export function removeConfig(itemId: string, locIds: string[]) {
  locIds.forEach((l) => { delete state.configs[itemId]?.[l]; evaluate(itemId, l); });
  commit();
}

export function adjustStock(itemId: string, locId: string, newOnHand: number): EvalResult {
  const s = (state.stock[itemId] ??= {});
  (s[locId] ??= {}).onHand = newOnHand;
  const r = evaluate(itemId, locId);
  commit();
  return r;
}

/* ── Order constraints ────────────────────────────────────────────────────── */

export type ConstraintKind = 'max' | 'min' | 'multiple';
export interface ConstraintRow {
  task: Task;
  min: number | null; max: number | null; unitMultiple: number | null;
  kind: ConstraintKind;
  /** The quantity the configured constraints allow. */
  target: number;
  /** target − quantity to replenish. Negative when the quantity is over. */
  diff: number;
  comment: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The selected pending tasks whose quantity to replenish breaks the location's
 * minimum order quantity, maximum order quantity or unit multiple. Empty means
 * the orders can be created as they are.
 */
export function orderConstraints(taskIds: string[]): ConstraintRow[] {
  return taskIds.map(taskOf).flatMap((t): ConstraintRow[] => {
    if (!t || t.status !== 'pending') return [];
    const c = configOf(t.itemId, t.locId);
    if (!c) return [];
    const { minOrderQty: min, maxOrderQty: max, unitMultiple: um } = c;
    const base = { task: t, min, max, unitMultiple: um };
    const whose = t.orderType === 'po' ? "vendor's configured" : 'configured';
    if (max && t.qty > max) {
      const target = um && um > 0 && um <= max ? Math.floor(max / um + 1e-9) * um : max;
      return [{ ...base, kind: 'max', target, diff: r2(target - t.qty),
        comment: `The quantity to replenish exceeds by ${n2(r2(t.qty - max))} units from the ${whose} maximum order quantity.` }];
    }
    if (min && t.qty < min) {
      const target = um && um > 0 ? Math.ceil(min / um - 1e-9) * um : min;
      return [{ ...base, kind: 'min', target, diff: r2(target - t.qty),
        comment: `The quantity to replenish is ${n2(r2(min - t.qty))} units below the ${whose} minimum order quantity.` }];
    }
    if (um && um > 0 && Math.abs(t.qty / um - Math.round(t.qty / um)) > 1e-9) {
      const target = Math.ceil(t.qty / um) * um;
      return [{ ...base, kind: 'multiple', target, diff: r2(target - t.qty),
        comment: `The quantity to replenish is not a multiple of the ${whose} unit multiple (${n2(um)}).` }];
    }
    return [];
  });
}

export interface CreateResult { orders: Order[]; remainders: Task[] }

/**
 * Turn pending tasks into draft orders. `apply` lists the tasks whose quantity
 * is first brought within their constraints ("Update Quantities"). A task
 * capped at the maximum order quantity leaves the rest as a NEW pending task.
 */
export function createOrdersFor(taskIds: string[], apply: string[] = []): CreateResult {
  const fixes = new Map(orderConstraints(apply).map((r) => [r.task.id, r]));
  const remainders: Task[] = [];
  const ts = taskIds.map(taskOf).filter((t): t is Task => Boolean(t && t.status === 'pending'));
  ts.forEach((t) => {
    const r = fixes.get(t.id);
    if (!r) return;
    const was = t.qty;
    t.qty = r.target;
    log(t, `Quantity to replenish updated from ${n2(was)} to ${n2(r.target)} to match the configured ${r.kind === 'max' ? 'maximum order quantity' : r.kind === 'min' ? 'minimum order quantity' : 'unit multiple'}.`);
    if (r.kind === 'max' && was - r.target > 0) {
      const rest: Task = {
        ...t, id: uid('T'), number: nextNumber('repl'), qty: r2(was - r.target), status: 'pending',
        createdAt: now(), orderId: null, history: [], split: true,
      };
      remainders.push(rest);
    }
  });
  const orders = createOrders(ts, 'manual');
  remainders.forEach((rest) => {
    const src = ts.find((t) => t.itemId === rest.itemId && t.locId === rest.locId && t.orderId);
    const o = orderOf(src?.orderId ?? null);
    log(rest, `Replenishment created for the remaining ${n2(rest.qty)} — ${src?.number} was ordered on ${o?.number ?? 'a draft order'} for the maximum order quantity.`);
    state.tasks.unshift(rest);
  });
  commit();
  return { orders, remainders };
}

export function dismissTasks(taskIds: string[]) {
  taskIds.map(taskOf).forEach((t) => {
    if (t && t.status === 'pending') { t.status = 'dismissed'; log(t, 'Dismissed manually.'); }
  });
  commit();
}

/* ── Simulation ───────────────────────────────────────────────────────────── */

export interface SimResult { task: Task; consumed: number; configured: boolean; maxOrderQty: number | null }
/**
 * `reorder` — stock falls below the reorder level, any order type.
 * `exceeds-max` — the same, for a Manufacturing Order whose quantity to
 * replenish is over the location's maximum order quantity, so Create Orders
 * opens the Order Constraints dialog.
 */
export type SimKind = 'reorder' | 'exceeds-max';

const randInt = (lo: number, hi: number) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** The config a simulation gives a location that has none: MO if the item has a BOM, else PO. */
function defaultConfig(itemId: string, avail = 0): ReplConfig | null {
  const item = itemOf(itemId);
  const b = state.boms.find((x) => x.itemId === itemId);
  const vendorId = item.preferredVendorId ?? '';
  if (!b && !vendorId) return null;
  //  Below what is on hand, so the simulated sale is what crosses it.
  const reorderLevel = Math.max(1, Math.floor(avail * randInt(3, 6) / 10));
  return {
    reorderLevel, freqValue: 1, freqUnit: 'days',
    orderType: b ? 'mo' : 'po', vendorId: b ? '' : vendorId, sourceLocationId: '', bomId: b?.id ?? '',
    maxStock: Math.max(reorderLevel * 3, Math.ceil(avail * 1.2)), minOrderQty: null, maxOrderQty: null, unitMultiple: b ? null : 5,
  };
}

/**
 * SIMULATE A REPLENISHMENT SCENARIO — the prototype's stand-in for real
 * demand. Picks an item at a location with nothing already pending or on
 * order and some stock on hand, configures it if it has no replenishment
 * settings, then ships enough
 * stock out (a simulated sale) to take available stock below the reorder
 * level. The rules then raise the replenishment exactly as they would for
 * real stock movement. Returns null when every candidate is already covered.
 */
export function simulateReplenishment(kind: SimKind = 'reorder'): SimResult | null {
  const candidates = state.items.flatMap((i) => state.locations.map((l) => ({ itemId: i.id, locId: l.id })))
    .filter(({ itemId, locId }) => !pendingFor(itemId, locId) && !awaitingFor(itemId, locId))
    .filter(({ itemId, locId }) => available(itemId, locId) > 0 && (configOf(itemId, locId) || defaultConfig(itemId)))
    .filter(({ itemId, locId }) => kind === 'reorder' || (
      state.boms.some((b) => b.itemId === itemId) && (configOf(itemId, locId)?.orderType ?? 'mo') === 'mo'));
  if (!candidates.length) return null;
  if (Date.now() > Date.parse(state.clock.now)) state.clock.now = new Date().toISOString();
  const { itemId, locId } = candidates[Math.floor(Math.random() * candidates.length)];

  let cfg = configOf(itemId, locId);
  const configured = !cfg;
  if (!cfg) {
    cfg = defaultConfig(itemId, available(itemId, locId))!;
    state.configs[itemId] ??= {};
    state.configs[itemId][locId] = cfg;
  }
  const avail = available(itemId, locId);
  const target = Math.min(Math.ceil(avail) - 1, randInt(0, Math.max(0, Math.floor(cfg.reorderLevel * 0.6))));
  const consumed = Math.max(0, Math.round((avail - target) * 100) / 100);
  const s = (state.stock[itemId] ??= {});
  const cur = stockOf(itemId, locId);
  (s[locId] ??= {}).onHand = cur.onHand - consumed;

  //  Exceeds-max: a maximum order quantity about 60% of what is needed.
  let capNote = '';
  if (kind === 'exceeds-max') {
    if (computeQty(cfg, avail - consumed) < 4) cfg.maxStock += 10;
    const need = computeQty(cfg, avail - consumed);
    const um = cfg.unitMultiple;
    let cap = Math.max(1, Math.floor(need * 0.6));
    if (um && um > 0) cap = Math.max(um, Math.floor(cap / um) * um);
    cfg.maxOrderQty = cap;
    if (cfg.minOrderQty && cfg.minOrderQty > cap) cfg.minOrderQty = null;
    capNote = `Maximum order quantity set to ${n2(cap)} for this location. `;
  }

  const r = evaluate(itemId, locId);
  if (!r.task || r.event !== 'created') { commit(); return null; }
  const unit = itemOf(itemId).unit;
  r.task.history.unshift({
    at: now(),
    text: `${configured ? `Replenishment configured for ${locOf(locId)?.name} (reorder level ${n2(cfg.reorderLevel)}, max stock ${n2(cfg.maxStock)}). ` : ''}${capNote}`
      + `Simulated sale shipped ${n2(consumed)} ${unit} from ${locOf(locId)?.name}; available stock fell from ${n2(avail)} to ${n2(avail - consumed)}.`,
  });
  commit();
  return { task: r.task, consumed, configured, maxOrderQty: cfg.maxOrderQty };
}

export function issueOrder(orderId: string): EvalResult[] {
  const o = orderOf(orderId);
  if (!o) return [];
  o.lines.forEach((l) => {
    //  A PO's quantity and a confirmed MO's both count as "yet to receive": on
    //  order from a vendor, or on the shop floor.
    if (o.type !== 'to') bump(l.itemId, o.locId, 'yetToReceive', l.qty);
    else { bump(l.itemId, o.sourceLocationId!, 'onHand', -l.qty); bump(l.itemId, o.locId, 'inTransit', l.qty); }
    const t = taskOf(l.taskId); if (t) log(t, `${o.number} marked as ${o.type === 'mo' ? 'confirmed' : 'issued'}.`);
  });
  o.status = 'issued';
  const out = reevalLines(o);
  commit();
  return out;
}

export function receiveOrder(orderId: string): EvalResult[] {
  const o = orderOf(orderId);
  if (!o) return [];
  o.lines.forEach((l) => {
    bump(l.itemId, o.locId, o.type === 'to' ? 'inTransit' : 'yetToReceive', -l.qty);
    bump(l.itemId, o.locId, 'onHand', l.qty);
    const t = taskOf(l.taskId); if (t) log(t, `${o.number} ${o.type === 'mo' ? 'completed' : 'received'} — ${n2(l.qty)} added to stock at ${locOf(o.locId)?.name}.`);
  });
  o.status = 'received';
  const out = reevalLines(o);
  commit();
  return out;
}

/** Deleting a draft sends its replenishments back to Pending. */
export function deleteDraft(orderId: string) {
  const o = orderOf(orderId);
  if (!o) return;
  o.lines.forEach((l) => {
    const t = taskOf(l.taskId);
    if (t) { t.status = 'pending'; t.orderId = null; log(t, `Draft ${o.number} deleted — replenishment returned to Pending.`); }
  });
  state.orders = state.orders.filter((x) => x.id !== o.id);
  reevalLines(o);
  commit();
}

/** An MO's estimated production time in minutes — every operation, per unit, times the quantity. */
export const moMinutes = (o: Order) => {
  const b = bomOf(o.bomId);
  const qty = o.lines.reduce((a, l) => a + l.qty, 0);
  return b ? b.operations.reduce((a, op) => a + op.minutes, 0) * qty : 0;
};
export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60); const m = Math.round(min % 60);
  return [h ? `${h} Hr${h > 1 ? 's' : ''}` : '', m || !h ? `${m} Min${m === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ');
};
export const fmtClock = (min: number) => [Math.floor(min / 60), Math.round(min % 60), 0].map((x) => String(x).padStart(2, '0')).join(':');

export const orderTotal = (o: Order) => o.lines.reduce((a, l) => a + l.qty * l.rate, 0);
