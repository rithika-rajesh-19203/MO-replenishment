/* Seed data + persistence (localStorage). Everything the prototype knows lives in Store.state. */
(function () {
  const KEY = 'mo-replenishment-proto-v1';

  function seed() {
    const now = new Date(); now.setHours(10, 30, 0, 0);
    const lastRun = new Date(now); lastRun.setHours(5, 0, 0, 0);
    const taskCreated = new Date(now); taskCreated.setHours(8, 15, 0, 0);
    const oldPo = new Date(now); oldPo.setDate(oldPo.getDate() - 6);

    const locations = [
      { id: 'L1', name: 'Head Office' },
      { id: 'L2', name: 'Location - 2', primary: true },
      { id: 'L3', name: 'Different GST' },
      { id: 'L4', name: 'Head Office Warehouse' },
      { id: 'L5', name: 'Bin Warehouse', binTracked: true, totalBins: 14, mappedBins: 0 },
    ];

    const vendors = [
      { id: 'V1', name: 'Acme Industrial Supplies' },
      { id: 'V2', name: 'Global Components Pvt Ltd' },
      { id: 'V3', name: 'Sri Lakshmi Traders' },
      { id: 'V4', name: 'Northwind Metals' },
    ];

    const items = [
      { id: 'I1', name: '34543', sku: 'SKU-34543', unit: 'pcs', salesRate: 1250, purchaseRate: 900, returnable: true, binTracked: true, preferredVendorId: 'V1' },
      { id: 'I2', name: 'acc check item', sku: 'ACC-CHK', unit: 'pcs', salesRate: 10, purchaseRate: 6 },
      { id: 'I3', name: 'Account item 1-blue', sku: 'AC1-BLU', unit: 'pcs', salesRate: 2, purchaseRate: 1.2 },
      { id: 'I4', name: 'Account item 1-red', sku: 'AC1-RED', unit: 'pcs', salesRate: 2, purchaseRate: 1.2 },
      { id: 'I5', name: 'Account item 1-yellow', sku: 'AC1-YEL', unit: 'pcs', salesRate: 2, purchaseRate: 1.2 },
      { id: 'I6', name: 'account item 2-blue', sku: 'AC2-BLU', unit: 'pcs', salesRate: 4, purchaseRate: 2.5 },
      { id: 'I7', name: 'Replenishment item', sku: 'REPL-ITEM', unit: 'pcs', salesRate: 150, purchaseRate: 95, preferredVendorId: 'V1' },
      { id: 'I8', name: 'Assembly 1', sku: 'ASM-1', unit: 'pcs', salesRate: 20, purchaseRate: 12, assembly: true },
      { id: 'I9', name: 'Assembly item', sku: 'ASM-ITEM', unit: 'pcs', salesRate: 0, purchaseRate: 0, assembly: true },
      { id: 'I10', name: 'Batch bin item', sku: 'BATCH-BIN', unit: 'pcs', salesRate: 30, purchaseRate: 18, binTracked: true },
      { id: 'I11', name: 'Steel Bolt M8', sku: 'BOLT-M8', unit: 'pcs', salesRate: 4, purchaseRate: 2.5, preferredVendorId: 'V4' },
      { id: 'I12', name: 'Copper Wire 2mm', sku: 'CU-2MM', unit: 'm', salesRate: 45, purchaseRate: 32, preferredVendorId: 'V2' },
    ];

    // stock[itemId][locId] = { onHand, committed, yetToReceive, inTransit } — missing keys default to 0
    const stock = {
      I1: { L1: { onHand: 13 }, L2: { onHand: -2, committed: 10 }, L5: { onHand: 2, inTransit: 1 } },
      I7: { L1: { onHand: 2 }, L2: { onHand: 40 } },
      I11: { L1: { onHand: 120 }, L4: { onHand: 500 } },
      I12: { L1: { onHand: 35 } },
      I2: { L1: { onHand: 8 } },
    };

    // configs[itemId][locId] = replenishment parameters
    const configs = {
      I7: {
        L1: { reorderLevel: 5, freqValue: 1, freqUnit: 'days', orderType: 'po', vendorId: 'V1', sourceLocationId: '', maxStock: 20, minOrderQty: '', maxOrderQty: '', unitMultiple: '' },
      },
    };

    const tasks = [
      {
        id: 'T303', number: 'REPL-00303', itemId: 'I7', locId: 'L1', orderType: 'po', vendorId: 'V1', sourceLocationId: '',
        reorderLevel: 5, maxStock: 20, qty: 18, status: 'pending', createdAt: taskCreated.toISOString(), orderId: null,
        history: [{ at: taskCreated.toISOString(), text: 'Replenishment created: available stock (2.00) is at or below the reorder level (5.00). Quantity to replenish: 18.00.' }],
      },
    ];

    const orders = [
      {
        id: 'O11', type: 'po', number: 'PO-00011', vendorId: 'V2', sourceLocationId: null, locId: 'L1', date: oldPo.toISOString(),
        status: 'received', createdBy: 'manual', lines: [{ itemId: 'I12', qty: 50, rate: 32, taskId: null }],
      },
    ];

    return {
      locations, vendors, items, stock, configs, tasks, orders,
      settings: { freqValue: 1, freqUnit: 'days', scheduleAt: '05:00', includeIncoming: false },
      clock: { now: now.toISOString(), lastRun: lastRun.toISOString() },
      runs: [],
      counters: { repl: 303, po: 11, to: 4 },
    };
  }

  const PREFIX = { repl: 'REPL-', po: 'PO-', to: 'TO-' };

  window.Store = {
    state: null,
    load() {
      try {
        const raw = localStorage.getItem(KEY);
        this.state = raw ? JSON.parse(raw) : seed();
      } catch (e) { this.state = seed(); }
    },
    save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch (e) { /* private mode etc. */ } },
    reset() { this.state = seed(); this.save(); },

    item(id) { return this.state.items.find(i => i.id === id); },
    loc(id) { return this.state.locations.find(l => l.id === id); },
    vendor(id) { return this.state.vendors.find(v => v.id === id); },
    order(id) { return this.state.orders.find(o => o.id === id); },
    task(id) { return this.state.tasks.find(t => t.id === id); },

    stock(itemId, locId) {
      const s = this.state.stock;
      s[itemId] = s[itemId] || {};
      const row = s[itemId][locId] = s[itemId][locId] || {};
      ['onHand', 'committed', 'yetToReceive', 'inTransit'].forEach(k => { if (typeof row[k] !== 'number') row[k] = 0; });
      return row;
    },
    config(itemId, locId) { return (this.state.configs[itemId] || {})[locId] || null; },
    setConfig(itemId, locId, cfg) {
      this.state.configs[itemId] = this.state.configs[itemId] || {};
      if (cfg) this.state.configs[itemId][locId] = cfg; else delete this.state.configs[itemId][locId];
    },
    next(kind) {
      this.state.counters[kind] += 1;
      return PREFIX[kind] + String(this.state.counters[kind]).padStart(5, '0');
    },
    uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
  };

  Store.load();
})();
