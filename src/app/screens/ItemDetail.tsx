import { useMemo, useRef, useState } from 'react';
import {
  Button, DescriptionList, DetailsToolbar, Divider, Icon, Inline, Menu, MiniList, PageHeader, Select, SplitView,
  Stack, StatusBadge, Surface, Table, Tabs, Text,
} from '@canon';
import type { DetailsToolbarGroup, DetailsToolbarItem, MenuEntry, MiniListItem, TableColumn } from '@canon';
import {
  bomOf, fmtDay, locOf, money, n2, orderTypeLabel, stockOf, useReplenishment, vendorOf,
} from '../data/replenishment';
import type { Location, Order } from '../data/replenishment';
import { AdjustStockModal } from './AdjustStockModal';
import { ORDER_TONE, orderStatusLabel } from './shared';
import type { Notify } from './ReplenishmentApp';

/**
 * ITEMS → one item, laid out as the product has it:
 *
 *   header      the item, and what kind of item it is
 *   toolbar     Edit · Adjust Stock · Start · Log Time · ⋯
 *   summary     Active, the image, sales this month, Stock on Hand — and the
 *               Stock Details band under it, which Hide Details folds away
 *   tabs        Item Details · Locations · Price Lists · Transactions
 *
 * Step 1 of the replenishment flow starts on Locations: the ⚙ beside "Stock
 * Locations" → Configure Replenishment. It is also in the toolbar's ⋯.
 *
 * Adjust Stock is how the prototype pushes stock under a reorder level and
 * raises a replenishment.
 */
export interface ItemDetailProps {
  itemId: string;
  tab: string;
  onTab: (tab: string) => void;
  onSelect: (itemId: string) => void;
  onConfigure: () => void;
  notify: Notify;
  onOutside: () => void;
}

interface StockRow { loc: Location; onHand: number; committed: number; available: number; yetToReceive: number; inTransit: number }

const ALL = 'all';

export function ItemDetail({ itemId, tab, onTab, onSelect, onConfigure, notify, onOutside }: ItemDetailProps) {
  const S = useReplenishment();
  const item = S.items.find((i) => i.id === itemId) ?? S.items[0];
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [folded, setFolded] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(true);
  const [permission, setPermission] = useState(ALL);
  const gearRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  const list: MiniListItem[] = useMemo(() => S.items.map((i) => ({
    id: i.id, name: i.name, amount: money(i.salesRate),
  })), [S.items]);

  const allRows: StockRow[] = S.locations.map((loc) => {
    const s = stockOf(item.id, loc.id);
    return { loc, ...s, available: s.onHand - s.committed };
  });
  const rows = permission === ALL ? allRows : allRows.filter((r) => r.loc.id === permission);
  const sum = (k: keyof Omit<StockRow, 'loc'>) => allRows.reduce((a, r) => a + r[k], 0);
  const totals = {
    onHand: sum('onHand'), committed: sum('committed'), available: sum('available'),
    incoming: sum('yetToReceive') + sum('inTransit'),
  };

  /* ── Locations ─────────────────────────────────────────────────────────── */

  const stockColumns: TableColumn<StockRow>[] = [
    {
      id: 'loc', header: 'Location Name',
      cell: (r) => (
        <Stack gap={1}>
          <Inline gap={2} align="center">
            <Text as="span">{r.loc.name}</Text>
            {r.loc.primary ? <Text as="span" tone="warning" aria-label="Primary location" title="Primary location">★</Text> : null}
          </Inline>
          {r.loc.totalBins ? <Text as="span" size="body-sm" tone="secondary">Total Bins: {r.loc.totalBins}</Text> : null}
        </Stack>
      ),
    },
    {
      id: 'bins', header: 'Bins', align: 'end',
      cell: (r) => (r.loc.totalBins ? (
        <Stack gap={1}>
          <Text as="span">Mapped Bins: 0</Text>
          <Text as="button" tone="link" onClick={onOutside}>Map Bins</Text>
        </Stack>
      ) : <Text as="span">N/A</Text>),
    },
    {
      id: 'onHand', header: 'Stock on Hand', align: 'end',
      cell: (r) => (
        <Stack gap={1}>
          <Text as="span">{n2(r.onHand)}</Text>
          {r.loc.totalBins ? <Text as="button" tone="link" onClick={onOutside}>View Bins</Text> : null}
          {r.yetToReceive ? <Text as="span" size="body-sm" tone="secondary">Yet to Receive: {n2(r.yetToReceive)}</Text> : null}
          {r.inTransit ? <Text as="span" size="body-sm" tone="secondary">In Transit: {n2(r.inTransit)}</Text> : null}
        </Stack>
      ),
    },
    { id: 'committed', header: 'Committed Stock', align: 'end', cell: (r) => <Text as="span">{n2(r.committed)}</Text> },
    { id: 'avail', header: 'Available for Sale', align: 'end', cell: (r) => <Text as="span">{n2(r.available)}</Text> },
  ];

  /* ── Transactions ──────────────────────────────────────────────────────── */

  const orders = S.orders.filter((o) => o.lines.some((l) => l.itemId === item.id));
  const orderColumns: TableColumn<Order>[] = [
    { id: 'date', header: 'Date', cell: (o) => <Text as="span">{fmtDay(o.date)}</Text> },
    {
      id: 'number', header: 'Transaction#',
      cell: (o) => <Text as="a" href={`#/orders/${o.id}`} tone="link" weight="medium">{o.number}</Text>,
    },
    { id: 'type', header: 'Type', cell: (o) => <Text as="span">{orderTypeLabel(o.type)}</Text> },
    { id: 'loc', header: 'Location', cell: (o) => <Text as="span">{locOf(o.locId)?.name}</Text> },
    { id: 'qty', header: 'Quantity', align: 'end', cell: (o) => <Text as="span">{n2(o.lines.filter((l) => l.itemId === item.id).reduce((a, l) => a + l.qty, 0))}</Text> },
    { id: 'status', header: 'Status', cell: (o) => <StatusBadge status={ORDER_TONE[o.status]}>{orderStatusLabel(o.type, o.status)}</StatusBadge> },
  ];

  const tabs = [
    { id: 'details', label: 'Item Details' },
    { id: 'locations', label: 'Locations' },
    { id: 'price-lists', label: 'Price Lists' },
    { id: 'transactions', label: 'Transactions', badge: orders.length ? String(orders.length) : undefined },
  ];
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'locations';

  /* ── Toolbar ───────────────────────────────────────────────────────────── */

  const actions: DetailsToolbarItem[] = [
    { id: 'edit', label: 'Edit', icon: 'edit', onSelect: onOutside },
    { id: 'adjust', label: 'Adjust Stock', onSelect: () => setAdjustOpen(true) },
    { id: 'start', label: 'Start', onSelect: onOutside },
    { id: 'log', label: 'Log Time', onSelect: onOutside },
  ];
  const toolbar: DetailsToolbarGroup[] = [{ id: 'item', label: 'Item actions', items: actions }];

  const more: MenuEntry[] = [
    ...actions.filter((a) => folded.includes(a.id)).map((a) => ({ id: a.id, label: a.label, onSelect: a.onSelect })),
    ...(folded.length ? [{ separator: true as const }] : []),
    { id: 'replenish', label: 'Configure Replenishment', onSelect: onConfigure },
    { id: 'clone', label: 'Clone Item', onSelect: onOutside },
    { id: 'inactive', label: 'Mark as Inactive', onSelect: onOutside },
    { separator: true as const },
    { id: 'delete', label: 'Delete', tone: 'danger', onSelect: onOutside },
  ];

  const gearEntries: MenuEntry[] = [
    { id: 'opening', label: 'Add Opening Stock', onSelect: onOutside },
    { id: 'replenish', label: 'Configure Replenishment', onSelect: onConfigure },
    { id: 'bin', label: 'Configure Default Bin', onSelect: onOutside },
  ];

  const kinds = [
    item.returnable ? 'Returnable Item' : null,
    item.binTracked ? 'Bin Tracked Item' : null,
    item.assembly ? 'Assembly Item' : null,
  ].filter(Boolean).join('  •  ') || 'Inventory Item';

  const stat = (label: string, value: number) => (
    <Text as="span" tone="secondary">{label}: <Text as="span" weight="semibold" tone="default">{n2(value)}</Text></Text>
  );

  return (
    <SplitView
      list={(
        <MiniList
          density="compact"
          label="Items" items={list} activeId={item.id} onActivate={onSelect}
          views={[{ id: 'all', label: 'All Items' }]} viewId="all" onViewChange={() => {}}
          onCreate={onOutside}
        />
      )}
    >
      <PageHeader type="detail" title={item.name} parent={{ label: 'All Items', href: '#/items' }} onBack={() => { window.location.hash = '#/items'; }} />
      <DetailsToolbar
        groups={toolbar}
        overflow={{ label: 'More item actions', ref: moreRef, expanded: moreOpen, onSelect: (ids) => { setFolded(ids); setMoreOpen((o) => !o); } }}
      />
      <Menu
        anchor={moreRef.current} open={moreOpen} onClose={() => setMoreOpen(false)}
        label="More item actions" align="start" emphasis="strong" entries={more}
      />

      <Surface tone="canvas" pad={0} radius="none" className="flex-1 min-h-0 overflow-y-auto">
        <Stack gap={8} className="p-section">

          {/* ── Summary ─────────────────────────────────────────────────── */}
          <Surface pad={10} radius="card" border="default">
            <Stack gap={8}>
              <Inline gap={10} align="start" justify="between" wrap>
                <Inline gap={8} align="start">
                  <Surface tone="sunken" pad={12} radius="md" border="default">
                    <Icon name="upload" size="xl" tone="muted" />
                  </Surface>
                  <Stack gap={4}>
                    <Inline gap={4} align="center">
                      <StatusBadge status="success" emphasis="solid">Active</StatusBadge>
                      <Text as="span" size="body-sm" tone="secondary">{kinds}</Text>
                    </Inline>
                    <Text as="h2" size="title" weight="semibold">{item.name}</Text>
                    <Text as="span" size="body-sm" tone="secondary">SKU: {item.sku}</Text>
                  </Stack>
                </Inline>

                <Stack gap={2}>
                  <Text as="span" size="body-sm" tone="secondary">Total Sales This Month: <Text as="span" size="body-sm" tone="default">{money(0)}</Text></Text>
                  <Text as="span" size="body-sm" tone="tertiary">No data found.</Text>
                </Stack>

                <Stack gap={2}>
                  <Text as="span" tone="secondary">Stock on Hand</Text>
                  <Text as="span" size="title" weight="semibold">{n2(totals.onHand)} {item.unit}</Text>
                  <Text as="button" tone="link" aria-expanded={showDetails} onClick={() => setShowDetails((v) => !v)}>
                    {showDetails ? 'Hide Details' : 'Show Details'}
                  </Text>
                </Stack>
              </Inline>

              {showDetails ? (
                <>
                  <Divider />
                  <Stack gap={6}>
                    <Inline gap={6} align="center">
                      <Text as="span" weight="semibold">Stock Details</Text>
                      <Text as="button" tone="link" onClick={onOutside}>View stock in other units</Text>
                    </Inline>
                    <Inline gap={8} align="center" wrap>
                      {stat('Stock on Hand', totals.onHand)}
                      <Divider orientation="vertical" />
                      {stat('Committed Stock', totals.committed)}
                      <Divider orientation="vertical" />
                      {stat('Available for Sale', totals.available)}
                    </Inline>
                    <Divider />
                    <Inline gap={6} align="center" wrap>
                      {stat('To be Shipped', 0)}
                      <Text as="span" tone="tertiary" aria-hidden>•</Text>
                      {stat('To be Received', totals.incoming)}
                      <Text as="span" tone="tertiary" aria-hidden>•</Text>
                      {stat('To be Invoiced', totals.committed)}
                      <Text as="span" tone="tertiary" aria-hidden>•</Text>
                      {stat('To be Billed', 0)}
                    </Inline>
                  </Stack>
                </>
              ) : null}
            </Stack>
          </Surface>

          {/* ── Tabs ────────────────────────────────────────────────────── */}
          <Surface pad={0} radius="card" border="default" className="overflow-hidden">
            <Tabs label="Item sections" items={tabs} value={activeTab} onChange={onTab}>
              {activeTab === 'locations' ? (
                <Stack gap={8} className="px-15 py-10">
                  <Inline gap={4} align="center">
                    <Text size="heading" weight="regular">Stock Locations</Text>
                    <Button
                      ref={gearRef} emphasis="secondary" size="sm" icon="settings"
                      iconRight={<Icon name="caret-down-bold" size="caret" tone="inherit" />}
                      label="Stock location actions" aria-expanded={gearOpen} aria-haspopup="menu"
                      onClick={() => setGearOpen((o) => !o)}
                    />
                  </Inline>
                  <Menu
                    anchor={gearRef.current} open={gearOpen} onClose={() => setGearOpen(false)}
                    label="Stock location actions" align="start" entries={gearEntries}
                  />
                  <Stack gap={3}>
                    <Text as="span">Location Permission</Text>
                    <Select
                      ariaLabel="Location Permission" value={permission} onChange={setPermission} className="max-w-filter-field"
                      options={[{ value: ALL, label: 'All Locations' }, ...S.locations.map((l) => ({ value: l.id, label: l.name }))]}
                    />
                  </Stack>
                  <Surface pad={0} radius="md" border="default" className="overflow-hidden">
                    <Table caption={`${item.name} — stock by location`} columns={stockColumns} rows={rows} rowKey={(r) => r.loc.id} placement="page" />
                  </Surface>
                </Stack>
              ) : activeTab === 'transactions' ? (
                <Stack gap={6} className="px-15 py-10">
                  <Surface pad={0} radius="md" border="default" className="overflow-hidden">
                    <Table
                      caption={`${item.name} — transactions`} columns={orderColumns} rows={orders} rowKey={(o) => o.id}
                      placement="page" empty={<Text tone="secondary">No transactions for this item yet.</Text>}
                    />
                  </Surface>
                </Stack>
              ) : activeTab === 'price-lists' ? (
                <Stack gap={6} className="px-15 py-10">
                  <Text tone="secondary">This item is not in any price list.</Text>
                </Stack>
              ) : (
                <Stack gap={6} className="px-15 py-10">
                  <DescriptionList
                    items={[
                      { label: 'Item Type', value: item.assembly ? 'Assembly Item' : 'Inventory Item' },
                      { label: 'SKU', value: item.sku },
                      { label: 'Unit', value: item.unit },
                      { label: 'Selling Price', value: money(item.salesRate) },
                      { label: 'Cost Price', value: money(item.purchaseRate) },
                      { label: 'Preferred Vendor', value: vendorOf(item.preferredVendorId ?? null)?.name ?? '—' },
                      { label: 'Bill of Materials', value: S.boms.filter((b) => b.itemId === item.id).map((b) => bomOf(b.id)!.number).join(', ') || '—' },
                    ]}
                  />
                </Stack>
              )}
            </Tabs>
          </Surface>
        </Stack>
      </Surface>

      <AdjustStockModal open={adjustOpen} itemId={item.id} onClose={() => setAdjustOpen(false)} notify={notify} />
    </SplitView>
  );
}
