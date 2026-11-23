import { Button, Icon, Inline, Stack, Surface, Text } from '@canon';
import { setGuideOpen, useGuide } from '../data/guide';
import type { GuideStep } from '../data/guide';

/**
 * GET STARTED — a floating card listing what this prototype can do, each with
 * a quick link to where you do it. Opened from the top bar's Get Started and
 * on a first visit; the ✕ closes it and the bar brings it back.
 *
 * Composed, not a component: a Surface card, a row of Surface segments for the
 * progress (one per step, filled once done), and Text rows. Each step ticks
 * itself when the thing is actually done — see `data/guide.ts`.
 */
export interface GuideCardProps {
  /** Runs a step's quick link — a route, or an action such as a simulation. */
  onRun: (step: GuideStep) => void;
}

export const GUIDE_STEPS: { id: GuideStep; title: string; text: string }[] = [
  { id: 'configure-item', title: 'Configure an item', text: 'Reorder level and order type' },
  { id: 'configure-bulk', title: 'Configure in bulk', text: 'Items list → ⋯ → Bulk Update' },
  { id: 'simulate', title: 'Simulate a replenishment', text: 'Stock falls below reorder level' },
  { id: 'view-pending', title: 'View pending replenishments', text: 'Waiting for an order' },
  { id: 'bulk-create', title: 'Bulk create orders', text: 'Tick two or more, Create Orders' },
  { id: 'constraints', title: 'Resolve an order constraint', text: 'MO over its maximum quantity' },
  { id: 'mo-lifecycle', title: 'Complete an MO', text: 'Confirm, then Complete' },
];

export function GuideCard({ onRun }: GuideCardProps) {
  const { done, open } = useGuide();
  if (!open) return null;
  const count = GUIDE_STEPS.filter((s) => done.includes(s.id)).length;

  //  320 × at most 320: the header and progress stay put, the steps scroll.
  //  A flex column so the list can take the remaining height and no more.
  return (
    <Surface
      tone="default" pad={0} radius="card" border="default" elevation="popover"
      className="fixed bottom-10 end-10 z-50 w-menu-max max-h-toggletip-h flex flex-col"
    >
      <Stack gap={4} className="px-8 pt-8 pb-6">
        <Inline gap={4} align="center" justify="between">
          <Text as="h2" weight="semibold">Get Started</Text>
          <Inline gap={4} align="center">
            <Text size="body-sm" weight="medium" tone={count === GUIDE_STEPS.length ? 'success' : 'secondary'}>
              {count}/{GUIDE_STEPS.length} done
            </Text>
            <Button emphasis="secondary" size="sm" icon="close" label="Close Get Started" onClick={() => setGuideOpen(false)} />
          </Inline>
        </Inline>
        {/* One segment per step, filled from the left by COUNT — steps can be
            done in any order, and a bar with gaps reads as broken. The count
            beside the title says the same thing in words. */}
        <Inline gap={1}>
          {GUIDE_STEPS.map((st, i) => (
            <Surface
              key={st.id} pad={0} radius="sm" className="flex-1 h-2"
              tone={i < count ? 'inverse' : 'sunken'}
              border={i < count ? 'none' : 'divider'}
            />
          ))}
        </Inline>
      </Stack>

      <Stack gap={5} className="flex-1 min-h-0 overflow-y-auto px-8 pb-8">
        {GUIDE_STEPS.map((s) => {
          const isDone = done.includes(s.id);
          return (
            <Inline key={s.id} gap={4} align="start">
              <Icon name="check-circle" size="md" tone={isDone ? 'success' : 'subtle'} label={isDone ? 'Done' : 'Not done yet'} />
              {/* align="start": a stretched <button> centres its label. */}
              <Stack gap={0} align="start">
                <Text as="button" tone="link" weight="medium" onClick={() => onRun(s.id)}>{s.title}</Text>
                <Text size="body-sm" tone="secondary">{s.text}</Text>
              </Stack>
            </Inline>
          );
        })}
      </Stack>
    </Surface>
  );
}
