# CLAUDE.md — Dice Tracker (die stat tracker)

**This folder is the project: a git clone of https://github.com/mdwsn/die-stat-tracker, branch `main`.**
It is the only copy to edit. An older working copy at `~/Downloads/Movetoclaudecode/plunk/` predates the
repo; don't edit it. `~/Downloads/CLAUDE.md` also loads here because it sits in the parent folder.
That file is a retired pointer about a different app (Command Center) and doesn't apply to this one.

The maintainer doesn't code. Explain every command in plain English and say whether it changes anything
or only reads.

## Workflow (the maintainer's standing instruction)
**When a round of changes is finished: run the tests, then commit and push to GitHub** (`origin main`).
Don't leave finished work sitting uncommitted. Commit messages say what changed in plain English.
Push with `GIT_TERMINAL_PROMPT=0`, so a missing sign-in fails fast instead of hanging. Git signs in
through the macOS keychain (`osxkeychain`).

## What it is
A stat tracker for die (the dice table game), for frat houses and friend groups. The person keeping
stats, usually a pledge, opens it on a phone, picks four registered players from search, logs the game
tap by tap, and finishes it. Finished games feed the leaderboard, the awards and a two-sentence recap.
Any game can be edited later, because a finished game that someone says "didn't count" has to be
fixable. The README covers the user-facing feature list.

## How it runs: the website is the product
- **The website** = `index.html` on GitHub Pages, with `PLUNK.BACKEND` (url + publishable key) filled in
  `js/config.js`, which runs `CloudStore` on **Supabase**. It's the real app; the maintainer called the
  claude.ai version a "gimmick". Setup steps live in `SETUP.md` (only he can create the accounts). Schema and
  security are in `supabase/schema.sql`: row-level security means you only see groups you're a member of, and
  membership comes only through `create_group()` / `join_group(code)`. **The publishable key is public by
  design. Never put the `service_role`/secret key in the repo.**
- Sign-in is email + password with **"Confirm email" OFF**, because Supabase's default email only reaches
  project-team addresses. Google sign-in is optional (`BACKEND.google`). Invite link = site URL +
  `?join=CODE`, and the code survives sign-in (and a Google round trip) in sessionStorage.
- **Offline-safe by design (basement wifi):** every write is parked in `plunk.outbox.v1` the moment it's
  made and only cleared once the server confirms it. Network failures retry with backoff (2s/5s/10s/20s)
  and on the `online` event. Groups are cached (`plunk.cache.*`) so a reload with no signal still shows the
  last data plus the parked taps. Realtime catches up (refetch) on reconnect and when the tab wakes.
  Realtime can't filter DELETE events, so one unfiltered delete listener ignores ids it doesn't hold.
- **Newer save wins (2026-11-01).** Games and players save through the `save_game` / `save_player` RPCs,
  which only write when the incoming `data.updated` is at least the stored one. Without this, a phone
  that was offline for hours would flush its outbox on reconnect and clobber newer taps from another phone.
  Players now carry `updated` too. A rejected save fires `onStale`, and the app shows a banner and refetches.
  Only one phone should keep score per game; whole-game last-writer-wins can still drop one phone's taps.
- **Live, watch, TV (2026-11-01).** A live game opens for **scoring** only on the device/account that
  started it (`g.by === S.me`) or after **Help score** (`S.helping`, per session). Everyone else gets **watch**
  (`V.watch`: live scorebar, last play, box score, no tap buttons). This prevents the two-scorer collision
  that whole-game last-writer-wins can't merge. **TV mode** (`V.tv`) is a full-screen scoreboard. Every
  screen except live/watch/TV/edit shows `V.liveBar`. `[data-ago]` text is refreshed every 5 s without a
  re-render. `ROADMAP.md` holds the product plan; keep it current when priorities change.
- **Opens offline (PWA).** `sw.js` serves the app's own files network-first (3 s timeout, then the saved
  copy) and the CDN/fonts cache-first. It never touches `*.supabase.co`. `manifest.webmanifest` plus
  `icons/` (drawn by `tools/make-icons.py`, standard library only) allow home-screen install. **Every file in
  sw.js's `SHELL` list must exist**, or `cache.addAll` rejects and offline loading silently stops working.
  smoke §0 checks this, and that every page script is in the list. Bump `CACHE` only when sw.js's own logic
  changes. It's never registered inside claude.ai.
- **Backups.** House → Backup downloads `{app:'dice-tracker', format:1, group, players, games}`. Restore
  works two ways. Into the same group, it merges by id and the newer copy wins. Into another group,
  players are matched by normalized name and everyone else gets a **stable id** (an FNV hash of target
  group + old id), so restoring the same file twice adds nothing; games are remapped to match. This is
  also the migration path from the device-only site to the shared database.
- **Schema changes reach the real database only when the maintainer re-runs `supabase/schema.sql`** in the
  Supabase SQL editor. It's written to be safe to re-run. Say so whenever it changes.
- With `BACKEND` empty, `index.html` falls back to **device-only** (localStorage) and shows a dismissable
  note saying so.
- `artifact.html` is a bare shell for claude.ai, which wraps it in its own page skeleton. **Never add
  doctype/html/head/body to it.** Publish it with the Artifact tool, passing
  `url: https://claude.ai/artifact/6XjXsZBPBCcoguetrH44VL` (the live shared version). It declares the
  `db` + `user` capabilities, so it runs on the shared database.
- smoke.js §0 fails if the two stop loading the same scripts or containers. A new script goes in both.
  (The Supabase library is lazy-loaded by `store.js` from a pinned jsDelivr URL, which is why it isn't a
  `<script>` tag in either page.)
- smoke.js §18 runs the website path against `tests/fake-supabase.js`, an in-memory stand-in that copies the
  membership rules. **It is not the real database.** Once `BACKEND` is set, also check the real project:
  an unauthenticated REST read of `groups` must return `[]`.

## Files
`app.css` (tokens at top, light + dark) · `js/config.js` (**what gets tracked**) · `js/logic.js` (pure
maths) · `js/store.js` (two backends with identical methods) · `js/views.js` (screens; views only
read) · `js/app.js` (state, `data-act` taps, forms, sheets, boot) · `smoke.js` (`npm test`, 144 checks).
Node may be at `~/.local/node/bin` rather than on PATH. jsdom isn't installed in this folder (no
`node_modules/`). Either run `npm install` once, or borrow the copy Command Center already has:
`NODE_PATH=~/Downloads/Movetoclaudecode/node_modules node smoke.js`.
`.gitignore` blocks `._*`: macOS leaves these hidden files behind, and they got into the first upload.

## Design system (2026-11-01, "product-grade, not AI-default")
Vanilla HTML/CSS/JS only (no React/Next). Visual references: shadcn/ui, square-ui's habit-tracker, and
Circle (a Linear-style UI). The rules, all set as tokens at the top of `app.css`:
- **Geist** (Google Fonts) for everything; tabular numbers wherever digits line up.
- **One accent**, indigo `--accent`, used for primary buttons, focus, the active nav item, sorted
  columns, the MVP card and **Team 1's marker**. Team 2's marker is ink (`--fg`), not a second hue.
  Green/amber/red are status only (live, game point, behind on throws), never decoration.
- **4px spacing scale** (`--s1`…`--s10`). **Radius 8px on controls, 12px on cards/sheets.** No pills.
- Hairline zinc borders and the faintest shadows. No glow, no rainbow gradients, no emoji.
- **Updated by the polish brief (see UI.md):** **dark is the default** (bare `:root` = dark;
  `[data-theme="light"]` = light, chosen in House → Appearance, stored as `dt.theme`, applied by an inline
  script in index.html before first paint). **Glass is allowed only on chrome that floats over content**
  (top bar, tabs, scorebar, sheets, toast, Live now card), never on every card. There's one faint accent
  wash at the top of the page.
- **Motion system:** `--dur-1/2/3` = 150/200/250 ms, `--ease`, and a short `--spring`. Ticker
  (`data-tick`), leaderboard FLIP (`tr[data-pid]`) and confetti all run from `render()` and all stop under
  `prefers-reduced-motion` (the preview browser has it on, so motion can't be eyeballed there). **Entry
  motion only on navigation** (`render(true)` from `go()`/`open()`); a tap must never re-animate the screen.
  Confetti fires once per game (`S.celebrated`) on the live→final transition of the game on screen, and
  not on a tie.
- Layout: phone = top bar + bottom tabs; 900px+ = 240px sidebar (group switcher, New game, nav,
  storage status). `.app.solo` (no group yet) has no sidebar.
- Dense leaderboard: 40px rows, 13px text, sticky header + sticky player column; awards are compact cards.
- **Specificity trap (shipped once, caught in preview):** `.btn` sets `display:inline-flex` and sits
  below the chrome rules, so an unscoped `.side-new{display:none}` loses on order and the sidebar's
  button leaks onto phones. Hide rules for chrome are scoped `.top .side-new`. Same trap for any
  component class that also carries `.btn`.

## Decisions (settled)
- **Names (2026-11-01):** the app is **Dice Tracker**, and stats are named in plain words the way the
  house sheet phrases them ("Fair Table Hits", "Short Table Hits"). **Never "plink"/"plunk"/"plonk"**:
  the maintainer called them cringy. Cup hit and Sink instead. Internal names are historical and stay:
  the `PLUNK` namespace, `plunk.*` storage keys, `rules.plunkPts` (= what a sink is worth), and the
  stat keys `plk` (cup hit) and `snk` (sink). Renaming those would orphan saved data.
- **Fair table hits include points.** A point is a fair table hit that scored, so the column is
  Point + Fair hit. Short table hits count as throws but not hits, and Hit % = (fair + cup hits +
  sinks) / throws. If the house sheet counts them differently, change the `fair`/`hit` flags in
  `config.js`; nothing else needs to move.
- **Throws are never typed.** Every throw has exactly one outcome (Point/Fair hit/Short hit/Cup hit/Sink/Miss), and
  throws are the sum of those. Total throws is how a house checks everyone got an even share, so it
  must not be able to drift.
- **Defense is optional per game** and can be collapsed mid-game without losing logged catches/drops.
- **Two logging modes:** "All four" (the table, four seats) and "Throw by throw" (one thrower at a time
  in order; one tap logs the outcome *and* the defender's catch or drop, then passes the turn).
- **Undo reverses exactly one tap**, including a combined tap.
- **Subs:** whoever leaves keeps their stats, the sub starts at zero, and both get credit for the game.
  This is different from "Wrong person?" in the editor, which moves the whole line to the right player.
- **"Didn't count" over delete:** void keeps the record but drops it from every stat. Delete exists
  behind a confirm.
- **Pledge status is snapshotted per game** (`game.pledges`), so initiating a class keeps their
  pledge-era games tagged. Player profiles split "as pledge" vs "since".
- **Stats kept by (2026-11-01).** Each game stores `scorer` (a player id) and a `scorerPledge`
  snapshot taken from `wasPledgeAt()`: a pledge now, or initiated after the game was played. **Best
  Pledge Statistician** = most *finished* games tracked as a pledge, ties broken by throws logged. The
  draft remembers the keeper per phone. `null` falls back to the player linked to the viewer's account,
  and `''` means explicitly nobody. Games from before this have no scorer and simply don't count.
- **Pick who you are (2026-11-01).** Each phone remembers which player it is per group
  (`plunk.me.<gid>`, localStorage). It's asked once on first load of a group with players (a sheet);
  "Just watching" sets `plunk.watcher.<gid>`. The **You** button switches, for a shared phone at the table.
  `S.mePid` feeds the default stats-keeper and "This is you". On the website, **Continue without email**
  = Supabase anonymous sign-in (needs *Allow anonymous sign-ins* ON). Anonymous users are `authenticated`,
  so the existing rules apply unchanged and the invite link remains the gate. Caveat: an anonymous account
  lives on that phone. Clearing site data means opening the invite link again and re-picking your name;
  no stats are lost, since stats belong to players, not accounts.
- **Names are registered once.** Exact duplicates are blocked; near misses ("Jaek") prompt "did you mean".

## Known limits (say them plainly)
- **claude.ai version:** viewers must be signed in to claude.ai. On a personal plan only the owner and
  people invited by email as editors can write, and editors lose write access if a public link is on.
- **GitHub Pages version:** device-only. No shared leaderboard, and Safari may clear the data after 7
  days without a visit. The public shared version needs its own sign-in + database (e.g. Supabase).
  `store.js` was built so that becomes a third backend with the same seven methods.
- **Stats are a placeholder set** until the house's real stat list arrives. Swap them in `config.js`;
  never rename a `k` once games exist.
- Tournaments: not built yet.
