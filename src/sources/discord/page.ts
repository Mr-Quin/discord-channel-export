import type { Conversation } from "../../core/model";
import type { PageAdapter } from "../types";

// Host is not checked here; the source's match patterns decide which pages it runs on,
// and the test harness serves the same paths from a local origin.
const CHANNEL_URL = /^(https?:\/\/[^/]+)\/channels\/(@me|\d+)\/(\d+)/;

export function conversationFromPage(url: string, title: string): Conversation | null {
  const m = CHANNEL_URL.exec(url);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  const { name, groupName } = parseTitle(title);
  return {
    source: "discord",
    id: m[3],
    url: `${m[1]}/channels/${m[2]}/${m[3]}`,
    name,
    groupId: m[2] === "@me" ? undefined : m[2],
    groupName,
  };
}

// Tab titles look like "Discord | #general | My Server", "(3) Discord | #general | My Server"
// or "Discord | @friend" for direct messages. Anything unexpected leaves the names unset
// rather than guessing.
export function parseTitle(title: string): { name?: string; groupName?: string } {
  const parts = title
    .replace(/^\(\d+\)\s*/, "")
    .split("|")
    .map((p) => p.trim());
  if (parts.length < 2 || !/discord/i.test(parts[0] ?? "")) return {};
  const name = parts[1]?.replace(/^[#@]/, "") || undefined;
  const groupName = parts[2] || undefined;
  return { name, groupName };
}

export const LIST_SELECTOR = '[data-list-id="chat-messages"]';

export function findScroller(root: Document = document): HTMLElement | null {
  let el = root.querySelector<HTMLElement>(LIST_SELECTOR);
  while (el && el.scrollHeight <= el.clientHeight) el = el.parentElement;
  return el;
}

// Discord asks for older messages when the scroller nears the top. A single jump to
// scrollTop 0 works, but spreading the move over a few frames fires the same scroll
// events a wheel would and keeps the client's own position bookkeeping happy.
export function loadOlder(scroller: HTMLElement, step: number, frames = 6): void {
  const target = Math.max(0, scroller.scrollTop - step);
  const start = scroller.scrollTop;
  let i = 0;
  const tick = () => {
    i += 1;
    scroller.scrollTop = i >= frames ? target : start - ((start - target) * i) / frames;
    if (i < frames) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function atTop(scroller: HTMLElement): boolean {
  return scroller.scrollTop <= 0;
}

export const discordPage: PageAdapter = { findScroller, loadOlder, atTop };
