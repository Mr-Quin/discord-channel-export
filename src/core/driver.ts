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
  initial: { oldestKey?: string; reachedStart: boolean };
  batchTimeoutMs?: number;
};

export const STEP_PX: [number, number] = [1800, 3200];

export async function runDriver(
  options: DriverOptions,
  deps: DriverDeps,
  signal: AbortSignal,
): Promise<StopReason> {
  const random = deps.random ?? Math.random;
  const state: DriveState = {
    loaded: 0,
    oldestKey: options.initial.oldestKey,
    reachedStart: options.initial.reachedStart,
    idleRounds: 0,
  };
  const report = () => deps.onProgress?.({ ...state });
  report();
  while (true) {
    if (signal.aborted) return "stopped";
    const reason = stopReason(state, options.rule, options.idleRounds);
    if (reason) return reason;
    const scroller = deps.page.findScroller();
    if (!scroller) return "noScroller";
    const [lo, hi] = STEP_PX;
    deps.page.loadOlder(scroller, Math.round(lo + (hi - lo) * random()));
    const batch = await deps.waitForBatch(
      options.conversationId,
      options.batchTimeoutMs ?? 4000,
      signal,
    );
    if (signal.aborted) return "stopped";
    if (batch) {
      state.loaded += batch.length;
      state.oldestKey = batch.stats.oldest?.sortKey;
      if (batch.reachedStart) state.reachedStart = true;
      state.idleRounds = 0;
    } else if (deps.page.atTop(scroller)) {
      state.idleRounds += 1;
    }
    report();
    await deps.sleep(pauseFor(options.speed, random), signal);
  }
}
