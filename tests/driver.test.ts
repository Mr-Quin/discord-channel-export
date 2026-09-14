import { type BatchEvent, type DriverDeps, runDriver } from "../src/core/driver";
import type { StoredConversation } from "../src/core/model";
import type { PageAdapter } from "../src/sources/types";

const stats = (oldest: string, count = 0): StoredConversation => ({
  source: "discord",
  id: "c",
  count,
  oldest: { sortKey: oldest, timestamp: "" },
});

function fakeDeps(script: (BatchEvent | null)[], scrollTop = 100) {
  const scroller = { scrollTop } as HTMLElement;
  const page: PageAdapter = {
    findScroller: () => scroller,
    loadOlder: (el, step) => {
      el.scrollTop = Math.max(0, el.scrollTop - step);
    },
    atTop: (el) => el.scrollTop <= 0,
  };
  let i = 0;
  const deps: DriverDeps = {
    page,
    waitForBatch: async () => script[i++] ?? null,
    sleep: async () => {},
    random: () => 0,
  };
  return { deps, scroller };
}

const key = (n: number) => String(n).padStart(20, "0");
const batch = (oldest: number, length = 50, reachedStart = false): BatchEvent => ({
  conversationId: "c",
  length,
  reachedStart,
  stats: stats(key(oldest)),
});

const base = {
  conversationId: "c",
  speed: "fast" as const,
  idleRounds: 3,
  initial: { reachedStart: false },
};
const ctl = () => new AbortController();

describe("runDriver", () => {
  it("stops at the date floor", async () => {
    const { deps } = fakeDeps([batch(900), batch(700), batch(400)]);
    const rule = { kind: "date", floorKey: key(500), iso: "" } as const;
    await expect(runDriver({ ...base, rule }, deps, ctl().signal)).resolves.toBe("target");
  });

  it("stops at the start", async () => {
    const { deps } = fakeDeps([batch(900), batch(700, 12, true)]);
    await expect(runDriver({ ...base, rule: { kind: "start" } }, deps, ctl().signal)).resolves.toBe(
      "start",
    );
  });

  it("caps on loaded messages", async () => {
    const { deps } = fakeDeps([batch(900), batch(800), batch(700)]);
    await expect(
      runDriver({ ...base, rule: { kind: "count", max: 100 } }, deps, ctl().signal),
    ).resolves.toBe("cap");
  });

  it("counts idle only at the top", async () => {
    const { deps, scroller } = fakeDeps([null, null, null, null, null, null], 5000);
    const progress: number[] = [];
    deps.onProgress = (s) => progress.push(s.idleRounds);
    await expect(runDriver({ ...base, rule: { kind: "start" } }, deps, ctl().signal)).resolves.toBe(
      "idle",
    );
    expect(scroller.scrollTop).toBe(0);
    expect(progress).toEqual([0, 0, 0, 1, 2, 3]);
  });

  it("honours the abort signal and a missing scroller", async () => {
    const c = ctl();
    const { deps } = fakeDeps([batch(900)]);
    deps.waitForBatch = async () => {
      c.abort();
      return null;
    };
    await expect(runDriver({ ...base, rule: { kind: "start" } }, deps, c.signal)).resolves.toBe(
      "stopped",
    );
    const none = fakeDeps([]);
    none.deps.page.findScroller = () => null;
    await expect(
      runDriver({ ...base, rule: { kind: "start" } }, none.deps, ctl().signal),
    ).resolves.toBe("noScroller");
  });

  it("does not report a date target already satisfied by what the store holds", async () => {
    const { deps } = fakeDeps([]);
    const rule = { kind: "date", floorKey: key(500), iso: "" } as const;
    const options = { ...base, rule, initial: { oldestKey: key(100), reachedStart: false } };
    await expect(runDriver(options, deps, ctl().signal)).resolves.toBe("target");
  });
});
