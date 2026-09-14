# Working in this repository

A Chrome MV3 browser extension that exports a Discord channel as JSON, a
self-contained HTML viewer, or CSV. It reads only the message batches the
user's own client already fetched and simulates scrolling; it never calls the
Discord API.

## Prerequisites

- Node and pnpm (`packageManager` in `package.json` pins the version).
- `pnpm install` once.
- Chromium for the browser tests: `pnpm exec playwright install chromium`.
- The real-site test and `pnpm e2e:real` need a logged-in profile; see below.

## One command to verify a change

```bash
pnpm run verify
```

That runs, in order: `tsc --noEmit`, `biome check`, `vitest run`, a
production build, and the Playwright end-to-end suite against the local
harness. CI runs the same on every push. Use `pnpm run check` for the fast
inner loop (types, lint, unit) and `pnpm run e2e:harness` for the browser
tests alone.

## Module boundaries

```
src/core/      model, capture hook, driver loop, rules, store, download, settings, protocol
src/sources/   one folder per site; discord/ is the only source so far
src/outputs/   json, csv, html (and html/ viewer.css + viewer.js)
src/page/      the in-page panel controller (owns capture, driver runs, exports)
src/components/ React: Panel (in-page), Popup, Options
src/entrypoints/ WXT entrypoints: background, main-world hook, page content, offscreen, popup, options
e2e/           Playwright: harness/ (a fake Discord page + server), specs, real-site helpers
tests/         Vitest unit tests
docs/design.md the architecture and test plan
```

The model is `source -> driver -> output`. A source owns everything
site-specific: which URLs it matches, which responses carry messages and how
to parse them, how to find the scroller and load older messages, and how to
normalise a raw message. The driver (`src/core/driver.ts`) is site-agnostic
and takes its dependencies (sleep, randomness, page adapter, batch waiting)
by injection, which is where isolated changes and their tests belong.

Two invariants worth knowing before touching the driver or store:

- History completeness. A "to date" or "since last export" run declares its
  target reached only once a batch it loaded this run reaches the floor, not
  from the oldest id already in storage. Storage can hold an older disjoint
  run, and stopping on that would leave the gap above it unfilled.
- Export checkpoint. `newestExported` advances only after a download
  completes on disk. Starting a download is not enough; an interruption must
  not move the checkpoint.

## Testing layers

- Unit (`tests/`, Vitest): pure logic in `core`, `sources`, `outputs`.
- Harness e2e (`e2e/harness.spec.ts`): the built extension loaded into
  Chromium against `e2e/harness/`, a page and server that imitate the Discord
  channel view with deterministic fake messages. Covers capture over fetch
  and XHR, auto-scroll and stop rules, persistence, exports read back from
  disk, the HTML viewer's rendering, navigation, and the popup. Test builds
  add the harness origin to the content-script matches via
  `WXT_EXTRA_MATCHES`.
- Real-site (`e2e/discord.spec.ts`, `pnpm e2e:real <url>`): drives a live
  channel in a logged-in profile. `pnpm e2e:login` opens the profile once to
  log in. `DCE_PROFILE` (default
  `~/.local/share/discord-channel-export/profile`) and `DCE_E2E_CHANNEL`
  select the profile and channel; the spec skips when they are unset. The
  profile holds a logged-in session; treat it like a password and never
  commit it.

## Completion criteria for a change

- `pnpm run verify` passes.
- New behaviour has a unit test, and browser-visible behaviour has a harness
  assertion.
- Comments follow the repository rule: only what a human would write for a
  hidden constraint, quirk, or trap. No narration or history.

## Canonical branch

The implementation currently lives on branch `worktree-build`; `main` holds
only the design docs. To make `main` canonical, fast-forward it:
`git checkout main && git merge --ff-only worktree-build`. Do this from the
main checkout, not from a worktree.
