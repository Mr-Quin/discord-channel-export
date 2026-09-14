import { PAUSE_MS, pauseFor, stopReason } from "../src/core/rules";

const base = { loaded: 0, reachedStart: false, idleRounds: 0 };

describe("stopReason", () => {
  it("keeps going with nothing to report", () => {
    expect(stopReason({ ...base, oldestKey: "9" }, { kind: "start" }, 6)).toBeNull();
  });
  it("stops at the start regardless of rule", () => {
    expect(stopReason({ ...base, reachedStart: true }, { kind: "count", max: 10 }, 6)).toBe(
      "start",
    );
  });
  it("stops when the oldest key reaches the floor", () => {
    const rule = { kind: "date", floorKey: "00000000000000000500", iso: "" } as const;
    expect(stopReason({ ...base, oldestKey: "00000000000000000501" }, rule, 6)).toBeNull();
    expect(stopReason({ ...base, oldestKey: "00000000000000000500" }, rule, 6)).toBe("target");
    expect(stopReason({ ...base, oldestKey: "00000000000000000001" }, rule, 6)).toBe("target");
  });
  it("caps on messages loaded this run", () => {
    const rule = { kind: "count", max: 100 } as const;
    expect(stopReason({ ...base, loaded: 90 }, rule, 6)).toBeNull();
    expect(stopReason({ ...base, loaded: 100 }, rule, 6)).toBe("cap");
  });
  it("goes idle only after the limit", () => {
    expect(stopReason({ ...base, idleRounds: 5 }, { kind: "start" }, 6)).toBeNull();
    expect(stopReason({ ...base, idleRounds: 6 }, { kind: "start" }, 6)).toBe("idle");
  });
});

describe("pauseFor", () => {
  it("stays inside the preset range", () => {
    for (const speed of ["slow", "normal", "fast"] as const) {
      const [lo, hi] = PAUSE_MS[speed];
      expect(pauseFor(speed, () => 0)).toBe(lo);
      expect(pauseFor(speed, () => 1)).toBe(hi);
    }
  });
});
