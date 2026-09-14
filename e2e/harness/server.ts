// A stand-in for the Discord web app: the same list element, the same paging
// endpoint, deterministic fake messages. The channel id doubles as the channel
// size so a spec can pick how much history there is.

import { readFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DISCORD_EPOCH_MS = 1420070400000n;
const AUTHORS = [
  { id: "1001", username: "alice", global_name: "Alice", avatar: null },
  { id: "1002", username: "bob", global_name: "Bob", avatar: null },
  { id: "1003", username: "carol", global_name: null, avatar: null },
];

function snowflake(ms: number): string {
  return ((BigInt(ms) - DISCORD_EPOCH_MS) << 22n).toString();
}

// Message n of a channel is posted n hours before a fixed "now", so ids and
// timestamps are stable across runs and specs can compute dates.
export const HARNESS_NOW = Date.UTC(2026, 8, 13, 12, 0, 0);

export function messageAt(channelId: string, n: number) {
  const ms = HARNESS_NOW - n * 3600 * 1000;
  const author = AUTHORS[n % AUTHORS.length];
  return {
    type: 0,
    id: snowflake(ms),
    channel_id: channelId,
    timestamp: new Date(ms).toISOString(),
    edited_timestamp: n % 17 === 0 ? new Date(ms + 60000).toISOString() : null,
    content:
      n % 5 === 0
        ? `message ${n} with **bold** and \`code\` and ||secret|| <@1002> https://example.com/${n}`
        : `message ${n}`,
    author,
    mentions: n % 5 === 0 ? [AUTHORS[1]] : [],
    mention_roles: [],
    referenced_message:
      n % 13 === 1 ? { content: `parent of ${n}`, author: AUTHORS[0] } : undefined,
    attachments:
      n % 7 === 0
        ? [
            {
              id: snowflake(ms + 1),
              filename: `file-${n}.png`,
              size: 1000 + n,
              url: `http://127.0.0.1/cdn/${n}.png?ex=1`,
              content_type: "image/png",
            },
          ]
        : [],
    embeds:
      n % 11 === 0
        ? [{ type: "rich", title: `Embed ${n}`, description: "desc", url: "https://example.com" }]
        : [],
    reactions: n % 3 === 0 ? [{ emoji: { id: null, name: "👍" }, count: 2 }] : [],
    pinned: false,
    mention_everyone: false,
    tts: false,
    flags: 0,
    components: [],
  };
}

export function channelSize(channelId: string): number {
  const n = Number(channelId);
  return Number.isFinite(n) && n > 0 && n <= 100000 ? n : 50;
}

function messages(channelId: string, before: string | null, limit: number) {
  const size = channelSize(channelId);
  const out = [];
  for (let n = 0; n < size && out.length < limit; n++) {
    const m = messageAt(channelId, n);
    if (before && BigInt(m.id) >= BigInt(before)) continue;
    out.push(m);
  }
  return out;
}

export type Harness = { server: http.Server; port: number; origin: string };

export function startHarness(port = 0): Promise<Harness> {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const api = /^\/api\/v9\/channels\/(\d+)\/messages$/.exec(url.pathname);
    if (api?.[1]) {
      const body = messages(
        api[1],
        url.searchParams.get("before"),
        Number(url.searchParams.get("limit") ?? 50),
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    if (/^\/channels\/(@me|\d+)\/(\d+)/.test(url.pathname)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(await readFile(join(here, "page.html"), "utf8"));
      return;
    }
    if (url.pathname === "/page.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      res.end(await readFile(join(here, "page.js"), "utf8"));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actual = (server.address() as AddressInfo).port;
      resolve({ server, port: actual, origin: `http://127.0.0.1:${actual}` });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { origin } = await startHarness(Number(process.env.PORT ?? 8787));
  console.log(`harness at ${origin}/channels/1/300`);
}
