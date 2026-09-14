import { reachedStart } from "../src/core/capture";
import { matchMessagesUrl, parseMessagesBody } from "../src/sources/discord/matcher";
import { normalizeDiscordMessage } from "../src/sources/discord/normalize";
import { conversationFromPage, parseTitle } from "../src/sources/discord/page";
import { dateOf, idFromSortKey, snowflakeAt, sortKey } from "../src/sources/discord/snowflake";

describe("matchMessagesUrl", () => {
  it("matches the initial load", () => {
    expect(
      matchMessagesUrl("GET", "https://discord.com/api/v9/channels/123/messages?limit=50"),
    ).toEqual({
      conversationId: "123",
      kind: "latest",
      limit: 50,
    });
  });
  it("reads before, after, around and limit", () => {
    const u = (q: string) => `https://discord.com/api/v9/channels/1/messages?${q}`;
    expect(matchMessagesUrl("GET", u("before=9&limit=10"))).toMatchObject({
      kind: "before",
      limit: 10,
    });
    expect(matchMessagesUrl("GET", u("after=9&limit=20"))).toMatchObject({
      kind: "after",
      limit: 20,
    });
    expect(matchMessagesUrl("GET", u("around=9"))).toMatchObject({ kind: "around", limit: 50 });
  });
  it("ignores other methods and paths", () => {
    const base = "https://discord.com/api/v9";
    expect(matchMessagesUrl("POST", `${base}/channels/1/messages`)).toBeNull();
    expect(matchMessagesUrl("GET", `${base}/channels/1/messages/5/reactions`)).toBeNull();
    expect(matchMessagesUrl("GET", `${base}/channels/1/messages/search?content=x`)).toBeNull();
    expect(matchMessagesUrl("GET", `${base}/guilds/1/messages/search`)).toBeNull();
    expect(matchMessagesUrl("GET", "not a url")).toBeNull();
  });
});

describe("parseMessagesBody", () => {
  it("accepts an array of messages as text or object", () => {
    expect(parseMessagesBody('[{"id":"1"}]')).toEqual([{ id: "1" }]);
    expect(parseMessagesBody([{ id: "1" }])).toEqual([{ id: "1" }]);
    expect(parseMessagesBody("[]")).toEqual([]);
  });
  it("rejects anything else", () => {
    expect(parseMessagesBody('{"id":"1"}')).toBeNull();
    expect(parseMessagesBody("[1,2]")).toBeNull();
    expect(() => parseMessagesBody("nope")).toThrow();
  });
});

describe("reachedStart", () => {
  it("only trusts short batches for before and latest", () => {
    expect(reachedStart({ conversationId: "1", kind: "before", limit: 50 }, 12)).toBe(true);
    expect(reachedStart({ conversationId: "1", kind: "latest", limit: 50 }, 12)).toBe(true);
    expect(reachedStart({ conversationId: "1", kind: "before", limit: 50 }, 50)).toBe(false);
    expect(reachedStart({ conversationId: "1", kind: "after", limit: 50 }, 3)).toBe(false);
    expect(reachedStart({ conversationId: "1", kind: "around", limit: 50 }, 3)).toBe(false);
  });
});

describe("snowflake", () => {
  it("round-trips through the sort key and orders as text", () => {
    const a = "1533082047877222600";
    const b = "999";
    expect(idFromSortKey(sortKey(a))).toBe(a);
    expect(sortKey(b) < sortKey(a)).toBe(true);
    expect(b < a).toBe(false);
  });
  it("decodes the time and builds a floor", () => {
    const id = "1533082047877222600";
    const at = dateOf(id);
    expect(at.toISOString()).toBe("2026-08-01T12:00:43.501Z");
    expect(snowflakeAt(at) <= BigInt(id)).toBe(true);
    expect(snowflakeAt(new Date(at.getTime() + 1)) > BigInt(id)).toBe(true);
    expect(snowflakeAt(new Date(0))).toBe(0n);
  });
});

describe("normalizeDiscordMessage", () => {
  const raw = {
    id: "1533082047877222600",
    timestamp: "2026-08-01T12:00:43.501000+00:00",
    content: "hi",
    author: { id: "7", username: "u", global_name: "U", avatar: "a_hash" },
    attachments: [
      {
        id: "9",
        filename: "f.rar",
        size: 3,
        url: "https://x/f.rar",
        content_type: "application/vnd.rar",
      },
    ],
  };
  it("maps the fields and keeps raw", () => {
    const m = normalizeDiscordMessage(raw);
    expect(m).toMatchObject({
      id: raw.id,
      sortKey: "01533082047877222600",
      content: "hi",
      author: {
        id: "7",
        name: "u",
        displayName: "U",
        avatarUrl: "https://cdn.discordapp.com/avatars/7/a_hash.gif",
      },
      attachments: [
        {
          id: "9",
          name: "f.rar",
          size: 3,
          url: "https://x/f.rar",
          contentType: "application/vnd.rar",
        },
      ],
    });
    expect(m?.raw).toBe(raw);
  });
  it("tolerates missing pieces and rejects junk", () => {
    expect(normalizeDiscordMessage({ id: "5" })).toMatchObject({
      content: "",
      attachments: [],
      author: { name: "" },
    });
    expect(normalizeDiscordMessage({ id: 5 })).toBeNull();
    expect(normalizeDiscordMessage(null)).toBeNull();
  });
});

describe("conversationFromPage", () => {
  it("reads guild channels and DMs", () => {
    expect(
      conversationFromPage("https://discord.com/channels/11/22?x", "Discord | #gen | Srv"),
    ).toEqual({
      source: "discord",
      id: "22",
      url: "https://discord.com/channels/11/22",
      name: "gen",
      groupId: "11",
      groupName: "Srv",
    });
    expect(
      conversationFromPage("https://discord.com/channels/@me/33", "(2) Discord | @pal"),
    ).toMatchObject({
      id: "33",
      name: "pal",
      groupId: undefined,
    });
    expect(conversationFromPage("https://discord.com/channels/@me", "Discord")).toBeNull();
  });
  it("leaves names unset for unknown titles", () => {
    expect(parseTitle("Something else")).toEqual({});
  });
});
