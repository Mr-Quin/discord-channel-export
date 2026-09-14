import type { PageAdapter } from "../sources/types";
import type { StoredConversation } from "./model";
import {
  type DriveState,
  pauseFor,
  type Rule,
  type Speed,
  type StopReason,
  stopReason,
} from "./rules";

export type BatchEvent = {
  conversationId: string;
  length: number;
  reachedStart: boolean;
  // The oldest id in this batch, the frontier the client has paginated back to. This is
  // not the same as the oldest id in storage, which may include an older disjoint run.
  oldestKey?: string;
  stats: StoredConversation;
};

export type DriverDeps = {
  page: PageAdapter;
  waitForBatch(
    conversationId: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<BatchEvent | null>;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  random?: () => number;
  onProgress?: (state: DriveState) => void;
};

export type DriverOptions = {
  conversationId: string;
  rule: Rule;
  speed: Speed;
  idleRounds: number;
  initial: { reachedStart: boolean };
  batchTimeoutMs?: number;
};

export const STEP_PX: [number, number] = [1800, 3200];

// The list can be briefly absent or too short to scroll while the client re-renders,
// so a missing scroller is retried for a moment before the run gives up.
const SCROLLER_TRIES = 10;
const SCROLLER_RETRY_MS = 300;
const SETTLE_MS = 150;
const NEAR_TOP_MS = 300;

async function findScroller(deps: DriverDeps, signal: AbortSignal): Promise<HTMLElement | null> {
  for (let i = 0; i < SCROLLER_TRIES; i++) {
    const scroller = deps.page.findScroller();
    if (scroller) return scroller;
    if (signal.aborted) return null;
    await deps.sleep(SCROLLER_RETRY_MS, signal);
  }
  return null;
}

export async function runDriver(
  options: DriverOptions,
  deps: DriverDeps,
  signal: AbortSignal,
): Promise<StopReason> {
  const random = deps.random ?? Math.random;
  // oldestKey stays undefined until a batch loads this run. A date or since-export target
  // is only declared once a loaded batch actually reaches the floor, so a disjoint older
  // run already in storage cannot make the run stop before the gap above it is filled.
  const state: DriveState = {
    loaded: 0,
    reachedStart: options.initial.reachedStart,
    idleRounds: 0,
  };
  const report = () => deps.onProgress?.({ ...state });
  report();
  while (true) {
    if (signal.aborted) return "stopped";
    const reason = stopReason(state, options.rule, options.idleRounds);
    if (reason) return reason;
    const scroller = await findScroller(deps, signal);
    if (!scroller) return signal.aborted ? "stopped" : "noScroller";
    const [lo, hi] = STEP_PX;
    deps.page.loadOlder(scroller, Math.round(lo + (hi - lo) * random()));
    await deps.sleep(SETTLE_MS, signal);
    // The client only asks for more once the top is in view. Away from the top a batch
    // is unlikely, so the wait is short and the next step follows quickly.
    const wait = deps.page.atTop(scroller) ? (options.batchTimeoutMs ?? 4000) : NEAR_TOP_MS;
    const batch = await deps.waitForBatch(options.conversationId, wait, signal);
    if (signal.aborted) return "stopped";
    if (batch) {
      state.loaded += batch.length;
      if (batch.oldestKey && (state.oldestKey === undefined || batch.oldestKey < state.oldestKey)) {
        state.oldestKey = batch.oldestKey;
      }
      if (batch.reachedStart) state.reachedStart = true;
      state.idleRounds = 0;
    } else if (deps.page.atTop(scroller)) {
      state.idleRounds += 1;
    }
    report();
    await deps.sleep(pauseFor(options.speed, random), signal);
  }
}
