import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Banner, Button, DescriptionList, DetailsToolbar, Inline, Menu, MiniList, PageHeader, SplitView, Stack,
  StatusBadge, Surface, Table, Tabs, Text,
} from '@canon';
import type { DetailsToolbarItem, MenuEntry, MiniListItem, TableColumn } from '@canon';
import {
  bomOf, deleteDraft, fmtClock, fmtDateTime, fmtDay, fmtDuration, issueOrder, itemOf, locOf, moMinutes, n2,
  receiveOrder, taskOf, useReplenishment,
} from '../data/replenishment';
import type { BomComponent, BomOperation } from '../data/replenishment';
import { markGuide } from '../data/guide';
import { ConfirmModal, ORDER_TONE, announce, orderStatusLabel } from './shared';
import type { Notify } from './ReplenishmentApp';

/**
 * MANUFACTURING → one Manufacturing Order, laid out as the product has it:
 *
 *   toolbar     Edit · PDF/Print · Adjust Quantity · Mark as Confirmed / Completed · ⋯
 *   summary     status, Item to Produce + job cards, Time Taken, Produced
 *               Quantity — and a "What's next?" strip with the next step
 *   tabs        Manufacturing Order Details · Components · Operations · Job Cards
 *
 * Draft → Confirmed releases one job card per BOM operation (counts as Yet to
 * Receive); Completed closes them, books the time and adds the quantity to
 * Stock on Hand. An MO raised by replenishment names its task in the details.
 */
export interface MoDetailProps {
  orderId: string;
  onSelect: (orderId: string) => void;
  onBack: () => void;
  notify: Notify;
  onOutside: () => void;
}

interface JobCard { number: string; operation: string; workCenter: string; status: 'pending' | 'completed' }

export function MoDetail({ orderId, onSelect, onBack, notify, onOutside }: MoDetailProps) {
  const S = useReplenishment();
  const o = S.orders.find((x) => x.id === orderId)!;
  const [tab, setTab] = useState('details');
  const [moreOpen, setMoreOpen] = useState(false);
  const [folded, setFolded] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  const list: MiniListItem[] = useMemo(() => S.orders.filter((x) => x.type === 'mo').map((x) => ({
    id: x.id, name: itemOf(x.lines[0].itemId).name,
    amount: String(x.lines.reduce((a, l) => a + l.qty, 0)),
    meta: [x.number, fmtDay(x.date)],
    status: orderStatusLabel('mo', x.status), statusVariant: ORDER_TONE[x.status],
  })), [S.orders]);

  const line = o.lines[0];
  const item = itemOf(line.itemId);
  const bom = bomOf(o.bomId);
  const qty = o.lines.reduce((a, l) => a + l.qty, 0);
  const minutes = moMinutes(o);
  const done = o.status === 'received';
  const task = taskOf(line.taskId);

  const jobCards: JobCard[] = o.status === 'draft' ? [] : (bom?.operations ?? []).map((op, i) => ({
    number: `JC-${o.number.replace(/\D/g, '')}-${i + 1}`, operation: op.name, workCenter: op.workCenter,
    status: done ? 'completed' : 'pending',
  }));
  const completedCards = jobCards.filter((j) => j.status === 'completed').length;

  const confirm = () => announce(issueOrder(o.id), notify, `${o.number} confirmed — ${bom?.operations.length ?? 0} job card${bom?.operations.length === 1 ? '' : 's'} released.`);
  const complete = () => {
    markGuide('mo-lifecycle');
    announce(receiveOrder(o.id), notify, `${o.number} completed. ${n2(qty)} ${item.unit} of ${item.name} added to stock at ${locOf(o.locId)?.name}.`);
  };

  /* ── Toolbar ───────────────────────────────────────────────────────────── */

  const actions: DetailsToolbarItem[] = [
    { id: 'edit', label: 'Edit', icon: 'edit', disabled: done, onSelect: onOutside },
    { id: 'pdf', label: 'PDF/Print', icon: 'pdf', menu: true, onSelect: onOutside },
    { id: 'adjust', label: 'Adjust Quantity', disabled: o.status !== 'draft', onSelect: onOutside },
    o.status === 'draft'
      ? { id: 'confirm', label: 'Mark as Confirmed', icon: 'check', onSelect: confirm }
      : { id: 'complete', label: 'Mark as Completed', icon: 'check', disabled: done, onSelect: () => { if (!done) complete(); } },
  ];
  const more: MenuEntry[] = [
    ...actions.filter((a) => folded.includes(a.id)).map((a) => ({ id: a.id, label: a.label, disabled: a.disabled, onSelect: a.onSelect })),
    ...(folded.length ? [{ separator: true as const }] : []),
    { id: 'cost', label: 'Cost Overview', icon: 'documents', onSelect: onOutside },
    { id: 'clone', label: 'Clone', icon: 'clone', onSelect: onOutside },
    { separator: true as const },
    { id: 'delete', label: 'Delete', icon: 'delete', tone: 'danger', disabled: o.status !== 'draft', onSelect: () => setConfirmDelete(true) },
  ];

  /* ── Summary ───────────────────────────────────────────────────────────── */

  const metric = (label: string, value: string, foot: string) => (
    <Stack gap={2} grow>
      <Text as="span" tone="secondary">{label}</Text>
      <Text as="span" size="title">{value}</Text>
      <Text as="span" size="body-sm" tone="secondary">{foot}</Text>
    </Stack>
  );

  const next = o.status === 'draft'
    ? { text: 'Confirm this manufacturing order to release job cards', label: 'Mark as Confirmed', run: confirm }
    : o.status === 'issued'
      ? { text: 'Complete the job cards to finish production and receive the stock', label: 'Mark as Completed', run: complete }
      : null;

  /* ── Tabs ──────────────────────────────────────────────────────────────── */

  const tabs = [
    { id: 'details', label: 'Manufacturing Order Details' },
    { id: 'components', label: 'Components', badge: String(bom?.components.length ?? 0) },
    { id: 'operations', label: 'Operations', badge: String(bom?.operations.length ?? 0) },
    { id: 'jobcards', label: 'Job Cards', badge: jobCards.length ? String(jobCards.length) : undefined },
  ];

  const componentColumns: TableColumn<BomComponent & { n: number }>[] = [
    { id: 'n', header: '#', cell: (c) => <Text as="span" tone="secondary">{c.n}</Text> },
    { id: 'name', header: 'Component', cell: (c) => <Text as="span">{c.name}</Text> },
    { id: 'per', header: 'Quantity per Unit', align: 'end', cell: (c) => <Text as="span">{n2(c.qty)} {c.unit}</Text> },
    { id: 'req', header: 'Required Quantity', align: 'end', cell: (c) => <Text as="span" weight="medium">{n2(c.qty * qty)} {c.unit}</Text> },
  ];
  const operationColumns: TableColumn<BomOperation & { n: number }>[] = [
    { id: 'n', header: '#', cell: (op) => <Text as="span" tone="secondary">{op.n}</Text> },
    { id: 'name', header: 'Operation', cell: (op) => <Text as="span">{op.name}</Text> },
    { id: 'wc', header: 'Work Center', cell: (op) => <Text as="span">{op.workCenter}</Text> },
    { id: 'per', header: 'Time per Unit', align: 'end', cell: (op) => <Text as="span">{fmtDuration(op.minutes)}</Text> },
    { id: 'total', header: 'Estimated Time', align: 'end', cell: (op) => <Text as="span" weight="medium">{fmtDuration(op.minutes * qty)}</Text> },
  ];
  const jobCardColumns: TableColumn<JobCard>[] = [
    { id: 'number', header: 'Job Card#', cell: (j) => <Text as="span" weight="medium">{j.number}</Text> },
    { id: 'op', header: 'Operation', cell: (j) => <Text as="span">{j.operation}</Text> },
    { id: 'wc', header: 'Work Center', cell: (j) => <Text as="span">{j.workCenter}</Text> },
    {
      id: 'status', header: 'Status',
      cell: (j) => <StatusBadge status={j.status === 'completed' ? 'success' : 'pending'}>{j.status === 'completed' ? 'Completed' : 'Pending'}</StatusBadge>,
    },
    { id: 'qty', header: 'Quantity', align: 'end', cell: () => <Text as="span">{n2(qty)} {item.unit}</Text> },
  ];

  const card = (children: ReactNode) => (
    <Surface pad={0} radius="md" border="default" className="overflow-hidden">{children}</Surface>
  );

  return (
    <SplitView
      list={(
        <MiniList
          label="Manufacturing Orders" items={list} activeId={o.id} onActivate={onSelect}
          views={[{ id: 'all', label: 'All Manufacturing Orders' }]} viewId="all" onViewChange={() => {}} onCreate={onOutside}
        />
      )}
    >
      <PageHeader type="detail" title={o.number} parent={{ label: 'Manufacturing Orders', href: '#/manufacturing-orders' }} onBack={onBack} />
      <DetailsToolbar
        groups={[{ id: 'mo', label: 'Manufacturing order actions', items: actions }]}
        overflow={{ label: 'More actions', ref: moreRef, expanded: moreOpen, onSelect: (ids) => { setFolded(ids); setMoreOpen((v) => !v); } }}
      />
      <Menu anchor={moreRef.current} open={moreOpen} onClose={() => setMoreOpen(false)} label="More actions" align="start" emphasis="strong" entries={more} />

      <Surface tone="canvas" pad={0} radius="none" className="flex-1 min-h-0 overflow-y-auto">
        <Stack gap={8} className="p-section">

          {/* ── Summary ─────────────────────────────────────────────────── */}
          <Surface pad={10} radius="card" border="default">
            <Stack gap={8}>
              <Inline gap={4} align="center">
                <StatusBadge status={ORDER_TONE[o.status]} emphasis="solid">{orderStatusLabel('mo', o.status)}</StatusBadge>
                <Text as="span" size="body-sm" tone="secondary">Location: {locOf(o.locId)?.name}</Text>
              </Inline>
              <Inline gap={10} align="start">
                <Stack gap={2} grow>
                  <Text as="span" tone="secondary">Item to Produce</Text>
                  <Text as="a" href={`#/items/${item.id}/details`} size="title" weight="medium">{item.name}</Text>
                  <Text as="span" size="body-sm" tone="secondary">
                    Job Cards: <Text as="span" size="body-sm" weight="semibold" tone="default">{completedCards} Completed</Text>
                    {' | '}<Text as="span" size="body-sm" weight="semibold" tone="default">{jobCards.length - completedCards} Pending</Text>
                  </Text>
                </Stack>
                {metric('Time Taken', fmtClock(done ? minutes : 0), `Estimated Time: ${fmtDuration(minutes)}`)}
                {metric('Produced Quantity', `${n2(done ? qty : 0)} ${item.unit}`, `Total Quantity: ${n2(qty)} ${item.unit}`)}
              </Inline>
              {next ? (
                <Banner tone="info">
                  <Inline gap={6} align="center" justify="between" wrap grow>
                    <Text as="span" tone="inherit"><Text as="span" weight="semibold" tone="inherit">WHAT'S NEXT?</Text> {next.text}</Text>
                    <Button size="sm" onClick={next.run}>{next.label}</Button>
                  </Inline>
                </Banner>
              ) : null}
            </Stack>
          </Surface>

          {/* ── Tabs ────────────────────────────────────────────────────── */}
          <Surface pad={0} radius="card" border="default" className="overflow-hidden">
            <Tabs label="Manufacturing order sections" items={tabs} value={tab} onChange={setTab}>
              <Stack gap={8} className="px-15 py-10">
                {tab === 'details' ? (
                  <>
                    <Text size="subheading" weight="semibold">Manufacturing Order Details</Text>
                    <Inline gap={10} align="start">
                      <Stack grow>
                        <DescriptionList
                          items={[
                            { label: 'Item to Produce', value: item.name },
                            { label: 'Owner Name', value: '-' },
                            { label: 'Start Date', value: fmtDay(o.date) },
                            { label: 'Quantity', value: `${n2(qty)} ${item.unit}` },
                          ]}
                        />
                      </Stack>
                      <Stack grow>
                        <DescriptionList
                          items={[
                            { label: 'Manufacturing Order#', value: o.number },
                            { label: 'Bill of Materials Name', value: bom ? <Text as="button" tone="link" onClick={() => setTab('components')}>{bom.name}</Text> : '—' },
                            { label: 'Location', value: locOf(o.locId)?.name ?? '—' },
                            {
                              label: 'Source',
                              value: task
                                ? <Text as="a" href="#/replenishments" tone="link">Replenishment {task.number}</Text>
                                : 'Manual',
                            },
                          ]}
                        />
                      </Stack>
                    </Inline>
                    {task ? (
                      <Text size="body-sm" tone="secondary">
                        {o.createdBy === 'scheduler' ? 'Created by the replenishment scheduler' : 'Created from replenishment'} on {fmtDateTime(o.date)}:
                        {' '}available stock at {locOf(o.locId)?.name} fell to the reorder level ({n2(task.reorderLevel)}).
                      </Text>
                    ) : null}
                  </>
                ) : tab === 'components' ? card(
                  <Table
                    caption={`${o.number} — components`} placement="page" columns={componentColumns}
                    rows={(bom?.components ?? []).map((c, i) => ({ ...c, n: i + 1 }))} rowKey={(c) => String(c.n)}
                  />,
                ) : tab === 'operations' ? card(
                  <Table
                    caption={`${o.number} — operations`} placement="page" columns={operationColumns}
                    rows={(bom?.operations ?? []).map((op, i) => ({ ...op, n: i + 1 }))} rowKey={(op) => String(op.n)}
                  />,
                ) : card(
                  <Table
                    caption={`${o.number} — job cards`} placement="page" columns={jobCardColumns} rows={jobCards} rowKey={(j) => j.number}
                    empty={<Text tone="secondary">Job cards are released when the manufacturing order is confirmed.</Text>}
                  />,
                )}
              </Stack>
            </Tabs>
          </Surface>
        </Stack>
      </Surface>

      <ConfirmModal
        open={confirmDelete} title="Delete draft?" confirmLabel="Delete"
        message={`${o.number} will be deleted${task ? ' and its replenishment will return to Pending' : ''}.`}
        onConfirm={() => { const n = o.number; deleteDraft(o.id); notify(`${n} deleted.`, 'info'); onBack(); }}
        onClose={() => setConfirmDelete(false)}
      />
    </SplitView>
  );
}
