# Discord Channel Export

A free browser extension that saves a Discord channel's messages from the
Discord web app as JSON, a self-contained HTML page, or CSV.

It reads only what your own Discord client has already received: the message
batches the web app fetches while a channel is open and scrolled. Nothing
calls the Discord API. The only automated action is scrolling the channel up
on your behalf, which you can stop at any time.

## Features

- A floating panel inside the channel view shows how many messages are
  stored for the channel and the oldest and newest timestamps.
- Load older messages automatically: a number of messages, back to a date,
  the whole channel, or everything since your last export. Stop any time.
- Messages are kept per channel in the extension's own storage and survive
  reloads. Clear a channel whenever you like.
- Export as raw JSON (the exact Discord message objects, oldest first), a
  single HTML file that renders the chat offline with search and a light or
  dark theme, or CSV.
- Options: scroll speed, message cap, filename template, default format,
  HTML theme. The options page also lists every stored channel and can
  export or clear them from there.

## Install

Chrome, Chromium, Brave, Vivaldi, Edge (Manifest V3).

```bash
pnpm install
pnpm build
```

Then load `.output/chrome-mv3` as an unpacked extension from
`chrome://extensions` with developer mode on. Reload any Discord tab that was
already open; the panel tells you if the capture hook is not active yet.

## Use

Open a channel. The panel appears at the bottom right and the messages the
client has already loaded are stored right away. Scroll up by hand or pick a
target under "Load older" and press Load. Pick a format and a range under
"Export" and press Export; the file lands in your downloads folder.

Attachment and media links in an export are signed by Discord and expire
after about a day. Open or download what you need soon after exporting.

Filename template placeholders: `{name}`, `{id}`, `{group}`, `{groupId}`,
`{source}`, `{stamp}` (UTC, `YYYYMMDDTHHMMSSZ`), `{ext}`. A slash makes a
subfolder of the downloads folder.

## Development

```bash
pnpm dev            # WXT dev server with hot reload
pnpm test           # unit tests (Vitest)
pnpm lint           # tsc and Biome
pnpm e2e            # builds a test flavour and runs Playwright against a local harness
pnpm e2e:login      # one-time login into a persistent profile for real-site checks
DCE_E2E_CHANNEL=https://discord.com/channels/<guild>/<channel> pnpm exec playwright test e2e/discord.spec.ts
pnpm e2e:real <channel url> [start|count|date|sinceExport] [value] [out dir]
```

The harness in `e2e/harness` imitates the Discord channel view: the same
list element and the same paging endpoint, with deterministic fake messages,
so capture, auto-scroll, stop rules, persistence, exports and the popup are
checked without a login. `pnpm e2e:real` drives a live channel in the
logged-in profile and leaves exports and screenshots in `e2e/.real`. The
profile lives at `~/.local/share/discord-channel-export/profile` (or
`DCE_PROFILE`) and holds a logged-in session, so treat it like a password.

Design notes live in `docs/design.md`.

## Privacy and terms

Everything stays in your browser. The extension makes no network requests of
its own. Discord's terms forbid automating a user account; this extension
sends nothing to Discord and only simulates scrolling in a channel you already
have open. Use it on your own content and at your own discretion.

## Licence

MIT
