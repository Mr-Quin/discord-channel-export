// Drives the extension against a real channel in the logged-in e2e profile and
// leaves exports and screenshots in an output directory. A manual check, not a
// test: `pnpm e2e:real <channel url> [start|count|date|sinceExport] [value] [out dir]`.

import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";

const [channel, mode = "start", value = "", out = "e2e/.real"] = process.argv.slice(2);
if (!channel) {
  console.error("usage: node e2e/real-run.ts <channel url> [mode] [value] [out dir]");
  process.exit(1);
}
const extension = join(process.cwd(), ".output", "chrome-mv3-test");
const profile =
  process.env.DCE_PROFILE ??
  join(homedir(), ".local", "share", "discord-channel-export", "profile");
const downloadsDir = mkdtempSync(join(tmpdir(), "dce-real-"));
mkdirSync(out, { recursive: true });

const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: process.env.DCE_HEADED !== "1",
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
  downloadsPath: downloadsDir,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const page = context.pages()[0] ?? (await context.newPage());
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text())) {
    console.log("console:", m.text());
  }
});

await page.goto(channel, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-list-id="chat-messages"]', { timeout: 60_000 });
const panel = page.locator("dce-panel .dce");
await panel.waitFor();
await page.waitForTimeout(1500);

const stat = (label: string) =>
  panel.locator(".dce-stats").locator(`span:has-text("${label}") + b`).textContent();
const log = (...parts: unknown[]) => console.log(...parts);

log("title:", await page.title());
log("panel:", await panel.locator(".dce-head strong").textContent());
log("hook warning:", await panel.locator(".dce-warn").count());
log(
  "captured:",
  await stat("captured"),
  "oldest:",
  await stat("oldest"),
  "newest:",
  await stat("newest"),
);

await panel.locator("select").first().selectOption(mode);
if (mode === "count") await panel.locator('input[type="number"]').first().fill(value);
if (mode === "date") await panel.locator('input[type="date"]').fill(value);
const started = Date.now();
await panel.getByRole("button", { name: "Load" }).click();
const note = panel.locator(".dce-section").first().locator(".dce-note").last();
let last = "";
let shotMidRun = false;
while (Date.now() - started < 600_000) {
  const text = (await note.textContent().catch(() => "")) ?? "";
  if (text !== last) {
    log(
      `${((Date.now() - started) / 1000).toFixed(1)}s`,
      text,
      "| captured",
      await stat("captured"),
    );
    last = text;
    if (!shotMidRun && /\+\d/.test(text)) {
      await page.screenshot({ path: join(out, "panel-running.png") });
      shotMidRun = true;
    }
  }
  if (
    await panel
      .getByRole("button", { name: "Load" })
      .isVisible()
      .catch(() => false)
  )
    break;
  await page.waitForTimeout(500);
}
log(
  "done:",
  await note.textContent(),
  "captured:",
  await stat("captured"),
  "oldest:",
  await stat("oldest"),
);
await page.screenshot({ path: join(out, "panel-done.png") });

type Item = { id: number; filename: string; state: string };

async function exportAs(format: string): Promise<string> {
  const before = (await worker.evaluate(() => chrome.downloads.search({}))) as Item[];
  const seen = new Set(before.map((d) => d.id));
  await panel.locator(".dce-section").nth(1).locator("select").first().selectOption(format);
  await panel.getByRole("button", { name: "Export" }).click();
  const exported: Locator = panel.locator(".dce-section").nth(1).locator(".dce-note");
  await exported.waitFor();
  for (let i = 0; i < 200; i++) {
    const items = (await worker.evaluate(() =>
      chrome.downloads.search({ orderBy: ["-startTime"] }),
    )) as Item[];
    const fresh = items.find((d) => !seen.has(d.id));
    if (fresh?.state === "complete") {
      const name = ((await exported.textContent()) ?? "").split("→")[1]?.trim() ?? format;
      const dest = join(out, name);
      copyFileSync(fresh.filename, dest);
      log("export:", await exported.textContent(), "->", dest);
      return dest;
    }
    if (fresh?.state === "interrupted") throw new Error("download interrupted");
    await page.waitForTimeout(100);
  }
  throw new Error("no download");
}

const jsonPath = await exportAs("json");
const htmlPath = await exportAs("html");
await exportAs("csv");
const data = JSON.parse(readFileSync(jsonPath, "utf8")) as {
  timestamp: string;
  channel_id: string;
}[];
log("json:", data.length, "messages", data[0]?.timestamp, "to", data.at(-1)?.timestamp);

const viewer: Page = await context.newPage();
await viewer.goto(`file://${htmlPath}`);
await viewer.waitForTimeout(2500);
log(
  "viewer:",
  await viewer.locator(".msg").count(),
  "messages,",
  await viewer.locator(".attachments").count(),
  "with attachments,",
  await viewer.locator(".embed").count(),
  "embeds",
);
await viewer.screenshot({ path: join(out, "viewer-dark.png") });
await viewer.locator("#theme").click();
await viewer.screenshot({ path: join(out, "viewer-light.png") });

const id = await worker.evaluate(() => chrome.runtime.id);
const popup = await context.newPage();
await popup.setViewportSize({ width: 420, height: 320 });
await popup.goto(`chrome-extension://${id}/popup.html`);
await popup.waitForTimeout(500);
await popup.screenshot({ path: join(out, "popup.png") });
const options = await context.newPage();
await options.setViewportSize({ width: 900, height: 780 });
await options.goto(`chrome-extension://${id}/options.html`);
await options.waitForTimeout(500);
await options.screenshot({ path: join(out, "options.png") });
await context.close();
log("output in", out);
