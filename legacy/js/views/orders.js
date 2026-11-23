/* Purchase Orders (Purchases module) and Transfer Orders (Inventory module): list + detail. */
window.Actions = window.Actions || {};
(function () {
  const { esc, num, money, icon } = U;

  Views.orderHref = o => o.type === 'to' ? `#/inventory/transfer-orders/${o.id}` : `#/purchases/orders/${o.id}`;

  const purchasesSubnav = () => Views.subnav([
    { label: 'Vendors' }, { label: 'Purchase Orders', href: '#/purchases/orders', active: true },
    { label: 'Purchase Receives' }, { label: 'Bills' }, { label: 'Payments Made' },
  ]);
  const subnavFor = type => type === 'to' ? Views.inventorySubnav('to') : purchasesSubnav();
  const sourceLabel = o => o.createdBy === 'scheduler' ? `<span class="chip">${icon('clock', 12)} Replenishment scheduler</span>`
    : o.lines.some(l => l.taskId) ? `<span class="chip">Replenishment (manual)</span>` : '<span class="muted">Manual</span>';
  const refs = o => o.lines.map(l => Store.task(l.taskId)).filter(Boolean).map(t => t.number);

  Views.orderList = type => {
    const list = Store.state.orders.filter(o => o.type === type);
    const isPo = type === 'po';
    const head = isPo
      ? '<th>DATE</th><th>PURCHASE ORDER#</th><th>REFERENCE#</th><th>VENDOR NAME</th><th>STATUS</th><th>DELIVER TO</th><th class="r">AMOUNT</th><th>CREATED BY</th>'
      : '<th>DATE</th><th>TRANSFER ORDER#</th><th>REFERENCE#</th><th>SOURCE LOCATION</th><th>DESTINATION LOCATION</th><th>STATUS</th><th class="r">QUANTITY</th><th>CREATED BY</th>';
    const rows = list.map(o => `<tr class="click" data-action="go" data-href="${Views.orderHref(o)}">
      <td>${U.dt(o.date)}</td><td class="link">${o.number}</td><td>${esc(refs(o).join(', ')) || '—'}</td>
      ${isPo ? `<td>${esc(Store.vendor(o.vendorId).name)}</td><td>${U.statusBadge(o.status)}</td><td>${esc(Store.loc(o.locId).name)}</td><td class="r">${money(Engine.orderTotal(o))}</td>`
        : `<td>${esc(Store.loc(o.sourceLocationId).name)}</td><td>${esc(Store.loc(o.locId).name)}</td><td>${U.statusBadge(o.status)}</td><td class="r">${num(o.lines.reduce((a, l) => a + l.qty, 0))}</td>`}
      <td>${sourceLabel(o)}</td></tr>`).join('');
    return {
      module: isPo ? 'purchases' : 'inventory', content: `${subnavFor(type)}
      <div class="lhead"><h2>All ${isPo ? 'Purchase' : 'Transfer'} Orders ${icon('caret', 16, 'blue')}</h2>
        <button class="btn primary" data-action="soon">${icon('plus', 14)} New</button></div>
      <table class="grid"><thead><tr>${head}</tr></thead>
      <tbody>${rows || `<tr><td colspan="8"><div class="empty"><h3>No ${isPo ? 'purchase' : 'transfer'} orders yet</h3><p>Draft orders created from replenishments will appear here.</p></div></td></tr>`}</tbody></table>`,
    };
  };

  Views.orderDetail = id => {
    const o = Store.order(id);
    if (!o) return { module: 'purchases', content: Views.placeholder('Order not found') };
    const isPo = o.type === 'po';
    const label = isPo ? 'Purchase Order' : 'Transfer Order';
    const tasks = o.lines.map(l => Store.task(l.taskId)).filter(Boolean);
    const banner = tasks.length ? `<div class="banner">${icon('info', 16)}<div>
      ${o.createdBy === 'scheduler' ? `Created automatically by the <b>replenishment scheduler</b> on ${U.dtt(o.date)}` : `Created manually from replenishment on ${U.dtt(o.date)}`}
      for ${tasks.map(t => `<a class="link" data-action="repl-history" data-id="${t.id}">${t.number}</a>`).join(', ')}.
      ${o.status === 'draft' ? ' Review it and mark it as issued to send it.' : ''}</div></div>` : '';
    const actions = [
      `<button class="act" data-action="soon">${icon('edit', 15)} Edit</button>`,
      o.status === 'draft' ? `<button class="act" data-action="order-issue" data-id="${o.id}">Mark as Issued</button>` : '',
      o.status === 'issued' ? `<button class="act" data-action="order-receive" data-id="${o.id}">${isPo ? 'Receive' : 'Mark as Received'}</button>` : '',
      o.status === 'draft' ? `<button class="act danger-t" data-action="order-delete" data-id="${o.id}">Delete</button>` : '',
    ].join('');
    const lines = o.lines.map((l, i) => `<tr><td>${i + 1}</td><td><a class="plain" href="#/items/${l.itemId}/locations">${esc(Store.item(l.itemId).name)}</a>
      <div class="muted sm">SKU: ${esc(Store.item(l.itemId).sku)}</div></td><td class="r">${num(l.qty)} ${esc(Store.item(l.itemId).unit)}</td>
      ${isPo ? `<td class="r">${num(l.rate)}</td><td class="r">${num(l.qty * l.rate)}</td>` : ''}</tr>`).join('');
    return {
      module: isPo ? 'purchases' : 'inventory', content: `${subnavFor(o.type)}
      <div class="od">
        <div class="cr-head"><a class="back" href="${isPo ? '#/purchases/orders' : '#/inventory/transfer-orders'}">${icon('back', 22)}</a>
          <div><h1>${o.number}</h1><div class="muted">${label}</div></div>
          <a class="icon-btn x" href="${isPo ? '#/purchases/orders' : '#/inventory/transfer-orders'}">${icon('close', 24)}</a></div>
        <div class="d-actions">${actions}</div>
        <div class="od-body">
          ${banner}
          <div class="doc">
            <div class="doc-top"><div><div class="doc-title">${label.toUpperCase()}</div><div class="muted"># ${o.number}</div></div>${U.statusBadge(o.status)}</div>
            <div class="doc-grid">
              ${isPo ? `<div><div class="muted sm">VENDOR</div><div class="b">${esc(Store.vendor(o.vendorId).name)}</div></div>`
                : `<div><div class="muted sm">SOURCE LOCATION</div><div class="b">${esc(Store.loc(o.sourceLocationId).name)}</div></div>`}
              <div><div class="muted sm">${isPo ? 'DELIVER TO' : 'DESTINATION LOCATION'}</div><div class="b">${esc(Store.loc(o.locId).name)}</div></div>
              <div><div class="muted sm">ORDER DATE</div><div>${U.dt(o.date)}</div></div>
              <div><div class="muted sm">REFERENCE#</div><div>${esc(refs(o).join(', ')) || '—'}</div></div>
            </div>
            <table class="grid boxed lines"><thead><tr><th>#</th><th>ITEM &amp; DESCRIPTION</th><th class="r">QTY</th>${isPo ? '<th class="r">RATE</th><th class="r">AMOUNT</th>' : ''}</tr></thead>
              <tbody>${lines}</tbody></table>
            ${isPo ? `<div class="totals"><span>Total</span><b>${money(Engine.orderTotal(o))}</b></div>` : ''}
          </div>
        </div>
      </div>`,
    };
  };

  function afterStockChange(results) {
    results.filter(r => r.event === 'created').forEach(r =>
      U.toast(`Stock at ${esc(Store.loc(r.task.locId).name)} is at or below the reorder level — <b>${r.task.number}</b> created.`, 'warn', 7000));
  }

  Object.assign(Actions, {
    'order-issue': el => { const o = Store.order(el.dataset.id); const r = Engine.issueOrder(o); App.render(); U.toast(`${o.number} marked as issued.`); afterStockChange(r); },
    'order-receive': el => { const o = Store.order(el.dataset.id); const r = Engine.receiveOrder(o); App.render(); U.toast(`${o.number} received. Stock updated at ${esc(Store.loc(o.locId).name)}.`); afterStockChange(r); },
    'order-delete': el => {
      const o = Store.order(el.dataset.id);
      U.confirmBox('Delete draft?', `${o.number} will be deleted and its replenishments will return to Pending.`, 'Delete', () => {
        Engine.deleteDraft(o); location.hash = o.type === 'to' ? '#/inventory/transfer-orders' : '#/purchases/orders'; U.toast(`${o.number} deleted.`);
      }, true);
    },
  });
})();
