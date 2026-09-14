export type Rule =
  | { kind: "start" }
  | { kind: "count"; max: number }
  | { kind: "date"; floorKey: string; iso: string }
  | { kind: "sinceExport"; floorKey: string };

export type StopReason =
  | "target"
  | "start"
  | "cap"
  | "idle"
  | "stopped"
  | "navigated"
  | "noScroller";

export type DriveState = {
  loaded: number;
  oldestKey?: string;
  reachedStart: boolean;
  idleRounds: number;
};

export function stopReason(state: DriveState, rule: Rule, idleLimit: number): StopReason | null {
  if (state.reachedStart) return "start";
  if (rule.kind === "date" || rule.kind === "sinceExport") {
    if (state.oldestKey !== undefined && state.oldestKey <= rule.floorKey) return "target";
  }
  if (rule.kind === "count" && state.loaded >= rule.max) return "cap";
  if (state.idleRounds >= idleLimit) return "idle";
  return null;
}

export function describeStop(reason: StopReason): string {
  switch (reason) {
    case "target":
      return "reached the target";
    case "start":
      return "reached the start of the channel";
    case "cap":
      return "loaded the requested number of messages";
    case "idle":
      return "nothing more loaded";
    case "stopped":
      return "stopped";
    case "navigated":
      return "left the channel";
    case "noScroller":
      return "message list not found";
  }
}

export type Speed = "slow" | "normal" | "fast";

export const PAUSE_MS: Record<Speed, [number, number]> = {
  slow: [1500, 3000],
  normal: [700, 1800],
  fast: [300, 800],
};

export function pauseFor(speed: Speed, rand: () => number = Math.random): number {
  const [lo, hi] = PAUSE_MS[speed];
  return Math.round(lo + (hi - lo) * rand());
}
