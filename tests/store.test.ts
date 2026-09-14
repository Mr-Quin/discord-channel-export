import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import type { Message } from "../src/core/model";
import {
  clearConversation,
  getStats,
  listConversations,
  markExported,
  putMessages,
  readMessages,
  resetDbForTests,
} from "../src/core/store";

const conv = { source: "discord", id: "c1", url: "u", name: "one" };
const m = (n: number): Message => ({
  id: String(n),
  sortKey: String(n).padStart(20, "0"),
  timestamp: new Date(n * 1000).toISOString(),
  author: { id: "a", name: "a" },
  content: `m${n}`,
  attachments: [],
  raw: { id: String(n) },
});

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe("store", () => {
  it("dedupes and tracks stats", async () => {
    const first = await putMessages(conv, [m(3), m(1), m(2)]);
    expect(first.added).toBe(3);
    expect(first.stats).toMatchObject({
      count: 3,
      oldest: { sortKey: m(1).sortKey },
      newest: { sortKey: m(3).sortKey },
    });
    const second = await putMessages(conv, [m(2), m(4)]);
    expect(second.added).toBe(1);
    expect(second.stats.count).toBe(4);
    expect((await getStats("discord", "c1"))?.newest?.sortKey).toBe(m(4).sortKey);
  });

  it("keeps the last known name when a later batch has none", async () => {
    await putMessages(conv, [m(1)]);
    await putMessages({ ...conv, name: undefined }, [m(2)]);
    expect((await getStats("discord", "c1"))?.name).toBe("one");
  });

  it("reads ranges oldest first", async () => {
    await putMessages(conv, [5, 3, 1, 4, 2].map(m));
    const ids = async (range: Parameters<typeof readMessages>[2], exported?: string) =>
      (await readMessages("discord", "c1", range, exported)).map((x) => x.id);
    expect(await ids({ kind: "all" })).toEqual(["1", "2", "3", "4", "5"]);
    expect(await ids({ kind: "newest", count: 2 })).toEqual(["4", "5"]);
    expect(await ids({ kind: "between", fromKey: m(2).sortKey, toKey: m(4).sortKey })).toEqual([
      "2",
      "3",
      "4",
    ]);
    expect(await ids({ kind: "sinceExport" }, m(3).sortKey)).toEqual(["4", "5"]);
    expect(await ids({ kind: "sinceExport" })).toEqual(["1", "2", "3", "4", "5"]);
  });

  it("marks exports monotonically and clears", async () => {
    await putMessages(conv, [m(1), m(2)]);
    await markExported("discord", "c1", m(2).sortKey);
    await markExported("discord", "c1", m(1).sortKey);
    expect((await getStats("discord", "c1"))?.newestExported).toBe(m(2).sortKey);
    expect((await listConversations()).map((c) => c.id)).toEqual(["c1"]);
    await clearConversation("discord", "c1");
    expect(await getStats("discord", "c1")).toBeUndefined();
    expect(await readMessages("discord", "c1", { kind: "all" })).toEqual([]);
  });
});
