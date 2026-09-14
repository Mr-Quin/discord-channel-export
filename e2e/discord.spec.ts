// Runs against real Discord in a persistent profile that holds a logged-in session.
// Skipped unless DCE_E2E_CHANNEL names a channel URL and the profile exists.

import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test as base } from "@playwright/test";
import { expect, lastDownloadId, launchWithExtension, panel, readDownload } from "./fixtures";

export const PROFILE_DIR =
  process.env.DCE_PROFILE ??
  join(homedir(), ".local", "share", "discord-channel-export", "profile");
const CHANNEL = process.env.DCE_E2E_CHANNEL;

const test = base;
test.skip(!CHANNEL || !existsSync(PROFILE_DIR), "needs DCE_E2E_CHANNEL and a logged-in profile");

test("captures, loads older, and exports a real channel", async () => {
  test.setTimeout(300_000);
  const downloadsDir = await mkdtemp(join(tmpdir(), "dce-downloads-"));
  const ext = await launchWithExtension(PROFILE_DIR, downloadsDir);
  try {
    const page = ext.context.pages()[0] ?? (await ext.context.newPage());
    await page.goto(CHANNEL as string, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-list-id="chat-messages"]', { timeout: 60_000 });
    const p = panel(page);
    await expect(p).toBeVisible();
    await expect(p.locator(".dce-warn")).toHaveCount(0);
    const captured = p.locator(".dce-stats").locator('span:has-text("captured") + b');
    await expect(captured).not.toHaveText("0", { timeout: 30_000 });
    const initial = Number(await captured.textContent());

    await p.locator("select").first().selectOption("count");
    await p.locator('input[type="number"]').first().fill("60");
    await p.getByRole("button", { name: "Load" }).click();
    const note = p.locator(".dce-section").first().locator(".dce-note").last();
    await expect(note).toContainText(/loaded the requested number|reached the start/, {
      timeout: 120_000,
    });
    const after = Number(await captured.textContent());
    expect(after).toBeGreaterThan(initial);

    const before = await lastDownloadId(ext.worker);
    await p.locator(".dce-section").nth(1).locator("select").first().selectOption("json");
    await p.getByRole("button", { name: "Export" }).click();
    const file = await readDownload(ext.worker, before);
    const parsed = JSON.parse(file.text) as { id: string; channel_id: string; content: string }[];
    expect(parsed.length).toBe(after);
    expect(parsed[0]).toHaveProperty("channel_id");
    expect(parsed[0]).toHaveProperty("content");
    for (let i = 1; i < parsed.length; i++) {
      expect(BigInt(parsed[i]?.id ?? 0) > BigInt(parsed[i - 1]?.id ?? 0)).toBe(true);
    }
    console.log(`exported ${parsed.length} messages to ${file.path}`);
  } finally {
    await ext.context.close();
    await rm(downloadsDir, { recursive: true, force: true });
  }
});
