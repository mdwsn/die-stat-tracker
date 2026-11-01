/* ================================================================
   [VIEWS] Every screen, as an HTML string built from data.
   Views only READ — they never save anything. Every button carries
   data-act="…" and app.js decides what the tap does.
   ================================================================ */
(function (P) {
  'use strict';
  var L = P.logic, esc = L.esc;
  var V = P.views = {};

  /* ---------- icons: 24px line icons, coloured by CSS via currentColor ---------- */
  var ICONS = {
    play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5.5 3.5-5.5 3.5z"/>',
    board: '<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V6"/><path d="M17 16v-8"/>',
    games: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>',
    players: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.5c1.4.8 2.3 2.4 2.5 4.5"/>',
    group: '<path d="M3.5 10.5 12 4l8.5 6.5"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5h4v5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    updown: '<path d="m8 15 4 4 4-4"/><path d="m8 9 4-4 4 4"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    back: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
    shuffle: '<path d="m18 4 3 3-3 3"/><path d="m18 14 3 3-3 3"/><path d="M3 7h3.5a4 4 0 0 1 3.3 1.8l4.4 6.4a4 4 0 0 0 3.3 1.8H21"/><path d="M3 17h3.5a4 4 0 0 0 3.3-1.8l.7-1M13.5 9.8l.7-1A4 4 0 0 1 17.5 7H21"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.5 2.5 0 0 0 2.6 3.9M16 6h2.5a2.5 2.5 0 0 1-2.6 3.9"/><path d="M12 13v3M9 20h6M10 16h4l.5 4h-5z"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/>',
    crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/>',
    star: '<path d="m12 3.5 2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.4l-5.1 2.9 1.1-5.8-4.3-4 5.8-.7z"/>'
  };
  var AWARD_ICON = { mvp: 'trophy', dpoy: 'shield', sniper: 'crosshair', sinks: 'target', iron: 'repeat', pledge: 'star', duo: 'players' };
  /* [route, sidebar label, phone tab label] */
  var TABS = [['play', 'Play', 'Play'], ['board', 'Leaderboard', 'Board'], ['games', 'Games', 'Games'], ['players', 'Players', 'Players'], ['group', 'House', 'House']];

  function icon(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>'; }
  function initials(name) {
    var w = String(name || '?').trim().split(/\s+/);
    return esc(((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase());
  }
  function av(p, size) { return '<span class="av' + (size ? ' ' + size : '') + '" aria-hidden="true">' + initials(p ? p.name : '?') + '</span>'; }
  function dot(ti) { return '<span class="dot t' + ti + '" aria-hidden="true"></span>'; }
  function nameOf(S, pid) { var p = S.byId[pid]; return p ? (p.nick || p.name) : 'Unknown'; }
  function teamNames(S, g, ti) { return L.joinNames(g.teams[ti].map(function (pid) { return esc(nameOf(S, pid)); })); }
  function when(ts) {
    if (!ts) return '';
    var d = new Date(ts), now = new Date();
    var y = new Date(now); y.setDate(now.getDate() - 1);
    var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (d.toDateString() === now.toDateString()) return 'Today, ' + time;
    if (d.toDateString() === y.toDateString()) return 'Yesterday, ' + time;
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + time;
  }
  function dayKey(ts) { return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
  /* title and sub are HTML — callers escape anything user-typed */
  function pageHead(title, sub, actions) {
    return '<header class="page-h"><div><h1>' + title + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' +
      (actions ? '<div class="row">' + actions + '</div>' : '') + '</header>';
  }
  function backBtn() { return '<button class="btn sm quiet back" data-act="back">' + icon('back') + 'Back</button>'; }
  function seg(act, current, options, label) {
    return '<div class="seg" role="group" aria-label="' + label + '">' + options.map(function (o) {
      return '<button data-act="' + act + '" data-v="' + o[0] + '" aria-pressed="' + (current === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  V.icon = icon; V.dot = dot; V.av = av; V.when = when;

  /* ---------- chrome: sidebar on laptops, top bar + tabs on phones ---------- */
  V.top = function (S) {
    var g = S.group;
    if (!g) return '<div class="ws"><span class="die" aria-hidden="true"></span><span class="ws-name">' + esc(P.APP_NAME) + '</span></div>';
    var nav = TABS.map(function (t) {
      return '<button data-act="nav" data-to="' + t[0] + '"' + (S.route === t[0] ? ' aria-current="page"' : '') + '>' + icon(t[0]) + '<span>' + t[1] + '</span></button>';
    }).join('');
    var shared = S.storeKind === 'shared';
    var onPlay = S.route === 'play' && !S.view;
    return '<button class="ws" data-act="switch-group" aria-label="Switch group"><span class="die" aria-hidden="true"></span><span class="ws-name">' + esc(g.name) + '</span>' + icon('updown') + '</button>' +
      (S.canWrite ? '<button class="btn wide side-new" data-act="nav" data-to="play">' + icon('plus') + 'New game</button>' : '') +
      '<nav class="side-nav" aria-label="Sections">' + nav + '</nav>' +
      '<div class="side-foot' + (shared ? '' : ' device') + '"><span class="dot"></span>' + (shared ? 'Shared · updates live' : 'Saved in this browser') + '</div>' +
      (S.canWrite && !onPlay ? '<button class="btn sm top-new" data-act="nav" data-to="play">' + icon('plus') + 'New game</button>' : '');
  };
  V.tabs = function (S) {
    return TABS.map(function (t) {
      return '<button data-act="nav" data-to="' + t[0] + '"' + (S.route === t[0] ? ' aria-current="page"' : '') + '>' + icon(t[0]) + '<span>' + t[2] + '</span></button>';
    }).join('');
  };

  /* ---------- first run: no group yet ---------- */
  V.welcome = function (S) {
    var others = S.groups.length ? '<section class="section"><span class="lab">Your groups</span><div class="card list">' + S.groups.map(function (g) {
      return '<button class="li" data-act="pick-group" data-id="' + esc(g.id) + '"><span class="die" aria-hidden="true"></span><span class="grow name">' + esc(g.name) + '</span><span class="end">' + icon('chevron') + '</span></button>';
    }).join('') + '</div></section>' : '';
    var form = !S.canWrite ? '<div class="empty"><b>Nothing shared with you yet</b><span>Ask whoever runs your group for the link.</span></div>' :
      '<form class="card pad stack" data-form="create-group">' +
      '<div class="hgroup"><h2>Start a group</h2><p class="sub">One group per house or friend group. You can add more later.</p></div>' +
      '<div class="field"><label for="g-name">Group name</label><input class="input" id="g-name" name="name" required maxlength="60" placeholder="e.g. Alpha Delta house"></div>' +
      '<div class="field"><label for="g-kind">Type</label><select class="input" id="g-kind" name="kind"><option value="house">Fraternity / house</option><option value="friends">Friend group</option><option value="league">League / club</option></select></div>' +
      '<button class="btn big wide" type="submit">Create group</button></form>';
    return '<section class="welcome"><div class="welcome-h"><span class="die lg" aria-hidden="true"></span><h1>Die stats, kept properly</h1>' +
      '<p class="sub">Register players once, log games from any phone, and the leaderboard, awards and game recaps fill in on their own.</p></div>' +
      others + form + '</section>';
  };

  /* ---------- PLAY: live games, new game, recent ---------- */
  V.play = function (S) {
    var live = S.games.filter(function (g) { return g.status === 'live'; });
    var recent = S.games.filter(function (g) { return g.status === 'final'; }).slice(0, 3);
    var r = S.rules;
    var out = pageHead('Play', 'First to ' + r.target + ', win by ' + r.winBy + (Number(r.plunkPts) !== 1 ? ' · a sink is worth ' + r.plunkPts : ''));
    if (live.length) out += '<section class="section"><div class="section-h"><h2>Live now</h2></div><div class="games-list">' + live.map(function (g) { return gameCard(S, g); }).join('') + '</div></section>';
    out += newGamePanel(S, S.draft);
    if (recent.length) out += '<section class="section"><div class="section-h"><h2>Recent games</h2><button class="link" data-act="nav" data-to="games">View all</button></div><div class="games-list">' + recent.map(function (g) { return gameCard(S, g); }).join('') + '</div></section>';
    return out;
  };
  function slotBtn(S, ti, si, pid) {
    var p = pid && S.byId[pid];
    if (!p) return '<button class="slot" data-act="pick-slot" data-t="' + ti + '" data-s="' + si + '">' + icon('plus') + '<span>Add player</span></button>';
    return '<button class="slot filled" data-act="pick-slot" data-t="' + ti + '" data-s="' + si + '">' + av(p) + '<span class="nm">' + esc(p.name) + '</span>' +
      (p.pledge ? '<span class="chip pledge">Pledge</span>' : '') +
      '<span class="x" data-act="clear-slot" data-t="' + ti + '" data-s="' + si + '" aria-label="Remove">' + icon('x') + '</span></button>';
  }
  function newGamePanel(S, d) {
    var full = d.teams[0][0] && d.teams[0][1] && d.teams[1][0] && d.teams[1][1];
    return '<section class="card pad stack">' +
      '<div class="section-h"><div class="hgroup"><h2>New game</h2><p class="sub">Pick four players. Search finds anyone already registered.</p></div>' +
      '<button class="btn sm ghost" data-act="shuffle"' + (full ? '' : ' disabled') + '>' + icon('shuffle') + 'Shuffle teams</button></div>' +
      '<div class="matchup">' +
      '<div class="side"><div class="side-h">' + dot(0) + 'Team 1</div>' + slotBtn(S, 0, 0, d.teams[0][0]) + slotBtn(S, 0, 1, d.teams[0][1]) + '</div>' +
      '<div class="vs">vs</div>' +
      '<div class="side"><div class="side-h">' + dot(1) + 'Team 2</div>' + slotBtn(S, 1, 0, d.teams[1][0]) + slotBtn(S, 1, 1, d.teams[1][1]) + '</div>' +
      '</div>' +
      '<div class="row between">' + seg('draft-mode', d.mode, [['table', 'All four'], ['throw', 'Throw by throw']], 'Logging style') +
      '<label class="check"><input type="checkbox" id="draft-def" data-change="draft-def"' + (d.defense ? ' checked' : '') + '> Track catches &amp; drops</label></div>' +
      '<p class="note">' + (d.mode === 'table'
        ? 'All four players on screen. Tap what each throw did under the person who threw it.'
        : 'One thrower at a time, in order. One tap per throw, the fastest way to keep up live.') + '</p>' +
      (S.canWrite ? '<button class="btn big wide" data-act="start-game"' + (full ? '' : ' disabled') + '>Start game</button>'
        : '<p class="note">You can watch games and stats here. Only people the group owner invited as editors can log games.</p>') +
      '</section>';
  }

  /* ---------- a game in a list ---------- */
  function gameCard(S, g) {
    var a = L.teamScore(g, 0), b = L.teamScore(g, 1), w = L.winnerOf(g), fin = g.status === 'final';
    function cls(ti) { return !fin || w === null ? '' : (w === ti ? 'won' : 'lost'); }
    var chip = g.status === 'live' ? '<span class="chip live">Live</span>' : g.status === 'void' ? '<span class="chip void">Didn’t count</span>' : '';
    return '<button class="game" data-act="open-game" data-id="' + esc(g.id) + '">' +
      '<div class="meta"><span>' + esc(when(g.started || g.created)) + '</span>' + chip + '</div>' +
      '<div class="line">' +
      '<span class="tn ' + cls(0) + '">' + dot(0) + '<span>' + teamNames(S, g, 0) + '</span></span><span class="s' + (fin && w === 1 ? ' lost' : '') + '">' + a + '</span>' +
      '<span class="tn ' + cls(1) + '">' + dot(1) + '<span>' + teamNames(S, g, 1) + '</span></span><span class="s' + (fin && w === 0 ? ' lost' : '') + '">' + b + '</span>' +
      '</div>' +
      (g.summary && g.status !== 'live' ? '<p class="recap">' + esc(g.summary) + '</p>' : '') +
      '</button>';
  }
  V.gameCard = gameCard;

  /* ---------- LIVE GAME ---------- */
  V.live = function (S, g) {
    var ws = L.winState(g);
    var flag = ws.done ? '<span class="gp-flag done">Game</span>' : ws.point !== null ? '<span class="gp-flag">Game point</span>' : '<span class="lab">To ' + g.rules.target + '</span>';
    var sb = '<div class="scorebar">' +
      '<div class="t"><span class="lab">' + dot(0) + 'Team 1</span><span class="names">' + teamNames(S, g, 0) + '</span><span class="sc">' + ws.a + '</span></div>' +
      '<div class="mid">' + flag + '<span class="saving" id="saving"></span></div>' +
      '<div class="t right"><span class="lab">Team 2' + dot(1) + '</span><span class="names">' + teamNames(S, g, 1) + '</span><span class="sc">' + ws.b + '</span></div>' +
      '</div>';
    var tools = '<div class="toolbar">' + seg('live-mode', g.mode, [['table', 'All four'], ['throw', 'Throw by throw']], 'Logging style') +
      '<button class="btn sm ghost" data-act="toggle-def" aria-pressed="' + !!g.defense + '">' + (g.defense ? 'Hide defense' : 'Track defense') + '</button>' +
      '<span class="sp"></span>' +
      '<button class="btn sm ghost" data-act="undo"' + (g.log.length ? '' : ' disabled') + '>' + icon('undo') + 'Undo</button>' +
      '<button class="btn sm ghost" data-act="sub">' + icon('swap') + 'Sub</button>' +
      '</div>';
    var body = g.mode === 'throw' ? throwMode(S, g) : tableMode(S, g);
    var foot = '<div class="live-foot">' +
      '<button class="btn quiet" data-act="edit-game" data-id="' + esc(g.id) + '">' + icon('edit') + 'Edit numbers</button>' +
      '<button class="btn big" data-act="finish">' + (ws.done ? 'Finish game' : 'Finish early') + '</button></div>';
    return '<div class="stack">' + sb + tools + body + gapsLine(S, g) + foot + '</div>';
  };
  function gapsLine(S, g) {
    var gaps = L.throwGaps(g), cur = g.teams[0].concat(g.teams[1]);
    var behind = cur.some(function (pid) { return gaps[pid] > P.EVEN_TOLERANCE; });
    return '<div class="stack tight"><span class="lab">Throws · ' + (behind ? 'not even yet' : 'even') + '</span><div class="gaps">' + cur.map(function (pid) {
      return '<span class="chip' + (gaps[pid] > P.EVEN_TOLERANCE ? ' warn' : '') + '">' + esc(nameOf(S, pid)) + ' <span class="num">' + L.throwsOf(g.stats[pid]) + '</span></span>';
    }).join('') + '</div></div>';
  }
  function tableMode(S, g) {
    var gaps = L.throwGaps(g);
    function seat(ti, si) {
      var pid = g.teams[ti][si], st = g.stats[pid] || L.blankStats(), gap = gaps[pid] || 0;
      var taps = P.OUTCOMES.map(function (o) {
        return '<button class="tap' + (o.points ? ' score' : '') + '" data-act="tap" data-p="' + esc(pid) + '" data-k="' + o.k + '" title="' + esc(o.hint) + '">' +
          '<span class="n">' + (st[o.k] || 0) + '</span><span class="l">' + esc(o.tap) + '</span></button>';
      }).join('');
      var def = g.defense ? '<div class="def-row"><span class="lab">Defense</span><div class="taps">' + P.DEFENSE.map(function (d) {
        return '<button class="tap def" data-act="tap" data-p="' + esc(pid) + '" data-k="' + d.k + '" title="' + esc(d.hint) + '">' +
          '<span class="n">' + (st[d.k] || 0) + '</span><span class="l">' + esc(d.tap) + '</span></button>';
      }).join('') + '</div></div>' : '';
      return '<div class="seat"><div class="seat-h">' + dot(ti) + '<span class="nm">' + esc(nameOf(S, pid)) + '</span>' +
        '<span class="thr' + (gap > P.EVEN_TOLERANCE ? ' behind' : '') + '">' + L.throwsOf(st) + ' thr</span></div>' +
        '<div class="taps">' + taps + '</div>' + def + '</div>';
    }
    return '<div class="felt" aria-label="The table">' +
      '<div class="end">' + seat(0, 0) + seat(0, 1) + '</div>' +
      '<div class="end">' + seat(1, 0) + seat(1, 1) + '</div></div>';
  }
  function throwMode(S, g) {
    var pid = L.thrower(g), ti = L.teamOf(g, pid), defTeam = g.teams[1 - ti];
    var order = L.throwOrder(g).map(function (p, i) {
      return '<button data-act="set-turn" data-i="' + i + '" aria-pressed="' + (p === pid) + '">' + dot(L.teamOf(g, p)) + esc(nameOf(S, p)) + '</button>';
    }).join('');
    var st = g.stats[pid] || L.blankStats(), th = L.throwsOf(st);
    function out(label, small, items, cls) {
      return '<button class="out ' + (cls || '') + '" data-act="throw" data-items="' + esc(JSON.stringify(items)) + '"><b>' + label + '</b><small>' + small + '</small></button>';
    }
    var o = [];
    P.OUTCOMES.forEach(function (x) {
      var cls = x.points ? 'score' : x.hit ? '' : 'miss';
      var sub = x.points === 'sink' ? x.hint + ', ' + L.plural(Number(g.rules.plunkPts), 'point') : x.hint;
      o.push(out(esc(x.tap), esc(sub), [[pid, x.k]], cls));
      if (g.defense && x.k === 'pt') defTeam.forEach(function (d) { o.push(out(esc(x.tap) + ', ' + esc(nameOf(S, d)) + ' dropped', 'Scores and counts a drop', [[pid, 'pt'], [d, 'drp']], 'def drop')); });
      if (g.defense && x.k === 'tbl') defTeam.forEach(function (d) { o.push(out('Caught by ' + esc(nameOf(S, d)), esc(x.tap) + ', counts a catch', [[pid, 'tbl'], [d, 'ctc']], 'def')); });
    });
    return '<section class="card pad up-card">' +
      '<div class="stack tight"><span class="lab">Throwing order · tap a name to change who’s up</span><div class="order">' + order + '</div></div>' +
      '<div class="thrower">' + dot(ti) + '<span class="nm">' + esc(nameOf(S, pid)) + '</span>' +
      '<span class="muted">' + th + ' throws · ' + L.pointsOf(st, g.rules) + ' pts · ' + L.fmtPct(th ? L.hitsOf(st) / th : null) + ' hit</span></div>' +
      '<div class="outs">' + o.join('') + '</div></section>';
  }

  /* ---------- GAME DETAIL (box score) ---------- */
  V.game = function (S, g) {
    var a = L.teamScore(g, 0), b = L.teamScore(g, 1), w = L.winnerOf(g), fin = g.status === 'final';
    var status = g.status === 'void' ? '<span class="chip void">Didn’t count</span>' : g.status === 'live' ? '<span class="chip live">Live</span>' : '';
    var head = '<div class="row between">' + backBtn() + '<div class="row">' + status +
      (S.canWrite ? '<button class="btn sm ghost" data-act="edit-game" data-id="' + esc(g.id) + '">' + icon('edit') + 'Edit game</button>' : '') + '</div></div>';
    function line(ti, s) {
      return '<span class="tn">' + dot(ti) + '<span>' + teamNames(S, g, ti) + '</span></span><span class="num' + (fin && w === 1 - ti ? ' faint' : '') + '">' + s + '</span>';
    }
    var score = '<section class="card pad stack">' +
      '<span class="lab">' + esc(when(g.started || g.created)) + (g.defense ? '' : ' · offense only') + '</span>' +
      '<div class="box-score">' + line(0, a) + line(1, b) + '</div>' +
      (g.summary ? '<p>' + esc(g.summary) + '</p>' : '') +
      (g.subs && g.subs.length ? '<p class="note">' + g.subs.map(function (s) { return esc(nameOf(S, s['in'])) + ' subbed in for ' + esc(nameOf(S, s.out)); }).join(' · ') + '</p>' : '') +
      '</section>';
    return head + score + '<section class="section"><div class="section-h"><h2>Box score</h2></div>' + boxScore(S, g) + '</section>';
  };
  /* long column names break onto two lines so a dense table stays narrow */
  function hdr(t) {
    if (t.length <= 10 || t.indexOf(' ') < 0) return esc(t);
    var i = t.lastIndexOf(' ');
    return esc(t.slice(0, i)) + '<br>' + esc(t.slice(i + 1));
  }
  function boxScore(S, g) {
    var cols = P.OUTCOMES.filter(function (o) { return !o.fair; }).concat(g.defense ? P.DEFENSE : []);
    var head = '<tr><th class="pl">Player</th><th>Throws</th><th>Hit%</th><th>PTS</th><th title="Fair table hits, the ones that scored included">' + hdr('Fair table hits') + '</th>' +
      cols.map(function (c) { return '<th title="' + esc(c.hint) + '">' + hdr(c.col) + '</th>'; }).join('') + '</tr>';
    var rows = [0, 1].map(function (ti) {
      return g.appeared[ti].map(function (pid) {
        var st = g.stats[pid] || {}, thr = L.throwsOf(st);
        return '<tr><td class="pl"><button data-act="open-player" data-id="' + esc(pid) + '">' + dot(ti) + '<span class="nm">' + esc(nameOf(S, pid)) + '</span></button></td>' +
          '<td class="hl">' + thr + '</td><td>' + L.fmtPct(thr ? L.hitsOf(st) / thr : null) + '</td><td>' + L.pointsOf(st, g.rules) + '</td><td>' + L.fairOf(st) + '</td>' +
          cols.map(function (c) { return '<td>' + (st[c.k] || 0) + '</td>'; }).join('') + '</tr>';
      }).join('');
    }).join('');
    return '<div class="tbl-wrap"><table class="stats"><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- EDIT GAME (any game, any time) ---------- */
  V.editGame = function (S, g) {
    var rows = [0, 1].map(function (ti) {
      return g.appeared[ti].map(function (pid) {
        var st = g.stats[pid] || {};
        var steps = P.OUTCOMES.concat(g.defense ? P.DEFENSE : []).map(function (c) {
          return '<div class="step"><button data-act="ed-step" data-p="' + esc(pid) + '" data-k="' + c.k + '" data-d="-1" aria-label="One less ' + esc(c.tap) + '">−</button>' +
            '<div><span class="n">' + (st[c.k] || 0) + '</span><span class="l">' + esc(c.tap) + '</span></div>' +
            '<button data-act="ed-step" data-p="' + esc(pid) + '" data-k="' + c.k + '" data-d="1" aria-label="One more ' + esc(c.tap) + '">+</button></div>';
        }).join('');
        return '<section class="card pad ed-player"><div class="row between"><span class="who">' + dot(ti) + esc(nameOf(S, pid)) + '</span>' +
          '<span class="row"><span class="lab">' + L.throwsOf(st) + ' throws</span><button class="btn sm ghost" data-act="ed-replace" data-p="' + esc(pid) + '">Wrong person?</button></span></div>' +
          '<div class="steps">' + steps + '</div></section>';
      }).join('');
    }).join('');
    function adj(ti) {
      var v = (g.adj || [0, 0])[ti] || 0;
      return '<div class="step"><button data-act="ed-adj" data-t="' + ti + '" data-d="-1" aria-label="Lower Team ' + (ti + 1) + ' adjustment">−</button>' +
        '<div><span class="n">' + (v > 0 ? '+' : '') + v + '</span><span class="l">Team ' + (ti + 1) + ' adjust</span></div>' +
        '<button data-act="ed-adj" data-t="' + ti + '" data-d="1" aria-label="Raise Team ' + (ti + 1) + ' adjustment">+</button></div>';
    }
    return '<div class="edit-h"><button class="btn sm ghost" data-act="ed-cancel">Cancel</button><h1>Edit game</h1><button class="btn sm" data-act="ed-save">Save</button></div>' +
      '<section class="card pad stack"><div class="row between"><h2>Score</h2>' +
      '<span class="num score-inline">' + dot(0) + ' ' + L.teamScore(g, 0) + ' – ' + L.teamScore(g, 1) + ' ' + dot(1) + '</span></div>' +
      '<p class="note">The score adds up from points and sinks. Use the adjustments only for anything your house scores outside the stat sheet.</p>' +
      '<div class="steps">' + adj(0) + adj(1) + '</div>' +
      '<label class="check"><input type="checkbox" data-change="ed-def"' + (g.defense ? ' checked' : '') + '> This game tracked catches &amp; drops</label>' +
      '<div class="field"><label for="ed-date">Played on</label><input class="input" type="datetime-local" id="ed-date" data-change="ed-date" value="' + esc(localInput(g.started || g.created)) + '"></div>' +
      '</section>' +
      '<section class="edit-grid">' + rows + '</section>' +
      '<section class="card pad stack"><h2>Status</h2>' +
      seg('ed-status', g.status, [['final', 'Counts'], ['void', 'Didn’t count'], ['live', 'Still playing']], 'Status') +
      '<p class="note">“Didn’t count” keeps the game on record but leaves it out of every stat. “Still playing” reopens it for live logging.</p>' +
      '<div><button class="btn sm ghost danger-text" data-act="ed-delete">Delete game…</button></div></section>';
  };
  function localInput(ts) {
    var d = new Date(ts || Date.now());
    function z(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  /* ---------- GAMES ---------- */
  V.games = function (S) {
    var n = S.games.length;
    var head = pageHead('Games', n ? L.plural(n, 'game') + ' logged' : 'Every game, live or finished');
    if (!n) return head + '<div class="empty"><b>No games yet</b><span>Start one from Play. It shows up here the moment it begins.</span><button class="btn" data-act="nav" data-to="play">New game</button></div>';
    var out = '', last = '';
    S.games.forEach(function (g) {
      var k = dayKey(g.started || g.created);
      if (k !== last) { out += (last ? '</div>' : '') + '<div class="day">' + esc(k) + '</div><div class="games-list">'; last = k; }
      out += gameCard(S, g);
    });
    return head + '<section class="section">' + out + '</div></section>';
  };

  /* ---------- BOARD: awards + leaderboard ---------- */
  var COLS = [
    { k: 'gp', t: 'GP', title: 'Games played', f: function (r) { return r.gp; } },
    { k: 'w', t: 'W–L', title: 'Wins', f: function (r) { return r.w + '–' + r.l; }, sort: 'w' },
    { k: 'winPct', t: 'Win%', title: 'Win rate', f: function (r) { return L.fmtPct(r.winPct); } },
    { k: 'thr', t: 'Throws', title: 'Throws', f: function (r) { return r.thr; }, g: 1 },
    { k: 'pts', t: 'PTS', title: 'Points', f: function (r) { return r.pts; } },
    { k: 'ppg', t: 'PPG', title: 'Points per game', f: function (r) { return L.fmt1(r.ppg); } },
    { k: 'fair', t: 'Fair table<br>hits', title: 'Fair table hits, the ones that scored included', f: function (r) { return r.fair; }, g: 1 },
    { k: 'short', t: 'Short table<br>hits', title: 'Short table hits', f: function (r) { return r.short; } },
    { k: 'hitPct', t: 'Hit%', title: 'Hit rate: fair table hits, cup hits and sinks out of all throws', f: function (r) { return L.fmtPct(r.hitPct); } },
    { k: 'plk', t: 'Cup hits', title: 'Cup hits', f: function (r) { return r.s.plk; }, v: function (r) { return r.s.plk; } },
    { k: 'snk', t: 'Sinks', title: 'Sinks', f: function (r) { return r.s.snk; }, v: function (r) { return r.s.snk; } },
    { k: 'ctc', t: 'Catches', title: 'Catches', f: function (r) { return r.s.ctc; }, v: function (r) { return r.s.ctc; }, g: 1, def: 1 },
    { k: 'drp', t: 'Drops', title: 'Drops', f: function (r) { return r.s.drp; }, v: function (r) { return r.s.drp; }, def: 1 },
    { k: 'catchPct', t: 'Catch%', title: 'Catch rate', f: function (r) { return L.fmtPct(r.catchPct); }, def: 1 },
    { k: 'impact', t: 'Impact', title: 'Impact per game', f: function (r) { return L.fmt1(r.impact); }, g: 1 }
  ];
  V.COLS = COLS;
  V.board = function (S) {
    var B = S.boardRows, ui = S.ui;
    var periodLabel = ui.period === 'season' ? L.seasonLabel() + ' season' : ui.period === '30d' ? 'Last 30 days' : 'All time';
    var finished = S.games.filter(function (g) { return g.status === 'final' && L.inPeriod(g, ui.period); }).length;
    var head = pageHead('Leaderboard', (finished ? L.plural(finished, 'finished game') + ' · ' : '') + esc(periodLabel));
    var filters = '<div class="filters">' +
      seg('period', ui.period, [['season', esc(L.seasonLabel())], ['30d', '30 days'], ['all', 'All time']], 'Period') +
      seg('who', ui.who, [['all', 'Everyone'], ['brothers', 'Members'], ['pledges', 'Pledges']], 'Who') + '</div>';
    var played = B.filter(function (r) { return r.gp > 0; });
    if (!played.length) {
      return head + filters + '<div class="empty"><b>No finished games in this period</b><span>Rankings and awards appear after the first game is finished.</span><button class="btn" data-act="nav" data-to="play">New game</button></div>';
    }
    var aw = S.awards.map(function (a) {
      var names = a.pids.map(function (pid) { return esc(nameOf(S, pid)); }).join(' &amp; ');
      var avs = a.pids.map(function (pid) { return av(S.byId[pid], 'sm'); }).join('');
      return '<button class="award ' + a.key + '" data-act="open-player" data-id="' + esc(a.pids[0]) + '">' +
        '<span class="award-h">' + icon(AWARD_ICON[a.key] || 'star') + esc(a.title) + '</span>' +
        '<span class="award-who">' + avs + '<span class="nm">' + names + '</span></span>' +
        '<span class="val">' + esc(a.value) + '</span><span class="why">' + esc(a.note) + '</span></button>';
    }).join('');
    var showDef = played.some(function (r) { return r.defGp > 0; });
    var cols = COLS.filter(function (c) { return showDef || !c.def; });
    var th = '<tr><th class="pl">Player</th>' + cols.map(function (c) {
      var s = ui.sort === c.k ? ' aria-sort="' + (ui.dir > 0 ? 'ascending' : 'descending') + '"' : '';
      return '<th class="' + (c.g ? 'grp' : '') + '"' + s + '><button data-act="sort" data-k="' + c.k + '" title="Sort by ' + esc(c.title) + '">' + c.t + '</button></th>';
    }).join('') + '</tr>';
    var body = played.map(function (r, i) {
      var p = S.byId[r.pid] || {};
      return '<tr class="' + (r.gp < P.MIN_GAMES ? 'dim' : '') + '"><td class="pl"><button data-act="open-player" data-id="' + esc(r.pid) + '">' +
        '<span class="rk">' + (i + 1) + '</span>' + av(p, 'sm') + '<span class="nm">' + esc(p.nick || p.name || '?') + '</span>' +
        (p.pledge ? '<span class="chip pledge">P</span>' : '') + '</button></td>' +
        cols.map(function (c) { return '<td class="' + (c.g ? 'grp ' : '') + (ui.sort === c.k ? 'hl' : '') + '">' + c.f(r) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return head + filters +
      (aw ? '<section class="section"><div class="section-h"><h2>Awards</h2><span class="lab">' + esc(periodLabel) + '</span></div><div class="awards">' + aw + '</div></section>' : '') +
      '<section class="section"><div class="section-h"><h2>Rankings</h2><span class="lab">Tap a column to sort</span></div>' +
      '<div class="tbl-wrap"><table class="stats"><thead>' + th + '</thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="legend">Greyed rows have fewer than ' + P.MIN_GAMES + ' games and can’t win awards yet. Throws counts every throw logged, so you can check everyone got an even share.</p></section>';
  };

  /* ---------- PLAYERS ---------- */
  V.players = function (S) {
    var active = S.players.filter(function (p) { return !p.archived; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var archived = S.players.filter(function (p) { return p.archived; });
    var q = S.ui.playerQ || '';
    var list = q ? L.searchPlayers(active, q) : active;
    function row(p) {
      var r = S.allRows[p.id];
      return '<button class="li" data-act="open-player" data-id="' + esc(p.id) + '">' + av(p) +
        '<span class="grow"><span class="name">' + esc(p.name) + (p.nick ? ' <span class="faint">“' + esc(p.nick) + '”</span>' : '') + '</span>' +
        '<span class="meta">' + (r && r.gp ? r.w + '–' + r.l + ' · ' + L.plural(r.thr, 'throw') + ' · ' + L.fmtPct(r.hitPct) + ' hit' : 'No games yet') + '</span></span>' +
        (p.pledge ? '<span class="chip pledge">Pledge' + (p.pledgeClass ? ' · ' + esc(p.pledgeClass) : '') + '</span>' : '') +
        '<span class="end">' + icon('chevron') + '</span></button>';
    }
    var head = pageHead('Players', active.length ? L.plural(active.length, 'player') + ' registered' : 'Register everyone once',
      S.canWrite ? '<button class="btn" data-act="add-player">' + icon('plus') + 'Add player</button>' : '');
    var main = active.length
      ? '<input class="input" id="player-q" data-input="player-q" placeholder="Search players" value="' + esc(q) + '" autocomplete="off">' +
        '<div class="card list" id="player-list">' + (list.map(row).join('') || '<div class="li"><span class="muted">No one matches “' + esc(q) + '”.</span></div>') + '</div>'
      : '<div class="empty"><b>No players yet</b><span>Register everyone once. After that, games pick them from search, with no retyping and no misspelled duplicates.</span>' +
        (S.canWrite ? '<button class="btn" data-act="add-player">' + icon('plus') + 'Add player</button>' : '') + '</div>';
    var arch = archived.length ? '<details class="section"><summary class="lab">Archived (' + archived.length + ')</summary><div class="card list">' + archived.map(row).join('') + '</div></details>' : '';
    return head + main + arch;
  };

  V.player = function (S, p) {
    var r = S.allRows[p.id] || null, pl = r && r.pledgeLine;
    var mine = S.me && p.userId === S.me;
    function kpi(label, val) { return '<div class="kpi"><span class="lab">' + label + '</span><span class="num">' + val + '</span></div>'; }
    var k = r && r.gp
      ? '<div class="kpis">' + kpi('Record', r.w + '–' + r.l) + kpi('Win rate', L.fmtPct(r.winPct)) + kpi('Throws', r.thr) +
        kpi('Fair table hits', r.fair) + kpi('Short table hits', r.short) + kpi('Hit rate', L.fmtPct(r.hitPct)) +
        kpi('Points', r.pts) + kpi('Per game', L.fmt1(r.ppg)) + kpi('Cup hits', r.s.plk) + kpi('Sinks', r.s.snk) +
        (r.defGp ? kpi('Catches', r.s.ctc) + kpi('Drops', r.s.drp) + kpi('Catch rate', L.fmtPct(r.catchPct)) : '') + kpi('Impact', L.fmt1(r.impact)) + '</div>'
      : '<div class="empty"><b>No finished games yet</b><span>Stats appear after their first finished game.</span></div>';
    var split = pl && pl.gp && pl.gp < r.gp
      ? '<section class="section"><div class="section-h"><h2>As a pledge vs. since</h2></div><div class="tbl-wrap"><table class="stats"><thead><tr><th class="pl">Period</th><th>GP</th><th>W–L</th><th>Hit%</th><th>PPG</th><th>Impact</th></tr></thead><tbody>' +
        splitRow('As a pledge', pl) + splitRow('Since', diff(r, pl)) + '</tbody></table></div></section>' : '';
    var games = S.games.filter(function (g) { return L.teamOf(g, p.id) >= 0; }).slice(0, 8);
    var partner = bestPartner(S, p.id);
    var badges = (p.nick ? '<span class="muted">“' + esc(p.nick) + '”</span>' : '') +
      (p.pledge ? '<span class="chip pledge">Pledge' + (p.pledgeClass ? ' · ' + esc(p.pledgeClass) : '') + '</span>' : '') +
      (p.archived ? '<span class="chip">Archived</span>' : '') + (mine ? '<span class="chip ok">This is you</span>' : '');
    return '<div class="row between">' + backBtn() + (S.canWrite ? '<button class="btn sm ghost" data-act="edit-player" data-id="' + esc(p.id) + '">' + icon('edit') + 'Edit</button>' : '') + '</div>' +
      '<section class="ph">' + av(p, 'lg') + '<div class="stack"><h1>' + esc(p.name) + '</h1>' + (badges ? '<div class="row">' + badges + '</div>' : '') + '</div></section>' +
      k + (partner ? '<p class="note">Best partner: <b>' + esc(nameOf(S, partner.pid)) + '</b>, ' + partner.w + '–' + (partner.gp - partner.w) + ' together.</p>' : '') +
      split +
      (games.length ? '<section class="section"><div class="section-h"><h2>Recent games</h2></div><div class="games-list">' + games.map(function (g) { return gameCard(S, g); }).join('') + '</div></section>' : '') +
      (S.me && !p.userId && !S.claimed ? '<div><button class="btn ghost" data-act="claim" data-id="' + esc(p.id) + '">This is me: link to my account</button></div>' : '');
  };
  function splitRow(label, x) {
    return '<tr><td class="pl">' + label + '</td><td>' + x.gp + '</td><td>' + x.w + '–' + x.l + '</td><td>' + L.fmtPct(x.hitPct) + '</td><td>' + L.fmt1(x.ppg) + '</td><td>' + L.fmt1(x.impact) + '</td></tr>';
  }
  function diff(r, pl) {
    var s = {}; Object.keys(r.s).forEach(function (k) { s[k] = r.s[k] - pl.s[k]; });
    var gp = r.gp - pl.gp, thr = r.thr - pl.thr, hits = r.hits - pl.hits, pts = r.pts - pl.pts;
    return { gp: gp, w: r.w - pl.w, l: r.l - pl.l, hitPct: thr ? hits / thr : null, ppg: gp ? pts / gp : null, impact: gp ? (pts + .5 * s.ctc - .5 * s.drp) / gp : null };
  }
  function bestPartner(S, pid) {
    var m = {};
    S.games.forEach(function (g) {
      if (g.status !== 'final') return;
      var ti = g.teams[0].indexOf(pid) >= 0 ? 0 : g.teams[1].indexOf(pid) >= 0 ? 1 : -1;
      if (ti < 0) return;
      var mate = g.teams[ti][0] === pid ? g.teams[ti][1] : g.teams[ti][0];
      var e = m[mate] || (m[mate] = { pid: mate, gp: 0, w: 0 });
      e.gp++; if (L.winnerOf(g) === ti) e.w++;
    });
    var list = Object.keys(m).map(function (k) { return m[k]; }).filter(function (e) { return e.gp >= 2; });
    list.sort(function (a, b) { return (b.w / b.gp - a.w / a.gp) || b.gp - a.gp; });
    return list[0] || null;
  }

  /* ---------- HOUSE (group settings) ---------- */
  V.group = function (S) {
    var g = S.group, r = S.rules, dis = S.canWrite ? '' : ' disabled';
    var pledges = S.players.filter(function (p) { return p.pledge && !p.archived; });
    function num(id, label, val, min, max) {
      return '<div class="field"><label for="' + id + '">' + label + '</label><input class="input" type="number" inputmode="numeric" id="' + id + '" name="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '"' + dis + '></div>';
    }
    var pledgeBody = pledges.length
      ? '<p class="note">' + L.plural(pledges.length, 'current pledge') + ': ' + pledges.map(function (p) { return esc(p.name); }).join(', ') + '.</p>' +
        '<p class="legend">Initiating keeps every game they played as pledges tagged that way, so their pledge-era stats stay separate.</p>' +
        (S.canWrite ? '<div><button class="btn ghost" data-act="initiate">Initiate pledge class…</button></div>' : '')
      : '<p class="note">No current pledges. Mark someone as a pledge when you add or edit them.</p>';
    return pageHead(esc(g.name), 'House rules, pledge class and who can log games') +
      '<div class="split">' +
      '<form class="card pad stack" data-form="rules"><div class="hgroup"><h2>House rules</h2><p class="sub">New games use these. Finished games keep the rules they were played under.</p></div>' +
      '<div class="grid3">' + num('target', 'Play to', r.target, 1, 50) + num('winBy', 'Win by', r.winBy, 1, 5) + num('plunkPts', 'Sink worth', r.plunkPts, 0, 10) + '</div>' +
      '<label class="check"><input type="checkbox" name="defense"' + (r.defense ? ' checked' : '') + dis + '> New games track catches &amp; drops</label>' +
      '<div class="field"><label for="gname">Group name</label><input class="input" id="gname" name="name" maxlength="60" value="' + esc(g.name) + '"' + dis + '></div>' +
      (S.canWrite ? '<div><button class="btn" type="submit">Save rules</button></div>' : '') + '</form>' +
      '<div class="stack">' +
      '<section class="card pad stack"><div class="hgroup"><h2>Pledge class</h2></div>' + pledgeBody + '</section>' +
      '<section class="card pad stack"><div class="hgroup"><h2>Who can log games</h2><p class="sub">' +
      (S.storeKind === 'shared' ? 'Anyone with access can watch. People invited as editors can log and edit games.' : 'This copy saves games in this browser only, so other phones won’t see them.') +
      '</p></div><div><button class="btn ghost" data-act="switch-group">Switch or create group</button></div></section>' +
      '</div></div>';
  };
})(window.PLUNK);
