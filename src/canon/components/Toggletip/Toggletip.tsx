import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../../icons';
import type { IconName } from '../../icons';
import { Text } from '../../primitives';
import { cn } from '../../utils/cn';

/**
 * TOGGLETIP — a tooltip you click. A text-link trigger and a small, anchored,
 * NON-MODAL dialog of read-only detail: an invoice line's bins, batches and
 * serial numbers, a figure's breakdown, the rule behind a number.
 *
 * ── WHY NOT ONE OF THE THREE THAT EXIST ─────────────────────────────────────
 * · **Tooltip (hover)** — hover content cannot hold a table the user reads,
 *   scrolls or copies from, and touch has no hover at all. WCAG 1.4.13 also
 *   wants hover content dismissable and persistent, which is a toggletip.
 * · **Menu** — a list of COMMANDS with a roving focus model. This holds content,
 *   not actions; the arrow-key model would trap the reader inside a table.
 * · **Modal / SidePanel** — both take the page away. The answer here is a
 *   glance: the user reads it and carries on, with the form still live behind.
 *
 * ── THE TRIGGER ─────────────────────────────────────────────────────────────
 * Drawn as a link (`text/link`, `primary/text`, 5.92:1) but it is a <button>:
 * it opens something on this page, it does not navigate. `aria-expanded` and
 * `aria-controls` say what it does to a screen reader.
 *
 * ── THE PANEL ───────────────────────────────────────────────────────────────
 * `role="dialog"`, NOT `aria-modal`: no focus trap, no inert page. Focus moves
 * to the panel on open so it is announced, Esc and the close glyph return focus
 * to the trigger, and a pointerdown anywhere else closes it. It shares the
 * menu's paint (`surface/default`, `radius/lg`, `shadow/menu`) so two floating
 * panels never drift apart, and it places itself the way Menu does: below the
 * trigger, flipped above when there is no room, clamped 4px inside the viewport.
 */
export interface ToggletipProps {
  /** The trigger's text — "View Inventory Details". */
  label: string;
  /** The panel's heading. Also its accessible name. */
  title: string;
  /** A line under the title — what the detail belongs to. */
  subtitle?: string;
  /** The panel body. Read-only content; keep commands out of it. */
  children: ReactNode;
  /** Optional leading glyph on the trigger. */
  icon?: IconName;
  /**
   * Show the glyph alone; `label` becomes the trigger's accessible name. For a
   * field hint beside a form label, where a text trigger would read as a
   * second label. Needs `icon` — defaults to `info` when it is omitted.
   */
  iconOnly?: boolean;
  /** Which edge of the trigger the panel lines up with. */
  align?: 'start' | 'end';
  /** Controlled open state. Omit both to let the component own it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const GAP = 4;

export function Toggletip({
  label, title, subtitle, children, icon, iconOnly = false, align = 'end',
  open: openProp, onOpenChange, className,
}: ToggletipProps) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const setOpen = useCallback((next: boolean) => {
    if (openProp === undefined) setOwn(next);
    onOpenChange?.(next);
  }, [openProp, onOpenChange]);

  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  //  More content below the fold — draws the fade at the body's foot so a long
  //  list of bins or batches does not look like it ends at the panel's edge
  //  (macOS hides scrollbars until you scroll).
  const [more, setMore] = useState(false);
  const panelId = useId();
  const titleId = useId();

  //  Rendered at −9999 first, measured, then placed — the position cannot be
  //  known until the panel exists to be measured. Same as Menu.
  //
  //  The HEIGHT is placed too, not only the position. The panel's natural
  //  height is its header plus the body's full content, capped at
  //  `chrome/toggletip-h`; if that does not fit below the trigger it flips
  //  above, and if it fits on neither side it takes the roomier side and caps
  //  itself to the space there. The body is the only scroller, so the header
  //  and its close control never scroll away.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return undefined; }
    const place = (e?: Event) => {
      //  The panel's own body scrolling must not re-place the panel.
      if (e?.target instanceof Node && panel.current?.contains(e.target)) return;
      const t = trigger.current?.getBoundingClientRect();
      const p = panel.current;
      const b = body.current;
      if (!t || !p || !b) return;
      const cap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zf-chrome-toggletip-h')) || 320;
      const chrome = p.offsetHeight - b.clientHeight;
      const natural = Math.min(cap, chrome + b.scrollHeight);
      const w = p.offsetWidth;
      const below = t.bottom + GAP;
      const roomBelow = window.innerHeight - below - GAP;
      const roomAbove = t.top - 2 * GAP;
      const up = natural > roomBelow && (natural <= roomAbove || roomAbove > roomBelow);
      const maxHeight = Math.max(0, Math.min(natural, up ? roomAbove : roomBelow));
      const wanted = align === 'start' ? t.left : t.right - w;
      setPos({
        top: up ? t.top - GAP - maxHeight : below,
        left: Math.min(Math.max(GAP, wanted), Math.max(GAP, window.innerWidth - w - GAP)),
        maxHeight,
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, align]);

  const checkMore = () => {
    const b = body.current;
    if (b) setMore(b.scrollTop + b.clientHeight < b.scrollHeight - 1);
  };
  useLayoutEffect(() => { if (open && pos) checkMore(); }, [open, pos, children]);

  //  Focus follows the panel in once it has a position, so it is announced.
  useEffect(() => {
    if (open && pos) panel.current?.focus({ preventScroll: true });
  }, [open, pos]);

  //  Click-outside. `pointerdown`, so a press on another control closes this
  //  before that control acts, and the trigger is excluded so its own click
  //  can toggle rather than close-then-reopen.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (panel.current?.contains(n) || trigger.current?.contains(n)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, setOpen]);

  const close = () => { setOpen(false); trigger.current?.focus(); };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        aria-label={iconOnly ? label : undefined}
        onClick={() => setOpen(!open)}
        className={cn(
          'inline-flex items-center gap-2 p-0 m-0 border-0 bg-transparent cursor-pointer',
          'text-body-sm font-medium text-primary-text hover:underline',
          'rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
          className,
        )}
      >
        {icon || iconOnly ? <Icon name={icon ?? 'info'} size="sm" tone="inherit" /> : null}
        {iconOnly ? null : label}
      </button>

      {open ? (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
          style={pos ?? { top: -9999, left: -9999 }}
          className={cn(
            'fixed z-100 box-border w-toggletip max-w-full max-h-toggletip-h',
            'flex flex-col bg-surface-default text-text-default rounded-lg shadow-menu',
            'outline-none focus-visible:outline-2 focus-visible:outline-focus-ring',
            'animate-nav-flyout-in motion-reduce:animate-none',
          )}
        >
          <header className="flex flex-none items-start justify-between gap-6 ps-8 pe-4 pt-6 pb-4 border-b border-border-divider">
            <span className="flex flex-col gap-1 min-w-0">
              <Text as="h2" size="body" weight="semibold" id={titleId}>{title}</Text>
              {subtitle ? <Text size="body-sm" tone="secondary">{subtitle}</Text> : null}
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className={cn(
                'flex flex-none items-center justify-center size-button-sm p-0 border-0 rounded-sm cursor-pointer',
                'bg-transparent text-icon-muted hover:bg-surface-hover',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
              )}
            >
              <Icon name="close" size="sm" tone="inherit" />
            </button>
          </header>
          <div className="relative flex flex-col flex-1 min-h-0">
            {/* The ONE scroller. Focusable, so the keyboard can scroll it
                (axe: scrollable-region-focusable) — a long serial list must
                not be pointer-only. */}
            <div
              ref={body}
              tabIndex={0}
              aria-label={`${title}, scrollable`}
              onScroll={checkMore}
              className={cn(
                'flex-1 min-h-0 overflow-y-auto overscroll-contain px-8 py-6',
                'outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
              )}
            >
              {children}
            </div>
            {more ? (
              <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-lg bg-linear-to-t from-surface-default to-transparent" />
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
