import { download } from "../core/download";
import type { ExportReply, ExportRequest, Request, StoreReply } from "../core/protocol";
import { loadSettings } from "../core/settings";
import {
  clearConversation,
  getStats,
  listConversations,
  markExported,
  putMessages,
  readMessages,
} from "../core/store";
import { outputById } from "../outputs";
import { renderFilename } from "../outputs/filename";

async function runExport(request: ExportRequest): Promise<ExportReply> {
  const output = outputById(request.output);
  if (!output) throw new Error(`unknown output ${request.output}`);
  const { conversation, range } = request;
  const [settings, stored] = await Promise.all([
    loadSettings(),
    getStats(conversation.source, conversation.id),
  ]);
  const merged = { ...stored, ...conversation, name: conversation.name ?? stored?.name };
  const messages = await readMessages(
    conversation.source,
    conversation.id,
    range,
    stored?.newestExported,
  );
  if (messages.length === 0) throw new Error("nothing to export in that range");
  const exportedAt = new Date();
  const text = output.serialize(messages, {
    conversation: merged,
    exportedAt,
    theme: settings.htmlTheme,
  });
  const filename = renderFilename(settings.filenameTemplate, merged, output.ext, exportedAt);
  await download(text, filename, output.mime);
  const newest = messages[messages.length - 1];
  if (newest) await markExported(conversation.source, conversation.id, newest.sortKey);
  return { filename, count: messages.length };
}

async function handle(request: Request): Promise<unknown> {
  switch (request.type) {
    case "store": {
      const reply: StoreReply = await putMessages(request.conversation, request.messages);
      return reply;
    }
    case "stats":
      return getStats(request.source, request.id);
    case "list":
      return listConversations();
    case "clear":
      await clearConversation(request.source, request.id);
      return null;
    case "export":
      return runExport(request.request);
    default:
      return undefined;
  }
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message: Request, _sender, sendResponse) => {
    if (typeof message !== "object" || !("type" in message)) return false;
    if (message.type.startsWith("download-") || message.type === "offscreen-ping") return false;
    handle(message).then(
      (result) => sendResponse(result ?? null),
      (err: unknown) => sendResponse({ error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  });
});
