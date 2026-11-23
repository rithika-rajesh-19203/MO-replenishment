/* App chrome: top bar, left nav, right rail, module sub-nav, prototype control panel. */
window.Views = window.Views || {};
(function () {
  const { icon, esc } = U;

  const NAV = [
    ['home', 'Home', 'home'], ['dashboard', 'Dashboard', 'dashboard'], ['people', 'People', 'user'],
    ['items', 'Items', 'items', '#/items'], ['inventory', 'Inventory', 'inventory', '#/inventory/replenishments'],
    ['purchases', 'Purchases', 'purchases', '#/purchases/orders'], ['manufacturing', 'Manufactu...', 'manufacturing'],
    ['sales', 'Sales', 'sales'], ['channels', 'Sales Channels', 'channels'], ['more', 'More', 'more'],
  ];
  const SEARCH = { items: 'Items', inventory: 'Inventory', purchases: 'Purchase Orders' };

  Views.shell = (module, content) => `
  <header class="topbar">
    <div class="brand">${icon('logo', 26)}<span>ERP</span></div>
    <div class="search">${icon('search', 16)}${icon('caret', 12)}<input placeholder="Search in ${SEARCH[module] || 'Employees'} ( / )"></div>
    <div class="top-right">
      <div class="org">Physical valu... ${icon('caret', 14)}</div>
      <button class="top-plus">${icon('plus', 18)}</button>
      <span class="top-ic bell">${icon('bell', 20)}<i>61</i></span>
      <a class="top-ic" href="#/settings/items" title="Settings">${icon('gear', 20)}</a>
      <span class="avatar">${icon('user', 18)}</span>
    </div>
  </header>
  <div class="frame">
    <nav class="sidebar">
      ${NAV.map(([key, label, ic, href]) => `
        <a class="nav ${key === module ? 'active' : ''}" href="${href || '#/' + key}">
          <span class="nav-ic">${icon(ic, 18)}</span><span class="nav-l">${label}</span></a>`).join('')}
    </nav>
    <main class="main">${content}</main>
    <aside class="rail">${['spark', 'spark', 'task', 'folder'].map(i => `<span>${icon(i, 18)}</span>`).join('')}<span class="rail-bottom">${icon('bolt', 18)}</span></aside>
  </div>`;

  /** tabs: [{label, href, active, caret, menuId, menu}] */
  Views.subnav = tabs => `<div class="subnav">${tabs.map(t => `
    <div class="dd"><a class="sn ${t.active ? 'active' : ''}" ${t.menuId ? `data-action="toggle-menu" data-menu="${t.menuId}"` : `href="${t.href || 'javascript:void(0)'}"`}>
      ${esc(t.label)}${t.caret ? icon('caret', 14) : ''}</a>${t.menuId ? U.menu(t.menuId, t.menu) : ''}</div>`).join('')}</div>`;

  Views.placeholder = name => `<div class="placeholder">
    <div class="ph-ic">${icon('info', 28)}</div>
    <h2>${esc(name)}</h2>
    <p>This module isn't part of the prototype yet.</p>
    <p class="muted">Try <a href="#/items/I7/locations">Items</a>, <a href="#/inventory/replenishments">Inventory → Replenishments</a> or <a href="#/purchases/orders">Purchases → Purchase Orders</a>.</p></div>`;

  Views.protoPanel = () => {
    const S = Store.state, c = S.clock, st = S.settings;
    if (!UIState.panelOpen) return `<button class="proto-fab" data-action="panel-toggle">${icon('clock', 14)} Prototype controls</button>`;
    const unit = st.freqValue == 1 ? st.freqUnit.replace(/s$/, '') : st.freqUnit;
    return `<div class="proto">
      <div class="proto-h"><b>${icon('clock', 14)} Prototype controls</b><button class="icon-btn" data-action="panel-toggle" title="Collapse">–</button></div>
      <div class="proto-row"><span>Simulated time</span><b>${U.dtt(c.now)}</b></div>
      <div class="proto-row"><span>Last scheduler run</span><b>${c.lastRun ? U.dtt(c.lastRun) : '—'}</b></div>
      <div class="proto-row"><span>Next scheduled run</span><b>${U.dtt(Engine.nextRun())}</b></div>
      <div class="proto-sub">Every ${esc(st.freqValue)} ${esc(unit)} at ${esc(st.scheduleAt)} · <a href="#/settings/items">Change</a></div>
      <div class="proto-btns">
        <button class="btn primary sm" data-action="ff">Fast-forward to next run</button>
        <button class="btn sm" data-action="run-now">Run scheduler now</button>
      </div>
      <button class="linkbtn" data-action="reset">Reset demo data</button>
    </div>`;
  };
})();
