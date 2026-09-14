import type { CaptureMatcher, CaptureRequest } from "../../core/capture";

const MESSAGES_PATH = /^\/api\/v\d+\/channels\/(\d+)\/messages\/?$/;

export function matchMessagesUrl(method: string, url: string): CaptureRequest | null {
  if (method !== "GET") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const m = MESSAGES_PATH.exec(parsed.pathname);
  if (!m?.[1]) return null;
  const q = parsed.searchParams;
  const limit = Number.parseInt(q.get("limit") ?? "50", 10);
  const kind = q.has("before")
    ? "before"
    : q.has("after")
      ? "after"
      : q.has("around")
        ? "around"
        : "latest";
  return { conversationId: m[1], kind, limit: Number.isFinite(limit) ? limit : 50 };
}

export function parseMessagesBody(body: unknown): unknown[] | null {
  const data = typeof body === "string" ? JSON.parse(body) : body;
  if (!Array.isArray(data)) return null;
  if (data.length && !(typeof data[0] === "object" && data[0] && "id" in data[0])) return null;
  return data;
}

export const discordMatcher: CaptureMatcher = {
  match: matchMessagesUrl,
  parse: parseMessagesBody,
};
