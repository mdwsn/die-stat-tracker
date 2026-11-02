/* ================================================================
   [APP] State, navigation, taps, sheets, boot.
   One state object `S`. Every change goes: action → save → render.
   ================================================================ */
(function (P) {
  'use strict';
  var L = P.logic, V = P.views, esc = L.esc;
  var $ = function (id) { return document.getElementById(id); };
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function store_get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store_set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  function sess_get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sess_set(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { } }
  /* scorer: null = default to the player linked to this account, '' = nobody, else a player id */
  function blankDraft() { return { teams: [[null, null], [null, null]], mode: 'table', defense: S.rules ? S.rules.defense : true, scorer: null }; }

  var S = P.S = {
    ready: false, route: 'play', view: null, groups: [], gid: null, group: null,
    players: [], games: [], byId: {}, rules: clone(P.DEFAULT_RULES), local: {},
    draft: null, edit: null, pick: null, helping: {}, celebrated: {}, groupReady: false,
    ui: { period: 'season', who: 'all', sort: 'impact', dir: -1, playerQ: '' },
    canWrite: true, me: null, claimed: false, storeKind: 'device',
    boardRows: [], awards: [], allRows: {}
  };
  S.draft = blankDraft();
  var store = null, unGroup = null, unGroups = null;

  /* ---------- derived numbers, recomputed after every change ---------- */
  function derive() {
    S.byId = {};
    S.players.forEach(function (p) { S.byId[p.id] = p; });
    S.rules = Object.assign({}, P.DEFAULT_RULES, (S.group && S.group.rules) || {});
    var last = {};
    S.games.forEach(function (g) { g.appeared[0].concat(g.appeared[1]).forEach(function (pid) { last[pid] = Math.max(last[pid] || 0, g.started || 0); }); });
    S.players.forEach(function (p) { p.lastPlayed = last[p.id] || 0; });
    S.allRows = {};
    L.leaderboard(S.games, S.players, 'all').forEach(function (r) { S.allRows[r.pid] = r; });
    var rows = L.leaderboard(S.games, S.players, S.ui.period);
    S.awards = L.awards(rows, S.games, S.ui.period);
    var who = S.ui.who;
    rows = rows.filter(function (r) {
      var p = S.byId[r.pid] || {};
      return who === 'all' || (who === 'pledges' ? p.pledge : !p.pledge);
    });
    var col = V.COLS.filter(function (c) { return c.k === S.ui.sort; })[0] || V.COLS[V.COLS.length - 1];
    var val = function (r) { var v = col.v ? col.v(r) : r[col.sort || col.k]; return v == null || !isFinite(v) ? null : v; };
    rows.sort(function (a, b) {
      var qa = a.gp >= P.MIN_GAMES, qb = b.gp >= P.MIN_GAMES;
      if (qa !== qb) return qa ? -1 : 1;                       // qualified players rank above thin samples
      var x = val(a), y = val(b);
      if (x === y) return b.gp - a.gp;
      if (x === null) return 1; if (y === null) return -1;
      return (x - y) * S.ui.dir;
    });
    S.boardRows = rows;
    S.claimed = !!S.me && S.players.some(function (p) { return p.userId === S.me; });
    var mine = S.me && S.players.filter(function (p) { return p.userId === S.me && !p.archived; })[0];
    S.claimedPid = mine ? mine.id : null;
    S.inviteLink = S.group && S.group.joinCode && store && store.siteUrl ? store.siteUrl() + '?join=' + S.group.joinCode : '';
    S.canShare = !!(navigator.share);
    S.theme = store_get('dt.theme') === 'light' ? 'light' : 'dark';
    S.lastBackup = S.gid ? +(store_get('plunk.lastBackup.' + S.gid) || 0) : 0;
    try { S.standalone = !!((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone); } catch (e) { S.standalone = false; }
    if (S.players.length && S.draft.scorer && !(S.byId[S.draft.scorer] && !S.byId[S.draft.scorer].archived)) S.draft.scorer = null;
    if (S.players.length) S.draft.teams = S.draft.teams.map(function (t) {
      return t.map(function (pid) { return pid && S.byId[pid] && !S.byId[pid].archived ? pid : null; });
    });
  }
  function mergeGames(list) {
    // A tap shows instantly; the database copy catches up a moment later.
    // Keep whichever copy of a game is newer so a slow echo never rolls back a tap.
    var seen = {}, out = [];
    list.forEach(function (g) {
      seen[g.id] = 1;
      var mine = S.local[g.id];
      if (mine && mine.__deleted) return;
      if (mine && (mine.updated || 0) > (g.updated || 0)) return out.push(clone(mine));
      if (mine) delete S.local[g.id];
      out.push(g);
    });
    Object.keys(S.local).forEach(function (id) { if (!seen[id] && !S.local[id].__deleted) out.push(clone(S.local[id])); });
    out.sort(function (a, b) { return (b.started || 0) - (a.started || 0); });
    return out;
  }
  /* Score a live game here only if you started it (or chose "Help score").
     Everyone else watches, so two phones never fight over one game. */
  function scoringHere(g) { return L.canScore(g, S.me, S.canWrite, S.helping); }
  function game(id) { return S.games.filter(function (g) { return g.id === id; })[0] || null; }
  function nameOf(pid) { var p = S.byId[pid]; return p ? (p.nick || p.name) : 'Unknown'; }

  /* ---------- writes ---------- */
  function onWriteError(e) {
    if (e && e.code === 'invalid_argument') {
      S.canWrite = false;
      banner('This link is view-only for you. Ask the group owner to invite you as an editor to log games.');
    } else if (e && e.code === 'denied') {
      banner('You don’t have access to change this group. Ask a member to send you its invite link.');
    } else if (e && e.code === 'quota_exceeded') banner('The database is full: ' + esc(e.message));
    else banner('A change didn’t save (' + esc((e && e.code) || 'error') + '). It is still on this screen — try again in a moment.');
    render();
  }
  function saveGame(g) {
    g.updated = Date.now();
    S.local[g.id] = clone(g);
    S.games = mergeGames(S.games);
    derive(); render();
    return store.saveGame(S.gid, clone(g))['catch'](onWriteError);
  }
  function savePlayer(p) {
    p.updated = Date.now();
    var i = S.players.findIndex(function (x) { return x.id === p.id; });
    if (i >= 0) S.players[i] = p; else S.players.push(p);
    derive(); render();
    var doc = clone(p); delete doc.lastPlayed;
    return store.savePlayer(S.gid, doc)['catch'](onWriteError);
  }
  function saveGroup(g) {
    S.group = g; derive(); render();
    return store.saveGroup(clone(g))['catch'](onWriteError);
  }

  /* ---------- group selection ---------- */
  function selectGroup(gid) {
    if (unGroup) { unGroup(); unGroup = null; }
    S.gid = gid; S.group = S.groups.filter(function (g) { return g.id === gid; })[0] || null;
    S.players = []; S.games = []; S.local = {}; S.view = null; S.groupReady = !gid;
    store_set('plunk.gid', gid || '');
    if (!gid) { derive(); render(); return; }
    var d = store_get('plunk.draft.' + gid);
    try { S.draft = d ? JSON.parse(d) : blankDraft(); } catch (e) { S.draft = blankDraft(); }
    unGroup = store.listenGroup(gid, function (data) {
      S.groupReady = true;
      S.players = data.players;
      S.games = mergeGames(data.games);
      derive(); render();
    }, function (e) { banner('Can’t load this group (' + esc(e.code) + ').'); });
    derive(); render();
  }
  function keepDraft() { if (S.gid) store_set('plunk.draft.' + S.gid, JSON.stringify(S.draft)); }

  /* ---------- render ---------- */
  /* ---------- motion: short, springy, and off when the phone asks for reduced motion ---------- */
  function calm() { return !window.requestAnimationFrame || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  var ticks = {}, seenStatus = {};
  /* number ticker: a score that moved by one rolls in; a bigger jump counts up over 250 ms */
  function runTicks() {
    var els = document.querySelectorAll('[data-tick]'), still = calm();
    for (var i = 0; i < els.length; i++) {
      var el = els[i], key = el.getAttribute('data-tick'), to = parseFloat(el.textContent), from = ticks[key];
      ticks[key] = to;
      if (still || from == null || from === to || !isFinite(from) || !isFinite(to)) continue;
      if (Math.abs(to - from) === 1) el.classList.add(to > from ? 'tick-up' : 'tick-down');
      else countUp(el, from, to);
    }
  }
  function countUp(el, from, to) {
    var t0 = performance.now();
    el.textContent = from;
    requestAnimationFrame(function step(t) {
      var k = Math.min(1, (t - t0) / 250), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    });
  }
  /* leaderboard: remember where each row was, then slide it from there to where it is now (FLIP) */
  function measureRows() {
    if (S.route !== 'board' || S.view || calm()) return null;
    var rows = document.querySelectorAll('#view tr[data-pid]'), m = {};
    for (var i = 0; i < rows.length; i++) m[rows[i].getAttribute('data-pid')] = rows[i].getBoundingClientRect().top;
    return rows.length ? m : null;
  }
  function playRows(before) {
    if (!before) return;
    var rows = document.querySelectorAll('#view tr[data-pid]'), moved = [];
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i], top = before[tr.getAttribute('data-pid')];
      if (top == null) continue;
      var dy = top - tr.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      tr.style.transition = 'none'; tr.style.transform = 'translateY(' + dy + 'px)'; moved.push(tr);
    }
    if (moved.length) requestAnimationFrame(function () { requestAnimationFrame(function () {
      moved.forEach(function (tr) { tr.style.transition = 'transform var(--dur-3) var(--spring)'; tr.style.transform = ''; tr.classList.add('moved'); });
    }); });
  }
  /* one shot of confetti for the winners, the moment the game on screen goes final */
  function checkFinish() {
    var g = S.view && game(S.view.id);
    if (!g) return;
    var before = seenStatus[g.id]; seenStatus[g.id] = g.status;
    if (before === 'live' && g.status === 'final' && !S.celebrated[g.id]) {
      var w = L.winnerOf(g);
      if (w === null) return;                       // a tie gets no confetti
      S.celebrated[g.id] = true;
      if (!calm()) confetti(w === 0 ? 0.3 : 0.7);
    }
  }
  function confetti(xFrac) {
    var c = document.createElement('canvas'), ctx = c.getContext && c.getContext('2d');
    if (!ctx) return;
    var W = window.innerWidth, H = window.innerHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr; c.className = 'confetti'; c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c); ctx.scale(dpr, dpr);
    var css = getComputedStyle(document.documentElement);
    var colors = [css.getPropertyValue('--accent').trim(), css.getPropertyValue('--accent-text').trim(), css.getPropertyValue('--fg').trim(), css.getPropertyValue('--faint').trim()];
    var bits = [];
    for (var i = 0; i < 110; i++) {
      var a = (-90 + (Math.random() - 0.5) * 75) * Math.PI / 180, v = 8 + Math.random() * 8;
      bits.push({ x: W * xFrac, y: H * 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35, w: 5 + Math.random() * 4, h: 8 + Math.random() * 6, c: colors[i % colors.length] });
    }
    var t0 = performance.now(), life = 1700;
    requestAnimationFrame(function frame(t) {
      var age = t - t0;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, 1 - age / life);
      bits.forEach(function (b) {
        b.vy += 0.3; b.vx *= 0.985; b.vy *= 0.985; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c;
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.max(0.2, Math.abs(Math.cos(b.r * 2))));
        ctx.restore();
      });
      if (age < life) requestAnimationFrame(frame); else c.remove();
    });
  }
  function applyTheme(v) {
    if (v === 'light') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme');
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', v === 'light' ? '#ffffff' : '#09090b');
  }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(10); } catch (e) { } }

  function render(enter) {
    var active = document.activeElement, focusId = active && active.id, sel = null;
    try { sel = focusId && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null; } catch (e) { }
    $('top').innerHTML = V.top(S);
    $('tabs').innerHTML = S.group ? V.tabs(S) : '';
    $('tabs').hidden = !S.group;
    $('app').classList.toggle('solo', !S.group);
    var html;
    if (S.fatal) html = '<div class="empty"><b>Can’t start Dice Tracker</b><span>' + esc(S.fatal) + '</span><button class="btn" data-act="reload">Try again</button></div>';
    else if (S.needAuth) html = V.signin(S);
    else if (!S.ready) html = V.skeleton();
    else if (!S.group) html = V.welcome(S);
    else if (!S.groupReady && !S.view) html = V.skeleton();
    else if (S.view && S.view.kind === 'edit' && S.edit) html = V.editGame(S, S.edit);
    else if (S.view && S.view.kind === 'tv' && game(S.view.id)) html = V.tv(S, game(S.view.id));
    else if (S.view && (S.view.kind === 'live' || S.view.kind === 'watch') && game(S.view.id) && game(S.view.id).status === 'live')
      html = S.view.kind === 'live' && scoringHere(game(S.view.id)) ? V.live(S, game(S.view.id)) : V.watch(S, game(S.view.id));
    else if (S.view && /^(game|live|watch)$/.test(S.view.kind) && game(S.view.id)) html = V.game(S, game(S.view.id));
    else if (S.view && S.view.kind === 'player' && S.byId[S.view.id]) html = V.player(S, S.byId[S.view.id]);
    else { S.view = null; html = V[S.route] ? V[S.route](S) : V.play(S); }
    if (S.group && S.ready && S.groupReady && !S.needAuth && !(S.view && /^(live|watch|tv|edit)$/.test(S.view.kind)) && !(S.route === 'play' && !S.view)) html = V.liveBar(S) + html;
    var rowsBefore = measureRows();
    var view = $('view');
    view.innerHTML = html;
    if (enter && !calm()) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); }
    else view.classList.remove('enter');          // never on a tap: the screen must not re-fly every throw
    playRows(rowsBefore); runTicks(); checkFinish();
    if (focusId && $(focusId)) {
      var el = $(focusId); el.focus();
      if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { }
    }
    savingText();
  }
  function savingText() {
    var sv = $('saving');
    if (sv) sv.textContent = S.offline ? 'Offline · ' + (S.unsynced ? S.unsynced + ' to upload' : 'will sync') : store && store.pending() ? 'Saving…' : '';
  }
  function go(route) {
    S.route = route; S.view = null; S.edit = null;
    try { history.replaceState(null, '', '#' + route); } catch (e) { }
    render(true); window.scrollTo(0, 0);
  }
  function open(kind, id) { S.view = { kind: kind, id: id }; render(true); window.scrollTo(0, 0); }

  /* ---------- banner, toast, sheet ---------- */
  function banner(html, rememberAs) {
    var b = $('banner');
    if (!html) { b.hidden = true; b.innerHTML = ''; return; }
    if (rememberAs && store_get(rememberAs)) return;          // already dismissed on this device
    b.innerHTML = '<div><span>' + html + '</span><button class="btn sm quiet" data-act="banner-x"' +
      (rememberAs ? ' data-remember="' + rememberAs + '"' : '') + '>Dismiss</button></div>';
    b.hidden = false;
  }
  var toastT = null;
  function toast(msg) {
    var t = $('toast');
    t.innerHTML = V.icon('check') + '<span></span>'; t.lastChild.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function sheet(title, body) {
    var s = $('sheet');
    s.innerHTML = '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="sheet-h"><h2>' + esc(title) + '</h2><button class="sheet-x" data-act="close" aria-label="Close">' + V.icon('x') + '</button></div><div class="stack" id="sheet-body">' + body + '</div></div>';
    s.hidden = false;
    var fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    var f = s.querySelector('[autofocus]') || (fine ? s.querySelector('.input') : null);
    if (f) f.focus();
  }
  function closeSheet() { $('sheet').hidden = true; $('sheet').innerHTML = ''; S.pick = null; }

  /* ---------- the player picker: search first, register only if new ---------- */
  function taken() {
    if (S.pick && (S.pick.for === 'scorer' || S.pick.for === 'ed-scorer')) return [];   // anyone can keep stats
    if (S.pick && S.pick.for === 'draft') return S.draft.teams[0].concat(S.draft.teams[1]).filter(Boolean);
    var g = S.pick && S.pick.for === 'replace' ? S.edit : (S.view && game(S.view.id));
    return g ? g.teams[0].concat(g.teams[1]) : [];
  }
  function openPicker(ctx, title) {
    S.pick = ctx;
    sheet(title || 'Pick a player', '<input class="input" id="pick-q" data-input="pick-q" placeholder="Search by name or nickname" autocomplete="off" autofocus>' +
      '<div class="results" id="pick-results">' + pickResults('') + '</div>');
  }
  function pickResults(q) {
    var list = L.searchPlayers(S.players, q, taken()).slice(0, 30);
    var rows = list.map(function (p) {
      return '<button class="li" data-act="pick" data-id="' + esc(p.id) + '">' + V.av(p) + '<span class="grow name">' + esc(p.name) +
        (p.nick ? ' <span class="faint">“' + esc(p.nick) + '”</span>' : '') + '</span>' + (p.pledge ? '<span class="chip pledge">Pledge</span>' : '') + '</button>';
    }).join('');
    var add = '';
    if (q.trim() && S.canWrite) {
      var look = L.lookalikes(S.players, q);
      if (look.exact) add = '<p class="note">“' + esc(look.exact.name) + '” is already registered' + (taken().indexOf(look.exact.id) >= 0 ? ' and already in this game.' : '. Pick them above.') + '</p>';
      else add = '<button class="li hit" data-act="pick-new" data-name="' + esc(q.trim()) + '"><span class="av">' + V.icon('plus') + '</span><span class="grow"><span class="name">Register “' + esc(q.trim()) + '”</span>' +
        (look.near.length ? '<span class="meta">Check first: ' + look.near.map(function (p) { return esc(p.name); }).join(', ') + '</span>' : '<span class="meta">New player in ' + esc(S.group.name) + '</span>') + '</span></button>';
    }
    if (!rows && !add) return '<p class="note">' + (S.players.length ? 'Type a name to search.' : 'No players registered yet. Type a name to add the first one.') + '</p>';
    return rows + add;
  }
  function picked(pid) {
    var ctx = S.pick, p = S.byId[pid];
    closeSheet();
    if (!ctx || !p) return;
    if (ctx.for === 'scorer') { S.draft.scorer = pid; keepDraft(); render(); return; }
    if (ctx.for === 'ed-scorer') { S.edit.scorer = pid; S.edit.scorerPledge = L.wasPledgeAt(p, S.edit.started || S.edit.created); render(); return; }
    if (ctx.for === 'draft') { S.draft.teams[ctx.t][ctx.s] = pid; keepDraft(); render(); }
    else if (ctx.for === 'sub') {
      var g = clone(game(S.view.id));
      L.substitute(g, ctx.t, ctx.s, pid, !!p.pledge);
      saveGame(g); toast(nameOf(pid) + ' is in');
    } else if (ctx.for === 'replace') {
      L.replacePlayer(S.edit, ctx.pid, pid, !!p.pledge); render();
    }
  }
  function newPlayer(name, extra) {
    var p = Object.assign({ id: L.uid('p'), name: name.trim().replace(/\s+/g, ' '), nick: '', pledge: false, pledgeClass: '', archived: false, userId: null, created: Date.now(), by: S.me }, extra || {});
    savePlayer(p);
    return p;
  }
  function playerForm(p, nameHint) {
    p = p || { name: nameHint || '', nick: '', pledge: false, pledgeClass: '' };
    return '<form class="stack" data-form="player" data-id="' + esc(p.id || '') + '">' +
      '<div class="field"><label for="pf-name">Full name</label><input class="input" id="pf-name" name="name" required maxlength="60" value="' + esc(p.name) + '" autocomplete="off"' + (p.id ? '' : ' autofocus') + '></div>' +
      '<div class="field"><label for="pf-nick">Nickname (optional)</label><input class="input" id="pf-nick" name="nick" maxlength="30" value="' + esc(p.nick || '') + '" autocomplete="off"></div>' +
      '<label class="check"><input type="checkbox" name="pledge"' + (p.pledge ? ' checked' : '') + '> Pledge</label>' +
      '<div class="field"><label for="pf-class">Pledge class (optional)</label><input class="input" id="pf-class" name="pledgeClass" maxlength="30" placeholder="e.g. Fall 2026" value="' + esc(p.pledgeClass || '') + '"></div>' +
      '<div id="pf-warn"></div>' +
      '<button class="btn big" type="submit">' + (p.id ? 'Save' : 'Add player') + '</button>' +
      (p.id ? '<button class="btn ghost" type="button" data-act="archive-player" data-id="' + esc(p.id) + '">' + (p.archived ? 'Restore player' : 'Archive player') + '</button><p class="note">Archiving hides them from search but keeps every game they played.</p>' : '') +
      '</form>';
  }

  function keepData() {
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(function (yes) { if (!yes) navigator.storage.persist(); }); } catch (e) { }
  }
  /* Lets the site open with no signal (sw.js). Never inside claude.ai, which doesn't allow it. */
  function registerOffline() {
    try {
      if (!('serviceWorker' in navigator) || window.claude) return;
      if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
      navigator.serviceWorker.register('sw.js')['catch'](function () { });
    } catch (e) { }
  }

  /* ---------- live game ---------- */
  var wake = null;
  function keepAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; }, function () { });
      if (!on && wake) { wake.release(); wake = null; }
    } catch (e) { }
  }
  function liveGame() { var g = S.view && game(S.view.id); return g ? clone(g) : null; }
  function finishSheet() {
    var g = liveGame(); if (!g) return;
    var ws = L.winState(g);
    g.ended = Date.now();
    var recap = L.summarize(g, nameOf);
    sheet(ws.done ? 'Finish game' : 'Finish early?',
      '<div class="final"><div>' + V.dot(0) + '<span class="num">' + ws.a + '</span></div><span class="lab">Final</span><div><span class="num">' + ws.b + '</span>' + V.dot(1) + '</div></div>' +
      (ws.done ? '' : '<div class="warnbox">Nobody has reached ' + g.rules.target + ' with a ' + g.rules.winBy + '-point lead yet. Finishing now records the score as it stands.</div>') +
      '<span class="lab">Recap</span><p>' + esc(recap) + '</p>' +
      '<p class="note">You can still edit this game after finishing: numbers, players, or whether it counted.</p>' +
      '<button class="btn big" data-act="finish-yes">Finish game</button><button class="btn ghost" data-act="close">Keep playing</button>');
  }

  /* ---------- backups ---------- */
  function slug(t) { return String(t || 'group').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'; }
  function backupData() {
    var g = clone(S.group); delete g.joinCode;
    return {
      app: 'dice-tracker', format: 1, exportedAt: new Date().toISOString(), group: g,
      players: S.players.map(function (p) { var c = clone(p); delete c.lastPlayed; return c; }),
      games: S.games.map(clone)
    };
  }
  /* The same backup restored into the same group always gets the same ids,
     so restoring twice never doubles anything. */
  function stableId(prefix, a, b) {
    var str = a + '|' + b, h1 = 0x811c9dc5, h2 = 0x01000193;
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
    }
    return prefix + 'i' + h1.toString(36) + h2.toString(36);
  }
  function remapGame(g, map, newId) {
    function m(pid) { return map[pid] || pid; }
    var ng = clone(g); ng.id = newId;
    ng.teams = (ng.teams || []).map(function (t) { return t.map(m); });
    ng.appeared = (ng.appeared || ng.teams).map(function (t) { return t.map(m); });
    var st = {}; Object.keys(ng.stats || {}).forEach(function (pid) { st[m(pid)] = ng.stats[pid]; }); ng.stats = st;
    ng.pledges = (ng.pledges || []).map(m);
    (ng.log || []).forEach(function (e) { (e.it || []).forEach(function (it) { it[0] = m(it[0]); }); });
    (ng.subs || []).forEach(function (sb) { sb.out = m(sb.out); sb['in'] = m(sb['in']); });
    if (ng.scorer) ng.scorer = m(ng.scorer);
    return ng;
  }
  function planImport(data) {
    if (!data || data.app !== 'dice-tracker' || !Array.isArray(data.players) || !Array.isArray(data.games)) throw new Error('not a backup');
    var same = !!(data.group && data.group.id === S.gid), map = {}, byName = {};
    S.players.forEach(function (p) { byName[L.norm(p.name)] = p; });
    var plan = { from: data.group ? data.group.name : 'a backup', at: data.exportedAt, players: [], games: [], c: { newP: 0, matchedP: 0, newG: 0, updG: 0, sameG: 0 } };
    data.players.forEach(function (p) {
      if (!p || !p.id || !p.name) return;
      var mine = same ? S.byId[p.id] : null, twin = byName[L.norm(p.name)];
      if (mine) { map[p.id] = p.id; if ((p.updated || 0) > (mine.updated || 0)) plan.players.push(clone(p)); plan.c.matchedP++; return; }
      if (twin) { map[p.id] = twin.id; plan.c.matchedP++; return; }          // already registered here: use them
      var id = same ? p.id : stableId('p', S.gid, p.id);
      map[p.id] = id;
      plan.players.push(Object.assign(clone(p), { id: id }));
      plan.c.newP++;
    });
    data.games.forEach(function (g) {
      if (!g || !g.id || !g.teams || !g.stats) return;
      var ng = same ? clone(g) : remapGame(g, map, stableId('g', S.gid, g.id)), cur = game(ng.id);
      if (!cur) { plan.games.push(ng); plan.c.newG++; }
      else if ((ng.updated || 0) > (cur.updated || 0)) { plan.games.push(ng); plan.c.updG++; }
      else plan.c.sameG++;
    });
    return plan;
  }
  function applyImport(plan) {
    plan.players.forEach(function (p) {
      var i = S.players.findIndex(function (x) { return x.id === p.id; });
      if (i >= 0) S.players[i] = p; else S.players.push(p);
      store.savePlayer(S.gid, clone(p))['catch'](onWriteError);           // keeps the backup's own `updated` time
    });
    plan.games.forEach(function (g) {
      S.local[g.id] = clone(g);
      store.saveGame(S.gid, clone(g))['catch'](onWriteError);
    });
    S.games = mergeGames(S.games); derive(); render();
  }
  function importSheet(plan) {
    S.importPlan = plan;
    var c = plan.c, nothing = !plan.players.length && !plan.games.length;
    sheet('Restore from a backup',
      '<p>From <b>' + esc(plan.from) + '</b>' + (plan.at ? ', saved ' + esc(V.when(Date.parse(plan.at))) : '') + '.</p>' +
      '<div class="card list">' +
      '<div class="li"><span class="grow name">' + L.plural(c.newP, 'new player') + '</span><span class="meta">' + c.matchedP + ' already here</span></div>' +
      '<div class="li"><span class="grow name">' + L.plural(c.newG, 'new game') + '</span><span class="meta">' + c.updG + ' newer copies</span></div>' +
      '<div class="li"><span class="grow name">' + L.plural(c.sameG, 'game') + ' already up to date</span></div></div>' +
      '<p class="note">Players with the same name as someone already in ' + esc(S.group.name) + ' are treated as the same person. Restoring the same file twice adds nothing the second time.</p>' +
      (nothing ? '<p class="note"><b>Everything in this backup is already here.</b></p><button class="btn ghost" data-act="close">Close</button>'
        : '<button class="btn big" data-act="import-yes">Add to ' + esc(S.group.name) + '</button><button class="btn ghost" data-act="close">Cancel</button>'));
  }

  /* ---------- actions ---------- */
  var A = {
    nav: function (el) { go(el.dataset.to); },
    back: function () { S.view = null; S.edit = null; render(); },
    close: closeSheet,
    reload: function () { location.reload(); },
    'auth-mode': function (el) { S.authMode = el.dataset.v; S.authError = ''; S.authNote = ''; render(); },
    google: function () { store.auth.google(); },
    'sign-out': function () { closeSheet(); store.auth.signOut(); },
    'copy-invite': function () {
      function select() {
        var el = $('invite-link'); if (!el) return;
        var r = document.createRange(); r.selectNodeContents(el);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
        toast('Link selected. Copy it from here.');
      }
      try { navigator.clipboard.writeText(S.inviteLink).then(function () { toast('Invite link copied'); }, select); } catch (e) { select(); }
    },
    'share-invite': function () {
      try { navigator.share({ title: 'Join ' + S.group.name + ' on Dice Tracker', url: S.inviteLink })['catch'](function () { }); } catch (e) { }
    },
    'export': function () {
      if (!window.URL || !URL.createObjectURL) return toast('Backups need a regular browser.');
      var blob = new Blob([JSON.stringify(backupData(), null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'dice-tracker-' + slug(S.group.name) + '-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
      store_set('plunk.lastBackup.' + S.gid, String(Date.now()));
      render(); toast('Backup downloaded');
    },
    'import-yes': function () {
      var plan = S.importPlan; S.importPlan = null; closeSheet();
      if (!plan) return;
      applyImport(plan);
      toast('Restored ' + L.plural(plan.players.length, 'player') + ' and ' + L.plural(plan.games.length, 'game'));
    },
    theme: function (el) {
      var v = el.dataset.v === 'light' ? 'light' : 'dark';
      store_set('dt.theme', v); applyTheme(v); render();
    },
    'banner-x': function (el) { if (el.dataset.remember) store_set(el.dataset.remember, '1'); banner(''); },
    'switch-group': function () {
      sheet('Groups', '<div class="card list">' + S.groups.map(function (g) {
        return '<button class="li" data-act="pick-group" data-id="' + esc(g.id) + '"><span class="die" aria-hidden="true"></span><span class="grow name">' + esc(g.name) + '</span>' + (g.id === S.gid ? '<span class="chip ok">Open</span>' : '') + '</button>';
      }).join('') + '</div>' + (S.canWrite ? '<form class="stack" data-form="create-group"><h3>New group</h3><div class="field"><label for="ng-name">Group name</label><input class="input" id="ng-name" name="name" required maxlength="60" placeholder="e.g. Friday league"></div><div class="field"><label for="ng-kind">Type</label><select class="input" id="ng-kind" name="kind"><option value="house">Fraternity / house</option><option value="friends">Friend group</option><option value="league">League / club</option></select></div><button class="btn" type="submit">Create group</button></form>' : ''));
    },
    'pick-group': function (el) { closeSheet(); S.route = 'play'; selectGroup(el.dataset.id); },

    /* new game */
    'pick-slot': function (el, ev) {
      if (ev.target.closest('[data-act="clear-slot"]')) return A['clear-slot'](ev.target.closest('[data-act="clear-slot"]'));
      if (!S.canWrite) return;
      openPicker({ for: 'draft', t: +el.dataset.t, s: +el.dataset.s }, 'Team ' + (+el.dataset.t + 1) + ' — pick a player');
    },
    'pick-scorer': function () { if (S.canWrite) openPicker({ for: 'scorer' }, 'Who’s keeping stats?'); },
    'clear-scorer': function () { S.draft.scorer = ''; keepDraft(); render(); },
    'ed-scorer': function () { openPicker({ for: 'ed-scorer' }, 'Who kept the stats?'); },
    'clear-slot': function (el) { S.draft.teams[+el.dataset.t][+el.dataset.s] = null; keepDraft(); render(); },
    pick: function (el) { picked(el.dataset.id); },
    'pick-new': function (el) {
      var name = el.dataset.name, look = L.lookalikes(S.players, name);
      if (look.near.length && !el.dataset.sure) {
        $('pick-results').innerHTML = '<div class="warnbox"><b>Did you mean one of these?</b>' + look.near.map(function (p) {
          return '<button class="li" data-act="pick" data-id="' + esc(p.id) + '"><span class="grow name">' + esc(p.name) + '</span><span class="faint">Pick</span></button>';
        }).join('') + '<button class="btn ghost" data-act="pick-new" data-sure="1" data-name="' + esc(name) + '">No — register “' + esc(name) + '” as someone new</button></div>';
        return;
      }
      var p = newPlayer(name);
      picked(p.id);
      toast(p.name + ' registered');
    },
    'draft-mode': function (el) { S.draft.mode = el.dataset.v; keepDraft(); render(); },
    shuffle: function () {
      var all = S.draft.teams[0].concat(S.draft.teams[1]);
      for (var i = all.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = all[i]; all[i] = all[j]; all[j] = t; }
      S.draft.teams = [[all[0], all[1]], [all[2], all[3]]]; keepDraft(); render();
    },
    'start-game': function () {
      keepData();
      var t = S.draft.teams, keep = S.draft.scorer;
      var keeper = keep == null ? S.claimedPid : (keep || null);
      var g = L.newGame({
        teams: t, mode: S.draft.mode, defense: S.draft.defense, rules: S.rules, by: S.me,
        pledges: t[0].concat(t[1]).filter(function (pid) { return S.byId[pid] && S.byId[pid].pledge; }),
        scorer: keeper, scorerPledge: L.wasPledgeAt(S.byId[keeper], Date.now())
      });
      S.draft = blankDraft(); S.draft.mode = g.mode; S.draft.defense = g.defense; S.draft.scorer = keep; keepDraft();   // same keeper next game
      S.view = { kind: 'live', id: g.id };
      saveGame(g); keepAwake(true); window.scrollTo(0, 0);
    },
    'open-game': function (el) {
      var g = game(el.dataset.id);
      if (g && g.status === 'live') { open(scoringHere(g) ? 'live' : 'watch', g.id); keepAwake(true); return; }
      open('game', el.dataset.id);
    },
    'help-score': function (el) { S.helping[el.dataset.id] = true; open('live', el.dataset.id); },
    tv: function (el) {
      S.tvBack = S.view; open('tv', el.dataset.id); keepAwake(true);
      try { var d = document.documentElement; if (d.requestFullscreen) d.requestFullscreen()['catch'](function () { }); } catch (e) { }
    },
    'tv-exit': function () {
      try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen()['catch'](function () { }); } catch (e) { }
      S.view = S.tvBack && S.tvBack.kind !== 'tv' ? S.tvBack : null; S.tvBack = null; render();
    },
    'open-player': function (el) { open('player', el.dataset.id); },

    /* live logging */
    tap: function (el) {
      var g = liveGame(); if (!g) return;
      buzz();
      L.record(g, [[el.dataset.p, el.dataset.k, 1]], false);
      saveGame(g);
      var b = document.querySelector('.tap[data-p="' + (window.CSS && CSS.escape ? CSS.escape(el.dataset.p) : el.dataset.p) + '"][data-k="' + el.dataset.k + '"]');
      if (b) b.classList.add('flash');
    },
    'throw': function (el) {
      var g = liveGame(); if (!g) return;
      buzz();
      var items = JSON.parse(el.dataset.items).map(function (i) { return [i[0], i[1], 1]; });
      L.record(g, items, true);
      saveGame(g);
    },
    'set-turn': function (el) { var g = liveGame(); if (!g) return; g.turn = +el.dataset.i; saveGame(g); },
    'live-mode': function (el) { var g = liveGame(); if (!g) return; g.mode = el.dataset.v; saveGame(g); },
    'toggle-def': function () { var g = liveGame(); if (!g) return; g.defense = !g.defense; saveGame(g); },
    undo: function () { var g = liveGame(); if (!g || !g.log.length) return; L.undo(g); saveGame(g); toast('Last tap undone'); },
    sub: function () {
      var g = liveGame(); if (!g) return;
      sheet('Who’s coming out?', '<div class="card list">' + [0, 1].map(function (ti) {
        return g.teams[ti].map(function (pid, si) {
          return '<button class="li" data-act="sub-out" data-t="' + ti + '" data-s="' + si + '">' + V.dot(ti) + '<span class="grow name">' + esc(nameOf(pid)) + '</span><span class="meta">' + L.throwsOf(g.stats[pid]) + ' throws</span></button>';
        }).join('');
      }).join('') + '</div><p class="note">They keep the stats they’ve logged. The sub starts from zero, and both get credit for playing the game.</p>');
    },
    'sub-out': function (el) { openPicker({ for: 'sub', t: +el.dataset.t, s: +el.dataset.s }, 'Who’s coming in?'); },
    finish: finishSheet,
    'finish-yes': function () {
      var g = liveGame(); if (!g) return;
      g.status = 'final'; g.ended = Date.now();
      g.summary = L.summarize(g, nameOf);
      closeSheet(); keepAwake(false);
      S.view = { kind: 'game', id: g.id };
      saveGame(g); toast('Game saved'); window.scrollTo(0, 0);
    },

    /* editing a game — live or finished, any time */
    'edit-game': function (el) {
      var g = game(el.dataset.id); if (!g || !S.canWrite) return;
      S.edit = clone(g); S.edit.__was = g.status;
      open('edit', g.id);
    },
    'ed-step': function (el) {
      var s = S.edit.stats[el.dataset.p] || (S.edit.stats[el.dataset.p] = L.blankStats());
      s[el.dataset.k] = Math.max(0, (s[el.dataset.k] || 0) + Number(el.dataset.d)); render();
    },
    'ed-adj': function (el) { S.edit.adj = S.edit.adj || [0, 0]; S.edit.adj[+el.dataset.t] += Number(el.dataset.d); render(); },
    'ed-status': function (el) { S.edit.status = el.dataset.v; render(); },
    'ed-replace': function (el) { openPicker({ for: 'replace', pid: el.dataset.p }, 'Who actually played?'); },
    'ed-cancel': function () { var id = S.edit && S.edit.id, was = S.edit && S.edit.__was; S.edit = null; open(was === 'live' ? 'live' : 'game', id); },
    'ed-save': function () {
      var g = S.edit; delete g.__was;
      if (g.status !== 'live') { if (!g.ended) g.ended = g.updated || Date.now(); g.summary = L.summarize(g, nameOf); }
      else g.ended = null;
      g.edits = (g.edits || []).concat([{ at: Date.now(), by: S.me }]);
      S.edit = null; S.view = { kind: g.status === 'live' ? 'live' : 'game', id: g.id };
      saveGame(g); toast('Changes saved');
    },
    'ed-delete': function () {
      sheet('Delete this game?', '<p>This removes the game and its stats for everyone. If it just shouldn’t count, mark it “Didn’t count” instead — that keeps the record.</p>' +
        '<button class="btn danger big" data-act="ed-delete-yes">Delete for good</button><button class="btn ghost" data-act="close">Keep it</button>');
    },
    'ed-delete-yes': function () {
      var id = S.edit.id;
      S.local[id] = { id: id, __deleted: true, updated: Date.now() + 1e9 };
      S.games = S.games.filter(function (g) { return g.id !== id; });
      S.edit = null; S.view = null; closeSheet(); derive(); go('games');
      store.removeGame(S.gid, id)['catch'](onWriteError);
      toast('Game deleted');
    },

    /* board */
    period: function (el) { S.ui.period = el.dataset.v; derive(); render(); },
    who: function (el) { S.ui.who = el.dataset.v; derive(); render(); },
    sort: function (el) {
      var k = el.dataset.k;
      S.ui.dir = S.ui.sort === k ? -S.ui.dir : -1; S.ui.sort = k; derive(); render();
    },

    /* players */
    'add-player': function () { sheet('Add player', playerForm(null)); },
    'edit-player': function (el) { sheet('Edit player', playerForm(S.byId[el.dataset.id])); },
    'archive-player': function (el) {
      var p = clone(S.byId[el.dataset.id]); p.archived = !p.archived; closeSheet(); savePlayer(p);
      toast(p.archived ? p.name + ' archived' : p.name + ' restored');
    },
    claim: function (el) { var p = clone(S.byId[el.dataset.id]); p.userId = S.me; savePlayer(p); toast('Linked to your account'); },
    initiate: function () {
      var n = S.players.filter(function (p) { return p.pledge && !p.archived; }).length;
      sheet('Initiate pledge class', '<p>Mark all ' + n + ' current pledges as members? Their pledge-era games stay tagged as pledge games.</p><button class="btn big" data-act="initiate-yes">Initiate ' + n + '</button><button class="btn ghost" data-act="close">Not yet</button>');
    },
    'initiate-yes': function () {
      closeSheet();
      S.players.filter(function (p) { return p.pledge && !p.archived; }).forEach(function (p) {
        var q = clone(p); q.pledge = false; q.initiated = Date.now(); savePlayer(q);
      });
      toast('Pledge class initiated');
    }
  };

  function fv(f, n) { var el = f.elements.namedItem(n); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; }
  var FORMS = {
    'create-group': function (f) {
      var name = String(fv(f, 'name')).trim(); if (!name) return;
      var g = { id: L.uid('h'), name: name, kind: fv(f, 'kind') || 'house', created: Date.now(), by: S.me, rules: clone(P.DEFAULT_RULES) };
      if (store.createGroup) {
        // on the website the server makes the group (and its invite code) before anything can be added to it
        var btn = f.querySelector('[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
        store.createGroup(g).then(function (code) {
          closeSheet();
          g.joinCode = code;
          if (!S.groups.some(function (x) { return x.id === g.id; })) S.groups = S.groups.concat([g]);
          S.route = 'players'; selectGroup(g.id);
          toast(name + ' created. Add your players.');
        }, function (e) {
          if (btn) { btn.disabled = false; btn.textContent = 'Create group'; }
          onWriteError(e);
        });
        return;
      }
      closeSheet();
      S.groups = S.groups.filter(function (x) { return x.id !== g.id; }).concat([g]);
      store.saveGroup(g).then(null, onWriteError);
      S.route = 'players'; selectGroup(g.id);
      toast(name + ' created — add your players');
    },
    auth: function (f) {
      var email = String(fv(f, 'email')).trim(), pw = String(fv(f, 'password'));
      if (!email || !pw) return;
      var up = S.authMode === 'up';
      S.authBusy = true; S.authError = ''; S.authNote = ''; S.authEmail = email; render();
      (up ? store.auth.signUp(email, pw) : store.auth.signIn(email, pw)).then(function (data) {
        S.authBusy = false;
        if (up && data && !data.session) { S.authMode = 'in'; S.authNote = 'Almost there: confirm your email with the link we just sent, then sign in.'; }
        render();   // with a session, the sign-in listener takes it from here
      }, function (e) { S.authBusy = false; S.authError = authMessage(e); render(); });
    },
    join: function (f) {
      var code = String(fv(f, 'code')).trim().toUpperCase();
      if (code) { sess_set('plunk.join', code); joinFromInvite(); }
    },
    rules: function (f) {
      var g = clone(S.group);
      function n(v, lo, hi, d) { v = parseInt(v, 10); return isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; }
      g.name = String(fv(f, 'name')).trim() || g.name;
      g.rules = { target: n(fv(f, 'target'), 1, 50, 7), winBy: n(fv(f, 'winBy'), 1, 5, 2), plunkPts: n(fv(f, 'plunkPts'), 0, 10, 1), defense: !!fv(f, 'defense') };
      S.groups = S.groups.map(function (x) { return x.id === g.id ? g : x; });
      saveGroup(g); toast('Rules saved');
    },
    player: function (f) {
      var id = f.dataset.id, name = String(fv(f, 'name')).trim().replace(/\s+/g, ' ');
      if (!name) return;
      var others = S.players.filter(function (p) { return p.id !== id; });
      var look = L.lookalikes(others, name);
      var warn = $('pf-warn');
      if (look.exact) { warn.innerHTML = '<div class="warnbox"><b>' + esc(look.exact.name) + ' is already registered.</b><button class="btn sm ghost" data-act="open-player" data-id="' + esc(look.exact.id) + '">Open their profile</button></div>'; return; }
      if (look.near.length && !f.dataset.sure) {
        f.dataset.sure = '1';
        warn.innerHTML = '<div class="warnbox"><b>Similar names already registered:</b> ' + look.near.map(function (p) { return esc(p.name); }).join(', ') + '.<span>If this is a different person, press the button again.</span></div>';
        return;
      }
      var fields = { name: name, nick: String(fv(f, 'nick')).trim(), pledge: !!fv(f, 'pledge'), pledgeClass: String(fv(f, 'pledgeClass')).trim() };
      closeSheet();
      if (id) { savePlayer(Object.assign(clone(S.byId[id]), fields)); toast('Saved'); }
      else { newPlayer(name, fields); toast(name + ' added'); }
    }
  };

  var CHANGES = {
    'import-file': function (el) {
      var file = el.files && el.files[0];
      if (!file) return;
      var r = new FileReader();
      r.onload = function () {
        try { importSheet(planImport(JSON.parse(r.result))); }
        catch (e) { banner('That file isn’t a Dice Tracker backup. Choose the .json file from “Download backup”.'); }
        el.value = '';
      };
      r.readAsText(file);
    },
    'draft-def': function (el) { S.draft.defense = el.checked; keepDraft(); },
    'ed-def': function (el) { S.edit.defense = el.checked; render(); },
    'ed-date': function (el) {
      var t = new Date(el.value).getTime();
      if (isFinite(t)) { var len = (S.edit.ended || t) - (S.edit.started || t); S.edit.started = t; if (S.edit.ended) S.edit.ended = t + Math.max(0, len); }
    }
  };
  var INPUTS = {
    'pick-q': function (el) { $('pick-results').innerHTML = pickResults(el.value); },
    'player-q': function (el) { S.ui.playerQ = el.value; render(); }
  };

  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-act]');
    if (!el) {
      if (ev.target.id === 'sheet') closeSheet();     // tap outside a sheet closes it
      return;
    }
    var fn = A[el.dataset.act];
    if (fn && !el.disabled) { ev.preventDefault(); fn(el, ev); }
  });
  document.addEventListener('submit', function (ev) {
    var f = ev.target.closest('[data-form]');
    if (!f) return;
    ev.preventDefault();
    if (FORMS[f.dataset.form]) FORMS[f.dataset.form](f);
  });
  document.addEventListener('change', function (ev) { var el = ev.target.closest('[data-change]'); if (el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el); });
  document.addEventListener('input', function (ev) { var el = ev.target.closest('[data-input]'); if (el && INPUTS[el.dataset.input]) INPUTS[el.dataset.input](el); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    if (!$('sheet').hidden) closeSheet();
    else if (S.view && S.view.kind === 'tv') A['tv-exit']();
  });
  /* keeps "updated 12s ago" honest without redrawing the screen */
  setInterval(function () {
    var els = document.querySelectorAll('[data-ago]');
    for (var i = 0; i < els.length; i++) els[i].textContent = V.ago(+els[i].getAttribute('data-ago'));
  }, 5000);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && S.view && S.view.kind === 'live') { wake = null; keepAwake(true); }
  });

  /* ---------- sign-in (the website only) ---------- */
  function authMessage(e) {
    var m = String((e && e.message) || '');
    if (/invalid login credentials/i.test(m)) return 'That email and password don’t match.';
    if (/already (been )?registered|already exists/i.test(m)) return 'That email already has an account. Sign in instead.';
    if (/at least 6|password should/i.test(m)) return 'Use a password with at least 6 characters.';
    if (/not confirmed/i.test(m)) return 'Confirm your email first. The link is in your inbox.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute, then try again.';
    if (/failed to fetch|network|load failed/i.test(m)) return 'Can’t reach the server. Check your connection.';
    return m || 'Something went wrong. Try again.';
  }
  /* An invite link is the site address + ?join=CODE. The code waits here
     through sign-in (and a Google round trip) until there's an account to join with. */
  function joinFromInvite() {
    var code = sess_get('plunk.join');
    if (!code || !store || !store.joinGroup || !S.me) return;
    sess_set('plunk.join', ''); S.pendingJoin = '';
    store.joinGroup(code).then(function (gid) {
      var g = S.groups.filter(function (x) { return x.id === gid; })[0];
      S.route = 'play';
      selectGroup(gid);
      toast('You’re in' + (g ? ': ' + g.name : ''));
    }, function (e) {
      banner(/invite code/i.test(e.message || '') ? 'That invite link doesn’t match any group. Ask for a fresh one.' : 'Couldn’t join the group (' + esc(e.code || 'error') + ').');
      render();
    });
  }
  function listenToGroups(slow) {
    var firstCall = true;
    unGroups = store.listenGroups(function (groups) {
      clearTimeout(slow);
      S.groups = groups.sort(function (a, b) { return (a.created || 0) - (b.created || 0); });
      var first = !S.ready; S.ready = true;
      if (first || !S.groups.some(function (g) { return g.id === S.gid; })) {
        var want = store_get('plunk.gid');
        var pick = S.groups.filter(function (g) { return g.id === want; })[0] || (S.groups.length === 1 ? S.groups[0] : null);
        if (pick) selectGroup(pick.id); else { S.group = null; derive(); render(); }
      } else { S.group = S.groups.filter(function (g) { return g.id === S.gid; })[0]; derive(); render(); }
      if (firstCall) { firstCall = false; joinFromInvite(); }
    }, function (e) { clearTimeout(slow); S.ready = true; banner('Can’t reach the database (' + esc(e.code) + ').'); render(); });
  }
  /* Runs at start-up and whenever someone signs in or out. */
  function startCloud() {
    if (unGroups) { unGroups(); unGroups = null; }
    if (unGroup) { unGroup(); unGroup = null; }
    S.groups = []; S.gid = null; S.group = null; S.players = []; S.games = []; S.local = {}; S.view = null; S.edit = null;
    var u = store.auth.user;
    S.me = u ? u.id : null; S.email = u ? (u.email || '') : '';
    S.needAuth = !u; S.authBusy = false; S.canWrite = true;
    if (!u) { S.authMode = 'in'; S.authError = ''; S.ready = true; render(); return; }   // signed out: back to plain "Sign in"
    S.ready = false; render();
    listenToGroups(null);
  }

  /* ---------- boot ---------- */
  function boot() {
    var h = (location.hash || '').replace('#', '');
    if (['play', 'board', 'games', 'players', 'group'].indexOf(h) >= 0) S.route = h;
    var inv = /[?&]join=([A-Za-z0-9]+)/.exec(location.search);
    if (inv) {
      sess_set('plunk.join', inv[1].toUpperCase());
      try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { }
    }
    S.pendingJoin = sess_get('plunk.join') || '';
    S.authMode = 'in';
    registerOffline();
    applyTheme(store_get('dt.theme') === 'light' ? 'light' : 'dark');
    render();
    var slow = setTimeout(function () {
      if (!S.ready) { var l = $('loading'); if (l) l.innerHTML = '<b>Still connecting…</b><span>The shared database isn’t answering yet. Check your connection — this page keeps trying.</span>'; }
    }, 10000);
    P.openStore().then(function (r) {
      if (r.why === 'cloud-failed') { clearTimeout(slow); S.fatal = (r.error && r.error.message) || 'Something went wrong.'; render(); return; }
      store = r.store; S.storeKind = store.kind;
      if (store.onPending) store.onPending(function (n, off) {
        var wasOffline = S.offline, was = S.offline + '|' + (S.offline ? S.unsynced : 0);
        S.offline = !!off; S.unsynced = store.outboxCount ? store.outboxCount() : 0; savingText();
        if (was !== S.offline + '|' + (S.offline ? S.unsynced : 0)) $('top').innerHTML = V.top(S);
        if (wasOffline && !S.offline && !S.unsynced) toast('All changes saved');
      });
      if (store.onStale) store.onStale(function (table, id, gid) {
        if (gid !== S.gid) return;
        banner(table === 'games'
          ? 'Another phone saved this game more recently, so its version was kept. Taps this phone made while it was offline weren’t added.'
          : 'Another phone saved newer details for this player, so those were kept.');
        delete S.local[id];
        if (store.reload) store.reload(gid);
      });
      if (store.onWriteError) store.onWriteError(function () { });
      if (store.kind === 'cloud') {
        clearTimeout(slow);
        S.googleOn = !!(P.BACKEND && P.BACKEND.google);
        store.auth.onChange(function () { startCloud(); });
        startCloud();
        return;
      }
      if (r.why === 'device') banner('This copy saves games in this browser only, so other phones won’t see them. ' +
        'Safari can also clear a site’s saved data after 7 days without a visit, so don’t keep the season’s only record here.', 'plunk.note.device');
      if (r.why === 'no-db') banner('You’re not signed in to claude.ai, so your group’s shared stats can’t load here. Sign in and reopen this link. Anything logged now stays on this device only.');
      var who = r.user ? Promise.all([r.user.me(), r.user.can('data.write')]) : Promise.resolve([null, null]);
      return who.then(function (w) {
        if (w[0]) S.me = w[0].id || null;
        if (w[1] === false && store.kind === 'shared') S.canWrite = false;
        listenToGroups(slow);
      });
    });
  }
  P.app = { S: S, A: A, FORMS: FORMS, render: render, runTicks: runTicks, ticks: ticks, boot: boot, game: game, backupData: backupData, planImport: planImport, applyImport: applyImport };
  if (!window.PLUNK_NO_BOOT) boot();
})(window.PLUNK);
