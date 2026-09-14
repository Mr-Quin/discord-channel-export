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
| 8 | Stack and tests | WXT + React + TypeScript, pnpm, Vitest for pure logic, manual protocol on real channels. |

## What it does

- Captures the message batches the Discord client fetches while a channel is
  open or scrolled. Nothing calls the Discord API.
- Optionally scrolls the channel up on the user's behalf until a target is
  reached: a date, a message count, the start of the channel, or the newest
  message from the previous export.
- Keeps captured messages per channel in the extension's IndexedDB.
- Exports a channel as raw JSON (the exact Discord API message objects,
  oldest first), a self-contained HTML page that renders the chat, or CSV.

## Architecture

```
discord.com tab
  MAIN world content script (document_start)
    wraps window.fetch and XMLHttpRequest
    matches GET /api/v*/channels/<id>/messages
    window.postMessage({ source, type: "batch", channelId, limit, messages })
  ISOLATED world content script
    receives batches, forwards to background
    mounts the panel (React in a shadow root)
    drives auto-scroll, tracks the current channel from the URL
background service worker
    IndexedDB: messages keyed [channelId, paddedId], channel metadata
    answers stats queries, assembles exports
offscreen document
    turns export text into a Blob and calls downloads.download
popup, options
    status, settings, storage management
```

### Capture

Both `fetch` and `XMLHttpRequest` are wrapped at `document_start`, before the
client makes its first request. Only GET responses whose URL matches
`/api/v\d+/channels/(\d+)/messages` and whose body is a JSON array are
forwarded. The query string's `limit` (default 50) travels with the batch: a
batch shorter than its limit means the client hit the start of the channel
(only meaningful for `before` requests, so `after` and `around` batches never
set that flag).

The hook is installed when the page loads. If the extension is installed or
updated while Discord is already open, the panel says so and asks for a
reload; it knows because the MAIN world script answers a handshake.

### Storage

IndexedDB in the extension origin, owned by the background worker.

- `messages`: key `[channelId, paddedId]`, value the raw message object.
  `paddedId` is the snowflake zero-padded to 20 digits so string keys order
  like the numbers do.
- `channels`: key `channelId`, value `{ guildId, name, guildName, count,
  oldest, newest, newestExported, updatedAt }`.

Counts, oldest and newest come from the store itself (a bounded key range
and a cursor from each end), so metadata never drifts from the data.

### Scroll driver

Ported from a proven Playwright exporter. The list is
`[data-list-id="chat-messages"]`; the scroller is its nearest ancestor whose
`scrollHeight` exceeds `clientHeight`. Each round moves `scrollTop` up by a
randomised amount in a few animation frames, then waits for a new batch.

Stop conditions, checked before every round:

- target reached: oldest captured id is at or below the floor (a date's
  snowflake, or the newest id from the previous export)
- reached the start of the channel (a short batch)
- message cap reached
- nothing new loaded for N rounds, counted only while `scrollTop` is 0,
  because moving up through posts already rendered loads nothing and must
  not count as idle
- the user pressed stop, or navigated to another channel

Speed presets set the pause range between rounds: slow 1.5 to 3 s, normal
0.7 to 1.8 s, fast 0.3 to 0.8 s.

### Export

The panel asks the background for an export of the current channel with a
format and a range. The background reads the range from IndexedDB, builds the
text, and hands it to the offscreen document, which creates a Blob and calls
`downloads.download`. Service workers cannot create object URLs and data URLs
choke on large files, which is why the offscreen document exists.

Filename template, default `{channel}-{channelId}-{stamp}.{ext}`, with
`{channel}`, `{channelId}`, `{guild}`, `{guildId}`, `{stamp}` (UTC, `YYYYMMDDTHHMMSSZ`)
and `{ext}`. Channel and guild names are sanitised for the filesystem.

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
src/entrypoints/
  background.ts
  discord-main.content.ts     MAIN world hook
  discord.content/            ISOLATED world: panel, scroll driver
  offscreen/                  blob download
  popup/
  options/
src/lib/                      pure logic, unit tested
  capture.ts snowflake.ts db.ts scroller.ts protocol.ts settings.ts
  export/{json,csv,html,filename}.ts
tests/
docs/design.md
```

## Testing

Unit (Vitest): URL matching and query parsing, batch dedupe and short-batch
detection, stop reasons, snowflake conversions, padded keys, filename
template and sanitising, CSV quoting, HTML escaping and the `</script`
embed, markdown subset.

Manual, on real channels, each slice:

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
