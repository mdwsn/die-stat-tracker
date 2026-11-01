# CLAUDE.md — Plunk (die stat tracker)

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

## Two page files, one app
- `index.html` is a complete page for GitHub Pages or any static host. It runs in **device-only**
  mode there (localStorage) and shows a dismissable note saying so.
- `artifact.html` is a bare shell for claude.ai, which wraps it in its own page skeleton. **Never add
  doctype/html/head/body to it.** Publish it with the Artifact tool, passing
  `url: https://claude.ai/artifact/6XjXsZBPBCcoguetrH44VL` (the live shared version). It declares the
  `db` + `user` capabilities, so it runs on the shared database.
- smoke.js §0 fails if the two stop loading the same scripts or containers. A new script goes in both.

## Files
`app.css` (tokens at top, light + dark) · `js/config.js` (**what gets tracked**) · `js/logic.js` (pure
maths) · `js/store.js` (two backends with identical methods) · `js/views.js` (screens; views only
read) · `js/app.js` (state, `data-act` taps, forms, sheets, boot) · `smoke.js` (`npm test`, 60 checks).
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
- Hairline zinc borders and the faintest shadows. **No glow, no gradients, no glassmorphism/blur.**
- Layout: phone = top bar + bottom tabs; 900px+ = 240px sidebar (group switcher, New game, nav,
  storage status). `.app.solo` (no group yet) has no sidebar.
- Dense leaderboard: 40px rows, 13px text, sticky header + sticky player column; awards are compact cards.
- **Specificity trap (shipped once, caught in preview):** `.btn` sets `display:inline-flex` and sits
  below the chrome rules, so an unscoped `.side-new{display:none}` loses on order and the sidebar's
  button leaks onto phones. Hide rules for chrome are scoped `.top .side-new`. Same trap for any
  component class that also carries `.btn`.

## Decisions (settled)
- **Throws are never typed.** Every throw has exactly one outcome (Point/Table/Plink/Plunk/Miss), and
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
