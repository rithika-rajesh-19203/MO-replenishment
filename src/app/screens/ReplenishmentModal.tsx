import { useEffect, useState } from 'react';
import {
  Divider, FormRow, Inline, InputField, Modal, Select, Stack, Text,
} from '@canon';
import { configOf, itemOf, locOf, saveConfig, useReplenishment } from '../data/replenishment';
import type { FreqUnit, OrderType, ReplConfig } from '../data/replenishment';
import { markGuide } from '../data/guide';
import { announce } from './shared';
import type { Notify } from './ReplenishmentApp';

/**
 * REPLENISHMENT — the per-location dialog from Configure Replenishment. Two
 * sections, as in the product: Reorder Criteria (when to replenish) and
 * Replenishment Task (what to raise, and how much).
 *
 * Opened for one location, or for several at once from the bulk bar — the same
 * parameters are then written to each.
 *
 * Order Type decides what the task raises: a Purchase Order needs a vendor, a
 * Transfer Order a source location, and a Manufacturing Order a BOM. Each
 * type shows only its own field.
 *
 * BULK — from the Items list's Bulk Update Replenishment. Several items, and
 * the parameters are written to every location of every selected item. Manufacturing Order is
 * listed but disabled: an MO is raised against a BOM, and a BOM belongs to one
 * item, so there is no one BOM a bulk edit could set. Its warning says so.
 *
 * Rows are `span="half"` — label a third, control a half — which is the
 * product's proportion and keeps every control on one edge however long its
 * label is.
 */
export interface ReplenishmentModalProps {
  open: boolean;
  /** The item, for a single-item edit. Ignored when `bulkItemIds` is set. */
  itemId?: string;
  /** The locations, for a single-item edit. A bulk edit picks its own. */
  locIds?: string[];
  /** Bulk mode — every item to configure. */
  bulkItemIds?: string[];
  onClose: () => void;
  onSaved: () => void;
  notify: Notify;
}

type Draft = Record<'reorderLevel' | 'freqValue' | 'maxStock' | 'minOrderQty' | 'maxOrderQty' | 'unitMultiple', string>
  & { freqUnit: FreqUnit; orderType: OrderType; vendorId: string; sourceLocationId: string; bomId: string };
type Errors = Partial<Record<keyof Draft, string>>;

export const MO_BULK_WARNING = 'Manufacturing Orders are raised against a Bill of Materials, and each item has its own. They cannot be set up in bulk — configure them from each item\'s Locations → Configure Replenishment.';

const str = (v: number | null | undefined) => (v == null ? '' : String(v));
const opt = (v: string) => (v.trim() === '' ? null : Number(v));

export function ReplenishmentModal({ open, itemId: oneItem = '', locIds: oneLocs = [], bulkItemIds, onClose, onSaved, notify }: ReplenishmentModalProps) {
  const S = useReplenishment();
  const bulk = Boolean(bulkItemIds);
  const itemIds = bulkItemIds ?? [oneItem];
  const itemId = itemIds[0];
  const [d, setD] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  //  A bulk edit writes to every location — there is no picker. A Transfer
  //  Order's source is the one location it cannot apply to.
  const allLocs = S.locations.map((l) => l.id);
  const locIds = bulk ? allLocs : oneLocs;

  useEffect(() => {
    if (!open) return;
    //  A bulk edit starts blank: the items may be configured differently, and
    //  prefilling from the first would quietly apply its values to the rest.
    const c = bulk ? null : locIds.map((l) => configOf(itemId, l)).find(Boolean);
    const firstBom = S.boms.find((b) => b.itemId === itemId)?.id ?? '';
    setD({
      reorderLevel: str(c?.reorderLevel), freqValue: str(c?.freqValue ?? 1), freqUnit: c?.freqUnit ?? 'days',
      orderType: c?.orderType ?? 'po', vendorId: c?.vendorId || (bulk ? '' : itemOf(itemId).preferredVendorId) || '',
      sourceLocationId: c?.sourceLocationId ?? '', bomId: c?.bomId || firstBom, maxStock: str(c?.maxStock),
      minOrderQty: str(c?.minOrderQty), maxOrderQty: str(c?.maxOrderQty), unitMultiple: str(c?.unitMultiple),
    });
    setErrors({});
  }, [open, itemId, bulk ? '' : oneLocs.join()]);

  if (!d) return null;
  const boms = S.boms.filter((b) => b.itemId === itemId);
  const set = (k: keyof Draft) => (v: string) => { setD({ ...d, [k]: v }); setErrors({ ...errors, [k]: undefined }); };

  const save = () => {
    const e: Errors = {};
    if (d.reorderLevel.trim() === '') e.reorderLevel = 'Enter a reorder level.';
    //  No comparison with the reorder level: a maximum at or below it is allowed.
    if (d.maxStock.trim() === '') e.maxStock = 'Enter the maximum stock level.';
    if (!Number(d.freqValue) || Number(d.freqValue) < 1) e.freqValue = 'Frequency must be at least 1.';
    if (d.orderType === 'po' && !d.vendorId) e.vendorId = 'Select a preferred vendor.';
    if (d.orderType === 'to' && !d.sourceLocationId) e.sourceLocationId = 'Select the location to transfer from.';
    if (d.orderType === 'mo' && !d.bomId) e.bomId = boms.length ? 'Select the BOM to manufacture from.' : 'This item has no BOM. Create one under Manufacturing → Bill of Materials.';
    if (d.minOrderQty && d.maxOrderQty && Number(d.minOrderQty) > Number(d.maxOrderQty)) e.maxOrderQty = 'Must be at least the minimum order quantity.';
    if (d.unitMultiple && Number(d.unitMultiple) <= 0) e.unitMultiple = 'Must be greater than 0.';
    if (Object.keys(e).length) { setErrors(e); return; }

    const cfg: ReplConfig = {
      reorderLevel: Number(d.reorderLevel), freqValue: Number(d.freqValue), freqUnit: d.freqUnit,
      orderType: d.orderType, vendorId: d.orderType === 'po' ? d.vendorId : '',
      sourceLocationId: d.orderType === 'to' ? d.sourceLocationId : '',
      bomId: d.orderType === 'mo' ? d.bomId : '',
      maxStock: Number(d.maxStock), minOrderQty: opt(d.minOrderQty), maxOrderQty: opt(d.maxOrderQty), unitMultiple: opt(d.unitMultiple),
    };
    const targets = bulk && d.orderType === 'to' ? locIds.filter((l) => l !== d.sourceLocationId) : locIds;
    const results = itemIds.flatMap((i) => saveConfig(i, targets, cfg));
    markGuide(bulk ? 'configure-bulk' : 'configure-item');
    onClose(); onSaved();
    announce(results, notify, bulk
      ? `Replenishment configured for ${itemIds.length} item${itemIds.length > 1 ? 's' : ''} at ${targets.length === allLocs.length ? 'all' : targets.length} locations${targets.length === allLocs.length ? '' : ` (every location except ${locOf(d.sourceLocationId)?.name})`}.`
      : `Replenishment configured for ${locIds.map((l) => locOf(l)?.name).join(', ')}.`);
  };

  const decimal = (k: 'reorderLevel' | 'maxStock' | 'minOrderQty' | 'maxOrderQty' | 'unitMultiple', label: string, help: string, required = false) => (
    <FormRow label={label} required={required} error={errors[k]} help={help}>
      {({ id, describedBy }) => (
        <InputField
          id={id} format="decimal" value={d[k]} required={required} aria-describedby={describedBy}
          error={Boolean(errors[k])} onChange={(ev) => set(k)(ev.target.value)}
        />
      )}
    </FormRow>
  );

  const names = locIds.map((l) => locOf(l)?.name).join(', ');

  return (
    <Modal
      open={open} title="Replenishment" width="md" onRequestClose={onClose}
      primaryAction={{ label: 'Save', onSelect: save }}
      secondaryAction={{ label: 'Cancel', onSelect: onClose }}
    >
      <Stack gap={8}>
        {bulk ? null : <Text tone="secondary">{itemOf(itemId).name} · {names}</Text>}
        <Text size="subheading" weight="semibold">Reorder Criteria</Text>
        {decimal('reorderLevel', 'Reorder Level', 'When available stock at this location falls to or below this level, a replenishment task is created.', true)}
        <FormRow label="Frequency" error={errors.freqValue} help="How often this item should be replenished at this location.">
          {({ id, describedBy }) => (
            <Inline gap={2} align="center">
              <InputField
                id={id} format="numeric" value={d.freqValue} aria-describedby={describedBy}
                error={Boolean(errors.freqValue)} onChange={(ev) => set('freqValue')(ev.target.value)}
              />
              <Select
                ariaLabel="Frequency unit" value={d.freqUnit} onChange={(v) => set('freqUnit')(v)}
                options={[{ value: 'days', label: 'Days' }, { value: 'weeks', label: 'Weeks' }, { value: 'months', label: 'Months' }]}
              />
            </Inline>
          )}
        </FormRow>

        <Divider />

        <Text size="subheading" weight="semibold">Replenishment Task</Text>
        <FormRow label="Order Type" required>
          {({ id }) => (
            <Select
              id={id} value={d.orderType} onChange={(v) => set('orderType')(v)}
              options={[
                { value: 'po', label: 'Purchase Order' },
                { value: 'to', label: 'Transfer Order' },
                bulk
                  ? { value: 'mo', label: 'Manufacturing Order', disabled: true, warning: MO_BULK_WARNING }
                  : { value: 'mo', label: 'Manufacturing Order' },
              ]}
            />
          )}
        </FormRow>
        {d.orderType === 'po' ? (
          <FormRow label="Preferred Vendor" required error={errors.vendorId}>
            {({ id, describedBy }) => (
              <Select
                id={id} value={d.vendorId} onChange={set('vendorId')} placeholder="Select Preferred Vendor"
                error={Boolean(errors.vendorId)} ariaDescribedBy={describedBy}
                options={S.vendors.map((v) => ({ value: v.id, label: v.name }))}
              />
            )}
          </FormRow>
        ) : null}
        {d.orderType === 'mo' ? (
          <FormRow label="Preferred BOM" required error={errors.bomId}>
            {({ id, describedBy }) => (
              <Select
                id={id} value={d.bomId} onChange={set('bomId')}
                placeholder={boms.length ? 'Select Preferred BOM' : 'No BOM for this item'}
                error={Boolean(errors.bomId)} ariaDescribedBy={describedBy}
                options={boms.map((b) => ({ value: b.id, label: `${b.name} (${b.number})` }))}
              />
            )}
          </FormRow>
        ) : null}
        {d.orderType === 'to' ? (
          <FormRow label="Source Location" required error={errors.sourceLocationId}>
            {({ id, describedBy }) => (
              <Select
                id={id} value={d.sourceLocationId} onChange={set('sourceLocationId')} placeholder="Select Source Location"
                error={Boolean(errors.sourceLocationId)} ariaDescribedBy={describedBy}
                options={S.locations.filter((l) => bulk || !locIds.includes(l.id)).map((l) => ({ value: l.id, label: l.name }))}
              />
            )}
          </FormRow>
        ) : null}
        {decimal('maxStock', 'Maximum Stock Level', 'Replenishment tops stock up to this level. Quantity to replenish = Maximum Stock Level − Available Stock.', true)}
        {decimal('minOrderQty', 'Minimum Order Quantity', 'The replenishment quantity will be at least this much.')}
        {decimal('maxOrderQty', 'Maximum Order Quantity', 'The replenishment quantity will not exceed this.')}
        {decimal('unitMultiple', 'Unit Multiple', 'The replenishment quantity is rounded up to a multiple of this — a pack size, for example.')}
      </Stack>
    </Modal>
  );
}
