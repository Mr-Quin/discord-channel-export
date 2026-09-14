import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import { expect, lastDownloadId, panel, readDownload, test } from "./fixtures";
import { HARNESS_NOW, messageAt, startHarness } from "./harness/server";

let origin = "";
let stop: () => void = () => {};

test.beforeAll(async () => {
  const h = await startHarness();
  origin = h.origin;
  stop = () => h.server.close();
});
test.afterAll(() => stop());

const stat = (page: Page, label: string) =>
  panel(page).locator(".dce-stats").locator(`span:has-text("${label}") + b`);

async function openChannel(page: Page, size: number, query = "") {
  await page.goto(`${origin}/channels/1/${size}${query}`);
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).locator(".dce-warn")).toHaveCount(0);
  await expect(stat(page, "captured")).toHaveText("50");
}

async function load(page: Page, mode: "count" | "date" | "start" | "sinceExport", value?: string) {
  const p = panel(page);
  await p.locator("select").first().selectOption(mode);
  if (mode === "count" && value) await p.locator('input[type="number"]').first().fill(value);
  if (mode === "date" && value) await p.locator('input[type="date"]').fill(value);
  await p.getByRole("button", { name: "Load" }).click();
}

const lastStop = (page: Page) =>
  panel(page).locator(".dce-section").first().locator(".dce-note").last();

test("captures the initial batch through fetch and through XHR", async ({ ext }) => {
  const page = await ext.context.newPage();
  await openChannel(page, 300);
  await openChannel(page, 300, "?xhr=1");
  await expect(stat(page, "newest")).not.toHaveText("-");
});

test("loads a number of messages, then persists across reload", async ({ ext }) => {
  const page = await ext.context.newPage();
  await openChannel(page, 2000);
  await load(page, "count", "120");
  await expect(lastStop(page)).toContainText("loaded the requested number", { timeout: 60_000 });
  const count = Number(await stat(page, "captured").textContent());
  expect(count).toBeGreaterThanOrEqual(170);
  expect(count).toBeLessThanOrEqual(250);
  await page.reload();
  await expect(panel(page)).toBeVisible();
  await expect(stat(page, "captured")).toHaveText(String(count));
});

test("loads the whole channel and stops at the start", async ({ ext }) => {
  const page = await ext.context.newPage();
  await openChannel(page, 120);
  await load(page, "start");
  await expect(lastStop(page)).toContainText("reached the start", { timeout: 60_000 });
  await expect(stat(page, "captured")).toHaveText("120");
});

test("loads back to a date", async ({ ext }) => {
  const page = await ext.context.newPage();
  await openChannel(page, 2000);
  // message n is n hours before HARNESS_NOW; 130 hours back is a little over five days
  const target = new Date(HARNESS_NOW - 130 * 3600 * 1000);
  const iso = target.toISOString().slice(0, 10);
  await load(page, "date", iso);
  await expect(lastStop(page)).toContainText("reached the target", { timeout: 60_000 });
  const oldest = await stat(page, "oldest").textContent();
  expect(new Date(oldest ?? "").getTime()).toBeLessThanOrEqual(
    new Date(`${iso}T00:00:00`).getTime(),
  );
});

test("stop button ends a run and switching channels ends it too", async ({ ext }) => {
  const page = await ext.context.newPage();
  await openChannel(page, 2000);
  await load(page, "start");
  await panel(page).getByRole("button", { name: "Stop" }).click();
  await expect(lastStop(page)).toContainText("stopped");
  await load(page, "start");
  await expect(panel(page).getByRole("button", { name: "Stop" })).toBeVisible();
  await page.locator('a[href="/channels/1/120"]').click();
  await expect(panel(page).locator(".dce-head strong")).toHaveText("#harness-120");
  await expect(panel(page).getByRole("button", { name: "Load" })).toBeVisible();
  await expect(stat(page, "captured")).toHaveText(/^(50|100)$/);
});

test("exports JSON, HTML and CSV and remembers the last export", async ({ ext }) => {
  const page = await ext.context.newPage();
  await openChannel(page, 120);
  await load(page, "start");
  await expect(lastStop(page)).toContainText("reached the start", { timeout: 60_000 });
  const p = panel(page);
  const formats = p.locator(".dce-section").nth(1).locator("select").first();

  let before = await lastDownloadId(ext.worker);
  await formats.selectOption("json");
  await p.getByRole("button", { name: "Export" }).click();
  await expect(p.locator(".dce-section").nth(1).locator(".dce-note")).toContainText("120 →");
  const exported = p.locator(".dce-section").nth(1).locator(".dce-note");
  await expect(exported).toContainText(/harness-120-120-\d{8}T\d{6}Z\.json$/);
  const json = await readDownload(ext.worker, before);
  const parsed = JSON.parse(json.text) as { id: string; content: string }[];
  expect(parsed).toHaveLength(120);
  expect(parsed[0]?.id).toBe(messageAt("120", 119).id);
  expect(parsed[119]?.id).toBe(messageAt("120", 0).id);
  expect(parsed[0]).toEqual(messageAt("120", 119));

  before = await lastDownloadId(ext.worker);
  await formats.selectOption("html");
  await p.getByRole("button", { name: "Export" }).click();
  await expect(exported).toContainText(/\.html$/);
  const html = await readDownload(ext.worker, before);
  expect(html.text).toContain('id="dce-data"');
  // Playwright's GUID download name has no extension, which file:// sniffs as text.
  const htmlPath = join(ext.downloadsDir, "export.html");
  await writeFile(htmlPath, html.text);
  const viewer = await ext.context.newPage();
  await viewer.goto(`file://${htmlPath}`);
  await expect(viewer.locator(".msg")).toHaveCount(120);
  await expect(viewer.locator("#count")).toHaveText("120 messages");
  await expect(viewer.locator(".mention").first()).toHaveText("@Bob");
  await expect(viewer.locator(".content b").first()).toHaveText("bold");
  await expect(viewer.locator(".content code").first()).toHaveText("code");
  await expect(viewer.locator(".spoiler").first()).toHaveText("secret");
  await expect(viewer.locator(".reply").first()).toContainText("Alice");
  await expect(viewer.locator(".reactions").first()).toBeVisible();
  await viewer.locator("#search").fill("message 42");
  await expect(viewer.locator(".msg:not(.hidden)")).toHaveCount(1);
  await expect(viewer.locator("#count")).toHaveText("1 of 120");
  await viewer.close();

  before = await lastDownloadId(ext.worker);
  await formats.selectOption("csv");
  await p.getByRole("button", { name: "Export" }).click();
  await expect(exported).toContainText(/\.csv$/);
  const csv = await readDownload(ext.worker, before);
  const lines = csv.text.trimEnd().split("\r\n");
  expect(lines[0]).toBe("id,timestamp,author_id,author,content,attachments");
  expect(lines).toHaveLength(121);

  await expect(stat(page, "exported up to")).not.toHaveText("-");
  const range = p.locator(".dce-section").nth(1).locator("select").nth(1);
  await range.selectOption("sinceExport");
  await p.getByRole("button", { name: "Export" }).click();
  await expect(p.locator(".dce-error")).toContainText("nothing to export");
});

test("clear empties the channel store", async ({ ext }) => {
  const page = await ext.context.newPage();
  await openChannel(page, 120);
  await panel(page).getByRole("button", { name: "Clear" }).click();
  await expect(stat(page, "captured")).toHaveText("0");
  await page.reload();
  await expect(stat(page, "captured")).toHaveText("50");
});

test("popup lists stored channels", async ({ ext }) => {
  const page = await ext.context.newPage();
  await openChannel(page, 120);
  const id = await ext.worker.evaluate(() => chrome.runtime.id);
  const popup = await ext.context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await expect(popup.locator("tbody tr")).toHaveCount(1);
  await expect(popup.locator("tbody td.num")).toHaveText("50");
});
