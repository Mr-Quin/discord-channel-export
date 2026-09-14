import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Controller } from "../src/page/controller";
import type { Source } from "../src/sources/types";

// A page whose scroller is always at the top and never yields a batch, so a run only ends
// by being stopped or going idle. Enough to exercise the controller's run lifecycle.
const source = {
  id: "discord",
  label: "Discord",
  matches: [],
  matcher: { match: () => null, parse: () => null },
  normalize: () => null,
  conversationFromPage: () => null,
  sortKeyForDate: () => "0",
  dateForSortKey: () => new Date(0),
  page: {
    findScroller: () => ({ scrollTop: 0 }) as unknown as HTMLElement,
    loadOlder: () => {},
    atTop: () => true,
  },
} as unknown as Source;

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { chrome?: unknown }).chrome = {
    runtime: { sendMessage: async () => null },
    storage: {
      sync: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Controller run lifecycle", () => {
  it("a stopped run that finishes late does not clear a newer run's progress", async () => {
    const c = new Controller(source);
    await c.setConversation({ source: "discord", id: "c1", url: "u" });

    const first = c.run({ kind: "count", max: 1_000_000 });
    expect(c.getSnapshot().running).toBeDefined();

    c.stop();
    const second = c.run({ kind: "count", max: 1_000_000 });
    expect(c.getSnapshot().running).toBeDefined();

    // Let the first run observe the abort and reach its cleanup while the second run owns
    // the panel. The second run's progress must survive the first run finishing.
    await vi.advanceTimersByTimeAsync(6000);
    expect(c.getSnapshot().running).toBeDefined();

    c.stop();
    await vi.advanceTimersByTimeAsync(60000);
    await Promise.all([first, second]);
    expect(c.getSnapshot().running).toBeUndefined();
    expect(c.getSnapshot().lastStop?.reason).toBe("stopped");
  });
});
