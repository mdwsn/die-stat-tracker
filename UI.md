# UI notes — the "real product" polish pass (1 Nov 2026)

The aim: open it next to the old app and ours feels live, fast and phone-first; his feels like a
spreadsheet. Plain HTML/CSS/JS on GitHub Pages, with no framework. `js/config.js`, the Supabase schema,
sign-in and the access rules were not touched.

## What changed

**Live game**
- Scores **tick** when they change: a +1 rolls in from below, and bigger jumps count up over 250 ms.
  The same goes for the Live now card, TV mode, and each tap button's count.
- **Who's up** is pinned inside the sticky scorebar ("Up next: Chris Diaz", or "Throwing" in throw-by-throw
  mode), and that player's seat is outlined with an **Up** tag. In "All four" mode, whoever has thrown
  least goes next, in the usual order.
- **One shot of confetti** for the winners the moment a game goes final, on the scorer's phone, every
  watcher's, and the TV. It never repeats on a redraw, and a tie gets none.
- **Bigger targets:** stat buttons are 56px tall, throw-by-throw buttons 64px, main buttons 48px.
- A **10 ms buzz** on every scoring tap, on phones that support it. iPhone browsers don't allow it, so
  nothing happens there.

**Leaderboard**
- Rows **slide** to their new place when ranks change, from a live update or a re-sort, with a brief
  highlight on rows that moved.
- **Top three:** rank 1 is an accent badge with a small crown and a faint row tint, rank 2 a solid badge,
  rank 3 an outlined one. Only players with enough games to qualify get them.

**Play and empty states**
- A **Live now** card for every game in progress: big score, who's up, last play, and one button
  (**Keep scoring** if it's yours, **Watch live** if not). Other screens keep the thin Live bar.
- Empty states say what to do next. For example, "Nothing finished this season" comes with a **Show all
  time** button, and Play explains that a game needs four players and new names can be typed straight
  into a seat.
- **Loading placeholders:** the page's shape pulses while data arrives, instead of briefly claiming
  "No players yet".

**Look and motion**
- **Dark is the default.** Light is available in House → Appearance, saved per device and applied
  before the page draws, so there's no flash.
- **Glass only where things float over content:** the top bar, tabs, scorebar, Live now card and toast.
  Cards stay solid. There's one faint accent wash at the top of the page.
- **One motion system:** 150 / 200 / 250 ms (`--dur-1…3`) with a short spring (`--spring`). Buttons
  press to 97% and stat buttons to 94%. Screens rise in **only when you navigate**, never on a tap,
  because re-animating the whole page on every throw reads like a reload.
- **Reduced motion is respected.** If the phone asks for less motion, there's no ticker, slide, rise or
  confetti; the numbers just change. Haptics aren't motion, so they still work.
- A toast with a check mark confirms saves, including "All changes saved" when a phone catches up after
  being offline.

## Where it lives

- Tokens (colours, glass, motion): the top of `app.css`. The new rules are in the "motion & live polish"
  block near the end.
- Ticker, row slide, confetti and buzz: the "motion" section at the top of `render()` in `js/app.js`.
- Live now card, who's up, medals and placeholders: `js/views.js` (`liveHero`, `upRow`, `V.skeleton`).
- Who's up and who may score: `nextUp()` and `canScore()` in `js/logic.js`.

## Checking it on a phone

The site keeps a copy of its files for offline use, but it always tries the network first. A normal
refresh is enough once a new version is uploaded. If an old version ever sticks, close the tab and
reopen it.
