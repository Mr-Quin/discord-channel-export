// Service workers cannot mint object URLs and data URLs fall over on big files, so the
// text goes to an offscreen document in chunks, comes back as a blob URL, and is handed
// to the downloads API from here.

const CHUNK = 4 * 1024 * 1024;
const OFFSCREEN_URL = "/offscreen.html";

let creating: Promise<void> | undefined;

async function ensureOffscreen(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.BLOBS],
        justification: "Build the export file as a Blob for the downloads API",
      })
      .finally(() => {
        creating = undefined;
      });
  }
  await creating;
}

async function ask<T>(message: Record<string, unknown>): Promise<T> {
  const reply = (await chrome.runtime.sendMessage(message)) as T | { error: string } | undefined;
  if (reply && typeof reply === "object" && "error" in reply) throw new Error(reply.error);
  return reply as T;
}

export async function download(text: string, filename: string, mime: string): Promise<number> {
  await ensureOffscreen();
  const id = crypto.randomUUID();
  await ask({ type: "download-begin", id });
  for (let i = 0; i < text.length; i += CHUNK) {
    await ask({ type: "download-chunk", id, text: text.slice(i, i + CHUNK) });
  }
  const { url } = await ask<{ url: string }>({ type: "download-end", id, filename, mime });
  const downloadId = await chrome.downloads.download({
    url,
    filename,
    saveAs: false,
    conflictAction: "uniquify",
  });
  const onChanged = (delta: chrome.downloads.DownloadDelta) => {
    if (delta.id !== downloadId || !delta.state) return;
    if (delta.state.current === "complete" || delta.state.current === "interrupted") {
      chrome.downloads.onChanged.removeListener(onChanged);
      chrome.runtime.sendMessage({ type: "download-release", url }).catch(() => {});
    }
  };
  chrome.downloads.onChanged.addListener(onChanged);
  return downloadId;
}
