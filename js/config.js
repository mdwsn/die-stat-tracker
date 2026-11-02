/* ================================================================
   [CONFIG] What Dice Tracker tracks. Edit here to change the stat sheet.
   ----------------------------------------------------------------
   Every throw has exactly ONE outcome from OUTCOMES. Tapping an
   outcome also counts the throw, so "total throws" is never typed —
   it is always the sum of outcomes, and can't drift out of sync.

     tap     the button label on the live screen and in the editor
     col     the column name in box scores and the leaderboard
     fair    counts toward "Fair table hits" (Point + Fair hit)
     hit     counts toward Hit % (everything that landed on target)
     points  what it adds to the score; 'sink' = the house sink value

   DEFENSE plays are separate and optional: a game can collapse them
   (track offense only) without losing anything already logged.

   Adding a stat = adding a row. `k` is the saved key — NEVER rename a
   key once games exist, or old games lose that column. Change the
   label instead. (That's why sinks are saved as `snk` and cup hits as
   `plk`: the keys predate the current names.)
   ================================================================ */
var PLUNK = window.PLUNK = window.PLUNK || {};   // internal name, kept so saved data still loads

PLUNK.OUTCOMES = [
  { k: 'pt',  tap: 'Point',     col: 'Points',           hint: 'Fair table hit that scored',       points: 1,      fair: true, hit: true },
  { k: 'tbl', tap: 'Fair hit',  col: 'Fair hits',        hint: 'Fair table hit, no point',                         fair: true, hit: true },
  { k: 'sht', tap: 'Short hit', col: 'Short table hits', hint: 'Hit the table short' },
  { k: 'plk', tap: 'Cup hit',   col: 'Cup hits',         hint: 'Hit a cup and stayed out',                                     hit: true },
  { k: 'snk', tap: 'Sink',      col: 'Sinks',            hint: 'Landed in the cup',                points: 'sink',             hit: true },
  { k: 'mis', tap: 'Miss',      col: 'Misses',           hint: 'Missed the table' }
];

PLUNK.DEFENSE = [
  { k: 'ctc', tap: 'Catch', col: 'Catches', hint: 'Caught it' },
  { k: 'drp', tap: 'Drop',  col: 'Drops',   hint: 'Should have caught it' }
];

/* House rules — every group can change these in House → House rules. */
PLUNK.DEFAULT_RULES = {
  target: 7,     // first to…
  winBy: 2,      // …winning by this many
  plunkPts: 1,   // what a SINK is worth (saved key predates the name — don't rename)
  defense: true  // new games track catches/drops unless turned off
};

/* Leaderboard & awards thresholds — keeps a 1-game wonder off the top. */
PLUNK.MIN_GAMES = 3;        // games before rates and awards count
PLUNK.MIN_THROWS = 25;      // throws before hit % can win Sniper
PLUNK.MIN_DUO_GAMES = 3;    // games together before a pair can be Best Duo
PLUNK.EVEN_TOLERANCE = 1;   // live game flags anyone this many throws behind

PLUNK.APP_NAME = 'Dice Tracker';

/* The real website's database (Supabase). Both values come from the
   Supabase dashboard (SETUP.md, step 2). They are PUBLIC by design and
   safe to commit: the database's own rules (supabase/schema.sql) decide
   who can read or write anything. Leave them empty and the app saves to
   this browser only. */
PLUNK.BACKEND = {
  url: 'https://yodibwocxusukufwdjip.supabase.co',
  key: 'sb_publishable_GviVTDDQ7_o45lqwNsaGTA_MxlqBBSN',
  google: false   // true once Google sign-in is switched on (SETUP.md, step 5)
};
