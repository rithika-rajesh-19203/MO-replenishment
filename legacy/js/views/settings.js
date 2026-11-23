/* Settings > Items > Preferences — replenishment schedule. Full-page layout (no app shell). */
window.Actions = window.Actions || {};
(function () {
  const { esc, icon } = U;

  Views.settings = () => {
    const s = Store.state.settings;
    const times = [];
    for (let h = 0; h < 24; h++) for (const m of ['00', '30']) times.push(String(h).padStart(2, '0') + ':' + m);
    const org = ['Organization', 'Users & Roles', 'Taxes & Compliance', 'Setup & Configurations', 'Customization', 'Automation'];
    const gen = ['Employees & Contractors', 'Customers and Vendors', 'Items', 'Accounting', 'Banking', 'Tasks', 'Projects'];
    const opt = (v, l, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;
    return `<div class="settings">
      <header class="s-top">
        <span class="s-logo">${icon('logo', 28)}</span>
        <a class="s-back" href="#/items">${icon('back', 18)}</a>
        <div><div class="s-title">All Settings</div><div class="muted">Physical valuation org</div></div>
        <div class="s-search">${icon('search', 16)} Search settings ( / )</div>
        <a class="btn" href="#/inventory/replenishments">Close Settings <span class="red">${icon('close', 14)}</span></a>
      </header>
      <div class="s-body">
        <aside class="s-nav">
          <div class="s-group">ORGANIZATION SETTINGS</div>
          ${org.map(o => `<div class="s-item">${icon('right', 14)} ${o}</div>`).join('')}
          <div class="s-group">MODULE SETTINGS</div>
          <div class="s-item open">${icon('caret', 14)} General</div>
          ${gen.map(g => `<div class="s-sub ${g === 'Items' ? 'active' : ''}">${g}</div>`).join('')}
        </aside>
        <section class="s-main">
          <h1>Items</h1>
          <div class="tabs">${['Preferences', 'Fields', 'Validation Rules', 'Record Locking', 'Buttons', 'Related Lists'].map((t, i) => `<span class="tab ${i === 0 ? 'active' : ''}">${t}</span>`).join('')}</div>
          <div class="s-scroll">
            <div class="s-block">
              <div class="b">Default Landed Cost Allocation Method</div>
              <div class="muted">The default allocation method to be used while allocating landed costs.</div>
              <div class="frow mt16"><label>Allocation Method</label><div class="fctl"><select class="input w280"><option>Quantity</option><option>Value</option><option>Weight</option></select></div></div>
            </div>
            <div class="s-block">
              <h2>Replenishments</h2>
              <div class="mt16">Select how frequently you would like to replenish the stock</div>
              <div class="combo w300 mt8"><input class="input" id="set-freq" type="number" min="1" value="${esc(s.freqValue)}">
                <select class="input" id="set-unit">${opt('days', 'Days', s.freqUnit)}${opt('weeks', 'Weeks', s.freqUnit)}${opt('months', 'Months', s.freqUnit)}</select></div>
              <div class="mt16">Schedule at</div>
              <select class="input w300 mt8" id="set-time">${times.map(t => opt(t, t, s.scheduleAt)).join('')}</select>
              <label class="check mt16"><input type="checkbox" id="set-incl" ${s.includeIncoming ? 'checked' : ''}> Include Yet to Receive and In Transit stock when calculating replenishment quantities.</label>
              <div class="muted hint">Replenishment quantities will be calculated using Available for Sale, Yet to Receive, and In Transit stock.</div>
              <div class="note mt16">${icon('clock', 14)} On every scheduled run, a draft order is created for each pending replenishment, grouped by vendor (or source location) and delivery location.
                Next run: <b>${U.dtt(Engine.nextRun())}</b></div>
            </div>
          </div>
          <footer class="s-foot"><button class="btn primary" data-action="save-settings">Save</button></footer>
        </section>
      </div>
    </div>`;
  };

  Object.assign(Actions, {
    'save-settings': () => {
      const v = Number(document.getElementById('set-freq').value);
      if (!v || v < 1) { U.toast('Frequency must be at least 1.', 'err'); return; }
      Object.assign(Store.state.settings, {
        freqValue: v, freqUnit: document.getElementById('set-unit').value,
        scheduleAt: document.getElementById('set-time').value, includeIncoming: document.getElementById('set-incl').checked,
      });
      Engine.evaluateAll(); // quantities depend on includeIncoming
      Store.save(); App.render();
      U.toast(`Preferences saved. Next replenishment run: ${U.dtt(Engine.nextRun())}.`);
    },
  });
})();
