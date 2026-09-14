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

// Each chunk is UTF-8 encoded on its own in the offscreen document, so a split across a
// UTF-16 surrogate pair would turn one emoji into two replacement characters. The cut is
// pulled back one unit whenever it would land between a pair's high and low half.
export function chunkEnd(text: string, start: number, size: number): number {
  const end = Math.min(start + size, text.length);
  if (end < text.length) {
    const code = text.charCodeAt(end - 1);
    if (code >= 0xd800 && code <= 0xdbff) {
      // The cut is between this high surrogate and its low half. Pull it back before the
      // pair, or, when that would make no progress, include the whole pair instead.
      return end - 1 > start ? end - 1 : Math.min(start + 2, text.length);
    }
  }
  return end;
}

export function waitForDownload(downloadId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const settle = (state: string | undefined) => {
      if (state === "complete") {
        cleanup();
        resolve();
      } else if (state === "interrupted") {
        cleanup();
        reject(new Error("download interrupted"));
      }
    };
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id === downloadId) settle(delta.state?.current);
    };
    const cleanup = () => chrome.downloads.onChanged.removeListener(onChanged);
    chrome.downloads.onChanged.addListener(onChanged);
    // The download can finish before the listener attaches, so check the current state too.
    chrome.downloads.search({ id: downloadId }).then((items) => settle(items[0]?.state));
  });
}

export async function download(text: string, filename: string, mime: string): Promise<number> {
  await ensureOffscreen();
  const id = crypto.randomUUID();
  await ask({ type: "download-begin", id });
  for (let i = 0; i < text.length; ) {
    const end = chunkEnd(text, i, CHUNK);
    await ask({ type: "download-chunk", id, text: text.slice(i, end) });
    i = end;
  }
  const { url } = await ask<{ url: string }>({ type: "download-end", id, filename, mime });
  try {
    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: "uniquify",
    });
    // The checkpoint that export advances must not move until the bytes are on disk, so
    // this resolves only once the download completes and throws if it is interrupted.
    await waitForDownload(downloadId);
    return downloadId;
  } finally {
    chrome.runtime.sendMessage({ type: "download-release", url }).catch(() => {});
  }
}
