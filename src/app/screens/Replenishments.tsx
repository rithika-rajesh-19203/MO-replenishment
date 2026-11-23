import { useMemo, useState } from 'react';
import {
  ActionBar, Button, DescriptionList, Inline, Menu, Modal, PageChrome, PageHeader, Select, Stack,
  StatusBadge, Surface, Table, Tabs, Text,
} from '@canon';
import type { MenuEntry, TableColumn } from '@canon';
import {
  available, configOf, dismissTasks, fmtDateTime, itemOf, locOf, n2, orderOf,
  bomOf, orderTypeLabel, useReplenishment, vendorOf,
} from '../data/replenishment';
import type { HistoryEntry, Task } from '../data/replenishment';
import { ConfirmModal, ORDER_TONE, TASK_LABEL, TASK_TONE, orderStatusLabel } from './shared';
import type { Notify } from './ReplenishmentApp';

/**
 * INVENTORY → REPLENISHMENTS. Step 2 of the flow: every task raised because a
 * location's available stock fell to its reorder level.
 *
 * The product's two tabs, Pending Replenishments and All Replenishments ▾: the
 * ▾ is a status filter, so it is a Select in the strip's trailing slot (shown
 * on All only) rather than a menu hanging off a tab. The VIEW BY bar is a row
 * of selects under the strip. Each row's ▾ opens Create Order / Dismiss /
 * Transactions & History. Pending rows can be ticked for bulk actions.
 */
export interface ReplenishmentsProps {
  onOpenOrder: (orderId: string) => void;
  /**
   * Create Orders. The app owns it, because a selection that breaks an order
   * constraint opens the Order Constraints dialog — over the Manufacturing
   * Orders list when it holds an MO.
   */
  onCreateOrders: (taskIds: string[]) => void;
  /** Tasks ticked on arrival — a simulated scenario hands its task over. */
  initialSelected?: string[];
  notify: Notify;
}

const STATUSES = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'ordered', label: 'Ordered' },
  { value: 'dismissed', label: 'Dismissed' },
];
const NONE = 'none';

export function Replenishments({ onOpenOrder, onCreateOrders, initialSelected, notify }: ReplenishmentsProps) {
  const S = useReplenishment();
  const [tab, setTab] = useState('pending');
  const [status, setStatus] = useState('all');
  const viewId = tab === 'pending' ? 'pending' : status;
  const [filters, setFilters] = useState({ item: NONE, loc: NONE, source: NONE, orderType: NONE, vendor: NONE });
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(initialSelected));
  const [rowMenu, setRowMenu] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [dismissIds, setDismissIds] = useState<string[] | null>(null);
  const viewLabel = tab === 'pending' ? 'Pending Replenishments' : 'All Replenishments';
  const pendingCount = S.tasks.filter((t) => t.status === 'pending').length;

  const rows = useMemo(() => S.tasks.filter((t) => {
    if (viewId !== 'all' && t.status !== viewId) return false;
    if (filters.item !== NONE && t.itemId !== filters.item) return false;
    if (filters.loc !== NONE && t.locId !== filters.loc) return false;
    if (filters.source !== NONE && t.sourceLocationId !== filters.source) return false;
    if (filters.orderType !== NONE && t.orderType !== filters.orderType) return false;
    if (filters.vendor !== NONE && t.vendorId !== filters.vendor) return false;
    return true;
  }), [S.tasks, viewId, filters]);

  const create = (ids: string[]) => {
    setSelected(new Set());
    onCreateOrders(ids);
  };

  const columns: TableColumn<Task>[] = [
    { id: 'number', header: 'Replenishment#', cell: (t) => <Text as="button" tone="link" weight="medium" onClick={() => setHistoryId(t.id)}>{t.number}</Text> },
    { id: 'item', header: 'Item', cell: (t) => <Text as="a" href={`#/items/${t.itemId}/locations`}>{itemOf(t.itemId).name}</Text> },
    { id: 'loc', header: 'Location', cell: (t) => <Text as="span">{locOf(t.locId)?.name}</Text> },
    { id: 'reorder', header: 'Reorder Level', align: 'end', cell: (t) => <Text as="span">{n2(t.reorderLevel)}</Text> },
    { id: 'max', header: 'Maximum Stock Level', align: 'end', cell: (t) => <Text as="span">{n2(t.maxStock)}</Text> },
    { id: 'qty', header: 'Quantity to Replenish', align: 'end', cell: (t) => <Text as="span" weight="semibold">{n2(t.qty)}</Text> },
    { id: 'status', header: 'Status', cell: (t) => <StatusBadge status={TASK_TONE[t.status]}>{TASK_LABEL[t.status]}</StatusBadge> },
    {
      id: 'type', header: 'Order Type',
      cell: (t) => {
        const o = orderOf(t.orderId);
        return (
          <Stack gap={1}>
            <Text as="span">{orderTypeLabel(t.orderType)}</Text>
            {o ? <Text as="a" href={`#/orders/${o.id}`} size="body-sm" tone="link">{o.number}</Text> : null}
          </Stack>
        );
      },
    },
    {
      id: 'actions', header: 'Actions', align: 'end',
      cell: (t) => (
        <Button
          emphasis="secondary" size="sm" icon="chevron-down" label={`Actions for ${t.number}`}
          aria-haspopup="menu" aria-expanded={rowMenu?.id === t.id}
          onClick={(e) => { const a = e.currentTarget; setRowMenu((m) => (m?.id === t.id ? null : { id: t.id, anchor: a })); }}
        />
      ),
    },
  ];

  const menuTask = rowMenu ? S.tasks.find((t) => t.id === rowMenu.id) : undefined;
  const menuEntries: MenuEntry[] = menuTask ? [
    ...(menuTask.status === 'pending' ? [
      { id: 'create', label: `Create ${orderTypeLabel(menuTask.orderType)}`, icon: 'plus' as const, onSelect: () => create([menuTask.id]) },
      { id: 'dismiss', label: 'Dismiss Replenishment', icon: 'close' as const, onSelect: () => setDismissIds([menuTask.id]) },
    ] : []),
    ...(orderOf(menuTask.orderId) ? [{ id: 'view', label: `View ${orderTypeLabel(menuTask.orderType)}`, onSelect: () => onOpenOrder(menuTask.orderId!) }] : []),
    { separator: true as const },
    { id: 'history', label: 'Transactions & History', icon: 'documents' as const, onSelect: () => setHistoryId(menuTask.id) },
  ] : [];

  const filter = (key: keyof typeof filters, label: string, options: { value: string; label: string }[]) => (
    <Inline gap={2} align="center">
      <Text size="body-sm" tone="secondary">{label}</Text>
      <Select
        ariaLabel={`View by ${label}`} value={filters[key]}
        onChange={(v) => { setFilters({ ...filters, [key]: v || NONE }); setSelected(new Set()); }}
        options={[{ value: NONE, label: 'None' }, ...options]}
      />
    </Inline>
  );

  const selectable = tab === 'pending';
  const historyTask = S.tasks.find((t) => t.id === historyId);

  return (
    <>
      <PageChrome
        bar={selected.size ? (
          <ActionBar
            count={selected.size} total={rows.length}
            primary={{ id: 'create', label: 'Create Orders', onSelect: () => create([...selected]) }}
            actions={[{ id: 'dismiss', label: 'Dismiss', onSelect: () => setDismissIds([...selected]) }]}
            onClear={() => setSelected(new Set())}
          />
        ) : undefined}
      >
        <PageHeader type="create" title="Replenishments" />
      </PageChrome>

      <Tabs
        label="Replenishment views" value={tab}
        onChange={(next) => { setTab(next); setSelected(new Set()); }}
        items={[
          { id: 'pending', label: 'Pending Replenishments', badge: pendingCount ? String(pendingCount) : undefined },
          { id: 'all', label: 'All Replenishments' },
        ]}
        trailing={tab === 'all' ? (
          <Select ariaLabel="Filter by status" value={status} onChange={(v) => setStatus(v || 'all')} options={STATUSES} />
        ) : undefined}
      >
        {null}
      </Tabs>

      <Surface tone="sunken" pad={4} radius="none" border="divider">
        <Inline gap={8} align="center" wrap>
          <Text size="overline" tone="secondary">View by</Text>
          {filter('item', 'Item Name', S.items.filter((i) => S.tasks.some((t) => t.itemId === i.id) || S.configs[i.id]).map((i) => ({ value: i.id, label: i.name })))}
          {filter('loc', 'Location', S.locations.map((l) => ({ value: l.id, label: l.name })))}
          {filter('source', 'Source Location', S.locations.map((l) => ({ value: l.id, label: l.name })))}
          {filter('orderType', 'Order Type', [{ value: 'po', label: 'Purchase Order' }, { value: 'to', label: 'Transfer Order' }, { value: 'mo', label: 'Manufacturing Order' }])}
          {filter('vendor', 'Preferred Vendor', S.vendors.map((v) => ({ value: v.id, label: v.name })))}
        </Inline>
      </Surface>

      <Surface tone="default" pad={0} radius="none" className="flex-1 min-h-0">
        <Table
          caption={`${viewLabel} — ${rows.length} records`}
          columns={columns} rows={rows} rowKey={(t) => t.id} placement="page"
          selection={selectable ? {
            selected, onChange: setSelected,
            allLabel: `Select all ${rows.length} replenishments`,
            rowLabel: (t) => `Select ${t.number}, ${itemOf(t.itemId).name}`,
          } : undefined}
          empty={(
            //  space/20 above and below, so the message sits in the empty table
            //  rather than pressed against its header band.
            <Stack gap={2} align="center" className="py-20">
              <Text weight="semibold">{tab === 'pending' ? 'No pending replenishments' : 'No replenishments match this view'}</Text>
              <Text tone="secondary">Configure reorder levels on an item's Locations tab. When available stock falls to the reorder level, a replenishment appears here.</Text>
            </Stack>
          )}
        />
      </Surface>

      <Menu
        anchor={rowMenu?.anchor ?? null} open={Boolean(rowMenu && menuTask)} onClose={() => setRowMenu(null)}
        label={menuTask ? `Actions for ${menuTask.number}` : 'Replenishment actions'} entries={menuEntries}
      />

      {historyTask ? <HistoryModal task={historyTask} onClose={() => setHistoryId(null)} /> : null}

      <ConfirmModal
        open={Boolean(dismissIds)} title="Dismiss replenishment?" confirmLabel="Dismiss"
        message={`${dismissIds?.length ?? 0} replenishment(s) will be dismissed and no order created. A new one is raised the next time stock falls to the reorder level.`}
        onConfirm={() => { dismissTasks(dismissIds ?? []); notify(`${dismissIds?.length} replenishment(s) dismissed.`, 'info'); setSelected(new Set()); }}
        onClose={() => setDismissIds(null)}
      />
    </>
  );
}

function HistoryModal({ task, onClose }: { task: Task; onClose: () => void }) {
  const o = orderOf(task.orderId);
  const cfg = configOf(task.itemId, task.locId);
  const party = { po: vendorOf(task.vendorId)?.name, to: locOf(task.sourceLocationId)?.name, mo: bomOf(task.bomId)?.name }[task.orderType];
  const columns: TableColumn<HistoryEntry & { key: string }>[] = [
    { id: 'at', header: 'Date', cell: (h) => <Text as="span" tone="secondary">{fmtDateTime(h.at)}</Text> },
    { id: 'text', header: 'Event', cell: (h) => <Text as="span">{h.text}</Text> },
  ];
  return (
    <Modal open title={`${task.number} — Transactions & History`} width="xl" onRequestClose={onClose} secondaryAction={{ label: 'Close', onSelect: onClose }}>
      <Stack gap={8}>
        <DescriptionList
          items={[
            { label: 'Item', value: `${itemOf(task.itemId).name} · ${locOf(task.locId)?.name}` },
            { label: 'Status', value: <StatusBadge status={TASK_TONE[task.status]}>{TASK_LABEL[task.status]}</StatusBadge> },
            { label: 'Order Type', value: orderTypeLabel(task.orderType) },
            { label: { po: 'Preferred Vendor', to: 'Source Location', mo: 'Preferred BOM' }[task.orderType], value: party ?? '—' },
            { label: 'Quantity to Replenish', value: n2(task.qty) },
            { label: 'Available Stock now', value: `${n2(available(task.itemId, task.locId))}${cfg ? ` (reorder level ${n2(cfg.reorderLevel)})` : ''}` },
            { label: 'Created On', value: fmtDateTime(task.createdAt) },
            {
              label: 'Transaction',
              value: o ? (
                <Inline gap={3} align="center">
                  <Text as="a" href={`#/orders/${o.id}`} tone="link" weight="medium" onClick={onClose}>{o.number}</Text>
                  <StatusBadge status={ORDER_TONE[o.status]}>{orderStatusLabel(o.type, o.status)}</StatusBadge>
                </Inline>
              ) : '—',
            },
          ]}
        />
        <Surface pad={0} radius="md" border="default" className="overflow-hidden">
          <Table
            caption={`${task.number} — history`} placement="page" columns={columns}
            rows={task.history.map((h, i) => ({ ...h, key: String(i) })).reverse()} rowKey={(h) => h.key}
          />
        </Surface>
      </Stack>
    </Modal>
  );
}
