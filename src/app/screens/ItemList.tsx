import { useMemo, useState } from 'react';
import { ActionBar, PageChrome, PageHeader, Surface, Table, Text } from '@canon';
import type { TableColumn, TableSort } from '@canon';
import { money, n2, orderTypeLabel, stockOf, useReplenishment } from '../data/replenishment';
import type { Item, ReplConfig } from '../data/replenishment';
import { ReplenishmentModal } from './ReplenishmentModal';
import type { Notify } from './ReplenishmentApp';

/**
 * ITEMS → ACTIVE ITEMS. The list view, composed like every other one. The row
 * name opens the item's detail.
 *
 * Selecting rows swaps the header for the bulk bar. Bulk Update Replenishment
 * is in its ⋯ and opens the Replenishment dialog in bulk mode: pick locations,
 * set the parameters once, write them to every selected item. Manufacturing
 * Order is shown there but disabled, with the reason on hover.
 */
export interface ItemListProps {
  notify: Notify;
  onOutside: () => void;
}

/** Where an item is set up to replenish, as one line: "Purchase Order · 2 locations". */
function replenishmentSummary(cfgs: Record<string, ReplConfig> | undefined) {
  const list = Object.values(cfgs ?? {});
  if (!list.length) return null;
  const types = [...new Set(list.map((c) => c.orderType))];
  const kind = types.length === 1 ? orderTypeLabel(types[0]) : 'Mixed';
  return `${kind} · ${list.length} location${list.length > 1 ? 's' : ''}`;
}

export function ItemList({ notify, onOutside }: ItemListProps) {
  const S = useReplenishment();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<TableSort>({ columnId: 'name', direction: 'asc' });
  //  The items the bulk dialog writes to, captured when it opens — never read
  //  live from the selection, which can change behind a modal.
  const [bulkIds, setBulkIds] = useState<string[] | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  //  Every seeded item is active, so the other views are the product's names
  //  rather than filters this prototype has data for.
  const views = [{ id: 'active', label: 'Active Items' }, { id: 'inactive', label: 'Inactive Items' }, { id: 'all', label: 'All Items' }];
  const [viewId, setViewId] = useState('active');
  const view = views.find((v) => v.id === viewId) ?? views[0];

  const onHand = (i: Item) => S.locations.reduce((a, l) => a + stockOf(i.id, l.id).onHand, 0);

  const rows = useMemo(() => {
    const key = (i: Item): string | number => ({
      name: i.name.toLowerCase(), purchase: i.purchaseRate, rate: i.salesRate, stock: onHand(i),
    } as Record<string, string | number>)[sort.columnId] ?? i.name;
    return S.items.filter(() => viewId !== 'inactive').sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.direction === 'asc' ? d : -d;
    });
  }, [S.items, S.stock, sort, viewId]);

  const columns: TableColumn<Item>[] = [
    {
      id: 'name', header: 'Name', sortable: true,
      cell: (i) => <Text as="a" href={`#/items/${i.id}/locations`} tone="link" weight="medium">{i.name}</Text>,
    },
    { id: 'sku', header: 'SKU', cell: (i) => <Text as="span" tone="secondary">{i.sku}</Text> },
    { id: 'purchase', header: 'Purchase Rate', align: 'end', sortable: true, cell: (i) => <Text as="span">{money(i.purchaseRate)}</Text> },
    { id: 'rate', header: 'Rate', align: 'end', sortable: true, cell: (i) => <Text as="span">{money(i.salesRate)}</Text> },
    { id: 'stock', header: 'Stock on Hand', align: 'end', sortable: true, cell: (i) => <Text as="span">{n2(onHand(i))}</Text> },
    { id: 'unit', header: 'Usage Unit', cell: (i) => <Text as="span">{i.unit}</Text> },
    {
      id: 'repl', header: 'Replenishment',
      cell: (i) => {
        const line = replenishmentSummary(S.configs[i.id]);
        return line ? <Text as="span">{line}</Text> : <Text as="span" tone="tertiary">Not configured</Text>;
      },
    },
  ];

  const out = (id: string, label: string) => ({ id, label, onSelect: onOutside });

  return (
    <>
      <PageChrome
        bar={selected.size ? (
          <ActionBar
            count={selected.size} total={rows.length} maxVisible={4}
            primary={out('bulk-update', 'Bulk Update')}
            actions={[
              out('new-txn', 'New Transaction'),
              out('active', 'Mark as Active'),
              out('inactive', 'Mark as Inactive'),
              out('variants', 'Add Variants to an Item'),
              out('barcode', 'Print Barcode'),
              out('returnable', 'Mark as Returnable'),
              out('permission', 'Configure Permission'),
              out('service-units', 'Map Service Units'),
              out('bin-on', 'Enable Bin location'),
              out('bin-off', 'Disable Bin location'),
              { id: 'bulk-repl', label: 'Bulk Update Replenishment', onSelect: () => setBulkIds([...selected]) },
              out('pause', 'Pause Replenishment'),
              out('resume', 'Resume Replenishment'),
              out('generate', 'Generate Replenishment'),
              out('delete', 'Delete'),
            ]}
            onClear={() => setSelected(new Set())}
          />
        ) : undefined}
      >
        <PageHeader
          type="list" title={view.label} views={views}
          onViewChange={(id) => { setViewId(id); setViewMenuOpen(false); }}
          viewMenuOpen={viewMenuOpen} onViewMenuToggle={() => setViewMenuOpen((o) => !o)}
          cta={{ label: 'New', icon: 'plus', onSelect: onOutside }}
        />
      </PageChrome>

      <Surface tone="default" pad={0} radius="none" className="flex-1 min-h-0">
        <Table
          caption={`${view.label} — ${rows.length} items`} columns={columns} rows={rows} rowKey={(i) => i.id}
          sort={sort} onSortChange={setSort} placement="page"
          empty={<Text tone="secondary">No {view.label.toLowerCase()}.</Text>}
          selection={{
            selected, onChange: setSelected, allLabel: `Select all ${rows.length} items`, rowLabel: (i) => i.name,
          }}
        />
      </Surface>

      <ReplenishmentModal
        open={bulkIds !== null} bulkItemIds={bulkIds ?? []}
        onClose={() => setBulkIds(null)}
        onSaved={() => setSelected(new Set())}
        notify={notify}
      />
    </>
  );
}
