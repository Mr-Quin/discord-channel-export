const parts = new Map<string, string[]>();

type Msg =
  | { type: "download-begin"; id: string }
  | { type: "download-chunk"; id: string; text: string }
  | { type: "download-end"; id: string; filename: string; mime: string }
  | { type: "download-release"; url: string }
  | { type: "offscreen-ping" };

chrome.runtime.onMessage.addListener((message: Msg, _sender, sendResponse) => {
  switch (message.type) {
    case "offscreen-ping":
      sendResponse({ ok: true });
      return false;
    case "download-begin":
      parts.set(message.id, []);
      sendResponse({ ok: true });
      return false;
    case "download-chunk": {
      const list = parts.get(message.id);
      if (!list) {
        sendResponse({ error: "unknown download id" });
        return false;
      }
      list.push(message.text);
      sendResponse({ ok: true });
      return false;
    }
    case "download-end": {
      const list = parts.get(message.id);
      parts.delete(message.id);
      if (!list) {
        sendResponse({ error: "unknown download id" });
        return false;
      }
      const blob = new Blob(list, { type: message.mime });
      sendResponse({ url: URL.createObjectURL(blob) });
      return false;
    }
    case "download-release":
      URL.revokeObjectURL(message.url);
      return false;
    default:
      return false;
  }
});
