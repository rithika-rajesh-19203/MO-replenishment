import { useEffect, useState } from 'react';
import { Banner, Icon, Inline, Modal, Stack, Table, Text } from '@canon';
import type { TableColumn } from '@canon';
import { itemOf, locOf, n2 } from '../data/replenishment';
import type { ConstraintRow, OrderType } from '../data/replenishment';

/**
 * ORDER CONSTRAINTS — shown by Create Orders when a selected task's quantity
 * to replenish breaks its location's maximum order quantity, minimum order
 * quantity or unit multiple.
 *
 *   Update Quantities   the TICKED rows are brought within their constraints.
 *                       A row over the maximum is ordered AT the maximum, and
 *                       the rest becomes a new pending replenishment.
 *   Continue Anyway     every order is created with the quantities as they are.
 *
 * Either way the selected tasks that had no problem are ordered too. Closing
 * the dialog creates nothing.
 *
 * Purchase Orders call it "Vendor Order Constraints" — the vendor's configured
 * values. A Manufacturing Order has no vendor, so it is the location's.
 */
export interface OrderConstraintsModalProps {
  open: boolean;
  rows: ConstraintRow[];
  /** Which orders the selection would create — decides the wording. */
  types: OrderType[];
  onUpdate: (taskIds: string[]) => void;
  onContinue: () => void;
  onClose: () => void;
}

const TITLE: Record<OrderType, string> = {
  po: 'Vendor Order Constraints', mo: 'Manufacturing Order Constraints', to: 'Transfer Order Constraints',
};

const qty = (n: number | null) => n2(n ?? 0);

export function OrderConstraintsModal({ open, rows, types, onUpdate, onContinue, onClose }: OrderConstraintsModalProps) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { if (open) setSelected(new Set()); }, [open]);

  const single = types.length === 1 ? types[0] : null;
  const title = single ? TITLE[single] : 'Order Constraints';
  const whose = single === 'po' ? "the vendor's configured" : 'the configured';
  const anyMax = rows.some((r) => r.kind === 'max');
  const noun = single === 'mo' ? 'manufacturing order' : single === 'to' ? 'transfer order' : single === 'po' ? 'purchase order' : 'order';

  //  The breached constraint is the one in bold, so the eye goes from the
  //  quantity straight to the number it broke.
  const bound = (r: ConstraintRow, kind: ConstraintRow['kind'], v: number | null) => (
    <Text as="span" weight={r.kind === kind ? 'bold' : 'regular'}>{qty(v)}</Text>
  );

  //  Modal tops out at 900 and Table headers do not wrap, so the product's
  //  eight wide columns would push Comments out behind a horizontal scroll.
  //  The location rides under the item name and the headers are short, which
  //  leaves Comments the width to read as a sentence.
  const columns: TableColumn<ConstraintRow>[] = [
    {
      id: 'item', header: 'Item',
      cell: (r) => (
        <Stack gap={0}>
          <Text as="span">{itemOf(r.task.itemId).name}</Text>
          <Text as="span" size="body-sm" tone="secondary">{locOf(r.task.locId)?.name}</Text>
        </Stack>
      ),
    },
    { id: 'qty', header: 'Quantity', align: 'end', cell: (r) => <Text as="span">{n2(r.task.qty)}</Text> },
    { id: 'min', header: 'Min Qty', align: 'end', cell: (r) => bound(r, 'min', r.min) },
    { id: 'max', header: 'Max Qty', align: 'end', cell: (r) => bound(r, 'max', r.max) },
    { id: 'um', header: 'Unit Multiple', align: 'end', cell: (r) => bound(r, 'multiple', r.unitMultiple) },
    {
      id: 'diff', header: 'Difference', align: 'end',
      cell: (r) => (
        <Inline gap={1} align="center" justify="end">
          <Text as="span" tone={r.diff < 0 ? 'danger' : 'success'}>{r.diff > 0 ? '+' : ''}{n2(r.diff)}</Text>
          <Text as="span" tone={r.diff < 0 ? 'danger' : 'success'}>
            <Icon name={r.diff < 0 ? 'arrow-down' : 'arrow-up'} size="xs" label={r.diff < 0 ? 'over' : 'under'} />
          </Text>
        </Inline>
      ),
    },
    { id: 'comment', header: 'Comments', cell: (r) => <Text as="span">{r.comment}</Text> },
  ];

  return (
    <Modal
      open={open} title={title} width="xl" onRequestClose={onClose}
      primaryAction={{ label: 'Update Quantities', onSelect: () => onUpdate([...selected]), disabled: selected.size === 0 }}
      secondaryAction={{ label: 'Continue Anyway', onSelect: onContinue }}
    >
      <Stack gap={8}>
        <Banner tone="warning">
          Reorder quantity for the following items does not match with {whose} unit multiple, maximum or minimum order
          quantity. Select the items and click Update Quantities to apply the configured values, or click Continue
          Anyway to proceed without changes.
        </Banner>
        <Table
          caption={title} columns={columns} rows={rows} rowKey={(r) => r.task.id}
          selection={{
            selected, onChange: setSelected, allLabel: `Select all ${rows.length} items`,
            rowLabel: (r) => `${itemOf(r.task.itemId).name} at ${locOf(r.task.locId)?.name}`,
          }}
        />
        {anyMax ? (
          <Text tone="secondary">
            <Text as="span" weight="semibold" tone="inherit">Note: </Text>
            When you update the quantity to the maximum order quantity and create the {noun}, a new replenishment task
            will be created automatically for the remaining quantity.
          </Text>
        ) : null}
      </Stack>
    </Modal>
  );
}
