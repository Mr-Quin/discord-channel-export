import type { Source } from "../types";
import { discordMatcher } from "./matcher";
import { normalizeDiscordMessage } from "./normalize";
import { conversationFromPage, discordPage } from "./page";
import { dateOf, idFromSortKey, snowflakeAt, sortKey } from "./snowflake";

export const discord: Source = {
  id: "discord",
  label: "Discord",
  matches: ["https://discord.com/*", "https://*.discord.com/*"],
  matcher: discordMatcher,
  normalize: (raw) => normalizeDiscordMessage(raw),
  conversationFromPage,
  sortKeyForDate: (date) => sortKey(snowflakeAt(date)),
  dateForSortKey: (key) => dateOf(idFromSortKey(key)),
  page: discordPage,
};
