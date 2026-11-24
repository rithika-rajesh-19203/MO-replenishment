import { useMemo, useState } from 'react';
import {
  Avatar, Icon, Inline, PageChrome, PageHeader, StatusBadge, Surface, Table, Text,
} from '@canon';
import type { TableColumn, TableSort } from '@canon';
import {
  bomOf, fmtDay, itemOf, locOf, money, n2, orderTotal, taskOf, useReplenishment, vendorOf,
} from '../data/replenishment';
import type { Order, OrderType } from '../data/replenishment';
import { ORDER_KIND, ORDER_TONE, orderStatusLabel } from './shared';

/**
 * PURCHASES → PURCHASE ORDERS, INVENTORY → TRANSFER ORDERS and MANUFACTURING →
 * MANUFACTURING ORDERS. The same list view three times, in the Purchase Orders
 * list's column order — only the columns differ. An order raised from a
 * replenishment carries the replenishment glyph beside its status.
 */
export interface OrderListProps {
  type: OrderType;
  onOutside: () => void;
}

const refs = (o: Order) => o.lines.map((l) => taskOf(l.taskId)?.number).filter(Boolean).join(', ') || '—';
/** Raised from a replenishment task — the list marks it with the glyph beside the status. */
const fromReplenishment = (o: Order) => o.lines.some((l) => l.taskId);
/** Expected delivery (PO, TO) or completion (MO): a fixed lead time after the order date. */
const LEAD_DAYS: Record<OrderType, number> = { po: 7, to: 3, mo: 5 };
const expectedOn = (o: Order) => new Date(new Date(o.date).getTime() + LEAD_DAYS[o.type] * 86_400_000).toISOString();

/** The Received / Billed / Produced dots: a tick once it has happened, a quiet dot until then. */
function Done({ done, label }: { done: boolean; label: string }) {
  return done
    ? <Icon name="check-circle" size="sm" tone="success" label={label} />
    : <Surface tone="pressed" pad={0} radius="full" border="default" className="size-3" />;
}

export function OrderList({ type, onOutside }: OrderListProps) {
  const S = useReplenishment();
  const isPo = type === 'po';
  const { noun, numberHeader } = ORDER_KIND[type];
  const views = [
    { id: 'all', label: `All ${noun}` },
    ...(['draft', 'issued', 'received'] as const).map((st) => ({ id: st, label: orderStatusLabel(type, st) })),
  ];
  const [viewId, setViewId] = useState('all');
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [sort, setSort] = useState<TableSort>({ columnId: 'date', direction: 'desc' });
  const view = views.find((v) => v.id === viewId) ?? views[0];

  const rows = useMemo(() => {
    const list = S.orders.filter((o) => o.type === type && (viewId === 'all' || o.status === viewId));
    const key = (o: Order): string | number => ({
      date: o.date, number: o.number, amount: orderTotal(o), status: o.status,
    } as Record<string, string | number>)[sort.columnId] ?? o.date;
    return [...list].sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.direction === 'asc' ? d : -d;
    });
  }, [S.orders, type, viewId, sort]);

  //  The Purchase Orders list's columns, in its order, for all three types —
  //  only the counterparty, the progress columns and the date's name differ.
  const isMo = type === 'mo';
  const columns: TableColumn<Order>[] = [
    { id: 'date', header: 'Date', sortable: true, cell: (o) => <Text as="span">{fmtDay(o.date)}</Text> },
    { id: 'loc', header: type === 'to' ? 'Destination' : 'Location', cell: (o) => <Text as="span">{locOf(o.locId)?.name}</Text> },
    {
      id: 'number', header: numberHeader, sortable: true,
      cell: (o) => <Text as="a" href={`#/orders/${o.id}`} tone="link" weight="medium">{o.number}</Text>,
    },
    { id: 'ref', header: 'Reference#', cell: (o) => <Text as="span" tone="secondary">{refs(o)}</Text> },
    ...(isMo ? [
      { id: 'item', header: 'Item Name', cell: (o: Order) => <Text as="span">{itemOf(o.lines[0].itemId).name}</Text> },
      { id: 'bom', header: 'BOM', cell: (o: Order) => <Text as="span" tone="secondary">{bomOf(o.bomId)?.number ?? '—'}</Text> },
    ] : isPo ? [{
      id: 'vendor', header: 'Vendor Name',
      cell: (o: Order) => (
        <Inline gap={3} align="center" grow>
          <Avatar name={vendorOf(o.vendorId)?.name ?? '—'} />
          <Text as="span" truncate>{vendorOf(o.vendorId)?.name}</Text>
        </Inline>
      ),
    }] : [{ id: 'source', header: 'Source Location', cell: (o: Order) => <Text as="span">{locOf(o.sourceLocationId ?? '')?.name}</Text> }]),
    {
      id: 'status', header: 'Status', sortable: true,
      cell: (o) => (
        <Inline gap={4} align="center">
          <StatusBadge status={ORDER_TONE[o.status]}>{orderStatusLabel(o.type, o.status)}</StatusBadge>
          {fromReplenishment(o) ? <Icon name="refresh" size="md" tone="muted" tip="Replenishment" /> : null}
        </Inline>
      ),
    },
    {
      id: 'received', header: isMo ? 'Produced' : 'Received',
      cell: (o) => <Done done={o.status === 'received'} label={isMo ? 'Produced' : 'Received'} />,
    },
    ...(isPo ? [{ id: 'billed', header: 'Billed', cell: () => <Done done={false} label="Billed" /> }] : []),
    ...(isPo ? [] : [{ id: 'qty', header: 'Quantity', align: 'end' as const, cell: (o: Order) => <Text as="span">{n2(o.lines.reduce((a, l) => a + l.qty, 0))}</Text> }]),
    ...(type === 'to' ? [] : [{ id: 'amount', header: 'Amount', align: 'end' as const, sortable: true, cell: (o: Order) => <Text as="span" weight="medium">{money(orderTotal(o))}</Text> }]),
    {
      id: 'due', header: isMo ? 'Expected Completion' : 'Delivery Date',
      cell: (o) => <Text as="span">{o.status === 'received' ? '—' : fmtDay(expectedOn(o))}</Text>,
    },
  ];

  return (
    <>
      <PageChrome>
        <PageHeader
          type="list" title={view.label} views={views}
          onViewChange={(id) => { setViewId(id); setViewMenuOpen(false); }}
          viewMenuOpen={viewMenuOpen} onViewMenuToggle={() => setViewMenuOpen((o) => !o)}
          cta={{ label: 'New', icon: 'plus', onSelect: onOutside }}
        />
      </PageChrome>
      <Surface tone="default" pad={0} radius="none" className="flex-1 min-h-0">
        <Table
          caption={`${view.label} — ${rows.length} records`} columns={columns} rows={rows} rowKey={(o) => o.id}
          sort={sort} onSortChange={setSort} placement="page"
          empty={<Text tone="secondary">No {noun.toLowerCase()} yet. Draft orders created from replenishments appear here.</Text>}
        />
      </Surface>
    </>
  );
}
