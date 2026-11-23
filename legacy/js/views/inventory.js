/* Inventory > Inventory Control > Replenishments (Pending / All). */
window.Actions = window.Actions || {};
(function () {
  const { esc, num, icon, menu } = U;

  Views.inventorySubnav = active => Views.subnav([
    { label: 'Pack and Ship', caret: true }, { label: 'Assemblies' }, { label: 'Warehouse Operations', caret: true },
    { label: 'Inventory Control', caret: true, active: true, menuId: 'invctl', menu: `
      <button class="mi ${active === 'repl' ? 'sel' : ''}" data-action="go" data-href="#/inventory/replenishments">Replenishments</button>
      <button class="mi ${active === 'to' ? 'sel' : ''}" data-action="go" data-href="#/inventory/transfer-orders">Transfer Orders</button>` },
  ]);

  const STATUS_OPTS = [['all', 'All Replenishments'], ['pending', 'Pending'], ['ordered', 'Ordered'], ['dismissed', 'Dismissed']];

  function filtered() {
    const S = Store.state, f = UIState.filters;
    return S.tasks.filter(t => {
      if (UIState.replTab === 'pending' ? t.status !== 'pending' : (UIState.replStatus !== 'all' && t.status !== UIState.replStatus)) return false;
      if (f.item && t.itemId !== f.item) return false;
      if (f.loc && t.locId !== f.loc) return false;
      if (f.source && t.sourceLocationId !== f.source) return false;
      if (f.orderType && t.orderType !== f.orderType) return false;
      if (f.vendor && t.vendorId !== f.vendor) return false;
      return true;
    });
  }

  function filterDD(key, label, options) {
    const cur = UIState.filters[key];
    const curL = cur ? (options.find(o => o.v === cur) || {}).l : 'None';
    return `<div class="dd"><button class="vb" data-action="toggle-menu" data-menu="f-${key}">${label} : <b>${esc(curL)}</b> ${icon('caret', 14)}</button>
      ${menu('f-' + key, [{ v: '', l: 'None' }, ...options].map(o => `<button class="mi ${o.v === cur ? 'sel' : ''}" data-action="set-filter" data-key="${key}" data-v="${o.v}">${esc(o.l)}</button>`).join(''), 'scroll')}</div>`;
  }

  function rowMenu(t) {
    const o = Store.order(t.orderId);
    const lbl = t.orderType === 'to' ? 'Transfer Order' : 'Purchase Order';
    let items = '';
    if (t.status === 'pending') items += `<button class="mi" data-action="repl-create" data-id="${t.id}">Create ${lbl}</button><button class="mi" data-action="repl-dismiss" data-id="${t.id}">Dismiss Replenishment</button>`;
    if (o) items += `<button class="mi" data-action="go" data-href="${Views.orderHref(o)}">View ${lbl}</button>`;
    items += `<button class="mi" data-action="repl-history" data-id="${t.id}">Transactions &amp; History</button>`;
    return menu('row-' + t.id, items, 'right');
  }

  Views.replenishments = () => {
    const S = Store.state;
    const pendingTab = UIState.replTab === 'pending';
    const list = filtered();
    const sel = UIState.selected;
    const selectable = list.filter(t => t.status === 'pending');
    const allSel = selectable.length && selectable.every(t => sel.has(t.id));
    const statusLabel = (STATUS_OPTS.find(s => s[0] === UIState.replStatus) || STATUS_OPTS[0])[1];

    const rows = list.map(t => {
      const o = Store.order(t.orderId);
      return `<tr class="${sel.has(t.id) ? 'selrow' : ''}">
        <td class="cbcol"></td>
        <td class="cbcol">${t.status === 'pending' ? `<input type="checkbox" data-change="repl-select" data-id="${t.id}" ${sel.has(t.id) ? 'checked' : ''}>` : ''}</td>
        <td><a class="link" data-action="repl-history" data-id="${t.id}">${t.number}</a></td>
        <td><a class="plain" href="#/items/${t.itemId}/locations">${esc(Store.item(t.itemId).name)}</a></td>
        <td>${esc(Store.loc(t.locId).name)}</td>
        <td class="r">${num(t.reorderLevel)}</td>
        <td class="r">${num(t.maxStock)}</td>
        <td class="r">${num(t.qty)}</td>
        <td>${U.statusBadge(t.status)}</td>
        <td>${U.orderTypeLabel(t.orderType)}${!pendingTab && o ? `<div><a class="link sm" href="${Views.orderHref(o)}">${o.number}</a></div>` : ''}</td>
        <td class="actcol"><div class="dd"><button class="rowbtn" data-action="toggle-menu" data-menu="row-${t.id}">${icon('caret', 14)}</button>${rowMenu(t)}</div></td>
      </tr>`;
    }).join('');

    const empty = `<tr><td colspan="11"><div class="empty">
      <h3>${pendingTab ? 'No pending replenishments' : 'No replenishments found'}</h3>
      <p>Configure reorder levels for an item's locations (Items → item → Locations → ${icon('gear', 13)} → Configure Replenishment).<br>
      When available stock falls to or at the reorder level, a replenishment task shows up here. On the scheduled run, draft orders are created for pending tasks.</p></div></td></tr>`;

    const bulk = sel.size ? `<div class="bulkbar"><span>${sel.size} selected</span>
      <button class="btn primary sm" data-action="repl-bulk-create">Create Orders</button>
      <button class="btn sm" data-action="repl-bulk-dismiss">Dismiss</button>
      <button class="linkbtn" data-action="repl-clear">Clear</button></div>` : '';

    const itemOpts = S.items.filter(i => S.tasks.some(t => t.itemId === i.id) || S.configs[i.id]).map(i => ({ v: i.id, l: i.name }));
    return {
      module: 'inventory', content: `${Views.inventorySubnav('repl')}
      <div class="ptabs">
        <a class="ptab ${pendingTab ? 'active' : ''}" data-action="repl-tab" data-tab="pending">Pending Replenishments</a>
        <div class="dd"><a class="ptab ${!pendingTab ? 'active' : ''}" data-action="repl-all">${!pendingTab ? esc(statusLabel) : 'All Replenishments'} ${icon('caret', 16, 'blue')}</a>
          ${menu('repl-status', STATUS_OPTS.map(([v, l]) => `<button class="mi ${!pendingTab && UIState.replStatus === v ? 'sel' : ''}" data-action="repl-status" data-v="${v}">${l}</button>`).join(''))}</div>
      </div>
      <div class="viewby"><span class="vb-l">VIEW BY:</span>
        ${filterDD('item', 'Item Name', itemOpts)}
        ${filterDD('loc', 'Location', S.locations.map(l => ({ v: l.id, l: l.name })))}
        ${filterDD('source', 'Source Location', S.locations.map(l => ({ v: l.id, l: l.name })))}
        ${filterDD('orderType', 'Order Type', [{ v: 'po', l: 'Purchase Order' }, { v: 'to', l: 'Transfer Order' }])}
        ${filterDD('vendor', 'Preferred Vendor', S.vendors.map(v => ({ v: v.id, l: v.name })))}
      </div>
      ${bulk}
      <table class="grid repl"><thead><tr>
        <th class="cbcol">${icon('sliders', 18, 'blue')}</th>
        <th class="cbcol"><input type="checkbox" data-change="repl-select-all" ${allSel ? 'checked' : ''} ${selectable.length ? '' : 'disabled'}></th>
        <th>REPLENISHMENT#</th><th>ITEM</th><th>LOCATION</th><th class="r">REORDER LEVEL</th><th class="r">MAXIMUM STOCK LEVEL</th>
        <th class="r">QUANTITY TO REPLENISH</th><th>STATUS</th><th>ORDER TYPE</th><th class="actcol"></th>
      </tr></thead><tbody>${rows || empty}</tbody></table>`,
    };
  };

  function historyModal(t) {
    const o = Store.order(t.orderId);
    const cfg = Store.config(t.itemId, t.locId);
    const party = t.orderType === 'po' ? (Store.vendor(t.vendorId) || {}).name : (Store.loc(t.sourceLocationId) || {}).name;
    U.modal({
      title: `${t.number}`, sub: `${esc(Store.item(t.itemId).name)} · ${esc(Store.loc(t.locId).name)}`, width: 640,
      body: `<dl class="kv tight">
          <dt>Status</dt><dd>${U.statusBadge(t.status)}</dd>
          <dt>Order Type</dt><dd>${U.orderTypeLabel(t.orderType)}</dd>
          <dt>${t.orderType === 'po' ? 'Preferred Vendor' : 'Source Location'}</dt><dd>${esc(party || '—')}</dd>
          <dt>Quantity to Replenish</dt><dd>${num(t.qty)}</dd>
          <dt>Current Available Stock</dt><dd>${num(Engine.available(t.itemId, t.locId))}${cfg ? ` <span class="muted">(reorder level ${num(cfg.reorderLevel)})</span>` : ''}</dd>
          <dt>Created On</dt><dd>${U.dtt(t.createdAt)}</dd>
          <dt>Transaction</dt><dd>${o ? `<a class="link" href="${Views.orderHref(o)}" data-close>${o.number}</a> ${U.statusBadge(o.status)}` : '—'}</dd>
        </dl>
        <h3 class="fsec mt16">History</h3>
        <ul class="timeline">${t.history.slice().reverse().map(h => `<li><div class="tl-d">${U.dtt(h.at)}</div><div>${esc(h.text)}</div></li>`).join('')}</ul>`,
    });
  }

  function createFor(tasks) {
    const orders = Engine.createOrders(tasks, 'manual');
    Store.save(); UIState.selected.clear();
    if (orders.length === 1) { location.hash = Views.orderHref(orders[0]); U.toast(`Draft ${U.orderTypeLabel(orders[0].type).toLowerCase()} ${orders[0].number} created.`); }
    else { App.render(); U.toast(`${orders.length} draft orders created: ${orders.map(o => `<a href="${Views.orderHref(o)}">${o.number}</a>`).join(', ')}`); }
  }
  function dismiss(tasks) {
    tasks.forEach(t => { t.status = 'dismissed'; Engine.log(t, 'Dismissed manually.'); });
    Store.save(); UIState.selected.clear(); App.render();
    U.toast(`${tasks.length} replenishment${tasks.length > 1 ? 's' : ''} dismissed.`);
  }

  Object.assign(Actions, {
    'repl-tab': el => { UIState.replTab = el.dataset.tab; UIState.selected.clear(); UIState.openMenu = null; App.render(); },
    'repl-all': () => { UIState.replTab = 'all'; UIState.openMenu = UIState.openMenu === 'repl-status' ? null : 'repl-status'; App.render(); },
    'repl-status': el => { UIState.replTab = 'all'; UIState.replStatus = el.dataset.v; UIState.selected.clear(); UIState.openMenu = null; App.render(); },
    'set-filter': el => { UIState.filters[el.dataset.key] = el.dataset.v; UIState.openMenu = null; UIState.selected.clear(); App.render(); },
    'repl-select': el => { el.checked ? UIState.selected.add(el.dataset.id) : UIState.selected.delete(el.dataset.id); App.render(); },
    'repl-select-all': el => { UIState.selected = new Set(el.checked ? filtered().filter(t => t.status === 'pending').map(t => t.id) : []); App.render(); },
    'repl-clear': () => { UIState.selected.clear(); App.render(); },
    'repl-history': el => { UIState.openMenu = null; App.render(); historyModal(Store.task(el.dataset.id)); },
    'repl-create': el => { UIState.openMenu = null; createFor([Store.task(el.dataset.id)]); },
    'repl-dismiss': el => {
      UIState.openMenu = null; App.render();
      const t = Store.task(el.dataset.id);
      U.confirmBox('Dismiss replenishment?', `${t.number} will be dismissed and no order will be created for it. A new replenishment will be raised the next time stock is at or below the reorder level.`, 'Dismiss', () => dismiss([t]), true);
    },
    'repl-bulk-create': () => createFor([...UIState.selected].map(id => Store.task(id)).filter(t => t && t.status === 'pending')),
    'repl-bulk-dismiss': () => {
      const ts = [...UIState.selected].map(id => Store.task(id)).filter(t => t && t.status === 'pending');
      U.confirmBox('Dismiss replenishments?', `${ts.length} replenishment(s) will be dismissed.`, 'Dismiss', () => dismiss(ts), true);
    },
  });
})();
