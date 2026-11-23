import { useEffect, useState } from 'react';
import {
  Banner, DescriptionList, FormRow, InputField, Modal, Select, Stack,
} from '@canon';
import {
  adjustStock, configOf, itemOf, locOf, n2, stockOf, useReplenishment,
} from '../data/replenishment';
import { announce } from './shared';
import type { Notify } from './ReplenishmentApp';

/**
 * ADJUST STOCK — a quantity adjustment at one location. The prototype's way of
 * moving stock under a reorder level: replenishment is checked the moment the
 * adjustment is saved.
 */
export interface AdjustStockModalProps {
  open: boolean;
  itemId: string;
  onClose: () => void;
  notify: Notify;
}

const REASONS = ['Stocktaking results', 'Damaged goods', 'Stock written off', 'Stolen goods', 'Consumed internally', 'Inventory revaluation'];

export function AdjustStockModal({ open, itemId, onClose, notify }: AdjustStockModalProps) {
  const S = useReplenishment();
  const [locId, setLocId] = useState(S.locations[0].id);
  const [newQty, setNewQty] = useState('');
  const [adjusted, setAdjusted] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [error, setError] = useState<string | undefined>();

  const current = stockOf(itemId, locId);
  const cfg = configOf(itemId, locId);

  useEffect(() => {
    if (!open) return;
    setNewQty(String(stockOf(itemId, locId).onHand)); setAdjusted(''); setError(undefined);
  }, [open, itemId, locId]);

  const save = () => {
    const v = Number(newQty);
    if (newQty.trim() === '' || Number.isNaN(v)) { setError('Enter the new quantity on hand.'); return; }
    const r = adjustStock(itemId, locId, v);
    onClose();
    announce([r], notify, `Stock adjusted for ${itemOf(itemId).name} at ${locOf(locId)?.name}.`);
  };

  return (
    <Modal
      open={open} title="Adjust Stock" width="lg" onRequestClose={onClose}
      primaryAction={{ label: 'Save', onSelect: save }}
      secondaryAction={{ label: 'Cancel', onSelect: onClose }}
    >
      <Stack gap={8}>
        <FormRow label="Location" required span="full">
          {({ id }) => (
            <Select id={id} value={locId} onChange={setLocId} options={S.locations.map((l) => ({ value: l.id, label: l.name }))} />
          )}
        </FormRow>
        <DescriptionList
          items={[
            { label: 'Stock on Hand', value: n2(current.onHand) },
            { label: 'Available for Sale', value: n2(current.onHand - current.committed) },
            { label: 'Reorder Level', value: cfg ? `${n2(cfg.reorderLevel)} (max stock ${n2(cfg.maxStock)})` : 'Not configured for this location' },
          ]}
        />
        <FormRow label="New Quantity on Hand" required error={error} span="full">
          {({ id, required, describedBy }) => (
            <InputField
              id={id} format="decimal" value={newQty} required={required} aria-describedby={describedBy} error={Boolean(error)}
              onChange={(e) => {
                setNewQty(e.target.value); setError(undefined);
                setAdjusted(e.target.value === '' ? '' : String(Number(e.target.value) - current.onHand));
              }}
            />
          )}
        </FormRow>
        <FormRow label="Quantity Adjusted" span="full">
          {({ id }) => (
            <InputField
              id={id} value={adjusted} placeholder="Eg. +10, -10"
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.+-]/g, '');
                setAdjusted(raw);
                const d = Number(raw);
                if (raw !== '' && raw !== '-' && raw !== '+' && !Number.isNaN(d)) setNewQty(String(current.onHand + d));
              }}
            />
          )}
        </FormRow>
        <FormRow label="Reason" required span="full">
          {({ id }) => <Select id={id} value={reason} onChange={setReason} options={REASONS.map((r) => ({ value: r, label: r }))} />}
        </FormRow>
        <Banner tone="info">Replenishment is checked as soon as stock changes.</Banner>
      </Stack>
    </Modal>
  );
}
