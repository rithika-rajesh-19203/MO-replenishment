/* Replenishment engine: stock evaluation, task lifecycle, scheduler, order creation & stock effects. */
(function () {
  const S = () => Store.state;
  const n = v => (v === '' || v == null || isNaN(Number(v))) ? null : Number(v);
  const now = () => S().clock.now;

  const snapshot = cfg => ({
    orderType: cfg.orderType, vendorId: cfg.vendorId || '', sourceLocationId: cfg.sourceLocationId || '',
    reorderLevel: Number(cfg.reorderLevel), maxStock: Number(cfg.maxStock),
  });

  function addFreq(d, value, unit) {
    const v = Math.max(1, Number(value) || 1);
    if (unit === 'weeks') d.setDate(d.getDate() + 7 * v);
    else if (unit === 'months') d.setMonth(d.getMonth() + v);
    else d.setDate(d.getDate() + v);
  }

  const E = window.Engine = {
    /** Stock used for replenishment math. */
    available(itemId, locId) {
      const s = Store.stock(itemId, locId);
      let a = s.onHand - s.committed;
      if (S().settings.includeIncoming) a += s.yetToReceive + s.inTransit;
      return a;
    },

    /** Qty = Max Stock − available, then Min Order Qty, Unit Multiple, Max Order Qty applied. */
    computeQty(cfg, avail) {
      let q = Number(cfg.maxStock) - avail;
      if (q <= 0) return 0;
      const min = n(cfg.minOrderQty), max = n(cfg.maxOrderQty), um = n(cfg.unitMultiple);
      if (min && q < min) q = min;
      if (um && um > 0) q = Math.ceil(q / um - 1e-9) * um;
      if (max && q > max) {
        q = max;
        if (um && um > 0) q = Math.max(um, Math.floor(max / um) * um);
      }
      return Math.round(q * 100) / 100;
    },

    pending(itemId, locId) {
      return S().tasks.find(t => t.itemId === itemId && t.locId === locId && t.status === 'pending');
    },
    /** An earlier replenishment whose order hasn't been received yet — blocks a duplicate task. */
    awaiting(itemId, locId) {
      return S().tasks.find(t => {
        if (t.itemId !== itemId || t.locId !== locId || t.status !== 'ordered') return false;
        const o = Store.order(t.orderId);
        return o && o.status !== 'received';
      });
    },
    log(t, text) { t.history.push({ at: now(), text }); },

    /** Re-check one item/location against its reorder level. Returns { task, event }. */
    evaluate(itemId, locId) {
      const cfg = Store.config(itemId, locId);
      const t = this.pending(itemId, locId);
      if (!cfg) {
        if (t) { t.status = 'dismissed'; this.log(t, 'Dismissed automatically — replenishment configuration was removed for this location.'); }
        return { task: t, event: t ? 'dismissed' : null };
      }
      const avail = this.available(itemId, locId);
      if (avail <= Number(cfg.reorderLevel)) {
        const qty = this.computeQty(cfg, avail);
        if (!t) {
          const waiting = this.awaiting(itemId, locId);
          if (waiting) return { task: waiting, event: 'awaiting', avail };
          const task = {
            id: Store.uid('T'), number: Store.next('repl'), itemId, locId, status: 'pending',
            createdAt: now(), orderId: null, history: [], ...snapshot(cfg), qty,
          };
          S().tasks.unshift(task);
          this.log(task, `Replenishment created: available stock (${U.num(avail)}) is at or below the reorder level (${U.num(cfg.reorderLevel)}). Quantity to replenish: ${U.num(qty)}.`);
          return { task, event: 'created', avail };
        }
        Object.assign(t, snapshot(cfg));
        if (t.qty !== qty) {
          this.log(t, `Quantity to replenish updated from ${U.num(t.qty)} to ${U.num(qty)} (available stock: ${U.num(avail)}).`);
          t.qty = qty;
          return { task: t, event: 'updated', avail };
        }
        return { task: t, event: null, avail };
      }
      if (t) {
        t.status = 'dismissed';
        this.log(t, `Dismissed automatically — available stock (${U.num(avail)}) is back above the reorder level (${U.num(cfg.reorderLevel)}).`);
        return { task: t, event: 'dismissed', avail };
      }
      return { task: null, event: null, avail };
    },

    evaluateAll() {
      const out = [];
      Object.entries(S().configs).forEach(([itemId, locs]) =>
        Object.keys(locs).forEach(locId => out.push(this.evaluate(itemId, locId))));
      return out;
    },

    /** Group tasks by order type + vendor/source + delivery location, one draft order per group. */
    createOrders(tasks, by) {
      const groups = {};
      tasks.forEach(t => {
        const k = [t.orderType, t.orderType === 'po' ? t.vendorId : t.sourceLocationId, t.locId].join('|');
        (groups[k] = groups[k] || []).push(t);
      });
      return Object.values(groups).map(g => {
        const f = g[0];
        const o = {
          id: Store.uid('O'), type: f.orderType, number: Store.next(f.orderType),
          vendorId: f.orderType === 'po' ? f.vendorId : null,
          sourceLocationId: f.orderType === 'to' ? f.sourceLocationId : null,
          locId: f.locId, date: now(), status: 'draft', createdBy: by,
          lines: g.map(t => ({ itemId: t.itemId, qty: t.qty, rate: f.orderType === 'po' ? (Store.item(t.itemId).purchaseRate || 0) : 0, taskId: t.id })),
        };
        S().orders.unshift(o);
        g.forEach(t => {
          t.status = 'ordered'; t.orderId = o.id;
          this.log(t, `Draft ${U.orderTypeLabel(o.type).toLowerCase()} ${o.number} created ${by === 'scheduler' ? 'by the replenishment scheduler' : 'manually'}.`);
        });
        return o;
      });
    },

    runScheduler() {
      this.evaluateAll();
      const pend = S().tasks.filter(t => t.status === 'pending' && t.qty > 0);
      const orders = this.createOrders(pend, 'scheduler');
      S().clock.lastRun = now();
      S().runs.unshift({ at: now(), tasks: pend.length, orders: orders.map(o => o.id) });
      Store.save();
      return orders;
    },

    nextRun() {
      const s = S().settings;
      const [hh, mm] = s.scheduleAt.split(':').map(Number);
      const cur = new Date(now());
      let d;
      if (S().clock.lastRun) { d = new Date(S().clock.lastRun); addFreq(d, s.freqValue, s.freqUnit); }
      else d = new Date(cur);
      d.setHours(hh, mm, 0, 0);
      let guard = 0;
      while (d <= cur && guard++ < 500) addFreq(d, s.freqValue, s.freqUnit);
      return d.toISOString();
    },

    fastForward() {
      S().clock.now = this.nextRun();
      return this.runScheduler();
    },

    /** Set on-hand for an item/location and re-evaluate. */
    adjustStock(itemId, locId, newOnHand) {
      Store.stock(itemId, locId).onHand = newOnHand;
      const r = this.evaluate(itemId, locId);
      Store.save();
      return r;
    },

    issueOrder(o) {
      o.lines.forEach(l => {
        if (o.type === 'po') Store.stock(l.itemId, o.locId).yetToReceive += l.qty;
        else { Store.stock(l.itemId, o.sourceLocationId).onHand -= l.qty; Store.stock(l.itemId, o.locId).inTransit += l.qty; }
        const t = Store.task(l.taskId); if (t) this.log(t, `${o.number} marked as issued.`);
      });
      o.status = 'issued';
      const results = this.reevalLines(o);
      Store.save();
      return results;
    },

    receiveOrder(o) {
      o.lines.forEach(l => {
        const s = Store.stock(l.itemId, o.locId);
        if (o.type === 'po') s.yetToReceive -= l.qty; else s.inTransit -= l.qty;
        s.onHand += l.qty;
        const t = Store.task(l.taskId); if (t) this.log(t, `${o.number} received — ${U.num(l.qty)} added to stock at ${Store.loc(o.locId).name}.`);
      });
      o.status = 'received';
      const results = this.reevalLines(o);
      Store.save();
      return results;
    },

    /** Deleting a draft sends its replenishments back to Pending. */
    deleteDraft(o) {
      o.lines.forEach(l => {
        const t = Store.task(l.taskId);
        if (t) { t.status = 'pending'; t.orderId = null; this.log(t, `Draft ${o.number} deleted — replenishment returned to Pending.`); }
      });
      S().orders = S().orders.filter(x => x.id !== o.id);
      this.reevalLines(o);
      Store.save();
    },

    reevalLines(o) {
      const out = [];
      o.lines.forEach(l => {
        out.push(this.evaluate(l.itemId, o.locId));
        if (o.type === 'to' && o.sourceLocationId) out.push(this.evaluate(l.itemId, o.sourceLocationId));
      });
      return out;
    },

    orderTotal(o) { return o.lines.reduce((a, l) => a + l.qty * l.rate, 0); },
  };
})();
