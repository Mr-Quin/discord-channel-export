import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type BrowserContext,
  test as base,
  chromium,
  type Page,
  type Worker,
} from "@playwright/test";

export const EXTENSION_DIR = resolve(process.env.DCE_EXTENSION_DIR ?? ".output/chrome-mv3-test");

export type Extension = {
  context: BrowserContext;
  worker: Worker;
  downloadsDir: string;
};

export async function launchWithExtension(
  userDataDir: string,
  downloadsDir: string,
  reused = false,
): Promise<Extension> {
  // A reused profile keeps the service worker registered from an earlier build, and
  // Chromium serves that stored script instead of the rebuilt one on disk. Dropping the
  // registration makes it register the current extension fresh; cookies are elsewhere.
  if (reused)
    await rm(join(userDataDir, "Default", "Service Worker"), { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: process.env.DCE_HEADED !== "1",
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    downloadsPath: downloadsDir,
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
  return { context, worker, downloadsDir };
}

export type DownloadRecord = { id: number; filename: string; state: string; url: string };

/**
 * The extension's own download records, newest first, once none is in progress.
 * Playwright renames every download to a GUID, so the intended filename is only
 * visible in the panel; the record's path is where the bytes are.
 */
export async function settledDownloads(worker: Worker): Promise<DownloadRecord[]> {
  for (let i = 0; i < 100; i++) {
    const items = (await worker.evaluate(() =>
      chrome.downloads.search({ orderBy: ["-startTime"] }),
    )) as DownloadRecord[];
    if (items.length && items.every((d) => d.state !== "in_progress")) return items;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("downloads did not settle");
}

export async function readDownload(
  worker: Worker,
  before: number,
): Promise<{ path: string; text: string }> {
  const items = await settledDownloads(worker);
  const fresh = items.filter((d) => d.id > before);
  const item = fresh[0];
  if (!item) throw new Error("no new download");
  if (item.state !== "complete") throw new Error(`download ${item.state}`);
  return { path: item.filename, text: await readFile(item.filename, "utf8") };
}

export async function lastDownloadId(worker: Worker): Promise<number> {
  const items = (await worker.evaluate(() =>
    chrome.downloads.search({ orderBy: ["-startTime"], limit: 1 }),
  )) as DownloadRecord[];
  return items[0]?.id ?? 0;
}

export const panel = (page: Page) => page.locator("dce-panel .dce");

export const test = base.extend<{ ext: Extension }>({
  ext: async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), "dce-profile-"));
    const downloadsDir = await mkdtemp(join(tmpdir(), "dce-downloads-"));
    const ext = await launchWithExtension(userDataDir, downloadsDir);
    await use(ext);
    await ext.context.close();
    await rm(userDataDir, { recursive: true, force: true });
    await rm(downloadsDir, { recursive: true, force: true });
  },
});

export { expect } from "@playwright/test";
