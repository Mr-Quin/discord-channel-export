import type { Conversation } from "../core/model";

export function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function sanitize(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  return cleaned.slice(0, 80) || "untitled";
}

export function renderFilename(
  template: string,
  conversation: Conversation,
  ext: string,
  date: Date,
): string {
  const values: Record<string, string> = {
    name: sanitize(conversation.name ?? conversation.id),
    id: conversation.id,
    group: sanitize(conversation.groupName ?? conversation.groupId ?? ""),
    groupId: conversation.groupId ?? "",
    source: conversation.source,
    stamp: stamp(date),
    ext,
  };
  const out = template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
  const safe = out
    .split("/")
    .map((part) => sanitize(part))
    .join("/");
  return safe.endsWith(`.${ext}`) ? safe : `${safe}.${ext}`;
}
