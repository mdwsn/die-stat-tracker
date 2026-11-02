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
  MVP, Defensive Player, Sniper, Most Sinks, Iron Man, Top Pledge, Best Pledge Statistician, Best Duo.
- **Credit for keeping stats.** Every game records who logged it ("Stats kept by"). The pledge who
  tracked the most games wins Best Pledge Statistician. The phone remembers its stats-keeper between games.

## Where games are saved

| How you open it | Where games are saved |
|---|---|
| **The website**: `index.html` with the Supabase settings filled in (`js/config.js`) | **One shared database.** You sign in, join your group by invite link, and every phone sees the same games, live. Taps made with no signal are kept on the phone and save when the signal returns. |
| `index.html` without those settings | This browser only. Other phones don't see the games. Fine for trying it out. |
| Published on claude.ai (`artifact.html`) | claude.ai's shared database. This was the first version and is kept working, but the website is the real app. |

## Put it online

[SETUP.md](SETUP.md) walks through it in about 20 minutes: GitHub Pages hosts the site for free, and
Supabase (free tier) handles sign-in and the shared database. There's no build step; the files are served
exactly as they are.

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
| `js/store.js` | Where data is saved: the website's database (Supabase), claude.ai's, or this browser |
| `js/views.js` | Every screen |
| `js/app.js` | Taps, forms, navigation, start-up |
| `smoke.js` | Automated tests that drive the real app like a person would |
| `supabase/schema.sql` | The database: tables, and the rules for who can see and change what |
| `tests/fake-supabase.js` | An in-memory stand-in for Supabase so the tests can run the website path |
| `SETUP.md` | Step-by-step: putting the site online |

## Tests

Needs [Node.js](https://nodejs.org).

```
npm install
npm test
```

## Roadmap

- "Continue with Google" sign-in and password-reset emails (see the end of SETUP.md).
- Tournaments.
