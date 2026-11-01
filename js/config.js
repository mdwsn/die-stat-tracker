/* ================================================================
   [CONFIG] What Plunk tracks. Edit here to change the stat sheet.
   ----------------------------------------------------------------
   Every throw has exactly ONE outcome from OUTCOMES. Tapping an
   outcome also counts the throw, so "total throws" is never typed —
   it is always the sum of outcomes, and can't drift out of sync.

   DEFENSE plays are separate and optional: a game can collapse them
   (track offense only) without losing anything already logged.

   Adding a stat = adding a row. `k` is the saved key — never rename
   a key once games exist, or old games lose that column. Change the
   label instead.
   ================================================================ */
var PLUNK = window.PLUNK = window.PLUNK || {};

PLUNK.OUTCOMES = [
  { k: 'pt',  label: 'Point', short: 'PTS', hint: 'Hit the table and scored',  points: 1,       onTable: true },
  { k: 'tbl', label: 'Table', short: 'TBL', hint: 'Hit the table, no point',                    onTable: true },
  { k: 'plk', label: 'Plink', short: 'PLK', hint: 'Hit a cup, no point',                         onTable: true },
  { k: 'snk', label: 'Plunk', short: 'PLU', hint: 'Landed in the cup',          points: 'plunk', onTable: true },
  { k: 'mis', label: 'Miss',  short: 'MIS', hint: 'Missed the table' }
];

PLUNK.DEFENSE = [
  { k: 'ctc', label: 'Catch', short: 'CTC', hint: 'Caught it' },
  { k: 'drp', label: 'Drop',  short: 'DRP', hint: 'Should have caught it' }
];

/* House rules — every group can change these in Group → Rules. */
PLUNK.DEFAULT_RULES = {
  target: 7,     // first to…
  winBy: 2,      // …winning by this many
  plunkPts: 1,   // what a plunk is worth on the scoreboard
  defense: true  // new games track catches/drops unless turned off
};

/* Leaderboard & awards thresholds — keeps a 1-game wonder off the top. */
PLUNK.MIN_GAMES = 3;        // games before rates and awards count
PLUNK.MIN_THROWS = 25;      // throws before hit % can win Sniper
PLUNK.MIN_DUO_GAMES = 3;    // games together before a pair can be Best Duo
PLUNK.EVEN_TOLERANCE = 1;   // live game flags anyone this many throws behind

PLUNK.APP_NAME = 'Plunk';
