import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppShell, Banner, Icon, Nav, TopBar } from '@canon';
import type { NavNode } from '@canon';
import { HISTORY_MARK } from '../data/books';
import {
  createOrdersFor, itemOf, locOf, n2, orderConstraints, orderTypeLabel, simulateReplenishment, taskOf, useReplenishment,
} from '../data/replenishment';
import type { ConstraintRow, OrderType, SimKind } from '../data/replenishment';
import { OrderConstraintsModal } from './OrderConstraintsModal';
import { GUIDE_STEPS, GuideCard } from './GuideCard';
import { markGuide, setGuideOpen, useGuide } from '../data/guide';
import type { GuideStep } from '../data/guide';
import { ORDER_KIND } from './shared';
import { ItemDetail } from './ItemDetail';
import { ItemList } from './ItemList';
import { ConfigureReplenishment } from './ConfigureReplenishment';
import { Replenishments } from './Replenishments';
import { OrderList } from './OrderList';
import { OrderDetail } from './OrderDetail';
import { MoDetail } from './MoDetail';

/**
 * REPLENISHMENT — the prototype's router.
 *
 * The flow, and where each step lives:
 *   1. Configure      Items → an item → Locations → ⚙ → Configure Replenishment
 *   2. Task raised    Inventory → Replenishments (Pending)
 *   2b. Simulate      "Simulate Replenishment" in the top bar — a simulated sale
 *                     takes some item below its reorder level
 *   3. Draft order    Purchases → Purchase Orders / Inventory → Transfer Orders /
 *                     Manufacturing → Manufacturing Orders
 *
 * Routes are the URL hash so a refresh lands where you were.
 */

export type Route =
  | { page: 'items' }
  | { page: 'item'; itemId: string; tab: string }
  | { page: 'configure'; itemId: string }
  | { page: 'replenishments' }
  | { page: 'orders'; type: OrderType }
  | { page: 'order'; id: string };

export const href = (r: Route): string => {
  switch (r.page) {
    case 'items': return '#/items';
    case 'item': return `#/items/${r.itemId}/${r.tab}`;
    case 'configure': return `#/items/${r.itemId}/replenishment`;
    case 'replenishments': return '#/replenishments';
    case 'orders': return ORDER_KIND[r.type].href;
    case 'order': return `#/orders/${r.id}`;
  }
};

function parse(hash: string): Route {
  const [a, b, c] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (a === 'items' && b) return c === 'replenishment' ? { page: 'configure', itemId: b } : { page: 'item', itemId: b, tab: c ?? 'locations' };
  if (a === 'items') return { page: 'items' };
  if (a === 'purchase-orders') return { page: 'orders', type: 'po' };
  if (a === 'transfer-orders') return { page: 'orders', type: 'to' };
  if (a === 'manufacturing-orders') return { page: 'orders', type: 'mo' };
  if (a === 'orders' && b) return { page: 'order', id: b };
  return { page: 'replenishments' };
}

const subscribeHash = (l: () => void) => { window.addEventListener('hashchange', l); return () => window.removeEventListener('hashchange', l); };
const go = (r: Route) => { window.location.hash = href(r); };

export type Tone = 'success' | 'info' | 'warning' | 'danger';
export type Notify = (message: string, tone?: Tone) => void;

const OUTSIDE = 'Not a part of this prototype';
const NAV_OF: Record<OrderType, string> = { po: 'purchase-orders', to: 'transfer-orders', mo: 'manufacturing-orders' };
const TOAST_MS = 5000;
const MARK = <Icon name="inventory" size="xl" tone="inherit" />;

export function ReplenishmentApp() {
  const route = parse(useSyncExternalStore(subscribeHash, () => window.location.hash));
  const S = useReplenishment();
  const guide = useGuide();
  const [collapsed, setCollapsed] = useState(false);
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: Tone; at: number } | null>(null);
  const [constraint, setConstraint] = useState<{ ids: string[]; rows: ConstraintRow[]; types: OrderType[]; onMoList: boolean } | null>(null);
  //  A simulated scenario's task, ticked when Replenishments mounts.
  const [preselect, setPreselect] = useState<{ ids: string[]; at: number } | null>(null);

  const notify: Notify = (message, tone = 'success') => setToast({ message, tone, at: Date.now() });
  const outside = () => notify(OUTSIDE, 'info');
  const outsideRef = useRef(outside);
  outsideRef.current = outside;

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(t);
  }, [toast]);

  const pending = S.tasks.filter((t) => t.status === 'pending').length;

  //  The hand-over is for one arrival. Leaving Replenishments drops it, so
  //  coming back later does not re-tick a task the user has moved on from.
  useEffect(() => { if (route.page !== 'replenishments' && preselect) setPreselect(null); }, [route.page, preselect]);
  useEffect(() => { if (route.page === 'replenishments') markGuide('view-pending'); }, [route.page]);

  //  Rebuilt only when the pending count changes — Nav compares node identity,
  //  so a fresh tree on every render would reset its open branches.
  const NAV_ITEMS: NavNode[] = useMemo(() => [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'items', label: 'Items', icon: 'items', children: [{ id: 'all-items', label: 'Items' }, { id: 'price-lists', label: 'Price Lists' }] },
    {
      id: 'inventory', label: 'Inventory', icon: 'inventory',
      ...(pending ? { badge: { value: String(pending), description: 'replenishments pending' } } : {}),
      children: [
        { id: 'assemblies', label: 'Assemblies' },
        { id: 'inventory-adjustments', label: 'Inventory Adjustments' },
        { id: 'replenishments', label: 'Replenishments', ...(pending ? { badge: { value: String(pending), description: 'pending' } } : {}) },
        { id: 'transfer-orders', label: 'Transfer Orders' },
        { id: 'picklists', label: 'Picklists' },
      ],
    },
    {
      id: 'purchases', label: 'Purchases', icon: 'purchases',
      children: [
        { id: 'vendors', label: 'Vendors' },
        { id: 'purchase-orders', label: 'Purchase Orders', action: { label: 'New Purchase Order', onSelect: () => outsideRef.current() } },
        { id: 'bills', label: 'Bills' },
      ],
    },
    {
      id: 'manufacturing', label: 'Manufacturing', icon: 'build',
      children: [{ id: 'bom', label: 'Bill of Materials' }, { id: 'manufacturing-orders', label: 'Manufacturing Orders' }],
    },
    { id: 'sales', label: 'Sales', icon: 'sales', children: [{ id: 'sales-orders', label: 'Sales Orders' }, { id: 'invoices', label: 'Invoices' }] },
    { id: 'reports', label: 'Reports', icon: 'reports' },
  ], [pending]);

  const navigate = (id: string) => {
    if (id === 'all-items') go({ page: 'items' });
    else if (id === 'replenishments') go({ page: 'replenishments' });
    else if (id === 'purchase-orders') go({ page: 'orders', type: 'po' });
    else if (id === 'transfer-orders') go({ page: 'orders', type: 'to' });
    else if (id === 'manufacturing-orders') go({ page: 'orders', type: 'mo' });
    else outside();
  };

  const toastNode = toast
    ? <Banner tone={toast.tone} placement="toast" onDismiss={() => setToast(null)}>{toast.message}</Banner>
    : null;

  /* ── Create Orders, through the constraints check ───────────────────────── */

  const finishCreate = (ids: string[], apply: string[], stay: boolean) => {
    if (constraint) markGuide('constraints');
    const { orders, remainders } = createOrdersFor(ids, apply);
    setConstraint(null);
    if (!orders.length) return;
    notify(
      `${orders.length === 1 ? 'Draft' : `${orders.length} draft`} order${orders.length > 1 ? 's' : ''} created: ${orders.map((o) => o.number).join(', ')}.`
      + (remainders.length ? ` ${remainders.map((t) => t.number).join(', ')} created in Replenishments for the remaining quantity.` : ''),
    );
    if (!stay && orders.length === 1) go({ page: 'order', id: orders[0].id });
  };

  //  A selection holding an MO opens the dialog over the Manufacturing Orders
  //  list, so the MOs it creates appear right behind it.
  const requestCreate = (ids: string[]) => {
    setPreselect(null);
    if (ids.length >= 2) markGuide('bulk-create');
    const rows = orderConstraints(ids);
    if (!rows.length) { finishCreate(ids, [], false); return; }
    const types = [...new Set(ids.map((id) => taskOf(id)?.orderType).filter((t): t is OrderType => Boolean(t)))];
    const onMoList = types.includes('mo');
    if (onMoList) go({ page: 'orders', type: 'mo' });
    setConstraint({ ids, rows, types, onMoList });
  };

  /** A Get Started quick link: take the user to where the step is done. */
  const runGuide = (step: GuideStep) => {
    switch (step) {
      case 'configure-item': go({ page: 'configure', itemId: 'I13' }); return;
      case 'configure-bulk': go({ page: 'items' }); return;
      case 'simulate': simulate('reorder'); return;
      case 'view-pending': case 'bulk-create': go({ page: 'replenishments' }); return;
      case 'constraints': simulate('exceeds-max'); return;
      case 'mo-lifecycle': go({ page: 'orders', type: 'mo' }); return;
    }
  };

  const simulate = (kind: SimKind) => {
    const r = simulateReplenishment(kind);
    if (!r) {
      notify(kind === 'exceeds-max'
        ? 'Every manufactured item with stock already has a replenishment pending or on order. Create orders for some, or dismiss them, then simulate again.'
        : 'Every item with stock already has a replenishment pending or on order. Create orders for some, or dismiss them, then simulate again.', 'info');
      return;
    }
    markGuide('simulate');
    const { task: t } = r;
    const unit = itemOf(t.itemId).unit;
    if (kind === 'exceeds-max') {
      notify(
        `${t.number} created — a simulated sale took ${itemOf(t.itemId).name} at ${locOf(t.locId)?.name} below its reorder level. `
        + `The quantity to replenish (${n2(t.qty)} ${unit}) is over the maximum order quantity (${n2(r.maxOrderQty ?? 0)}). It is selected — click Create Orders.`,
      );
      setPreselect({ ids: [t.id], at: Date.now() });
      go({ page: 'replenishments' });
      return;
    }
    notify(
      `${t.number} created — a simulated sale of ${n2(r.consumed)} ${unit} took ${itemOf(t.itemId).name} at ${locOf(t.locId)?.name} below its reorder level (${n2(t.reorderLevel)}). `
      + `${r.configured ? 'Replenishment was configured for it first. ' : ''}Replenish ${n2(t.qty)} ${unit} by ${orderTypeLabel(t.orderType)}.`,
    );
    go({ page: 'replenishments' });
  };

  const currentId = route.page === 'items' || route.page === 'item' || route.page === 'configure' ? 'all-items'
    : route.page === 'replenishments' ? 'replenishments'
      : route.page === 'orders' ? NAV_OF[route.type]
        : route.page === 'order' ? NAV_OF[S.orders.find((o) => o.id === route.id)?.type ?? 'po']
          : 'replenishments';

  const screen = route.page === 'items' ? (
    <ItemList notify={notify} onOutside={outside} />
  ) : route.page === 'item' ? (
    <ItemDetail
      key={route.itemId} itemId={route.itemId} tab={route.tab}
      onTab={(tab) => go({ page: 'item', itemId: route.itemId, tab })}
      onSelect={(itemId) => go({ page: 'item', itemId, tab: route.tab })}
      onConfigure={() => go({ page: 'configure', itemId: route.itemId })}
      notify={notify} onOutside={outside}
    />
  ) : route.page === 'configure' ? (
    <ConfigureReplenishment
      key={route.itemId} itemId={route.itemId}
      onBack={() => go({ page: 'item', itemId: route.itemId, tab: 'locations' })}
      notify={notify}
    />
  ) : route.page === 'orders' ? (
    <OrderList key={route.type} type={route.type} onOutside={outside} />
  ) : route.page === 'order' && S.orders.find((o) => o.id === route.id)?.type === 'mo' ? (
    <MoDetail
      key={route.id} orderId={route.id} onSelect={(id) => go({ page: 'order', id })}
      onBack={() => go({ page: 'orders', type: 'mo' })} notify={notify} onOutside={outside}
    />
  ) : route.page === 'order' ? (
    <OrderDetail
      orderId={route.id} onSelect={(id) => go({ page: 'order', id })}
      onBack={(type) => go({ page: 'orders', type })}
      notify={notify} onOutside={outside}
    />
  ) : (
    <Replenishments
      key={preselect?.at ?? 'replenishments'} initialSelected={preselect?.ids}
      onOpenOrder={(id) => go({ page: 'order', id })} onCreateOrders={requestCreate} notify={notify}
    />
  );

  const scope = route.page === 'items' || route.page === 'item' || route.page === 'configure' ? 'Items'
    : route.page === 'orders' || route.page === 'order' ? 'Orders' : 'Inventory';

  return (
    <AppShell
      key="app"
      nav={(
        <Nav
          items={NAV_ITEMS} currentId={currentId} onNavigate={navigate}
          collapsed={collapsed} onCollapsedChange={setCollapsed}
          product={{ name: 'ERP', mark: MARK }}
        />
      )}
      topBar={(
        <TopBar
          leading={[{ id: 'recent', label: 'Recent activity', icon: HISTORY_MARK, onSelect: outside }]}
          search={{ scope, value: query, onValueChange: setQuery, onSubmit: outside, onScopeOpen: outside }}
          org={{ name: 'Physical valuation org', onOpen: outside }}
          actions={[
            {
              id: 'simulate', label: 'Simulate Replenishment', icon: 'sparkle', labelled: true,
              menu: [
                { id: 'reorder', label: 'Stock falls below reorder level', onSelect: () => simulate('reorder') },
                { id: 'exceeds-max', label: 'MO quantity exceeds maximum order quantity', onSelect: () => simulate('exceeds-max') },
              ],
            },
            {
              id: 'guide', label: 'Get Started', icon: 'learn',
              count: GUIDE_STEPS.filter((st) => !guide.done.includes(st.id)).length,
              onSelect: () => setGuideOpen(!guide.open),
            },
            { id: 'new', label: 'Create new', icon: 'plus', filled: true, onSelect: outside },
            { id: 'notifications', label: 'Notifications', icon: 'bell', count: pending, onSelect: () => go({ page: 'replenishments' }) },
            { id: 'settings', label: 'Settings', icon: 'settings', onSelect: outside },
          ]}
          account={{ name: 'Rithika Rajesh', initials: 'RR', onOpen: outside }}
        />
      )}
    >
      {screen}
      <OrderConstraintsModal
        open={constraint !== null} rows={constraint?.rows ?? []} types={constraint?.types ?? []}
        onUpdate={(apply) => constraint && finishCreate(constraint.ids, apply, constraint.onMoList)}
        onContinue={() => constraint && finishCreate(constraint.ids, [], constraint.onMoList)}
        onClose={() => setConstraint(null)}
      />
      <GuideCard onRun={runGuide} />
      {toastNode}
    </AppShell>
  );
}
