// Opens a headed Chromium on the Discord login page with the e2e profile so a
// person can log in once. The window closes itself after login.

import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const profile =
  process.env.DCE_PROFILE ??
  join(homedir(), ".local", "share", "discord-channel-export", "profile");

const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: false,
  viewport: { width: 1280, height: 900 },
});
const page = context.pages()[0] ?? (await context.newPage());
await page.goto("https://discord.com/login");
console.log(`log in; profile at ${profile}`);
await page.waitForURL(/\/channels\//, { timeout: 600_000 });
await page.waitForTimeout(3000);
await context.close();
console.log("logged in");
