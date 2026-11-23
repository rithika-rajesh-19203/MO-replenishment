import { Modal, Text } from '@canon';
import type { StatusBadgeStatus } from '@canon';
import { locOf, n2 } from '../data/replenishment';
import type { EvalResult, OrderStatus, OrderType, TaskStatus } from '../data/replenishment';
import type { Notify } from './ReplenishmentApp';

/**
 * Bits more than one screen needs: the status → badge mappings, the sentence a
 * stock change produces, and a confirm dialog.
 */

/** Pending is Attention; Ordered is in flight until the order is received; Dismissed is terminal. */
export const TASK_TONE: Record<TaskStatus, StatusBadgeStatus> = {
  pending: 'pending', ordered: 'in-progress', dismissed: 'cancelled',
};
export const TASK_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending', ordered: 'Ordered', dismissed: 'Dismissed',
};
export const ORDER_TONE: Record<OrderStatus, StatusBadgeStatus> = {
  draft: 'draft', issued: 'in-progress', received: 'success',
};
const ORDER_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft', issued: 'Issued', received: 'Received',
};
/** A Manufacturing Order is confirmed and completed, not issued and received. */
const MO_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft', issued: 'Confirmed', received: 'Completed',
};
export const orderStatusLabel = (type: OrderType, s: OrderStatus) => (type === 'mo' ? MO_LABEL : ORDER_LABEL)[s];

/** Per order type: the list's plural noun, its route, and its number column. */
export const ORDER_KIND: Record<OrderType, { noun: string; href: string; numberHeader: string }> = {
  po: { noun: 'Purchase Orders', href: '#/purchase-orders', numberHeader: 'Purchase Order#' },
  to: { noun: 'Transfer Orders', href: '#/transfer-orders', numberHeader: 'Transfer Order#' },
  mo: { noun: 'Manufacturing Orders', href: '#/manufacturing-orders', numberHeader: 'Manufacturing Order#' },
};

/** Say what a re-evaluation did — the most important one, if several. */
export function announce(results: EvalResult[], notify: Notify, fallback?: string) {
  const created = results.filter((r) => r.event === 'created' && r.task);
  const r = created[0] ?? results.find((x) => x.event && x.task);
  if (!r || !r.task) { if (fallback) notify(fallback); return; }
  const where = locOf(r.task.locId)?.name ?? '';
  const prefix = fallback ? `${fallback} ` : '';
  if (r.event === 'created') {
    const more = created.length > 1 ? ` (+${created.length - 1} more)` : '';
    notify(`${prefix}Stock at ${where} is at ${n2(r.avail)}, at or below the reorder level — ${r.task.number} created for ${n2(r.task.qty)}${more}.`, 'warning');
  } else if (r.event === 'updated') {
    notify(`${prefix}${r.task.number}: quantity to replenish is now ${n2(r.task.qty)}.`, 'warning');
  } else if (r.event === 'dismissed') {
    notify(`${prefix}${r.task.number} dismissed automatically — stock at ${where} is back above the reorder level.`, 'info');
  } else if (r.event === 'awaiting') {
    notify(`${prefix}Stock at ${where} is below the reorder level, but ${r.task.number} is already ordered and awaiting receipt.`, 'info');
  }
}

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ open, title, message, confirmLabel, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Modal
      open={open} title={title} width="sm" onRequestClose={onClose}
      primaryAction={{ label: confirmLabel, onSelect: () => { onConfirm(); onClose(); } }}
      secondaryAction={{ label: 'Cancel', onSelect: onClose }}
    >
      <Text>{message}</Text>
    </Modal>
  );
}
