# Dice Tracker

A stat tracker for **die**, the dice table game. Make a group for your house or your friends, register
players once, and log games from any phone. Leaderboards, awards and a two-sentence recap of every game
fill in on their own.

## What it does

- **Start a game in seconds.** Pick four registered players from search. Typos are forgiven, and
  near-duplicate names ("Jake" vs "Jaek") are caught before they become two people.
- **Two ways to log.** *All four* shows the whole table with every player's buttons. *Throw by throw*
  shows one thrower at a time in order, and a single tap records the throw plus any catch or drop.
- **The stat sheet:** throws, points, fair table hits, short table hits, cup hits, sinks and misses,
  plus catches and drops when defense is tracked.
- **Total throws are automatic.** Every outcome counts as a throw, so everyone's throw count is always
  right, and the live game flags anyone who's behind.
- **Defense is optional.** Turn catches and drops off for any game, even halfway through.
- **Substitutions.** The player coming out keeps their stats, the sub starts at zero, and both get
  credit for the game.
- **Edit any game, any time.** Fix numbers, swap in the right player, change the date, or mark it
  "Didn't count" (kept on record, left out of stats). Undo reverses the last tap.
- **Pledge tracking.** Tag pledges by class. Games they played as pledges stay tagged after
  initiation, and profiles show pledge-era stats separately.
- **Leaderboard and awards.** Sort by any stat and filter by season, last 30 days or all time. Awards:
  MVP, Defensive Player, Sniper, Most Sinks, Iron Man, Top Pledge, Best Duo.

## Where games are saved

| How you open it | Where games are saved |
|---|---|
| Published on claude.ai (`artifact.html`) | A shared database. Everyone signed in with access sees the same games, live. |
| Anywhere else (GitHub Pages, any web host, opening `index.html` directly) | **This browser only.** Other phones don't see the games. |

Browser-only storage is fine for trying the app, but it shouldn't hold a season's only record. Safari
clears a site's saved data after 7 days without a visit. A shared database for the public web version
is the next step on the roadmap.

## Put it on GitHub Pages (free hosting)

1. Upload the contents of this folder to a GitHub repository, with `index.html` at the top level.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, set Source to **Deploy from a branch**, pick **main** and
   **/ (root)**, then press **Save**.
4. After about a minute the site is live at `https://<your-username>.github.io/<repository-name>/`.

There's no build step. The files are served exactly as they are.

## Change what gets tracked

Everything tracked is defined in [`js/config.js`](js/config.js):

- `OUTCOMES`: what a throw can do (Point, Fair hit, Short hit, Cup hit, Sink, Miss).
- `DEFENSE`: defensive plays (Catch, Drop).
- `DEFAULT_RULES`: target score, win-by, what a sink is worth. Each group can also change these in the app.
- Award thresholds: minimum games, minimum throws.

Add a stat by adding a row. **Never rename a stat's `k` key once games exist**, because old games would
lose that column. Change its `label` instead.

## Files

| File | What it does |
|---|---|
| `index.html` | The page for normal web hosting |
| `artifact.html` | The same app's page for publishing on claude.ai |
| `app.css` | All styling, light and dark |
| `js/config.js` | What gets tracked |
| `js/logic.js` | Scoring, leaderboard, awards, recaps, name search: pure maths, no screen |
| `js/store.js` | Where data is saved: shared database or this browser |
| `js/views.js` | Every screen |
| `js/app.js` | Taps, forms, navigation, start-up |
| `smoke.js` | Automated tests that drive the real app like a person would |

## Tests

Needs [Node.js](https://nodejs.org).

```
npm install
npm test
```

## Roadmap

- Shared database and sign-in for the public web version, so every phone sees the same games.
- Tournaments.
