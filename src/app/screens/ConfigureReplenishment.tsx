import { useState } from 'react';
import {
  ActionBar, Inline, PageChrome, PageHeader, Stack, Surface, Table, Text,
} from '@canon';
import type { TableColumn } from '@canon';
import {
  bomOf, configOf, locOf, n2, orderTypeLabel, removeConfig, unitLabel, useReplenishment, vendorOf,
} from '../data/replenishment';
import type { Location } from '../data/replenishment';
import { ReplenishmentModal } from './ReplenishmentModal';
import { ConfirmModal } from './shared';
import type { Notify } from './ReplenishmentApp';

/**
 * ITEMS → an item → CONFIGURE REPLENISHMENT. One row per location; Strategy's
 * "Configure" opens the Replenishment dialog for that location. Ticking rows
 * swaps the header for the bulk bar, which configures or clears them together.
 */
export interface ConfigureReplenishmentProps {
  itemId: string;
  onBack: () => void;
  notify: Notify;
}


export function ConfigureReplenishment({ itemId, onBack, notify }: ConfigureReplenishmentProps) {
  const S = useReplenishment();
  const item = S.items.find((i) => i.id === itemId) ?? S.items[0];
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<string[] | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const val = (v: number | null | undefined) => <Text as="span">{v == null ? '' : n2(v)}</Text>;

  const columns: TableColumn<Location>[] = [
    { id: 'loc', header: 'Location Name *', cell: (l) => <Text as="span" weight="medium">{l.name}</Text> },
    {
      id: 'strategy', header: 'Strategy *',
      cell: (l) => {
        const c = configOf(item.id, l.id);
        if (!c) return <Text as="button" tone="link" weight="medium" onClick={() => setEditing([l.id])}>Configure</Text>;
        const party = { po: vendorOf(c.vendorId)?.name, to: `From ${locOf(c.sourceLocationId)?.name}`, mo: bomOf(c.bomId)?.name }[c.orderType];
        return (
          <Inline gap={4} align="center" justify="between" grow>
            <Stack gap={1}>
              <Text as="span" weight="medium">{orderTypeLabel(c.orderType)}</Text>
              <Text as="span" size="body-sm" tone="secondary" truncate>{party} · every {c.freqValue} {unitLabel(c.freqValue, c.freqUnit)}</Text>
            </Stack>
            <Text as="button" tone="link" onClick={() => setEditing([l.id])}>Edit</Text>
          </Inline>
        );
      },
    },
    { id: 'reorder', header: 'Reorder Level *', align: 'end', cell: (l) => val(configOf(item.id, l.id)?.reorderLevel) },
    { id: 'max', header: 'Maximum Stock Level *', align: 'end', cell: (l) => val(configOf(item.id, l.id)?.maxStock) },
    { id: 'minoq', header: 'Minimum Order Quantity', align: 'end', cell: (l) => val(configOf(item.id, l.id)?.minOrderQty) },
    { id: 'maxoq', header: 'Maximum Order Quantity', align: 'end', cell: (l) => val(configOf(item.id, l.id)?.maxOrderQty) },
    { id: 'um', header: 'Unit Multiple', align: 'end', cell: (l) => val(configOf(item.id, l.id)?.unitMultiple) },
  ];

  const configuredSelected = [...selected].filter((l) => configOf(item.id, l));

  return (
    <>
      <PageChrome
        bar={selected.size ? (
          <ActionBar
            count={selected.size} total={S.locations.length}
            primary={{ id: 'configure', label: 'Configure', onSelect: () => setEditing([...selected]) }}
            actions={[{ id: 'remove', label: 'Remove Configuration', onSelect: () => (configuredSelected.length ? setConfirmRemove(true) : notify('None of the selected locations are configured.', 'info')) }]}
            onClear={() => setSelected(new Set())}
          />
        ) : undefined}
      >
        <PageHeader type="detail" title="Configure Replenishment" parent={{ label: item.name, href: `#/items/${item.id}/locations` }} onBack={onBack} />
      </PageChrome>

      <Surface tone="default" pad={0} radius="none" className="flex-1 min-h-0">
        <Table
          caption={`${item.name} — replenishment by location`}
          columns={columns} rows={S.locations} rowKey={(l) => l.id} placement="page"
          selection={{
            selected, onChange: setSelected,
            allLabel: `Select all ${S.locations.length} locations`, rowLabel: (l) => `Select ${l.name}`,
          }}
        />
      </Surface>

      <ReplenishmentModal
        open={Boolean(editing)} itemId={item.id} locIds={editing ?? []}
        onClose={() => setEditing(null)} onSaved={() => setSelected(new Set())} notify={notify}
      />
      <ConfirmModal
        open={confirmRemove} title="Remove configuration?" confirmLabel="Remove"
        message={`Replenishment settings for ${configuredSelected.length} location(s) will be removed, and their pending replenishments dismissed.`}
        onConfirm={() => { removeConfig(item.id, configuredSelected); setSelected(new Set()); notify('Replenishment configuration removed.', 'info'); }}
        onClose={() => setConfirmRemove(false)}
      />
    </>
  );
}
