/* ================================================================
   [VIEWS] Every screen, as an HTML string built from data.
   Views only READ — they never save anything. Every button carries
   data-act="…" and app.js decides what the tap does.
   ================================================================ */
(function (P) {
  'use strict';
  var L = P.logic, esc = L.esc;
  var V = P.views = {};

  /* ---------- shared bits ---------- */
  var ICONS = {
    play: '<path d="M7 5.5v13l11-6.5z"/>',
    board: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    games: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2"/><circle cx="15" cy="15" r="1.2"/><circle cx="15" cy="9" r="1.2"/><circle cx="9" cy="15" r="1.2"/>',
    players: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.5c1.4.8 2.3 2.4 2.5 4.5"/>',
    group: '<path d="M4 10.5 12 4l8 6.5V20H4z"/><path d="M10 20v-5h4v5"/>'
  };
  var TABS = [['play', 'Play'], ['board', 'Board'], ['games', 'Games'], ['players', 'Players'], ['group', 'House']];
  function icon(n) { return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + '</svg>'; }
  function initials(name) {
    var w = String(name || '?').trim().split(/\s+/);
    return esc(((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase());
  }
  function av(p) { return '<span class="av" aria-hidden="true">' + initials(p ? p.name : '?') + '</span>'; }
  function nameOf(S, pid) { var p = S.byId[pid]; return p ? (p.nick || p.name) : 'Unknown'; }
  function teamNames(S, g, ti) { return L.joinNames(g.teams[ti].map(function (pid) { return esc(nameOf(S, pid)); })); }
  function when(ts) {
    if (!ts) return '';
    var d = new Date(ts), now = new Date();
    var same = d.toDateString() === now.toDateString();
    var y = new Date(now); y.setDate(now.getDate() - 1);
    var time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (same) return 'Today, ' + time;
    if (d.toDateString() === y.toDateString()) return 'Yesterday, ' + time;
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + time;
  }
  function dayKey(ts) { return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
  V.when = when;

  V.top = function (S) {
    var g = S.group;
    var nav = TABS.map(function (t) {
      return '<button data-act="nav" data-to="' + t[0] + '"' + (S.route === t[0] ? ' aria-current="page"' : '') + '>' + icon(t[0]) + '<span>' + t[1] + '</span></button>';
    }).join('');
    return '<div class="brand"><span class="die" aria-hidden="true"></span>' + esc(P.APP_NAME) + '</div>' +
      '<nav class="topnav" aria-label="Sections">' + nav + '</nav>' +
      (g ? '<button class="groupbtn" data-act="switch-group" aria-label="Switch group"><span>' + esc(g.name) + '</span>▾</button>' : '');
  };
  V.tabs = function (S) {
    return TABS.map(function (t) {
      return '<button data-act="nav" data-to="' + t[0] + '" class="' + (t[0] === 'play' ? 'play-tab' : '') + '"' +
        (S.route === t[0] ? ' aria-current="page"' : '') + '><span>' + icon(t[0]) + '</span><span>' + t[1] + '</span></button>';
    }).join('');
  };

  /* ---------- first run: no group yet ---------- */
  V.welcome = function (S) {
    var others = S.groups.length
      ? '<div class="panel stack"><h3>Your groups</h3><div class="list">' + S.groups.map(function (g) {
        return '<button class="li" data-act="pick-group" data-id="' + esc(g.id) + '"><span class="die" aria-hidden="true"></span><span class="grow name">' + esc(g.name) + '</span><span class="faint">Open</span></button>';
      }).join('') + '</div></div>' : '';
    return '<section class="hero">' +
      '<span class="lab">Die stats, kept properly</span>' +
      '<h1>Every throw.<br>Every catch.<br>Every bro ranked.</h1>' +
      '<p class="muted">Make a group for your house or your friends, register players once, and log games from any phone. Leaderboards, awards and game recaps fill in on their own.</p>' +
      '</section>' + others + (!S.canWrite ? '<div class="empty"><b>Nothing shared with you yet.</b><span>Ask whoever runs your group for the link.</span></div>' :
      '<form class="panel stack" data-form="create-group">' +
      '<h2>Start a group</h2>' +
      '<div class="field"><label for="g-name">Group name</label><input class="input" id="g-name" name="name" required maxlength="60" placeholder="e.g. Alpha Delta house"></div>' +
      '<div class="field"><label for="g-kind">What is it?</label><select class="input" id="g-kind" name="kind"><option value="house">Fraternity / house</option><option value="friends">Friend group</option><option value="league">League / club</option></select></div>' +
      '<button class="btn big" type="submit">Create group</button>' +
      '</form>');
  };

  /* ---------- PLAY: new game, live games, recent ---------- */
  V.play = function (S) {
    var live = S.games.filter(function (g) { return g.status === 'live'; });
    var draft = S.draft;
    var out = '';
    if (live.length) {
      out += '<section class="stack"><div class="row between"><h2>Live now</h2></div>' +
        live.map(function (g) { return gameCard(S, g); }).join('') + '</section>';
    }
    out += newGamePanel(S, draft);
    var recent = S.games.filter(function (g) { return g.status === 'final'; }).slice(0, 3);
    if (recent.length) {
      out += '<section class="stack"><div class="row between"><h2>Last games</h2><button class="link" data-act="nav" data-to="games">All games</button></div>' +
        recent.map(function (g) { return gameCard(S, g); }).join('') + '</section>';
    }
    return out;
  };

  function slotBtn(S, ti, si, pid) {
    var p = pid && S.byId[pid];
    if (!p) return '<button class="slot" data-act="pick-slot" data-t="' + ti + '" data-s="' + si + '"><span class="av">+</span><span class="faint">Add player</span></button>';
    return '<button class="slot filled" data-act="pick-slot" data-t="' + ti + '" data-s="' + si + '">' + av(p) +
      '<span>' + esc(p.name) + (p.pledge ? ' <span class="chip pledge">Pledge</span>' : '') + '</span>' +
      '<span class="x" data-act="clear-slot" data-t="' + ti + '" data-s="' + si + '" aria-label="Remove">×</span></button>';
  }
  function newGamePanel(S, d) {
    var full = d.teams[0][0] && d.teams[0][1] && d.teams[1][0] && d.teams[1][1];
    var canWrite = S.canWrite;
    return '<section class="panel stack">' +
      '<div class="row between"><h2>New game</h2>' +
      '<div class="row"><button class="btn sm ghost" data-act="shuffle"' + (full ? '' : ' disabled') + '>Shuffle teams</button></div></div>' +
      '<div class="matchup">' +
      '<div class="side ta"><span class="lab a">Team 1</span>' + slotBtn(S, 0, 0, d.teams[0][0]) + slotBtn(S, 0, 1, d.teams[0][1]) + '</div>' +
      '<div class="vs">VS</div>' +
      '<div class="side tb"><span class="lab b">Team 2</span>' + slotBtn(S, 1, 0, d.teams[1][0]) + slotBtn(S, 1, 1, d.teams[1][1]) + '</div>' +
      '</div>' +
      '<div class="row between">' +
      '<div class="stack tight"><span class="lab">Logging style</span>' +
      '<div class="seg" role="group" aria-label="Logging style">' +
      '<button data-act="draft-mode" data-v="table" aria-pressed="' + (d.mode === 'table') + '">All four</button>' +
      '<button data-act="draft-mode" data-v="throw" aria-pressed="' + (d.mode === 'throw') + '">Throw by throw</button></div></div>' +
      '<label class="check"><input type="checkbox" id="draft-def" data-change="draft-def"' + (d.defense ? ' checked' : '') + '> Track catches &amp; drops</label>' +
      '</div>' +
      '<p class="faint">' + (d.mode === 'table'
        ? 'All four players on screen. Tap what each throw did under the person who threw it.'
        : 'One thrower at a time, in order. One tap per throw — fastest when you are keeping up live.') +
      ' First to ' + S.rules.target + ', win by ' + S.rules.winBy + '.</p>' +
      (canWrite ? '<button class="btn big wide" data-act="start-game"' + (full ? '' : ' disabled') + '>Start game</button>'
        : '<p class="muted">You can watch games and stats here. Only people the group owner invited as editors can log games.</p>') +
      '</section>';
  }

  /* ---------- a game in a list ---------- */
  function gameCard(S, g) {
    var a = L.teamScore(g, 0), b = L.teamScore(g, 1), w = L.winnerOf(g);
    var fin = g.status === 'final';
    function cls(ti) { return !fin || w === null ? '' : (w === ti ? 'won' : 'lost'); }
    var chip = g.status === 'live' ? '<span class="chip live">Live</span>' : g.status === 'void' ? '<span class="chip void">Didn’t count</span>' : '';
    return '<button class="game" data-act="open-game" data-id="' + esc(g.id) + '">' +
      '<div class="row between"><span class="faint" style="font-size:13px">' + esc(when(g.started || g.created)) + '</span>' + chip + '</div>' +
      '<div class="line"><span class="tn ' + cls(0) + '"><span class="a">●</span> ' + teamNames(S, g, 0) + '</span><span class="s ' + (fin && w === 1 ? 'lost' : '') + '">' + a + '</span>' +
      '<span class="tn ' + cls(1) + '"><span class="b">●</span> ' + teamNames(S, g, 1) + '</span><span class="s ' + (fin && w === 0 ? 'lost' : '') + '">' + b + '</span></div>' +
      (g.summary && g.status !== 'live' ? '<p class="recap">' + esc(g.summary) + '</p>' : '') +
      '</button>';
  }
  V.gameCard = gameCard;

  /* ---------- LIVE GAME ---------- */
  V.live = function (S, g) {
    var ws = L.winState(g);
    var flag = ws.done ? '<span class="gp-flag done">GAME</span>' : ws.point !== null ? '<span class="gp-flag">GAME POINT</span>' : '<span class="lab">to ' + g.rules.target + '</span>';
    var sb = '<div class="scorebar">' +
      '<div class="t"><span class="lab a">Team 1</span><span class="names">' + teamNames(S, g, 0) + '</span><span class="sc a">' + ws.a + '</span></div>' +
      '<div class="mid">' + flag + '<span class="saving" id="saving"></span></div>' +
      '<div class="t right"><span class="lab b">Team 2</span><span class="names">' + teamNames(S, g, 1) + '</span><span class="sc b">' + ws.b + '</span></div>' +
      '</div>';
    var tools = '<div class="toolbar">' +
      '<div class="seg" role="group" aria-label="Logging style">' +
      '<button data-act="live-mode" data-v="table" aria-pressed="' + (g.mode === 'table') + '">All four</button>' +
      '<button data-act="live-mode" data-v="throw" aria-pressed="' + (g.mode === 'throw') + '">Throw by throw</button></div>' +
      '<button class="btn sm ghost" data-act="toggle-def" aria-pressed="' + !!g.defense + '">' + (g.defense ? 'Hide defense' : 'Track defense') + '</button>' +
      '<span class="sp"></span>' +
      '<button class="btn sm ghost" data-act="undo"' + (g.log.length ? '' : ' disabled') + '>Undo</button>' +
      '<button class="btn sm ghost" data-act="sub">Sub</button>' +
      '</div>';
    var body = g.mode === 'throw' ? throwMode(S, g) : tableMode(S, g);
    var foot = '<div class="row between">' +
      '<button class="btn quiet" data-act="edit-game" data-id="' + esc(g.id) + '">Edit numbers</button>' +
      '<button class="btn big" data-act="finish">' + (ws.done ? 'Finish game' : 'Finish early') + '</button></div>';
    return sb + tools + body + gapsLine(S, g) + foot;
  };

  function gapsLine(S, g) {
    var gaps = L.throwGaps(g);
    var behind = Object.keys(gaps).filter(function (pid) { return gaps[pid] > P.EVEN_TOLERANCE; });
    var cur = g.teams[0].concat(g.teams[1]);
    var parts = cur.map(function (pid) {
      return '<span class="chip' + (gaps[pid] > P.EVEN_TOLERANCE ? '' : ' ok') + '">' + esc(nameOf(S, pid)) + ' ' + L.throwsOf(g.stats[pid]) + '</span>';
    }).join('');
    return '<div class="stack tight"><span class="lab">Throws' + (behind.length ? ' — not even yet' : ' — even') + '</span><div class="gaps">' + parts + '</div></div>';
  }

  function tableMode(S, g) {
    var up = g.mode === 'table' ? null : L.thrower(g);
    function seat(ti, si) {
      var pid = g.teams[ti][si], st = g.stats[pid] || L.blankStats(), gap = L.throwGaps(g)[pid] || 0;
      var taps = P.OUTCOMES.map(function (o) {
        return '<button class="tap' + (o.points ? ' score' : '') + '" data-act="tap" data-p="' + esc(pid) + '" data-k="' + o.k + '" title="' + esc(o.hint) + '">' +
          '<span class="n">' + (st[o.k] || 0) + '</span><span class="l">' + esc(o.label) + '</span></button>';
      }).join('');
      var def = g.defense ? '<div class="def-row"><span class="lab">Defense</span><div class="taps">' + P.DEFENSE.map(function (d) {
        return '<button class="tap def" data-act="tap" data-p="' + esc(pid) + '" data-k="' + d.k + '" title="' + esc(d.hint) + '">' +
          '<span class="n">' + (st[d.k] || 0) + '</span><span class="l">' + esc(d.label) + '</span></button>';
      }).join('') + '</div></div>' : '';
      return '<div class="seat ' + (ti ? 'tb' : 'ta') + (up === pid ? ' up' : '') + '">' +
        '<div class="seat-h"><span class="nm">' + esc(nameOf(S, pid)) + '</span><span class="thr' + (gap > P.EVEN_TOLERANCE ? ' behind' : '') + '">' + L.throwsOf(st) + ' thr</span></div>' +
        '<div class="taps">' + taps + '</div>' + def + '</div>';
    }
    return '<div class="felt" aria-label="The table">' +
      '<div class="end">' + seat(0, 0) + seat(0, 1) + '</div>' +
      '<div class="end">' + seat(1, 0) + seat(1, 1) + '</div></div>';
  }

  function throwMode(S, g) {
    var pid = L.thrower(g), ti = L.teamOf(g, pid), defTeam = g.teams[1 - ti];
    var order = L.throwOrder(g).map(function (p, i) {
      return '<button class="' + (L.teamOf(g, p) ? 'tb' : 'ta') + '" data-act="set-turn" data-i="' + i + '" aria-pressed="' + (p === pid) + '">' + esc(nameOf(S, p)) + '</button>';
    }).join('');
    var st = g.stats[pid] || L.blankStats();
    function out(label, small, items, cls) {
      return '<button class="out ' + (cls || '') + '" data-act="throw" data-items="' + esc(JSON.stringify(items)) + '"><b>' + label + '</b><small>' + small + '</small></button>';
    }
    var o = [];
    o.push(out('Point', 'Table, scored', [[pid, 'pt']], 'score'));
    if (g.defense) defTeam.forEach(function (d) { o.push(out('Point — ' + esc(nameOf(S, d)) + ' dropped', 'Scored; counts a drop', [[pid, 'pt'], [d, 'drp']], 'def drop')); });
    o.push(out('Table', 'Hit, no point', [[pid, 'tbl']]));
    if (g.defense) defTeam.forEach(function (d) { o.push(out('Caught by ' + esc(nameOf(S, d)), 'Table hit; counts a catch', [[pid, 'tbl'], [d, 'ctc']], 'def')); });
    o.push(out('Plink', 'Hit a cup', [[pid, 'plk']]));
    o.push(out('Plunk', 'In the cup — ' + L.plural(Number(g.rules.plunkPts), 'point'), [[pid, 'snk']], 'score'));
    o.push(out('Miss', 'Off the table', [[pid, 'mis']], 'miss'));
    return '<section class="panel up-card">' +
      '<div class="stack tight"><span class="lab">Throwing order — tap to change who is up</span><div class="order">' + order + '</div></div>' +
      '<div class="thrower"><span class="nm ' + (ti ? 'b' : 'a') + '">' + esc(nameOf(S, pid)) + '</span>' +
      '<span class="muted">' + L.throwsOf(st) + ' throws · ' + L.pointsOf(st, g.rules) + ' pts · ' + L.fmtPct(L.throwsOf(st) ? L.hitsOf(st) / L.throwsOf(st) : null) + ' hit</span></div>' +
      '<div class="outs">' + o.join('') + '</div></section>';
  }

  /* ---------- GAME DETAIL (box score) ---------- */
  V.game = function (S, g) {
    var a = L.teamScore(g, 0), b = L.teamScore(g, 1);
    var head = '<div class="row between"><button class="btn sm ghost" data-act="back">← Back</button>' +
      '<div class="row">' + (g.status === 'void' ? '<span class="chip void">Didn’t count</span>' : '') +
      (S.canWrite ? '<button class="btn sm" data-act="edit-game" data-id="' + esc(g.id) + '">Edit game</button>' : '') + '</div></div>';
    var score = '<section class="panel stack">' +
      '<span class="faint">' + esc(when(g.started || g.created)) + (g.defense ? '' : ' · offense only') + '</span>' +
      '<div class="line" style="display:grid;grid-template-columns:1fr auto;gap:6px 14px;align-items:center">' +
      '<h3 class="a">' + teamNames(S, g, 0) + '</h3><span class="num a" style="font-size:44px">' + a + '</span>' +
      '<h3 class="b">' + teamNames(S, g, 1) + '</h3><span class="num b" style="font-size:44px">' + b + '</span></div>' +
      (g.summary ? '<p>' + esc(g.summary) + '</p>' : '') +
      (g.subs && g.subs.length ? '<p class="faint">' + g.subs.map(function (s) { return esc(nameOf(S, s['in'])) + ' subbed in for ' + esc(nameOf(S, s.out)); }).join(' · ') + '</p>' : '') +
      '</section>';
    return head + score + boxScore(S, g);
  };
  function boxScore(S, g) {
    var cols = P.OUTCOMES.concat(g.defense ? P.DEFENSE : []);
    var head = '<tr><th class="pl">Player</th><th>THR</th><th>Hit%</th>' + cols.map(function (c) { return '<th>' + c.short + '</th>'; }).join('') + '</tr>';
    var rows = [0, 1].map(function (ti) {
      return g.appeared[ti].map(function (pid) {
        var st = g.stats[pid] || {}, thr = L.throwsOf(st);
        return '<tr><td class="pl"><button data-act="open-player" data-id="' + esc(pid) + '"><span class="' + (ti ? 'b' : 'a') + '">●</span> ' + esc(nameOf(S, pid)) + '</button></td>' +
          '<td class="hl">' + thr + '</td><td>' + L.fmtPct(thr ? L.hitsOf(st) / thr : null) + '</td>' +
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
          return '<div class="step"><button data-act="ed-step" data-p="' + esc(pid) + '" data-k="' + c.k + '" data-d="-1" aria-label="Less ' + esc(c.label) + '">−</button>' +
            '<div><div class="n">' + (st[c.k] || 0) + '</div><div class="l">' + esc(c.label) + '</div></div>' +
            '<button data-act="ed-step" data-p="' + esc(pid) + '" data-k="' + c.k + '" data-d="1" aria-label="More ' + esc(c.label) + '">+</button></div>';
        }).join('');
        return '<div class="ed-player ' + (ti ? 'tb' : 'ta') + '"><div class="row between"><b>' + esc(nameOf(S, pid)) + '</b>' +
          '<span class="row"><span class="faint">' + L.throwsOf(st) + ' throws</span><button class="btn sm ghost" data-act="ed-replace" data-p="' + esc(pid) + '">Wrong person?</button></span></div>' +
          '<div class="steps">' + steps + '</div></div>';
      }).join('');
    }).join('');
    function adj(ti) {
      return '<div class="step"><button data-act="ed-adj" data-t="' + ti + '" data-d="-1">−</button><div><div class="n">' + ((g.adj || [0, 0])[ti] > 0 ? '+' : '') + ((g.adj || [0, 0])[ti] || 0) + '</div><div class="l">Team ' + (ti + 1) + ' adjust</div></div><button data-act="ed-adj" data-t="' + ti + '" data-d="1">+</button></div>';
    }
    var isLive = g.status === 'live';
    return '<div class="row between"><button class="btn sm ghost" data-act="ed-cancel">Cancel</button><h2>Edit game</h2><button class="btn sm" data-act="ed-save">Save</button></div>' +
      '<section class="panel stack"><div class="row between"><span class="lab">Score</span><span class="num" style="font-size:30px"><span class="a">' + L.teamScore(g, 0) + '</span> – <span class="b">' + L.teamScore(g, 1) + '</span></span></div>' +
      '<p class="faint">The score is added up from points and plunks. Use the adjust buttons only for anything your house scores outside the stat sheet.</p>' +
      '<div class="steps">' + adj(0) + adj(1) + '</div>' +
      '<label class="check"><input type="checkbox" data-change="ed-def"' + (g.defense ? ' checked' : '') + '> This game tracked catches &amp; drops</label>' +
      '<div class="field"><label for="ed-date">Played on</label><input class="input" type="datetime-local" id="ed-date" data-change="ed-date" value="' + esc(localInput(g.started || g.created)) + '"></div>' +
      '</section>' +
      '<section class="edit-grid">' + rows + '</section>' +
      '<section class="panel stack"><h3>Game status</h3>' +
      '<div class="seg" role="group" aria-label="Status">' +
      '<button data-act="ed-status" data-v="final" aria-pressed="' + (g.status === 'final') + '">Counts</button>' +
      '<button data-act="ed-status" data-v="void" aria-pressed="' + (g.status === 'void') + '">Didn’t count</button>' +
      '<button data-act="ed-status" data-v="live" aria-pressed="' + isLive + '">Still playing</button></div>' +
      '<p class="faint">“Didn’t count” keeps the game on record but leaves it out of every stat. “Still playing” reopens it for live logging.</p>' +
      '<button class="btn ghost" data-act="ed-delete">Delete game…</button></section>';
  };
  function localInput(ts) {
    var d = new Date(ts || Date.now());
    function z(n) { return String(n).padStart(2, '0'); }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes());
  }

  /* ---------- GAMES ---------- */
  V.games = function (S) {
    if (!S.games.length) return '<h1>Games</h1><div class="empty"><b>No games yet.</b><span>Start one from Play — it shows up here the moment it begins.</span><button class="btn" data-act="nav" data-to="play">New game</button></div>';
    var out = '<h1>Games</h1>', last = '';
    S.games.forEach(function (g) {
      var k = dayKey(g.started || g.created);
      if (k !== last) { out += '<div class="lab day">' + esc(k) + '</div>'; last = k; }
      out += gameCard(S, g);
    });
    return out;
  };

  /* ---------- BOARD: awards + leaderboard ---------- */
  var COLS = [
    { k: 'gp', t: 'GP', f: function (r) { return r.gp; } },
    { k: 'w', t: 'W–L', f: function (r) { return r.w + '–' + r.l; }, sort: 'w' },
    { k: 'winPct', t: 'Win%', f: function (r) { return L.fmtPct(r.winPct); } },
    { k: 'thr', t: 'Throws', f: function (r) { return r.thr; }, g: 1 },
    { k: 'hitPct', t: 'Hit%', f: function (r) { return L.fmtPct(r.hitPct); } },
    { k: 'pts', t: 'PTS', f: function (r) { return r.pts; } },
    { k: 'ppg', t: 'PPG', f: function (r) { return L.fmt1(r.ppg); } },
    { k: 'plk', t: 'PLK', f: function (r) { return r.s.plk; }, v: function (r) { return r.s.plk; } },
    { k: 'snk', t: 'Plunks', f: function (r) { return r.s.snk; }, v: function (r) { return r.s.snk; } },
    { k: 'ctc', t: 'CTC', f: function (r) { return r.s.ctc; }, v: function (r) { return r.s.ctc; }, g: 1, def: 1 },
    { k: 'drp', t: 'DRP', f: function (r) { return r.s.drp; }, v: function (r) { return r.s.drp; }, def: 1 },
    { k: 'catchPct', t: 'Catch%', f: function (r) { return L.fmtPct(r.catchPct); }, def: 1 },
    { k: 'impact', t: 'Impact', f: function (r) { return L.fmt1(r.impact); }, g: 1 }
  ];
  V.COLS = COLS;
  V.board = function (S) {
    var B = S.boardRows, ui = S.ui;
    var per = '<div class="seg" role="group" aria-label="Period">' +
      [['season', L.seasonLabel()], ['30d', '30 days'], ['all', 'All time']].map(function (p) {
        return '<button data-act="period" data-v="' + p[0] + '" aria-pressed="' + (ui.period === p[0]) + '">' + p[1] + '</button>';
      }).join('') + '</div>';
    var who = '<div class="seg" role="group" aria-label="Who">' +
      [['all', 'Everyone'], ['brothers', 'Members'], ['pledges', 'Pledges']].map(function (p) {
        return '<button data-act="who" data-v="' + p[0] + '" aria-pressed="' + (ui.who === p[0]) + '">' + p[1] + '</button>';
      }).join('') + '</div>';
    var played = B.filter(function (r) { return r.gp > 0; });
    if (!played.length) {
      return '<h1>Leaderboard</h1><div class="row">' + per + '</div><div class="empty"><b>No finished games in this period.</b><span>Rankings and awards appear after the first game is finished.</span><button class="btn" data-act="nav" data-to="play">New game</button></div>';
    }
    var aw = S.awards.map(function (a) {
      var names = a.pids.map(function (pid) { return esc(nameOf(S, pid)); }).join(' &amp; ');
      return '<button class="award ' + a.key + '" data-act="open-player" data-id="' + esc(a.pids[0]) + '"><span class="lab">' + esc(a.title) + '</span><span class="who">' + names + '</span><span class="val">' + esc(a.value) + '</span><span class="why">' + esc(a.note) + '</span></button>';
    }).join('');
    var showDef = played.some(function (r) { return r.defGp > 0; });
    var cols = COLS.filter(function (c) { return showDef || !c.def; });
    var th = '<tr><th class="pl">Player</th>' + cols.map(function (c) {
      var s = ui.sort === c.k ? ' aria-sort="' + (ui.dir > 0 ? 'ascending' : 'descending') + '"' : '';
      return '<th class="' + (c.g ? 'grp' : '') + '"' + s + '><button data-act="sort" data-k="' + c.k + '">' + c.t + '</button></th>';
    }).join('') + '</tr>';
    var body = played.map(function (r, i) {
      var p = S.byId[r.pid] || {};
      var thin = r.gp < P.MIN_GAMES;
      return '<tr class="' + (thin ? 'dim' : '') + '"><td class="pl"><button data-act="open-player" data-id="' + esc(r.pid) + '"><span class="rk">' + (i + 1) + '</span>' + esc(p.nick || p.name || '?') + (p.pledge ? ' <span class="chip pledge">P</span>' : '') + '</button></td>' +
        cols.map(function (c) { return '<td class="' + (c.g ? 'grp ' : '') + (ui.sort === c.k ? 'hl' : '') + '">' + c.f(r) + '</td>'; }).join('') + '</tr>';
    }).join('');
    return '<div class="row between"><h1>Leaderboard</h1></div>' +
      '<div class="row">' + per + who + '</div>' +
      (aw ? '<section class="stack"><span class="lab">Awards — ' + esc(ui.period === 'season' ? L.seasonLabel() + ' season' : ui.period === '30d' ? 'last 30 days' : 'all time') + '</span><div class="awards">' + aw + '</div></section>' : '') +
      '<section class="stack"><div class="tbl-wrap"><table class="stats"><thead>' + th + '</thead><tbody>' + body + '</tbody></table></div>' +
      '<p class="faint">Greyed rows have fewer than ' + P.MIN_GAMES + ' games and can’t win awards yet. Throws = every throw logged, so you can check everyone got an even share. Tap a column to sort.</p></section>';
  };

  /* ---------- PLAYERS ---------- */
  V.players = function (S) {
    var active = S.players.filter(function (p) { return !p.archived; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var archived = S.players.filter(function (p) { return p.archived; });
    var q = S.ui.playerQ || '';
    var list = q ? L.searchPlayers(active, q) : active;
    var rows = list.map(function (p) {
      var r = S.allRows[p.id];
      return '<button class="li" data-act="open-player" data-id="' + esc(p.id) + '">' + av(p) +
        '<span class="grow"><span class="name">' + esc(p.name) + (p.nick ? ' <span class="faint">“' + esc(p.nick) + '”</span>' : '') + '</span>' +
        '<span class="faint" style="font-size:13px">' + (r && r.gp ? r.w + '–' + r.l + ' · ' + r.thr + ' throws' : 'No games yet') + '</span></span>' +
        (p.pledge ? '<span class="chip pledge">Pledge' + (p.pledgeClass ? ' · ' + esc(p.pledgeClass) : '') + '</span>' : '') + '</button>';
    }).join('');
    return '<div class="row between"><h1>Players</h1>' + (S.canWrite ? '<button class="btn" data-act="add-player">Add player</button>' : '') + '</div>' +
      '<input class="input" id="player-q" data-input="player-q" placeholder="Search players" value="' + esc(q) + '" autocomplete="off">' +
      (active.length ? '<section class="panel flat"><div class="list" id="player-list">' + (rows || '<p class="muted">No one matches “' + esc(q) + '”.</p>') + '</div></section>'
        : '<div class="empty"><b>No players yet.</b><span>Register everyone once. After that, games pick them from search — no retyping, no misspelled duplicates.</span>' + (S.canWrite ? '<button class="btn" data-act="add-player">Add player</button>' : '') + '</div>') +
      (archived.length ? '<details class="panel flat"><summary class="lab">Archived (' + archived.length + ')</summary><div class="list">' + archived.map(function (p) {
        return '<button class="li" data-act="open-player" data-id="' + esc(p.id) + '">' + av(p) + '<span class="grow name">' + esc(p.name) + '</span></button>';
      }).join('') + '</div></details>' : '');
  };
  V.playerRows = function (S, list) { return list; };

  V.player = function (S, p) {
    var r = S.allRows[p.id] || null, pl = r && r.pledgeLine;
    var mine = S.me && p.userId === S.me;
    function kpi(label, val) { return '<div class="kpi"><span class="lab">' + label + '</span><span class="num">' + val + '</span></div>'; }
    var k = r && r.gp ? '<div class="kpis">' + kpi('Record', r.w + '–' + r.l) + kpi('Win%', L.fmtPct(r.winPct)) + kpi('Throws', r.thr) +
      kpi('Hit%', L.fmtPct(r.hitPct)) + kpi('Points', r.pts) + kpi('PPG', L.fmt1(r.ppg)) + kpi('Plunks', r.s.snk) +
      (r.defGp ? kpi('Catches', r.s.ctc) + kpi('Drops', r.s.drp) + kpi('Catch%', L.fmtPct(r.catchPct)) : '') + kpi('Impact', L.fmt1(r.impact)) + '</div>'
      : '<div class="empty"><b>No finished games yet.</b></div>';
    var split = pl && pl.gp && pl.gp < r.gp ? '<section class="panel stack"><h3>As a pledge vs. after</h3><div class="tbl-wrap"><table class="stats"><thead><tr><th class="pl"></th><th>GP</th><th>W–L</th><th>Hit%</th><th>PPG</th><th>Impact</th></tr></thead><tbody>' +
      splitRow('As pledge', pl) + splitRow('Since', diff(r, pl)) + '</tbody></table></div></section>' : '';
    var games = S.games.filter(function (g) { return L.teamOf(g, p.id) >= 0; }).slice(0, 8);
    var partner = bestPartner(S, p.id);
    return '<div class="row between"><button class="btn sm ghost" data-act="back">← Back</button>' + (S.canWrite ? '<button class="btn sm ghost" data-act="edit-player" data-id="' + esc(p.id) + '">Edit</button>' : '') + '</div>' +
      '<section class="ph">' + av(p) + '<div class="stack tight"><h1>' + esc(p.name) + '</h1><div class="row">' +
      (p.nick ? '<span class="muted">“' + esc(p.nick) + '”</span>' : '') +
      (p.pledge ? '<span class="chip pledge">Pledge' + (p.pledgeClass ? ' · ' + esc(p.pledgeClass) : '') + '</span>' : '') +
      (p.archived ? '<span class="chip">Archived</span>' : '') + (mine ? '<span class="chip ok">This is you</span>' : '') + '</div></div></section>' +
      k + (partner ? '<p class="muted">Best partner: <b>' + esc(nameOf(S, partner.pid)) + '</b> — ' + partner.w + '–' + (partner.gp - partner.w) + ' together.</p>' : '') +
      split +
      (games.length ? '<section class="stack"><h2>Recent games</h2>' + games.map(function (g) { return gameCard(S, g); }).join('') + '</section>' : '') +
      (S.me && !p.userId && !S.claimed ? '<button class="btn ghost" data-act="claim" data-id="' + esc(p.id) + '">This is me — link to my account</button>' : '');
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
    var g = S.group, r = S.rules;
    var pledges = S.players.filter(function (p) { return p.pledge && !p.archived; });
    function num(id, label, val, min, max) {
      return '<div class="field"><label for="' + id + '">' + label + '</label><input class="input" type="number" inputmode="numeric" id="' + id + '" name="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '"' + (S.canWrite ? '' : ' disabled') + '></div>';
    }
    return '<h1>' + esc(g.name) + '</h1>' +
      '<div class="split"><form class="panel stack" data-form="rules"><h2>House rules</h2>' +
      '<div class="steps" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">' + num('target', 'Play to', r.target, 1, 50) + num('winBy', 'Win by', r.winBy, 1, 5) + num('plunkPts', 'A plunk is worth', r.plunkPts, 0, 10) + '</div>' +
      '<label class="check"><input type="checkbox" name="defense"' + (r.defense ? ' checked' : '') + (S.canWrite ? '' : ' disabled') + '> New games track catches &amp; drops</label>' +
      '<div class="field"><label for="gname">Group name</label><input class="input" id="gname" name="name" maxlength="60" value="' + esc(g.name) + '"' + (S.canWrite ? '' : ' disabled') + '></div>' +
      (S.canWrite ? '<button class="btn" type="submit">Save rules</button>' : '') + '</form>' +
      '<div class="stack"><section class="panel stack"><h2>Pledge class</h2>' +
      (pledges.length ? '<p class="muted">' + pledges.length + ' current ' + (pledges.length === 1 ? 'pledge' : 'pledges') + ': ' + pledges.map(function (p) { return esc(p.name); }).join(', ') + '.</p>' +
        '<p class="faint">Initiating keeps every game they played as pledges tagged that way, so their pledge-era stats stay separate.</p>' +
        (S.canWrite ? '<button class="btn ghost" data-act="initiate">Initiate pledge class…</button>' : '')
        : '<p class="muted">No current pledges. Mark someone as a pledge when you add or edit them.</p>') + '</section>' +
      '<section class="panel stack"><h2>Who can log games</h2>' +
      '<p class="muted">This group lives in the shared Plunk database. Anyone with the link can watch stats; people invited as editors can log and edit games.</p>' +
      '<p class="faint">Storage: ' + (S.storeKind === 'shared' ? 'shared — every device sees the same games, live.' : 'this device only — games stay in this browser.') + '</p>' +
      '<button class="btn ghost" data-act="switch-group">Switch or create group</button></section></div></div>';
  };
})(window.PLUNK);
