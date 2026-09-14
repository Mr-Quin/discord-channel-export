# Design

A free browser extension that exports a Discord channel's messages from the
Discord web app. It reads only what the user's own client already received,
and the only automated action is scrolling.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Browser targets | Chrome MV3 first (Chrome, Chromium, Brave, Vivaldi, Edge). Firefox later, behind the same core. |
| 2 | In-page UI | Floating shadow-DOM panel in the channel view. Popup shows global status only. |
| 3 | Auto-scroll | Extension drives the scroller with randomised pauses, a speed setting and a stop button. |
| 4 | Delivery | File download only. No integration with any other tool. |
| 5 | Configuration | Options page: scroll speed, caps, filename template, default format, HTML theme, storage management. |
| 6 | Storage and scope | IndexedDB per channel, deduped by message id, survives reloads. Export all or a date/count range. |
| 7 | Licence and repo | MIT, public, `discord-channel-export`. |
| 8 | Stack and tests | WXT + React + TypeScript, pnpm, Vitest for pure logic, Playwright end-to-end against a local harness and against real Discord. |
| 9 | Model | Generic source, driver and output. Discord is the first source; more can follow without touching the driver or outputs. |

## What it does

- Captures the message batches the Discord client fetches while a channel is
  open or scrolled. Nothing calls the Discord API.
- Optionally scrolls the channel up on the user's behalf until a target is
  reached: a date, a message count, the start of the channel, or the newest
  message from the previous export.
- Keeps captured messages per channel in the extension's IndexedDB.
- Exports a channel as raw JSON (the exact Discord API message objects,
  oldest first), a self-contained HTML page that renders the chat, or CSV.

## Model

Three parts, each replaceable on its own.

- **Source**: everything specific to one site. Which URLs it owns, how to
  read the current conversation (id, name, container) from the page, which
  network responses carry messages and how to parse them, how to find the
  scroller and ask the page for older messages, and how to normalise a raw
  message into the common model. Discord is the only source for now.
- **Driver**: the site-agnostic loop. Takes batches from the source's
  capture, stores them, and drives the source's scroller until a rule says
  stop. Rules today: until a date, until a count, until the start, until the
  newest id of the previous export. Filters (by author, by keyword, by time
  window) plug into the same place later.
- **Output**: a serialiser from stored messages to a file. JSON keeps the raw
  objects untouched; HTML and CSV work from the common model with the raw
  object available for source-specific rendering.

Common model:

```ts
type Message = {
  id: string            // sortable within a conversation
  sortKey: string       // fixed-width, orders by time
  timestamp: string     // ISO 8601
  author: { id: string; name: string; displayName?: string; avatarUrl?: string }
  content: string
  attachments: { id: string; name: string; size?: number; url: string; contentType?: string }[]
  raw: unknown          // the source's original object
}
type Conversation = { source: string; id: string; name?: string; groupId?: string; groupName?: string; url: string }
```

## Architecture

```
site tab (matches every registered source's URL patterns)
  MAIN world content script (document_start)
    wraps window.fetch and XMLHttpRequest once
    each source contributes a matcher: (method, url) -> parser | null
    window.postMessage({ source, type: "batch", conversationId, batch })
  ISOLATED world content script
    picks the source for the current URL
    forwards batches to background, mounts the panel, runs the driver
background service worker
    IndexedDB: messages keyed [source, conversationId, sortKey], conversation metadata
    answers stats queries, runs outputs
offscreen document
    turns output text into a Blob and calls downloads.download
popup, options
    status, settings, storage management
```

### Capture

Both `fetch` and `XMLHttpRequest` are wrapped at `document_start`, before the
client makes its first request. The Discord source's matcher accepts GET
responses whose URL matches `/api/v\d+/channels/(\d+)/messages` and whose
body is a JSON array; those batches are forwarded. The query string's `limit` (default 50) travels with the batch: a
batch shorter than its limit means the client hit the start of the channel
(only meaningful for `before` requests, so `after` and `around` batches never
set that flag).

The hook is installed when the page loads. If the extension is installed or
updated while Discord is already open, the panel says so and asks for a
reload; it knows because the MAIN world script answers a handshake.

### Storage

IndexedDB in the extension origin, owned by the background worker.

- `messages`: key `[source, conversationId, sortKey]`, value the common
  model with `raw` inside. For Discord `sortKey` is the snowflake zero-padded
  to 20 digits so string keys order like the numbers do.
- `conversations`: key `[source, conversationId]`, value the conversation
  plus `{ count, oldest, newest, newestExported, updatedAt }`.

Counts, oldest and newest come from the store itself (a bounded key range
and a cursor from each end), so metadata never drifts from the data.

### Driver

The loop is generic; the Discord source supplies `findScroller()` and
`loadOlder()`. For Discord the list is `[data-list-id="chat-messages"]`, the
scroller its nearest ancestor whose `scrollHeight` exceeds `clientHeight`,
and loading older means moving `scrollTop` up by a randomised amount over a
few animation frames. Each round calls `loadOlder()`, lets the animation
settle, then waits for a batch: a few seconds when the scroller is at the
top (where the client asks for more), a few hundred milliseconds otherwise,
so stepping through posts already rendered does not stall. A batch that
lands between two waits is held for the next one. A scroller that is
missing for a moment (the client re-rendering) is retried before the run
gives up.

Stop conditions, checked before every round:

- target reached: oldest captured id is at or below the floor (a date's
  snowflake, or the newest id from the previous export)
- reached the start of the channel (a short batch)
- message cap reached
- nothing new loaded for N rounds, counted only while the source reports
  `atTop()`, because moving up through posts already rendered loads nothing
  and must not count as idle
- the user pressed stop, or navigated to another channel

Speed presets set the pause range between rounds: slow 1.5 to 3 s, normal
0.7 to 1.8 s, fast 0.3 to 0.8 s.

### Export

The panel asks the background for an export of the current channel with a
format and a range. The background reads the range from IndexedDB, builds the
text, and hands it to the offscreen document, which creates a Blob and calls
`downloads.download`. Service workers cannot create object URLs and data URLs
choke on large files, which is why the offscreen document exists.

Filename template, default `{name}-{id}-{stamp}.{ext}`, with `{name}`,
`{id}`, `{group}`, `{groupId}`, `{source}`, `{stamp}` (UTC,
`YYYYMMDDTHHMMSSZ`) and `{ext}`. Names are sanitised for the filesystem.

Formats:

- JSON: the raw message array, oldest first, no field stripped.
- HTML: one file, no external code. The messages are embedded as a JSON
  array inside `<script type="application/json">` (with `</` escaped) and a
  small inline viewer renders them: day dividers, author grouping, avatars,
  a markdown subset (bold, italic, strikethrough, code, spoilers, links,
  mentions resolved from the message's own `mentions`), attachments (images
  and video inline, other files as links with size), embeds, reactions,
  replies and the edited marker. Media still points at Discord's CDN, and
  attachment links expire roughly a day after the export.
- CSV: `id,timestamp,author_id,author,content,attachments`, RFC 4180 quoting,
  attachment URLs joined with a space.

Ranges: everything captured, newest N messages, between two dates, or since
the previous export. Exporting records the newest exported id on the channel.

### Panel

Draggable, collapsible, position remembered. Shows for the current channel:
capture state, count in store, oldest and newest timestamps, last export.
Controls: load older (to date, N messages, whole channel, since last export),
stop, speed, export (format and range), clear channel. A summary line
reports the stop reason of the last run.

### Settings

`storage.sync`: scroll speed, idle rounds, default cap, filename template,
default format, default range, HTML theme, panel collapsed.

## Repository layout

```
src/core/          model, driver loop and rules, store, protocol, settings
src/sources/       one folder per site; discord/ is the first
  discord/         matcher and parser for the hook, page adapter, normaliser
src/outputs/       json, html, csv, filename template
src/entrypoints/
  background.ts
  main-world.content.ts     hook, composed from every source's matcher
  page.content/             ISOLATED world: panel, driver
  offscreen/                blob download
  popup/
  options/
src/components/    panel and options UI
e2e/               Playwright: local harness and real-site specs
docs/design.md
```

## Test infrastructure

Everything below runs from the repository without a human in the loop.

- **Unit** (Vitest): pure modules under `src/core`, `src/sources`,
  `src/outputs`.
- **Harness end-to-end** (Playwright, Chromium with the built extension
  loaded): `e2e/harness` serves a small page that imitates the Discord
  channel view: the same list element, a scroller that requests
  `/api/v9/channels/<id>/messages?before=&limit=` from the harness server as
  it nears the top, and a fake message set with a known size. Test builds
  add the harness origin to the content script matches through
  `DCE_EXTRA_MATCHES`. The specs drive the panel: hook handshake, capture on
  load, load older to a date, to a count, to the start, stop button, export
  in each format (the download is read back and checked), persistence across
  reload, and channel switch mid-run.
- **Real-site end-to-end**: the same specs, minus the deterministic size
  checks, against real Discord in a persistent Chromium profile that holds a
  logged-in session. `pnpm e2e:login` opens the profile for a one-time
  login. `DCE_PROFILE` (default
  `~/.local/share/discord-channel-export/profile`) and `DCE_E2E_CHANNEL`
  select the profile and channel; the specs skip when they are unset. The
  profile is a logged-in session and never enters the repository.

## Testing

Unit (Vitest): URL matching and query parsing, batch dedupe and short-batch
detection, stop rules, snowflake conversions, sort keys, filename
template and sanitising, CSV quoting, HTML escaping and the `</script`
embed, markdown subset.

End-to-end, against the harness on every change and against a real
channel before each release:

1. Load unpacked, open a channel, confirm the panel mounts and the handshake
   passes; reload if it reports the hook missing.
2. Scroll by hand; count rises; reload the tab; count persists.
3. Load older to a date; stops with "reached target"; oldest timestamp is
   at or before the date.
4. Load whole channel on a small channel; stops with "reached start".
5. Load N messages; stops at the cap.
6. Export JSON; file opens, array length matches, oldest first.
7. Export HTML; opens offline, renders attachments and embeds.
8. Export CSV; opens in a spreadsheet, non-ASCII intact.
9. Since last export after new posts: only newer messages loaded.
10. Switch channels mid-run; run stops, panel follows the new channel.

## Non-goals

Anything that calls the Discord API directly, posts, reacts, or reads
channels the client did not load. Downloading media into the export.
