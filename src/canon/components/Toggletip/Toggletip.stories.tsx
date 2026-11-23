import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toggletip } from './Toggletip';
import { Divider } from '../Divider/Divider';
import { Inline, Stack, Text } from '../../primitives';

/**
 * A tooltip you click: a link-styled trigger and an anchored, non-modal dialog
 * of read-only detail. Esc or the close glyph returns focus to the trigger; a
 * press anywhere else closes it. Review in all four pane × hue combinations —
 * the panel paints on `surface/default` with `shadow/menu`, like Menu.
 */
const meta = {
  title: 'Components/Toggletip', component: Toggletip,
  parameters: { layout: 'centered' },
  args: {
    label: 'View Inventory Details',
    title: 'Bin & batch details',
    subtitle: 'a Product - 2 · 3 lb · Warehouse 1',
    children: null,
  },
} satisfies Meta<typeof Toggletip>;
export default meta;
type Story = StoryObj<typeof meta>;

const Row = ({ a, b, c }: { a: string; b: string; c: string }) => (
  <Inline gap={6} justify="between">
    <Text size="body-sm">{a}</Text>
    <Text size="body-sm" tone="secondary">{b}</Text>
    <Text size="body-sm" weight="medium">{c}</Text>
  </Inline>
);

const Body = () => (
  <Stack gap={4}>
    <Text size="caption" tone="secondary" weight="semibold">BATCHES</Text>
    <Row a="BT-2026-031" b="Bin A-01-02" c="2.00 lb" />
    <Row a="BT-2026-044" b="Bin A-01-03" c="1.00 lb" />
    <Divider />
    <Text size="caption" tone="secondary" weight="semibold">SERIAL NUMBERS</Text>
    <Text size="body-sm">SN-88201, SN-88202, SN-88203</Text>
  </Stack>
);

export const Default: Story = { args: { children: <Body /> } };

/** Opened — the state a reviewer actually needs to see. */
export const Open: Story = { args: { children: <Body />, open: true } };

/** Lines up with the trigger's leading edge rather than its trailing one. */
export const AlignStart: Story = { args: { children: <Body />, align: 'start', icon: 'info' } };

/** Glyph only — `label` becomes the accessible name. The form-row hint. */
export const IconOnly: Story = { args: { children: <Body />, iconOnly: true, align: 'start' } };

/** Long content scrolls inside the panel; the page does not move. */
export const Scrolling: Story = {
  args: {
    open: true,
    children: (
      <Stack gap={4}>
        {Array.from({ length: 24 }, (_, i) => (
          <Row key={i} a={`SN-${88200 + i}`} b={`Bin B-0${(i % 4) + 1}-01`} c="1.00 lb" />
        ))}
      </Stack>
    ),
  },
};
