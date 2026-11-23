import { useSyncExternalStore } from 'react';

/**
 * GET STARTED — which of the prototype's flows this viewer has tried. Kept
 * apart from the replenishment data on purpose: resetting the demo data should
 * not forget what you have already explored, and the guide is a viewer's
 * convenience, not part of the ERP.
 *
 * A step is marked done by DOING it — saving a config, creating orders,
 * completing an MO — never by clicking its link. A link only takes you there.
 */
export type GuideStep =
  | 'configure-item' | 'configure-bulk' | 'simulate' | 'view-pending'
  | 'bulk-create' | 'constraints' | 'mo-lifecycle';

interface GuideState { done: GuideStep[]; open: boolean }

const KEY = 'mo-replenishment-guide-v1';

function load(): GuideState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as GuideState;
  } catch { /* private mode, blocked storage */ }
  //  Open on a first visit, so a new viewer sees what the prototype can do.
  return { done: [], open: true };
}

let state: GuideState = load();
const listeners = new Set<() => void>();

function commit(next: GuideState) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function useGuide(): GuideState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => state,
  );
}

export function markGuide(step: GuideStep) {
  if (!state.done.includes(step)) commit({ ...state, done: [...state.done, step] });
}

export function setGuideOpen(open: boolean) {
  if (state.open !== open) commit({ ...state, open });
}

export function resetGuide() { commit({ done: [], open: true }); }
