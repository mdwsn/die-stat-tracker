/* ================================================================
   [LOGIC] Pure math: scoring, stat totals, leaderboard, awards,
   game summaries, name search. Nothing in this file touches the
   screen or the database — it takes data and returns answers, which
   is what lets smoke.js test it without a browser.
   ================================================================ */
(function (P) {
  'use strict';
  var OUT_KEYS = P.OUTCOMES.map(function (o) { return o.k; });
  var DEF_KEYS = P.DEFENSE.map(function (d) { return d.k; });
  var ALL_KEYS = OUT_KEYS.concat(DEF_KEYS);
  var DAY = 864e5;

  /* ---------- small helpers ---------- */
  function uid(prefix) {
    var r = '';
    try { r = crypto.randomUUID().replace(/-/g, ''); } catch (e) { r = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
    return (prefix || '') + Date.now().toString(36) + r.slice(0, 10);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(x) { return x == null || !isFinite(x) ? null : x; }
  function fmtPct(x) { return x == null || !isFinite(x) ? '—' : Math.round(x * 100) + '%'; }
  function fmt1(x) { return x == null || !isFinite(x) ? '—' : (Math.round(x * 10) / 10).toFixed(1); }
  function plural(n, word, many) { return n + ' ' + (n === 1 ? word : (many || word + 's')); }
  function joinNames(list) {
    if (list.length <= 1) return list.join('');
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }
  function blankStats() { var s = {}; ALL_KEYS.forEach(function (k) { s[k] = 0; }); return s; }

  /* ---------- one player's line in one game ---------- */
  function throwsOf(s) { s = s || {}; return OUT_KEYS.reduce(function (n, k) { return n + (s[k] || 0); }, 0); }
  function hitsOf(s) {
    s = s || {};
    return P.OUTCOMES.reduce(function (n, o) { return n + (o.hit ? (s[o.k] || 0) : 0); }, 0);
  }
  /* "Fair table hits": every fair landing, the ones that scored included */
  function fairOf(s) {
    s = s || {};
    return P.OUTCOMES.reduce(function (n, o) { return n + (o.fair ? (s[o.k] || 0) : 0); }, 0);
  }
  function pointsOf(s, rules) {
    s = s || {}; rules = rules || P.DEFAULT_RULES;
    return P.OUTCOMES.reduce(function (n, o) {
      if (!o.points) return n;
      // a sink is worth the house value; 0 is a real setting, so only a missing value falls back to 1
      var each = o.points === 'sink' ? Number(rules.plunkPts != null ? rules.plunkPts : 1) : o.points;
      return n + each * (s[o.k] || 0);
    }, 0);
  }

  /* ---------- games ---------- */
  function newGame(opts) {
    var now = Date.now();
    var g = {
      id: uid('g'), status: 'live', created: now, started: now, ended: null, updated: now,
      by: opts.by || null, mode: opts.mode || 'table',
      defense: opts.defense !== false,
      rules: Object.assign({}, P.DEFAULT_RULES, opts.rules || {}),
      teams: [opts.teams[0].slice(), opts.teams[1].slice()],
      appeared: [opts.teams[0].slice(), opts.teams[1].slice()],
      stats: {}, adj: [0, 0], pledges: (opts.pledges || []).slice(),
      log: [], turn: 0, subs: [], summary: '', edits: []
    };
    g.appeared[0].concat(g.appeared[1]).forEach(function (pid) { g.stats[pid] = blankStats(); });
    return g;
  }
  function teamScore(g, ti) {
    var total = (g.appeared[ti] || []).reduce(function (n, pid) { return n + pointsOf(g.stats[pid], g.rules); }, 0);
    return total + Number((g.adj || [0, 0])[ti] || 0);
  }
  function winnerOf(g) {
    var a = teamScore(g, 0), b = teamScore(g, 1);
    return a > b ? 0 : b > a ? 1 : null;
  }
  /* done: someone reached the target with the required lead.
     point: a team is one score from winning (shown as GAME POINT). */
  function winState(g) {
    var r = g.rules || P.DEFAULT_RULES, a = teamScore(g, 0), b = teamScore(g, 1);
    var done = Math.max(a, b) >= r.target && Math.abs(a - b) >= r.winBy;
    function onePointAway(me, them) { return me + 1 >= r.target && me + 1 - them >= r.winBy; }
    return {
      a: a, b: b, done: done, winner: done ? (a > b ? 0 : 1) : null,
      point: done ? null : onePointAway(a, b) ? 0 : onePointAway(b, a) ? 1 : null
    };
  }
  /* Throw order for throw-by-throw mode: teams alternate, partners alternate. */
  function throwOrder(g) { return [g.teams[0][0], g.teams[1][0], g.teams[0][1], g.teams[1][1]]; }
  function thrower(g) { return throwOrder(g)[(g.turn || 0) % 4]; }
  function teamOf(g, pid) {
    if ((g.appeared[0] || []).indexOf(pid) >= 0) return 0;
    if ((g.appeared[1] || []).indexOf(pid) >= 0) return 1;
    return -1;
  }

  /* Every tap is one log entry, so Undo reverses exactly one tap —
     including a combined tap like "Point, dropped by Matt". */
  function record(g, items, advanceTurn) {
    items.forEach(function (it) {
      var s = g.stats[it[0]] || (g.stats[it[0]] = blankStats());
      s[it[1]] = Math.max(0, (s[it[1]] || 0) + it[2]);
    });
    g.log.push({ at: Date.now(), it: items, tr: advanceTurn ? 1 : 0 });
    if (advanceTurn) g.turn = ((g.turn || 0) + 1) % 4;
    g.updated = Date.now();
    return g;
  }
  function undo(g) {
    var e = g.log.pop();
    if (!e) return null;
    e.it.forEach(function (it) {
      var s = g.stats[it[0]];
      if (s) s[it[1]] = Math.max(0, (s[it[1]] || 0) - it[2]);
    });
    if (e.tr) g.turn = ((g.turn || 0) + 3) % 4;
    g.updated = Date.now();
    return e;
  }
  /* Substitution: the player leaving keeps what they did; the new one
     starts at zero. Both count as having played the game. */
  function substitute(g, ti, si, inPid, inIsPledge) {
    var out = g.teams[ti][si];
    if (out === inPid) return g;
    g.teams[ti][si] = inPid;
    if (g.appeared[ti].indexOf(inPid) < 0) g.appeared[ti].push(inPid);
    if (!g.stats[inPid]) g.stats[inPid] = blankStats();
    if (inIsPledge && g.pledges.indexOf(inPid) < 0) g.pledges.push(inPid);
    g.subs.push({ at: Date.now(), ti: ti, out: out, 'in': inPid });
    g.updated = Date.now();
    return g;
  }
  /* Correction, not a sub: the wrong person was picked. Their whole line
     moves to the right person, as if they'd been picked from the start. */
  function replacePlayer(g, oldPid, newPid, newIsPledge) {
    if (oldPid === newPid) return g;
    function swap(arr) { return arr.map(function (p) { return p === oldPid ? newPid : p; }); }
    g.teams = g.teams.map(swap);
    g.appeared = g.appeared.map(swap);
    g.stats[newPid] = g.stats[oldPid] || blankStats();
    delete g.stats[oldPid];
    g.pledges = g.pledges.filter(function (p) { return p !== oldPid; });
    if (newIsPledge) g.pledges.push(newPid);
    g.log.forEach(function (e) { e.it.forEach(function (it) { if (it[0] === oldPid) it[0] = newPid; }); });
    g.subs.forEach(function (s) { if (s.out === oldPid) s.out = newPid; if (s['in'] === oldPid) s['in'] = newPid; });
    g.updated = Date.now();
    return g;
  }
  /* Throws-are-even check: who is behind the most-thrown player. */
  function throwGaps(g) {
    var cur = g.teams[0].concat(g.teams[1]);
    var t = cur.map(function (pid) { return throwsOf(g.stats[pid]); });
    var max = Math.max.apply(null, t);
    var out = {};
    cur.forEach(function (pid, i) { out[pid] = max - t[i]; });
    return out;
  }

  /* ---------- the two-sentence recap ---------- */
  function summarize(g, nameOf) {
    var sa = teamScore(g, 0), sb = teamScore(g, 1), w = winnerOf(g), r = g.rules || P.DEFAULT_RULES;
    function side(ti) { return joinNames(g.teams[ti].map(nameOf)); }
    var s1;
    if (w === null) {
      s1 = side(0) + ' and ' + side(1) + ' finished level at ' + sa + '–' + sb;
    } else {
      var W = side(w), L = side(1 - w), ws = Math.max(sa, sb), ls = Math.min(sa, sb), m = ws - ls;
      if (ls === 0) s1 = W + ' shut out ' + L + ' ' + ws + '–0';
      else if (ws > r.target) s1 = W + ' outlasted ' + L + ' ' + ws + '–' + ls + ' past the target of ' + r.target;
      else if (m >= 5) s1 = W + ' ran ' + L + ' off the table ' + ws + '–' + ls;
      else if (m <= 2) s1 = W + ' edged ' + L + ' ' + ws + '–' + ls;
      else s1 = W + ' beat ' + L + ' ' + ws + '–' + ls;
    }
    var mins = g.ended && g.started ? Math.round((g.ended - g.started) / 6e4) : 0;
    if (mins >= 2 && mins <= 300) s1 += ' in ' + mins + ' minutes';
    s1 += '.';

    var everyone = g.appeared[0].concat(g.appeared[1]);
    var totalThrows = everyone.reduce(function (n, p) { return n + throwsOf(g.stats[p]); }, 0);
    if (!totalThrows) return s1 + ' No throws were logged.';
    var star = everyone.slice().sort(function (x, y) {
      var px = pointsOf(g.stats[x], r), py = pointsOf(g.stats[y], r);
      if (py !== px) return py - px;
      return hitsOf(g.stats[y]) / Math.max(1, throwsOf(g.stats[y])) - hitsOf(g.stats[x]) / Math.max(1, throwsOf(g.stats[x]));
    })[0];
    var st = g.stats[star], th = throwsOf(st);
    var s2 = nameOf(star) + ' led the table with ' + plural(pointsOf(st, r), 'point') +
      ' on ' + Math.round(hitsOf(st) / Math.max(1, th) * 100) + '% hitting';
    if (st.snk) s2 += ', including ' + plural(st.snk, 'sink');
    if (g.defense) {
      var glove = everyone.slice().sort(function (x, y) { return (g.stats[y].ctc || 0) - (g.stats[x].ctc || 0); })[0];
      var c = g.stats[glove].ctc || 0;
      if (c >= 2 && glove !== star) s2 += ', while ' + nameOf(glove) + ' made ' + plural(c, 'catch', 'catches') + ' on defense';
      else if (c >= 2) s2 += ' and made ' + plural(c, 'catch', 'catches') + ' on defense';
    }
    return s1 + ' ' + s2 + '.';
  }

  /* ---------- periods ---------- */
  function seasonStart(now) {
    var d = new Date(now || Date.now());
    var y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;   // school year starts Aug 1
    return new Date(y, 7, 1).getTime();
  }
  function seasonLabel(now) {
    var y = new Date(seasonStart(now)).getFullYear();
    return y + '–' + String(y + 1).slice(2);
  }
  function inPeriod(g, period, now) {
    var t = g.started || g.created || 0;
    now = now || Date.now();
    if (period === 'season') return t >= seasonStart(now);
    if (period === '30d') return t >= now - 30 * DAY;
    return true;
  }

  /* ---------- leaderboard ---------- */
  function emptyLine() { return { gp: 0, w: 0, l: 0, d: 0, defGp: 0, pts: 0, s: blankStats() }; }
  function addLine(line, g, pid, ti, win) {
    var st = g.stats[pid] || {};
    line.gp++;
    if (win === ti) line.w++; else if (win === null) line.d++; else line.l++;
    if (g.defense) line.defGp++;
    line.pts += pointsOf(st, g.rules);
    ALL_KEYS.forEach(function (k) { line.s[k] += st[k] || 0; });
  }
  function derive(line) {
    var s = line.s, thr = throwsOf(s), hits = hitsOf(s), chances = s.ctc + s.drp;
    line.thr = thr; line.hits = hits;
    line.fair = fairOf(s); line.short = s.sht || 0;
    line.hitPct = thr ? hits / thr : null;
    line.winPct = line.gp ? line.w / line.gp : null;
    line.ppg = line.gp ? line.pts / line.gp : null;
    line.catchPct = chances ? s.ctc / chances : null;
    line.dpg = line.defGp ? (s.ctc - s.drp) / line.defGp : null;
    /* Impact per game — the MVP number. Points carry it; catches add
       half a point, drops take half away (only in games tracking defense). */
    line.impact = line.gp ? (line.pts + 0.5 * s.ctc - 0.5 * s.drp) / line.gp : null;
    line.tpg = line.gp ? thr / line.gp : null;
    return line;
  }
  /* games: every game in the group; only finished ones count. */
  function leaderboard(games, players, period, now) {
    var rows = {};
    players.forEach(function (p) {
      var r = emptyLine(); r.pid = p.id; r.pledgeLine = emptyLine(); r.last = 0;
      rows[p.id] = r;
    });
    games.forEach(function (g) {
      if (g.status !== 'final' || !inPeriod(g, period, now)) return;
      var win = winnerOf(g);
      [0, 1].forEach(function (ti) {
        g.appeared[ti].forEach(function (pid) {
          var r = rows[pid];
          if (!r) return;                       // player record missing — skip, never crash
          addLine(r, g, pid, ti, win);
          if ((g.pledges || []).indexOf(pid) >= 0) addLine(r.pledgeLine, g, pid, ti, win);
          r.last = Math.max(r.last, g.started || g.created || 0);
        });
      });
    });
    return Object.keys(rows).map(function (k) {
      var r = derive(rows[k]); derive(r.pledgeLine); return r;
    });
  }

  /* ---------- awards ---------- */
  function best(list, key, tie) {
    var c = list.filter(function (r) { return r[key] != null && isFinite(r[key]); });
    c.sort(function (a, b) { return (b[key] - a[key]) || (tie ? (b[tie] || 0) - (a[tie] || 0) : 0); });
    return c[0] || null;
  }
  function duos(games, period, now) {
    var map = {};
    games.forEach(function (g) {
      if (g.status !== 'final' || !inPeriod(g, period, now)) return;
      var win = winnerOf(g);
      [0, 1].forEach(function (ti) {
        var t = g.teams[ti].slice().sort();
        var key = t.join('|');
        var d = map[key] || (map[key] = { pids: t, gp: 0, w: 0 });
        d.gp++; if (win === ti) d.w++;
      });
    });
    return Object.keys(map).map(function (k) { var d = map[k]; d.winPct = d.w / d.gp; return d; });
  }
  function awards(rows, games, period, now) {
    var q = rows.filter(function (r) { return r.gp >= P.MIN_GAMES; });
    var out = [];
    var mvp = best(q, 'impact', 'winPct');
    if (mvp) out.push({ key: 'mvp', title: 'MVP', pids: [mvp.pid], value: fmt1(mvp.impact) + ' impact / game', note: 'Points per game, plus half a point per catch, minus half per drop' });
    var dq = q.filter(function (r) { return r.defGp >= P.MIN_GAMES && r.s.ctc > 0; });
    var dpoy = best(dq, 'dpg', 'catchPct');
    if (dpoy) out.push({ key: 'dpoy', title: 'Defensive Player', pids: [dpoy.pid], value: fmtPct(dpoy.catchPct) + ' catch rate', note: 'Most catches minus drops per game tracked' });
    var sn = best(q.filter(function (r) { return r.thr >= P.MIN_THROWS; }), 'hitPct', 'thr');
    if (sn) out.push({ key: 'sniper', title: 'Sniper', pids: [sn.pid], value: fmtPct(sn.hitPct) + ' on the table', note: 'Best hit rate, ' + P.MIN_THROWS + '+ throws' });
    var sk = best(rows.filter(function (r) { return r.s.snk > 0; }).map(function (r) { return Object.assign({}, r, { sinks: r.s.snk }); }), 'sinks', 'gp');
    if (sk) out.push({ key: 'sinks', title: 'Most Sinks', pids: [sk.pid], value: plural(sk.sinks, 'sink'), note: 'Most dice in the cup' });
    var im = best(rows.filter(function (r) { return r.gp > 0; }), 'gp', 'winPct');
    if (im) out.push({ key: 'iron', title: 'Iron Man', pids: [im.pid], value: plural(im.gp, 'game'), note: 'Most games played' });
    var pl = best(rows.filter(function (r) { return r.pledgeLine.gp >= P.MIN_GAMES; }).map(function (r) {
      return { pid: r.pid, impact: r.pledgeLine.impact, winPct: r.pledgeLine.winPct };
    }), 'impact', 'winPct');
    if (pl) out.push({ key: 'pledge', title: 'Top Pledge', pids: [pl.pid], value: fmt1(pl.impact) + ' impact / game', note: 'MVP number, counting only games played as a pledge' });
    var duo = best(duos(games, period, now).filter(function (d) { return d.gp >= P.MIN_DUO_GAMES; }), 'winPct', 'gp');
    if (duo) out.push({ key: 'duo', title: 'Best Duo', pids: duo.pids, value: duo.w + '–' + (duo.gp - duo.w) + ' together', note: 'Best record as partners, ' + P.MIN_DUO_GAMES + '+ games' });
    return out;
  }

  /* ---------- name search (stops "Jake" / "jake" / "Jaek" becoming 3 people) ---------- */
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length; if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  function tolerance(len) { return len <= 2 ? 0 : len <= 5 ? 1 : 2; }
  /* "jke" fits inside "jake" in order — a dropped letter, the commonest typo on a phone */
  function subseq(q, w) {
    if (q.length < 3 || q[0] !== w[0]) return false;
    for (var i = 0, j = 0; j < w.length && i < q.length; j++) if (q[i] === w[j]) i++;
    return i === q.length;
  }
  function matchScore(p, q) {
    var n = norm(p.name), k = norm(p.nick);
    if (!q) return 1;
    if (n === q || k === q) return 100;
    if (n.indexOf(q) === 0 || (k && k.indexOf(q) === 0)) return 80;
    var words = (n + ' ' + k).split(' ').filter(Boolean);
    if (words.some(function (w) { return w.indexOf(q) === 0; })) return 70;
    if (n.indexOf(q) >= 0 || (k && k.indexOf(q) >= 0)) return 50;
    var tol = tolerance(q.length), d = Math.min(lev(q, n), words.reduce(function (m, w) {
      return Math.min(m, lev(q, w), lev(q, w.slice(0, q.length)));     // whole word, or the start of it
    }, 99));
    if (d <= tol) return 30 - d;
    if (words.some(function (w) { return subseq(q, w); }) || subseq(q.replace(/ /g, ''), n.replace(/ /g, ''))) return 20;
    return 0;
  }
  function searchPlayers(players, query, exclude) {
    var q = norm(query); exclude = exclude || [];
    return players
      .filter(function (p) { return !p.archived && exclude.indexOf(p.id) < 0; })
      .map(function (p) { return { p: p, sc: matchScore(p, q) }; })
      .filter(function (x) { return x.sc > 0; })
      .sort(function (a, b) { return (b.sc - a.sc) || ((b.p.lastPlayed || 0) - (a.p.lastPlayed || 0)) || a.p.name.localeCompare(b.p.name); })
      .map(function (x) { return x.p; });
  }
  /* Before registering a new name: exact duplicates are blocked, near
     misses ("Jaek" vs "Jake") are offered as "did you mean". */
  function lookalikes(players, name) {
    var q = norm(name);
    if (!q) return { exact: null, near: [] };
    var exact = null, near = [];
    players.forEach(function (p) {
      var n = norm(p.name), k = norm(p.nick);
      if (n === q || (k && k === q)) { exact = exact || p; return; }
      var d = Math.min(lev(q, n), k ? lev(q, k) : 99);
      var firstSame = n.split(' ')[0] === q.split(' ')[0] && q.split(' ')[0].length >= 3;
      if (d <= Math.max(1, tolerance(q.length)) || firstSame) near.push(p);
    });
    return { exact: exact, near: near.slice(0, 4) };
  }

  P.logic = {
    OUT_KEYS: OUT_KEYS, DEF_KEYS: DEF_KEYS, ALL_KEYS: ALL_KEYS,
    uid: uid, esc: esc, pct: pct, fmtPct: fmtPct, fmt1: fmt1, plural: plural, joinNames: joinNames,
    blankStats: blankStats, throwsOf: throwsOf, hitsOf: hitsOf, fairOf: fairOf, pointsOf: pointsOf,
    newGame: newGame, teamScore: teamScore, winnerOf: winnerOf, winState: winState,
    throwOrder: throwOrder, thrower: thrower, teamOf: teamOf,
    record: record, undo: undo, substitute: substitute, replacePlayer: replacePlayer, throwGaps: throwGaps,
    summarize: summarize, seasonStart: seasonStart, seasonLabel: seasonLabel, inPeriod: inPeriod,
    leaderboard: leaderboard, awards: awards, duos: duos,
    norm: norm, lev: lev, searchPlayers: searchPlayers, lookalikes: lookalikes
  };
})(window.PLUNK);
