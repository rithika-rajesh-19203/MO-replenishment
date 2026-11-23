/* Shared helpers: formatting, icons, modal, toast, menus. */
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = n => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = n => '₹' + num(n);
  const dt = iso => new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const tm = iso => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dtt = iso => dt(iso) + ', ' + tm(iso);

  const P = {
    logo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    dashboard: '<circle cx="12" cy="13" r="8"/><path d="M12 13l4-4"/>',
    items: '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    inventory: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v7l2-1.5 2 1.5V4"/>',
    purchases: '<path d="M6 7h12l-1 13H7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
    manufacturing: '<path d="M3 21V10l6 4v-4l6 4V4h6v17z"/>',
    sales: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12L22 7H6"/>',
    channels: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9v11h16V9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/>',
    more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    caret: '<path d="M6 9l6 6 6-6"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7"/><path d="M12 17h.01"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    assembly: '<rect x="4" y="8" width="12" height="12" rx="2"/><path d="M8 8V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3"/>',
    returnable: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    bin: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-8h10v8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    task: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    spark: '<path d="M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2z"/>',
    star: '<path fill="currentColor" stroke="none" d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  };
  const icon = (name, size = 16, cls = '') =>
    `<svg class="ic ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;

  const tip = text => `<span class="help" data-tip="${esc(text)}">${icon('help', 14)}</span>`;

  // Dropdown menu: rendered only while UIState.openMenu === id
  const menu = (id, inner, cls = '') => (window.UIState && UIState.openMenu === id) ? `<div class="menu ${cls}">${inner}</div>` : '';

  function toast(html, kind = 'ok', ms = 4500) {
    let host = document.querySelector('.toasts');
    if (!host) { host = document.createElement('div'); host.className = 'toasts'; document.body.appendChild(host); }
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = html;
    host.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  }

  function modal({ title, sub = '', body, footer, width = 700, onMount }) {
    const wrap = document.createElement('div');
    wrap.className = 'overlay';
    wrap.innerHTML = `<div class="modal" style="max-width:${width}px">
      <div class="modal-h"><div><div class="modal-t">${title}</div>${sub ? `<div class="modal-sub">${sub}</div>` : ''}</div>
      <button class="icon-btn danger" data-close>${icon('close', 18)}</button></div>
      <div class="modal-b">${body}</div>
      ${footer ? `<div class="modal-f">${footer}</div>` : ''}</div>`;
    const close = () => wrap.remove();
    wrap.addEventListener('click', e => {
      if (e.target === wrap || e.target.closest('[data-close]')) close();
    });
    document.body.appendChild(wrap);
    const api = { el: wrap, close, q: s => wrap.querySelector(s), qa: s => [...wrap.querySelectorAll(s)] };
    onMount && onMount(api);
    return api;
  }

  function confirmBox(title, message, okLabel, onOk, danger) {
    const m = modal({
      title, width: 480,
      body: `<p class="confirm-msg">${message}</p>`,
      footer: `<button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${okLabel}</button><button class="btn" data-close>Cancel</button>`,
    });
    m.q('[data-ok]').addEventListener('click', () => { m.close(); onOk(); });
  }

  const statusBadge = s => {
    const map = { pending: ['PENDING', 'st-pending'], ordered: ['ORDERED', 'st-ordered'], dismissed: ['DISMISSED', 'st-muted'],
      draft: ['DRAFT', 'st-muted'], issued: ['ISSUED', 'st-info'], received: ['RECEIVED', 'st-ordered'] };
    const [l, c] = map[s] || [s, ''];
    return `<span class="status ${c}">${l}</span>`;
  };
  const orderTypeLabel = t => t === 'to' ? 'Transfer Order' : 'Purchase Order';

  window.U = { esc, num, money, dt, tm, dtt, icon, tip, menu, toast, modal, confirmBox, statusBadge, orderTypeLabel };
})();
