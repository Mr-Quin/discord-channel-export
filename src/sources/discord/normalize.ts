import type { Attachment, Message } from "../../core/model";
import { sortKey } from "./snowflake";

type RawAuthor = {
  id?: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
};

type RawAttachment = {
  id?: string;
  filename?: string;
  size?: number;
  url?: string;
  content_type?: string;
};

type RawMessage = {
  id?: string;
  timestamp?: string;
  content?: string;
  author?: RawAuthor;
  attachments?: RawAttachment[];
};

export function avatarUrl(author: RawAuthor): string | undefined {
  if (!author.id) return undefined;
  if (!author.avatar) return undefined;
  const ext = author.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.${ext}`;
}

export function normalizeDiscordMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as RawMessage;
  if (typeof m.id !== "string" || !/^\d+$/.test(m.id)) return null;
  const author = m.author ?? {};
  const attachments: Attachment[] = (m.attachments ?? [])
    .filter((a) => a && typeof a.id === "string" && typeof a.url === "string")
    .map((a) => ({
      id: a.id as string,
      name: a.filename ?? "",
      size: typeof a.size === "number" ? a.size : undefined,
      url: a.url as string,
      contentType: a.content_type,
    }));
  return {
    id: m.id,
    sortKey: sortKey(m.id),
    timestamp: m.timestamp ?? "",
    author: {
      id: author.id ?? "",
      name: author.username ?? "",
      displayName: author.global_name ?? undefined,
      avatarUrl: avatarUrl(author),
    },
    content: m.content ?? "",
    attachments,
    raw,
  };
}
