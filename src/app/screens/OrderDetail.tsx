import { useMemo, useState } from 'react';
import {
  Banner, DescriptionList, DetailsToolbar, Inline, MiniList, PageHeader, SplitView, Stack, StatusBadge,
  Surface, Table, Text,
} from '@canon';
import type { DetailsToolbarGroup, MiniListItem, TableColumn } from '@canon';
import {
  bomOf, deleteDraft, fmtDateTime, fmtDay, issueOrder, itemOf, locOf, money, n2, orderTotal, orderTypeLabel,
  receiveOrder, taskOf, useReplenishment, vendorOf,
} from '../data/replenishment';
import type { OrderLine, OrderType } from '../data/replenishment';
import { ConfirmModal, ORDER_KIND, ORDER_TONE, announce, orderStatusLabel } from './shared';
import type { Notify } from './ReplenishmentApp';

/**
 * A PURCHASE, TRANSFER or MANUFACTURING ORDER. The detail-view pattern: the list of
 * orders of the same type on the left, the record on the right.
 *
 * A draft raised from a replenishment says so in a banner, naming the tasks.
 * The toolbar moves it along: Mark as Issued (adds Yet to Receive, or moves
 * stock into transit) → Receive (adds Stock on Hand). Deleting a draft returns
 * its replenishments to Pending.
 */
export interface OrderDetailProps {
  orderId: string;
  onSelect: (orderId: string) => void;
  onBack: (type: OrderType) => void;
  notify: Notify;
  onOutside: () => void;
}

export function OrderDetail({ orderId, onSelect, onBack, notify, onOutside }: OrderDetailProps) {
  const S = useReplenishment();
  const o = S.orders.find((x) => x.id === orderId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const type = o?.type ?? 'po';
  const isPo = type === 'po';
  const isMo = type === 'mo';
  const { noun, href: listHref } = ORDER_KIND[type];
  const priced = type !== 'to';

  const list: MiniListItem[] = useMemo(() => S.orders.filter((x) => x.type === type).map((x) => ({
    id: x.id, name: x.number,
    amount: isPo ? money(orderTotal(x)) : `${n2(x.lines.reduce((a, l) => a + l.qty, 0))} units`,
    meta: [
      { po: vendorOf(x.vendorId)?.name ?? '', to: `From ${locOf(x.sourceLocationId ?? '')?.name}`, mo: itemOf(x.lines[0].itemId).name }[x.type],
      fmtDay(x.date),
    ],
    status: orderStatusLabel(x.type, x.status), statusVariant: ORDER_TONE[x.status],
  })), [S.orders, type, isPo]);

  if (!o) {
    return (
      <Stack gap={4} className="p-10">
        <Text size="heading">This order no longer exists.</Text>
        <Text as="a" href="#/purchase-orders" tone="link">Back to Purchase Orders</Text>
      </Stack>
    );
  }

  const tasks = o.lines.map((l) => taskOf(l.taskId)).filter((t) => Boolean(t));
  const toolbar: DetailsToolbarGroup[] = [{
    id: 'order', label: 'Order actions',
    items: [
      { id: 'edit', label: 'Edit', icon: 'edit', onSelect: onOutside },
      {
        id: 'issue', label: isMo ? 'Mark as Confirmed' : 'Mark as Issued', icon: 'check', disabled: o.status !== 'draft',
        onSelect: () => { if (o.status !== 'draft') return; announce(issueOrder(o.id), notify, `${o.number} marked as ${isMo ? 'confirmed' : 'issued'}.`); },
      },
      {
        id: 'receive', label: { po: 'Receive', to: 'Mark as Received', mo: 'Mark as Completed' }[type], icon: 'import', disabled: o.status !== 'issued',
        onSelect: () => { if (o.status !== 'issued') return; announce(receiveOrder(o.id), notify, `${o.number} ${isMo ? 'completed' : 'received'}. Stock updated at ${locOf(o.locId)?.name}.`); },
      },
      { id: 'delete', label: 'Delete', icon: 'delete', disabled: o.status !== 'draft', onSelect: () => { if (o.status === 'draft') setConfirmDelete(true); } },
    ],
  }];

  const columns: TableColumn<OrderLine & { n: number }>[] = [
    { id: 'n', header: '#', cell: (l) => <Text as="span" tone="secondary">{l.n}</Text> },
    {
      id: 'item', header: 'Item & Description',
      cell: (l) => (
        <Stack gap={1}>
          <Text as="span" weight="medium">{itemOf(l.itemId).name}</Text>
          <Text as="span" size="body-sm" tone="secondary">SKU: {itemOf(l.itemId).sku}{l.taskId ? ` · ${taskOf(l.taskId)?.number}` : ''}</Text>
        </Stack>
      ),
    },
    { id: 'qty', header: 'Quantity', align: 'end', cell: (l) => <Text as="span">{n2(l.qty)} {itemOf(l.itemId).unit}</Text> },
    ...(priced ? [
      { id: 'rate', header: isMo ? 'Cost' : 'Rate', align: 'end' as const, cell: (l: OrderLine) => <Text as="span">{n2(l.rate)}</Text> },
      { id: 'amount', header: 'Amount', align: 'end' as const, cell: (l: OrderLine) => <Text as="span" weight="medium">{n2(l.qty * l.rate)}</Text> },
    ] : []),
  ];

  return (
    <SplitView
      list={(
        <MiniList
          label={noun} items={list} activeId={o.id} onActivate={onSelect}
          views={[{ id: 'all', label: `All ${noun}` }]} viewId="all" onViewChange={() => {}} onCreate={onOutside}
        />
      )}
    >
      <PageHeader type="detail" title={o.number} parent={{ label: noun, href: listHref }} onBack={() => onBack(type)} />
      <DetailsToolbar groups={toolbar} />

      <Surface tone="canvas" pad={0} radius="none" className="flex-1 min-h-0 overflow-y-auto">
        <Stack gap={8} className="p-10">
          {tasks.length ? (
            <Banner tone={o.status === 'draft' ? 'warning' : 'info'}>
              {o.createdBy === 'scheduler' ? 'Created by the replenishment scheduler' : 'Created from replenishment'} on {fmtDateTime(o.date)} for {tasks.map((t) => t!.number).join(', ')}.
              {o.status === 'draft' ? ` Review it and mark it as ${isMo ? 'confirmed' : 'issued'}.` : ''}
            </Banner>
          ) : null}

          <Surface pad={10} radius="card" border="default">
            <Stack gap={8}>
              <Inline gap={4} align="start" justify="between">
                <Stack gap={1}>
                  <Text size="title" weight="medium">{orderTypeLabel(o.type)}</Text>
                  <Text tone="secondary"># {o.number}</Text>
                </Stack>
                <StatusBadge status={ORDER_TONE[o.status]}>{orderStatusLabel(o.type, o.status)}</StatusBadge>
              </Inline>
              <DescriptionList
                items={[
                  {
                    po: { label: 'Vendor', value: vendorOf(o.vendorId)?.name ?? '—' },
                    to: { label: 'Source Location', value: locOf(o.sourceLocationId ?? '')?.name ?? '—' },
                    mo: { label: 'BOM', value: bomOf(o.bomId) ? `${bomOf(o.bomId)!.number} · ${bomOf(o.bomId)!.name}` : '—' },
                  }[type],
                  { label: { po: 'Deliver To', to: 'Destination Location', mo: 'Location' }[type], value: locOf(o.locId)?.name ?? '—' },
                  { label: 'Order Date', value: fmtDay(o.date) },
                  { label: 'Reference#', value: tasks.map((t) => t!.number).join(', ') || '—' },
                ]}
              />
              <Surface pad={0} radius="md" border="default" className="overflow-hidden">
                <Table
                  caption={`${o.number} — line items`} placement="page" columns={columns}
                  rows={o.lines.map((l, i) => ({ ...l, n: i + 1 }))} rowKey={(l) => String(l.n)}
                />
              </Surface>
              {priced ? (
                <Inline gap={10} justify="end">
                  <Text weight="semibold">{isMo ? 'Estimated Cost' : 'Total'}</Text>
                  <Text weight="semibold">{money(orderTotal(o))}</Text>
                </Inline>
              ) : null}
            </Stack>
          </Surface>
        </Stack>
      </Surface>

      <ConfirmModal
        open={confirmDelete} title="Delete draft?" confirmLabel="Delete"
        message={`${o.number} will be deleted and its replenishments will return to Pending.`}
        onConfirm={() => { const t = o.type; const n = o.number; deleteDraft(o.id); notify(`${n} deleted.`, 'info'); onBack(t); }}
        onClose={() => setConfirmDelete(false)}
      />
    </SplitView>
  );
}
