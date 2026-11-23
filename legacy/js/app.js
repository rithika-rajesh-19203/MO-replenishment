/* Router, global UI state, event delegation, prototype-panel actions. */
window.Actions = window.Actions || {};
(function () {
  window.UIState = {
    openMenu: null, panelOpen: true,
    replTab: 'pending', replStatus: 'all',
    filters: { item: '', loc: '', source: '', orderType: '', vendor: '' },
    selected: new Set(), cfgSelected: new Set(),
  };
  let lastRoute = '';

  function route() {
    const [mod, a, b] = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    switch (mod) {
      case 'items': return Views.items(a, b);
      case 'inventory':
        if (a === 'transfer-orders') return b ? Views.orderDetail(b) : Views.orderList('to');
        return Views.replenishments();
      case 'purchases': return b ? Views.orderDetail(b) : Views.orderList('po');
      default: return { module: mod, content: Views.placeholder((mod || '').replace(/^\w/, c => c.toUpperCase())) };
    }
  }

  function render() {
    if (!location.hash || location.hash === '#/' || location.hash === '#') { location.replace('#/items/I7/locations'); return; }
    const key = location.hash.split('/').slice(0, 3).join('/');
    if (key !== lastRoute) { UIState.selected.clear(); UIState.cfgSelected.clear(); UIState.openMenu = null; lastRoute = key; }
    const isSettings = location.hash.startsWith('#/settings');
    let html;
    if (isSettings) html = Views.settings();
    else { const r = route(); html = Views.shell(r.module, r.content); }
    document.getElementById('app').innerHTML = html + Views.protoPanel();
  }
  window.App = { render };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el) {
      if (UIState.openMenu && !e.target.closest('.menu')) { UIState.openMenu = null; render(); }
      return;
    }
    const fn = Actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (el && Actions[el.dataset.change]) Actions[el.dataset.change](el, e);
  });
  window.addEventListener('hashchange', render);

  function reportRun(orders) {
    App.render();
    if (!orders.length) { U.toast(`Scheduler ran at ${U.dtt(Store.state.clock.now)} — no pending replenishments, nothing created.`, 'info'); return; }
    U.toast(`Scheduler ran at ${U.dtt(Store.state.clock.now)} — ${orders.length} draft order${orders.length > 1 ? 's' : ''} created: ` +
      orders.map(o => `<a href="${Views.orderHref(o)}">${o.number}</a>`).join(', '), 'ok', 8000);
  }

  Object.assign(Actions, {
    go: el => { UIState.openMenu = null; location.hash = el.dataset.href; render(); },
    'toggle-menu': el => { const id = el.dataset.menu; UIState.openMenu = UIState.openMenu === id ? null : id; render(); },
    soon: () => { UIState.openMenu = null; render(); U.toast('Not part of this prototype yet.', 'info', 2500); },
    'panel-toggle': () => { UIState.panelOpen = !UIState.panelOpen; render(); },
    'run-now': () => reportRun(Engine.runScheduler()),
    ff: () => reportRun(Engine.fastForward()),
    reset: () => U.confirmBox('Reset demo data?', 'All items, configurations, replenishments and orders go back to the starting state.', 'Reset', () => {
      Store.reset(); render(); U.toast('Demo data reset.');
    }, true),
  });

  render();
})();
