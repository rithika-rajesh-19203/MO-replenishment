/* Items module: item list + detail (Locations tab), Configure Replenishment page & modal, Adjust Stock. */
window.Actions = window.Actions || {};
(function () {
  const { esc, num, money, icon, tip, menu } = U;

  const itemsSubnav = () => Views.subnav([
    { label: 'Items', href: '#/items', active: true, caret: true },
    { label: 'Bill of Materials' }, { label: 'Plans and Addons', caret: true },
    { label: 'Price Lists' }, { label: 'Pricing Widgets' }, { label: 'Coupons' },
  ]);

  Views.items = (id, tab) => {
    const S = Store.state;
    const item = Store.item(id) || S.items[0];
    if (tab === 'replenishment') return { module: 'items', content: configurePage(item) };
    tab = tab || 'locations';

    const list = S.items.map(it => `
      <div class="il-row ${it.id === item.id ? 'active' : ''}" data-action="go" data-href="#/items/${it.id}/${tab}">
        <span class="cb"></span>
        <span class="il-name">${esc(it.name)}${it.assembly ? `<span class="muted-ic">${icon('assembly', 15)}</span>` : ''}</span>
        <span class="il-rate">${money(it.salesRate)}</span>
      </div>`).join('');

    const badges = [
      item.returnable ? `<span>${icon('returnable', 15)} Returnable Item</span>` : '',
      item.binTracked ? `<span>${icon('bin', 15)} Bin Tracked Item</span>` : '',
      item.assembly ? `<span>${icon('assembly', 15)} Assembly Item</span>` : '',
    ].filter(Boolean).join('<span class="dot">•</span>');

    const tabs = [['details', 'Item Details'], ['locations', 'Locations'], ['pricelists', 'Price Lists'], ['transactions', 'Transactions']];
    const body = tab === 'details' ? detailsTab(item) : tab === 'transactions' ? transactionsTab(item)
      : tab === 'locations' ? locationsTab(item) : `<p class="muted pad">Not part of the prototype.</p>`;

    return {
      module: 'items', content: `${itemsSubnav()}
      <div class="split">
        <div class="list-pane">
          <div class="lp-head"><h2>All Items ${icon('caret', 16, 'blue')}</h2>
            <div class="lp-actions"><button class="btn primary sq">${icon('plus', 18)}</button><button class="btn sq">${icon('more', 18)}</button></div></div>
          <div class="il">${list}</div>
        </div>
        <div class="detail">
          <div class="d-head"><div><h1>${esc(item.name)}</h1><div class="d-sub">${badges || '<span>Inventory Item</span>'}</div></div>
            <a class="icon-btn danger" href="#/items">${icon('close', 20)}</a></div>
          <div class="d-actions">
            <button class="act">${icon('edit', 15)} Edit</button>
            <button class="act" data-action="adjust-stock" data-item="${item.id}">Adjust Stock</button>
            <button class="act">${icon('clock', 15)} Start</button>
            <button class="act">Log Time</button>
            <button class="act">${icon('more', 16)}</button>
          </div>
          <div class="d-body"><div class="card">
            <div class="tabs">${tabs.map(([k, l]) => `<a class="tab ${k === tab ? 'active' : ''}" href="#/items/${item.id}/${k}">${l}</a>`).join('')}<span class="tab">${icon('more', 18)}</span></div>
            ${body}
          </div></div>
        </div>
      </div>`,
    };
  };

  function locationsTab(item) {
    const S = Store.state;
    const rows = S.locations.map(l => {
      const s = Store.stock(item.id, l.id);
      const avail = s.onHand - s.committed;
      const extra = [s.yetToReceive ? `Yet to Receive: ${num(s.yetToReceive)}` : '', s.inTransit ? `In Transit: ${num(s.inTransit)}` : ''].filter(Boolean)
        .map(x => `<div class="sub-note">${x}</div>`).join('');
      return `<tr>
        <td><div>${esc(l.name)} ${l.primary ? `<span class="star">${icon('star', 15)}</span>` : ''}</div>${l.binTracked ? `<div class="mt8">Total Bins: ${l.totalBins}</div>` : ''}</td>
        <td class="r">${l.binTracked ? `Mapped Bins: ${l.mappedBins}<div class="mt8"><a class="link">Map Bins</a></div>` : 'N/A'}</td>
        <td class="r">${num(s.onHand)}${l.binTracked ? `<div><a class="link">View Bins</a></div>` : ''}${extra}</td>
        <td class="r">${num(s.committed)}</td>
        <td class="r">${num(avail)}</td></tr>`;
    }).join('');
    return `<div class="pad">
      <div class="sl-head"><h2>Stock Locations</h2>
        <div class="dd"><button class="btn gear-btn" data-action="toggle-menu" data-menu="stockgear">${icon('gear', 16)}${icon('caret', 12)}</button>
        ${menu('stockgear', `
          <button class="mi" data-action="soon">Add Opening Stock</button>
          <button class="mi" data-action="go" data-href="#/items/${item.id}/replenishment">Configure Replenishment</button>
          <button class="mi" data-action="soon">Configure Default Bin</button>`)}</div></div>
      <label class="lbl">Location Permission</label>
      <select class="input w260"><option>All Locations</option></select>
      <table class="grid boxed mt16"><thead><tr><th>LOCATION</th><th class="r">BINS</th><th class="r">STOCK ON HAND</th><th class="r">COMMITTED STOCK</th><th class="r">AVAILABLE FOR SALE</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function detailsTab(item) {
    const S = Store.state;
    const cfgCount = Object.keys(S.configs[item.id] || {}).length;
    const v = Store.vendor(item.preferredVendorId);
    const kv = [['Item Type', item.assembly ? 'Assembly Item' : 'Inventory Item'], ['SKU', item.sku], ['Unit', item.unit],
      ['Selling Price', money(item.salesRate)], ['Cost Price', money(item.purchaseRate)], ['Preferred Vendor', v ? v.name : '—'],
      ['Replenishment', cfgCount ? `Configured for ${cfgCount} location${cfgCount > 1 ? 's' : ''} · <a class="link" href="#/items/${item.id}/replenishment">View</a>` : `Not configured · <a class="link" href="#/items/${item.id}/replenishment">Configure</a>`]];
    return `<div class="pad"><dl class="kv">${kv.map(([k, val]) => `<dt>${k}</dt><dd>${k === 'Replenishment' ? val : esc(val)}</dd>`).join('')}</dl></div>`;
  }

  function transactionsTab(item) {
    const orders = Store.state.orders.filter(o => o.lines.some(l => l.itemId === item.id));
    if (!orders.length) return `<p class="muted pad">No transactions yet.</p>`;
    return `<div class="pad"><table class="grid boxed"><thead><tr><th>DATE</th><th>TRANSACTION#</th><th>TYPE</th><th>LOCATION</th><th class="r">QUANTITY</th><th>STATUS</th></tr></thead><tbody>
      ${orders.map(o => `<tr class="click" data-action="go" data-href="${Views.orderHref(o)}"><td>${U.dt(o.date)}</td><td class="link">${o.number}</td><td>${U.orderTypeLabel(o.type)}</td>
      <td>${esc(Store.loc(o.locId).name)}</td><td class="r">${num(o.lines.filter(l => l.itemId === item.id).reduce((a, l) => a + l.qty, 0))}</td><td>${U.statusBadge(o.status)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ---------- Configure Replenishment page ---------- */
  function strategyCell(item, l, cfg) {
    if (!cfg) return `<a class="link cfg" data-action="cfg-open" data-item="${item.id}" data-locs="${l.id}">${icon('gear', 15)} Configure</a>`;
    const party = cfg.orderType === 'po' ? (Store.vendor(cfg.vendorId) || {}).name : 'From ' + (Store.loc(cfg.sourceLocationId) || {}).name;
    return `<div class="strat"><div><b>${U.orderTypeLabel(cfg.orderType)}</b><div class="muted sm">${esc(party || '')} · every ${cfg.freqValue} ${cfg.freqValue == 1 ? cfg.freqUnit.replace(/s$/, "") : cfg.freqUnit}</div></div>
      <a class="link sm" data-action="cfg-open" data-item="${item.id}" data-locs="${l.id}">${icon('edit', 13)} Edit</a></div>`;
  }

  function configurePage(item) {
    const S = Store.state, sel = UIState.cfgSelected;
    const v = x => (x === '' || x == null) ? '' : num(x);
    const rows = S.locations.map(l => {
      const c = Store.config(item.id, l.id);
      return `<tr class="${sel.has(l.id) ? 'selrow' : ''}">
        <td class="cbcol"><input type="checkbox" data-change="cfg-select" data-loc="${l.id}" ${sel.has(l.id) ? 'checked' : ''}></td>
        <td>${esc(l.name)}</td>
        <td>${strategyCell(item, l, c)}</td>
        <td class="r">${c ? v(c.reorderLevel) : ''}</td><td class="r">${c ? v(c.maxStock) : ''}</td>
        <td class="r">${c ? v(c.minOrderQty) : ''}</td><td class="r">${c ? v(c.maxOrderQty) : ''}</td><td class="r">${c ? v(c.unitMultiple) : ''}</td></tr>`;
    }).join('');
    const allSel = sel.size === S.locations.length;
    const bulk = sel.size ? `<div class="bulkbar"><span>${sel.size} location${sel.size > 1 ? 's' : ''} selected</span>
      <button class="btn primary sm" data-action="cfg-open" data-item="${item.id}" data-locs="${[...sel].join(',')}">Configure</button>
      <button class="btn sm" data-action="cfg-remove" data-item="${item.id}">Remove Configuration</button>
      <button class="linkbtn" data-action="cfg-clear">Clear</button></div>` : '';
    return `${itemsSubnav()}
      <div class="page">
        <div class="cr-head"><a class="back" href="#/items/${item.id}/locations">${icon('back', 22)}</a>
          <div><h1>Configure Replenishment</h1><a class="link" href="#/items/${item.id}/details">${esc(item.name)}</a></div>
          <a class="icon-btn x" href="#/items/${item.id}/locations">${icon('close', 24)}</a></div>
        ${bulk}
        <table class="grid cr"><thead><tr>
          <th class="cbcol"><input type="checkbox" data-change="cfg-select-all" ${allSel ? 'checked' : ''}></th>
          <th class="req">LOCATION NAME*</th><th class="req">STRATEGY*</th>
          <th class="r req">REORDER LEVEL* ${tip('When available stock at this location falls to or below this level, a replenishment task is created.')}</th>
          <th class="r req">MAXIMUM STOCK LEVEL* ${tip('Replenishment tops stock up to this level. Quantity to replenish = Maximum Stock Level − Available Stock.')}</th>
          <th class="r">MINIMUM ORDER QUANTITY ${tip('The replenishment quantity will be at least this much.')}</th>
          <th class="r">MAXIMUM ORDER QUANTITY ${tip('The replenishment quantity will not exceed this.')}</th>
          <th class="r">UNIT MULTIPLE ${tip('The replenishment quantity is rounded up to a multiple of this (e.g. pack size).')}</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>`;
  }

  function openConfigModal(itemId, locIds) {
    const S = Store.state, item = Store.item(itemId);
    const first = locIds.map(l => Store.config(itemId, l)).find(Boolean);
    const c = first || { reorderLevel: '', freqValue: 1, freqUnit: 'days', orderType: 'po', vendorId: item.preferredVendorId || '', sourceLocationId: '', maxStock: '', minOrderQty: '', maxOrderQty: '', unitMultiple: '' };
    const locNames = locIds.map(l => Store.loc(l).name).join(', ');
    const opt = (v, l, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`;
    const row = (label, html, { req, help, id } = {}) => `<div class="frow" ${id ? `id="${id}"` : ''}>
      <label class="${req ? 'req' : ''}">${label}${req ? '*' : ''} ${help ? tip(help) : ''}</label><div class="fctl">${html}<div class="ferr"></div></div></div>`;

    const body = `
      <h3 class="fsec">Reorder Criteria</h3>
      ${row('Reorder Level', `<input class="input" name="reorderLevel" type="number" min="0" step="any" value="${esc(c.reorderLevel)}">`, { req: true, help: 'When available stock falls to or below this level, a replenishment task is created.' })}
      ${row('Frequency', `<div class="combo"><input class="input" name="freqValue" type="number" min="1" value="${esc(c.freqValue)}"><select class="input" name="freqUnit">${opt('days', 'Days', c.freqUnit)}${opt('weeks', 'Weeks', c.freqUnit)}${opt('months', 'Months', c.freqUnit)}</select></div>`, { help: 'How often this item should be replenished at this location.' })}
      <hr class="fhr">
      <h3 class="fsec">Replenishment Task</h3>
      ${row('Order Type', `<select class="input" name="orderType">${opt('po', 'Purchase Order', c.orderType)}${opt('to', 'Transfer Order', c.orderType)}</select>`, { req: true })}
      ${row('Preferred Vendor', `<select class="input" name="vendorId"><option value="">Select Preferred Vendor</option>${S.vendors.map(v => opt(v.id, v.name, c.vendorId)).join('')}</select>`, { req: true, id: 'r-vendor' })}
      ${row('Source Location', `<select class="input" name="sourceLocationId"><option value="">Select Source Location</option>${S.locations.filter(l => !locIds.includes(l.id)).map(l => opt(l.id, l.name, c.sourceLocationId)).join('')}</select>`, { req: true, id: 'r-source' })}
      ${row('Maximum Stock Level', `<input class="input" name="maxStock" type="number" min="0" step="any" value="${esc(c.maxStock)}">`, { req: true, help: 'Quantity to replenish = Maximum Stock Level − Available Stock.' })}
      ${row('Minimum Order Quantity', `<input class="input" name="minOrderQty" type="number" min="0" step="any" value="${esc(c.minOrderQty)}">`, { help: 'The replenishment quantity will be at least this much.' })}
      ${row('Maximum Order Quantity', `<input class="input" name="maxOrderQty" type="number" min="0" step="any" value="${esc(c.maxOrderQty)}">`, { help: 'The replenishment quantity will not exceed this.' })}
      ${row('Unit Multiple', `<input class="input" name="unitMultiple" type="number" min="0" step="any" value="${esc(c.unitMultiple)}">`, { help: 'The replenishment quantity is rounded up to a multiple of this.' })}`;

    U.modal({
      title: 'Replenishment', sub: `${esc(item.name)} · ${esc(locNames)}`, body, width: 700,
      footer: `<button class="btn primary" data-save>Save</button><button class="btn" data-close>Cancel</button>`,
      onMount(m) {
        const f = name => m.q(`[name="${name}"]`);
        const sync = () => {
          const po = f('orderType').value === 'po';
          m.q('#r-vendor').style.display = po ? '' : 'none';
          m.q('#r-source').style.display = po ? 'none' : '';
        };
        f('orderType').addEventListener('change', sync); sync();
        m.q('[data-save]').addEventListener('click', () => {
          m.qa('.ferr').forEach(e => e.textContent = ''); m.qa('.input').forEach(e => e.classList.remove('err'));
          const val = k => f(k).value.trim();
          const errs = {};
          const rl = val('reorderLevel'), ms = val('maxStock'), mn = val('minOrderQty'), mx = val('maxOrderQty'), um = val('unitMultiple');
          if (rl === '' || Number(rl) < 0) errs.reorderLevel = 'Enter a reorder level (0 or more).';
          if (ms === '') errs.maxStock = 'Enter the maximum stock level.';
          else if (rl !== '' && Number(ms) <= Number(rl)) errs.maxStock = 'Maximum stock level must be greater than the reorder level.';
          if (val('orderType') === 'po' && !val('vendorId')) errs.vendorId = 'Select a preferred vendor.';
          if (val('orderType') === 'to' && !val('sourceLocationId')) errs.sourceLocationId = 'Select the location to transfer stock from.';
          if (mn !== '' && mx !== '' && Number(mn) > Number(mx)) errs.maxOrderQty = 'Maximum order quantity must be at least the minimum order quantity.';
          if (um !== '' && Number(um) <= 0) errs.unitMultiple = 'Unit multiple must be greater than 0.';
          if (!val('freqValue') || Number(val('freqValue')) < 1) errs.freqValue = 'Frequency must be at least 1.';
          if (Object.keys(errs).length) {
            Object.entries(errs).forEach(([k, msg]) => { f(k).classList.add('err'); f(k).closest('.fctl').querySelector('.ferr').textContent = msg; });
            return;
          }
          const cfg = {
            reorderLevel: Number(rl), freqValue: Number(val('freqValue')), freqUnit: val('freqUnit'), orderType: val('orderType'),
            vendorId: val('orderType') === 'po' ? val('vendorId') : '', sourceLocationId: val('orderType') === 'to' ? val('sourceLocationId') : '',
            maxStock: Number(ms), minOrderQty: mn === '' ? '' : Number(mn), maxOrderQty: mx === '' ? '' : Number(mx), unitMultiple: um === '' ? '' : Number(um),
          };
          const created = [];
          locIds.forEach(l => {
            Store.setConfig(itemId, l, { ...cfg });
            const r = Engine.evaluate(itemId, l);
            if (r.event === 'created') created.push(r.task);
          });
          Store.save(); m.close(); UIState.cfgSelected.clear(); App.render();
          U.toast(`Replenishment configured for ${esc(locNames)}.`);
          created.forEach(t => U.toast(`Available stock at ${esc(Store.loc(t.locId).name)} is already at or below the reorder level — <b>${t.number}</b> created. <a href="#/inventory/replenishments">View</a>`, 'warn', 7000));
        });
      },
    });
  }

  function openAdjustStock(itemId) {
    const S = Store.state, item = Store.item(itemId);
    const reasons = ['Stocktaking results', 'Damaged goods', 'Stock written off', 'Stolen goods', 'Consumed internally', 'Inventory revaluation'];
    U.modal({
      title: 'Adjust Stock', sub: esc(item.name), width: 620,
      body: `
        <div class="frow"><label>Mode of adjustment</label><div class="fctl"><label class="radio"><input type="radio" checked> Quantity Adjustment</label></div></div>
        <div class="frow"><label class="req">Location*</label><div class="fctl"><select class="input" name="loc">${S.locations.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></div></div>
        <div class="frow"><label>Quantity Available</label><div class="fctl"><div class="ro" data-avail></div></div></div>
        <div class="frow"><label class="req">New Quantity on hand*</label><div class="fctl"><input class="input" type="number" step="any" name="newqty"><div class="ferr"></div></div></div>
        <div class="frow"><label>Quantity Adjusted</label><div class="fctl"><input class="input" type="number" step="any" name="adj" placeholder="Eg. +10, -10"></div></div>
        <div class="frow"><label class="req">Reason*</label><div class="fctl"><select class="input" name="reason">${reasons.map(r => `<option>${r}</option>`).join('')}</select></div></div>
        <div class="note">${icon('info', 14)} Replenishment is checked as soon as stock changes. If available stock at the location falls to or below its reorder level, a replenishment task is created.</div>`,
      footer: `<button class="btn primary" data-save>Save</button><button class="btn" data-close>Cancel</button>`,
      onMount(m) {
        const loc = m.q('[name=loc]'), nq = m.q('[name=newqty]'), adj = m.q('[name=adj]'), av = m.q('[data-avail]');
        const cur = () => Store.stock(itemId, loc.value);
        const refresh = () => {
          const s = cur(); const cfg = Store.config(itemId, loc.value);
          av.innerHTML = `On hand <b>${num(s.onHand)}</b> · Committed ${num(s.committed)} · Available ${num(s.onHand - s.committed)}` +
            (cfg ? `<div class="muted sm">Reorder level ${num(cfg.reorderLevel)} · Max stock ${num(cfg.maxStock)}</div>` : `<div class="muted sm">No replenishment configured for this location</div>`);
          nq.value = s.onHand; adj.value = '';
        };
        loc.addEventListener('change', refresh); refresh();
        nq.addEventListener('input', () => { adj.value = nq.value === '' ? '' : Number(nq.value) - cur().onHand; });
        adj.addEventListener('input', () => { nq.value = adj.value === '' ? cur().onHand : cur().onHand + Number(adj.value); });
        m.q('[data-save]').addEventListener('click', () => {
          if (nq.value === '' || isNaN(Number(nq.value))) { nq.classList.add('err'); nq.nextElementSibling.textContent = 'Enter the new quantity on hand.'; return; }
          const r = Engine.adjustStock(itemId, loc.value, Number(nq.value));
          m.close(); App.render();
          U.toast('Inventory adjustment saved.');
          const ln = esc(Store.loc(loc.value).name);
          if (r.event === 'created') U.toast(`Stock at ${ln} fell to ${num(r.avail)}, at or below the reorder level. <b>${r.task.number}</b> created (qty ${num(r.task.qty)}). <a href="#/inventory/replenishments">View</a>`, 'warn', 8000);
          else if (r.event === 'updated') U.toast(`${r.task.number}: quantity to replenish updated to ${num(r.task.qty)}.`, 'warn', 6000);
          else if (r.event === 'dismissed') U.toast(`${r.task.number} dismissed automatically — stock is back above the reorder level.`, 'info', 6000);
          else if (r.event === 'awaiting') U.toast(`Stock at ${ln} is below the reorder level, but ${r.task.number} is already ordered and awaiting receipt, so no new task was created.`, 'info', 8000);
        });
      },
    });
  }

  Object.assign(Actions, {
    'adjust-stock': el => openAdjustStock(el.dataset.item),
    'cfg-open': el => openConfigModal(el.dataset.item, el.dataset.locs.split(',')),
    'cfg-select': el => { const s = UIState.cfgSelected; el.checked ? s.add(el.dataset.loc) : s.delete(el.dataset.loc); App.render(); },
    'cfg-select-all': el => { UIState.cfgSelected = new Set(el.checked ? Store.state.locations.map(l => l.id) : []); App.render(); },
    'cfg-clear': () => { UIState.cfgSelected.clear(); App.render(); },
    'cfg-remove': el => {
      const itemId = el.dataset.item, locs = [...UIState.cfgSelected].filter(l => Store.config(itemId, l));
      if (!locs.length) { U.toast('None of the selected locations are configured.', 'info'); return; }
      U.confirmBox('Remove configuration?', `Replenishment settings for ${locs.length} location(s) will be removed. Pending replenishments for them will be dismissed.`, 'Remove', () => {
        locs.forEach(l => { Store.setConfig(itemId, l, null); Engine.evaluate(itemId, l); });
        Store.save(); UIState.cfgSelected.clear(); App.render(); U.toast('Configuration removed.');
      }, true);
    },
  });
})();
