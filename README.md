# Discord Channel Export

A free browser extension that saves a Discord channel's messages from the
Discord web app as JSON, a self-contained HTML page, or CSV.

It reads only what your own Discord client has already received: the message
batches the web app fetches while a channel is open and scrolled. Nothing
calls the Discord API. The only automated action is scrolling the channel up
on your behalf, which you can stop at any time.

## Features

- Floating panel inside the channel view: message count, capture state,
  load older (to a date, a number of messages, the whole channel, or since
  your last export), stop, export.
- Messages are kept per channel in the extension's own storage and survive
  reloads. Clear them per channel whenever you like.
- Export formats: raw JSON (the exact Discord message objects, oldest
  first), a single HTML file that renders the chat offline, and CSV.
- Options: scroll speed, message cap, filename template, default format,
  HTML theme.

## Install

Chrome, Chromium, Brave, Vivaldi, Edge (Manifest V3).

```bash
pnpm install
pnpm build
```

Then load `.output/chrome-mv3` as an unpacked extension from
`chrome://extensions` with developer mode on. Reload any Discord tab that
was already open.

## Development

```bash
pnpm dev          # WXT dev server with hot reload
pnpm test         # unit tests
pnpm lint
```

Design notes live in `docs/design.md`.

## Privacy and terms

Everything stays in your browser. The extension makes no network requests
of its own. Discord's terms forbid automating a user account; this
extension does not send anything to Discord and only simulates scrolling in
a channel you already have open. Use it on your own content and at your own
discretion.

## Licence

MIT
