import type { Conversation, Message, StoredConversation } from "./model";

export type OutputId = "json" | "html" | "csv";

export type ExportRange =
  | { kind: "all" }
  | { kind: "newest"; count: number }
  | { kind: "between"; fromKey?: string; toKey?: string }
  | { kind: "sinceExport" };

export type ExportRequest = {
  conversation: Conversation;
  output: OutputId;
  range: ExportRange;
};

export type Request =
  | { type: "store"; conversation: Conversation; messages: Message[] }
  | { type: "stats"; source: string; id: string }
  | { type: "list" }
  | { type: "clear"; source: string; id: string }
  | { type: "export"; request: ExportRequest }
  | { type: "download-begin"; id: string }
  | { type: "download-chunk"; id: string; text: string }
  | { type: "download-end"; id: string; filename: string; mime: string }
  | { type: "offscreen-ping" };

export type StoreReply = { added: number; stats: StoredConversation };
export type ExportReply = { filename: string; count: number };

export async function send<T>(request: Request): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(request)) as T | { error: string };
  if (reply && typeof reply === "object" && "error" in reply && typeof reply.error === "string") {
    throw new Error(reply.error);
  }
  return reply as T;
}
