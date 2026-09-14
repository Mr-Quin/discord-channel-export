import type { Message } from "../core/model";
import viewerCss from "./html/viewer.css?raw";
import viewerJs from "./html/viewer.js?raw";
import type { Output, OutputContext } from "./types";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// JSON inside a script element: "<" must never appear, or "</script>" in a message
// would end the element early. < is a valid JSON escape, so the parse is unchanged.
export function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function renderHtml(messages: Message[], ctx: OutputContext): string {
  const c = ctx.conversation;
  const title = c.name ? `#${c.name}` : c.id;
  const heading = c.groupName
    ? `${escapeHtml(c.groupName)} · ${escapeHtml(title)}`
    : escapeHtml(title);
  const payload = {
    conversation: c,
    exportedAt: ctx.exportedAt.toISOString(),
    messages,
  };
  return `<!doctype html>
<html lang="en" data-theme="${ctx.theme ?? "dark"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${viewerCss}</style>
</head>
<body>
<header>
<h1>${heading}</h1>
<span class="meta" id="count">${messages.length} messages</span>
<span class="meta">exported ${escapeHtml(ctx.exportedAt.toISOString().slice(0, 16).replace("T", " "))} UTC</span>
<input id="search" type="search" placeholder="Search">
<button id="theme" type="button">Theme</button>
</header>
<main></main>
<script id="dce-data" type="application/json">${embedJson(payload)}</script>
<script>${viewerJs}</script>
</body>
</html>
`;
}

export const htmlOutput: Output = {
  id: "html",
  label: "HTML",
  ext: "html",
  mime: "text/html",
  serialize: renderHtml,
};
