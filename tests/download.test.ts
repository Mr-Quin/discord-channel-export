import { chunkEnd, waitForDownload } from "../src/core/download";

type Delta = { id: number; state?: { current: string } };

function fakeDownloads(searchState?: string) {
  const listeners: ((d: Delta) => void)[] = [];
  const chrome = {
    downloads: {
      onChanged: {
        addListener: (fn: (d: Delta) => void) => listeners.push(fn),
        removeListener: (fn: (d: Delta) => void) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
      search: async () => (searchState ? [{ state: searchState }] : [{}]),
    },
  };
  (globalThis as { chrome?: unknown }).chrome = chrome;
  const emit = (d: Delta) => {
    for (const fn of [...listeners]) fn(d);
  };
  return { emit, count: () => listeners.length };
}

describe("waitForDownload", () => {
  it("resolves when the download completes", async () => {
    const dl = fakeDownloads();
    const p = waitForDownload(7);
    dl.emit({ id: 7, state: { current: "complete" } });
    await expect(p).resolves.toBeUndefined();
    expect(dl.count()).toBe(0);
  });

  it("rejects when the download is interrupted", async () => {
    const dl = fakeDownloads();
    const p = waitForDownload(7);
    dl.emit({ id: 9, state: { current: "complete" } }); // another download, ignored
    dl.emit({ id: 7, state: { current: "interrupted" } });
    await expect(p).rejects.toThrow("interrupted");
    expect(dl.count()).toBe(0);
  });

  it("settles from the current state when it finished before the listener attached", async () => {
    fakeDownloads("complete");
    await expect(waitForDownload(7)).resolves.toBeUndefined();
  });
});

function chunks(text: string, size: number): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = chunkEnd(text, i, size);
    if (end <= i) throw new Error("no progress");
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

function splitsAPair(parts: string[]): boolean {
  for (const part of parts) {
    if (!part) continue;
    const last = part.charCodeAt(part.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) return true;
    const first = part.charCodeAt(0);
    if (first >= 0xdc00 && first <= 0xdfff) return true;
  }
  return false;
}

describe("chunkEnd", () => {
  const text = `${"😀".repeat(8)}plain ascii ${"🎉".repeat(3)}x`;

  it("never ends a chunk between a surrogate pair, for any size", () => {
    for (const size of [1, 2, 3, 4, 5, 7, 16]) {
      const parts = chunks(text, size);
      expect(parts.join("")).toBe(text);
      expect(splitsAPair(parts)).toBe(false);
    }
  });

  it("includes the whole pair when the size is one and the cut lands on it", () => {
    const s = "😀x"; // high, low, x
    expect(chunkEnd(s, 0, 1)).toBe(2);
    expect(chunkEnd(s, 2, 1)).toBe(3);
  });

  it("reassembles as bytes without replacement characters", () => {
    // Blob would UTF-8 each chunk on its own; a mid-pair split becomes U+FFFD.
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const joined = chunks(text, 3)
      .map((p) => enc.encode(p))
      .reduce((acc, b) => {
        const out = new Uint8Array(acc.length + b.length);
        out.set(acc);
        out.set(b, acc.length);
        return out;
      }, new Uint8Array());
    expect(dec.decode(joined)).toBe(text);
    expect(dec.decode(joined)).not.toContain("�");
  });
});
