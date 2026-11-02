/* Dice Tracker smoke test — runs the real app in a fake browser (jsdom) and
   drives it with clicks, the same way a person would.
   Run:  npm install   (once — fetches jsdom)
         npm test       (or: node smoke.js)                             */
const fs = require('fs');
const path = require('path');
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }                                         // installed in this folder
catch (e) { ({ JSDOM } = require(path.join(__dirname, '..', 'node_modules', 'jsdom'))); }  // or one folder up

const dir = __dirname;
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const inline = src => src
  .replace(/<link[^>]*>/g, '')
  .replace(/<script src="([^"]+)"><\/script>/g, (_, f) => '<script>' + read(f) + '</script>');
const html = inline(read('index.html'));            // a complete page, exactly what GitHub Pages serves

// the website build: same page, with the database switched on (pointed at tests/fake-supabase.js)
const fake = require('./tests/fake-supabase.js');
const cloudHtml = inline(read('index.html').replace('<script src="js/config.js"></script>',
  '<script src="js/config.js"></script><script>PLUNK.BACKEND = { url: "https://fake.supabase.co", key: "test-key", google: true };</script>'));
const settle = async (n) => { for (let i = 0; i < (n || 12); i++) await new Promise(r => setTimeout(r, 5)); };
function bootCloud(srv, url) {
  const dom = new JSDOM(cloudHtml, { runScripts: 'dangerously', url, beforeParse(w) { w.supabase = fake.lib(srv); w.scrollTo = () => {}; } });
  return settle().then(() => dom.window);
}
function ui(win) {
  const doc = win.document, q = (s) => doc.querySelector(s), qa = (s) => [...doc.querySelectorAll(s)];
  const u = {
    win, q, qa, S: win.PLUNK.app.S,
    view: () => doc.getElementById('view').textContent,
    click(sel) { const el = typeof sel === 'string' ? q(sel) : sel; if (!el) throw new Error('nothing to click: ' + sel); el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true })); },
    submit(sel, values) {
      const f = q(sel); if (!f) throw new Error('no form: ' + sel);
      for (const [k, v] of Object.entries(values || {})) { const el = f.elements.namedItem(k); if (el.type === 'checkbox') el.checked = !!v; else el.value = v; }
      f.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    },
    type(sel, text) { const el = q(sel); el.value = text; el.dispatchEvent(new win.Event('input', { bubbles: true })); },
    pick(sel, query, name) {
      u.click(sel); u.type('#pick-q', query);
      const b = qa('#pick-results [data-act="pick"]').find((x) => x.textContent.includes(name));
      if (!b) throw new Error('no search result for ' + name); u.click(b);
    }
  };
  return u;
}

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}
function boot(storage) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: 'http://127.0.0.1/plunk/',
    beforeParse(w) {
      if (storage) for (const k of Object.keys(storage)) w.localStorage.setItem(k, storage[k]);
      w.scrollTo = () => {};
    }
  });
  return new Promise(r => setTimeout(() => r(dom.window), 30));
}

(async () => {
const w = await boot();
const d = w.document, P = w.PLUNK, L = P.logic, S = P.app.S;
const $ = (sel) => d.querySelector(sel);
const $$ = (sel) => [...d.querySelectorAll(sel)];
function click(sel) {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (!el) throw new Error('nothing to click: ' + sel);
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
}
function submit(form, values) {
  for (const [k, v] of Object.entries(values || {})) {
    const el = form.elements.namedItem(k);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
  form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}
function type(sel, text) { const el = $(sel); el.value = text; el.dispatchEvent(new w.Event('input', { bubbles: true })); }
const view = () => $('#view').textContent;
const live = () => P.app.game(S.view.id);

console.log('\n§0 The two page files');
const scripts = f => (read(f).match(/<script src="[^"]+"><\/script>/g) || []).join('|');
const idsOf = f => (read(f).match(/id="[^"]+"/g) || []).join('|');
ok(scripts('index.html') === scripts('artifact.html') && scripts('index.html').includes('js/app.js'), 'index.html and artifact.html load the same scripts in the same order');
ok(idsOf('index.html') === idsOf('artifact.html'), 'and have the same app containers');
ok(/<meta name="viewport"/.test(read('index.html')) && /^<!doctype html>/i.test(read('index.html')), 'index.html is a complete page with phone sizing');
ok(/<title>Dice Tracker<\/title>/.test(read('index.html')) && /<title>Dice Tracker<\/title>/.test(read('artifact.html')), 'both pages are named Dice Tracker');
ok(!/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(read('artifact.html')), 'artifact.html stays a bare shell (claude.ai adds the page around it)');

const shell = (read('sw.js').match(/const SHELL = \[([\s\S]*?)\];/) || [])[1] || '';
const shellFiles = (shell.match(/'([^']+)'/g) || []).map(x => x.slice(1, -1)).filter(f => f !== './');
ok(shellFiles.length > 5 && shellFiles.every(f => fs.existsSync(path.join(dir, f))), 'every file the offline helper (sw.js) saves really exists', shellFiles.filter(f => !fs.existsSync(path.join(dir, f))));
const appScripts = (read('index.html').match(/<script src="([^"]+)"/g) || []).map(x => x.slice(13, -1));
ok(appScripts.every(f => shellFiles.includes(f)), 'and it saves every script the page loads', appScripts.filter(f => !shellFiles.includes(f)));
const mf = JSON.parse(read('manifest.webmanifest'));
ok(/rel="manifest"/.test(read('index.html')) && mf.icons.length >= 2 && mf.icons.every(i => fs.existsSync(path.join(dir, i.src))), 'index.html links the install file, and every icon it lists exists');

console.log('\n§1 First run');
ok(/browser only/.test($('#banner').textContent), 'off claude.ai, a note says games are saved on this device only');
click('[data-act="banner-x"]');
ok($('#banner').hidden && w.localStorage.getItem('plunk.note.device'), 'dismissing the note is remembered');
ok(/Start a group/.test(view()), 'boots to the start-a-group screen');
submit($('form[data-form="create-group"]'), { name: 'Alpha House', kind: 'house' });
ok(S.group && S.group.name === 'Alpha House', 'creating a group opens it');
ok(S.route === 'players', 'lands on Players to register people');

console.log('\n§2 Registering players — no duplicates');
function addPlayer(name, extra) {
  click('[data-act="add-player"]');
  submit($('form[data-form="player"]'), Object.assign({ name }, extra || {}));
}
addPlayer('Jake Miller');
addPlayer('Ryan Cole', { nick: 'Ro' });
addPlayer('Matt Price', { pledge: true, pledgeClass: 'Fall 2026' });
addPlayer('Chris Diaz');
addPlayer('Sam Ortiz', { pledge: true });
ok(S.players.length === 5, 'five players registered', S.players.length);
addPlayer('jake miller');
ok(S.players.length === 5 && /already registered/.test($('#pf-warn').textContent), 'exact duplicate (different case) is blocked');
click('[data-act="close"]');
addPlayer('Jake Millr');
ok(S.players.length === 5 && /Similar names/.test($('#pf-warn').textContent), 'near-miss spelling warns first');
submit($('form[data-form="player"]'));
ok(S.players.length === 6, 'second press registers a genuinely different person');
const ids = Object.fromEntries(S.players.map(p => [p.name, p.id]));
ok(L.searchPlayers(S.players, 'jke')[0].name === 'Jake Miller', 'search forgives a typo ("jke" → Jake)');
ok(L.searchPlayers(S.players, 'ro')[0].name === 'Ryan Cole', 'search finds nicknames');

console.log('\n§3 Starting a game from search');
click('[data-act="nav"][data-to="play"]');
ok($('[data-act="start-game"]').disabled, 'Start is disabled until four players are picked');
function pickSlot(t, s, q, name) {
  click(`[data-act="pick-slot"][data-t="${t}"][data-s="${s}"]`);
  type('#pick-q', q);
  const btn = $$('#pick-results [data-act="pick"]').find(b => b.textContent.includes(name));
  click(btn);
}
pickSlot(0, 0, 'jake m', 'Jake Miller');
pickSlot(0, 1, 'ryan', 'Ryan Cole');
pickSlot(1, 0, 'matt', 'Matt Price');
type; click('[data-act="pick-slot"][data-t="1"][data-s="1"]');
type('#pick-q', 'matt');
ok(!$$('#pick-results [data-act="pick"]').some(b => b.textContent.includes('Matt Price')), 'someone already in the game is not offered again');
type('#pick-q', 'chris');
click($$('#pick-results [data-act="pick"]').find(b => b.textContent.includes('Chris Diaz')));
click('[data-act="pick-scorer"]');
type('#pick-q', 'sam');
click($$('#pick-results [data-act="pick"]').find(b => b.textContent.includes('Sam Ortiz')));
ok(/Sam Ortiz/.test($('[data-act="pick-scorer"]').textContent), 'the stats-keeper is picked from search like a player');
click('[data-act="start-game"]');
ok(S.view && S.view.kind === 'live' && $('.scorebar'), 'start opens the live table');
ok($$('.seat').length === 4, 'all four players on screen');
ok(!/pl[iou]nk/i.test(view()), 'live screen uses plain stat names (no plink/plunk)');
ok($$('.tap[data-k="sht"]').length === 4 && /Fair hit/.test(view()) && /Short hit/.test(view()), 'every seat has Fair hit and Short hit buttons');

console.log('\n§4 Logging — table mode');
const J = ids['Jake Miller'], R = ids['Ryan Cole'], M = ids['Matt Price'], C = ids['Chris Diaz'], SAM = ids['Sam Ortiz'];
function tap(pid, k, n) { for (let i = 0; i < (n || 1); i++) click(`.tap[data-p="${pid}"][data-k="${k}"]`); }
tap(J, 'pt', 3); tap(J, 'tbl', 2); tap(J, 'mis', 1); tap(M, 'ctc', 1);
ok(L.throwsOf(live().stats[J]) === 6, 'throws are counted automatically from outcomes (6)', live().stats[J]);
ok(L.teamScore(live(), 0) === 3, 'score adds up from points (3)');
ok(live().stats[M].ctc === 1, 'defensive catch recorded');
click('[data-act="undo"]');
ok(live().stats[M].ctc === 0 && live().stats[J].mis === 1, 'undo reverses exactly the last tap');
tap(J, 'snk', 1);
ok(L.teamScore(live(), 0) === 4, 'a sink scores the house sink value');

console.log('\n§5 Throw-by-throw mode');
click('[data-act="live-mode"][data-v="throw"]');
ok($('.up-card') && /throwing order/i.test(view()), 'throw mode shows one thrower at a time');
const before = live().turn;
const up = L.thrower(live());
const dropBtn = $$('[data-act="throw"]').find(b => /dropped/.test(b.textContent));
click(dropBtn);
const items = JSON.parse(dropBtn.dataset.items);
ok(live().stats[up].pt >= 1 && live().stats[items[1][0]].drp === 1, 'one tap logs the point AND the defender’s drop');
ok(live().turn === (before + 1) % 4, 'turn passes to the next thrower');
click('[data-act="undo"]');
ok(live().turn === before && live().stats[items[1][0]].drp === 0, 'undo in throw mode also gives the turn back');

console.log('\n§6 Collapsing defense');
click('[data-act="live-mode"][data-v="table"]');
tap(C, 'ctc', 2);
click('[data-act="toggle-def"]');
ok(!$('.tap.def') && !live().defense, 'defense taps disappear when collapsed');
ok(live().stats[C].ctc === 2, 'catches already logged are kept');
click('[data-act="toggle-def"]');

console.log('\n§7 Substitution');
tap(R, 'tbl', 4);
click('[data-act="sub"]');
click(`[data-act="sub-out"][data-t="0"][data-s="1"]`);
type('#pick-q', 'sam');
click($$('#pick-results [data-act="pick"]').find(b => b.textContent.includes('Sam Ortiz')));
ok(live().teams[0][1] === SAM && live().appeared[0].includes(R), 'sub takes the seat; Ryan still counted as having played');
ok(live().stats[R].tbl === 4 && L.throwsOf(live().stats[SAM]) === 0, 'Ryan keeps his stats, Sam starts at zero');
ok(live().pledges.includes(SAM), 'a pledge subbing in is tagged as playing as a pledge');

console.log('\n§8 Finishing');
tap(J, 'pt', 2); tap(M, 'pt', 2); tap(C, 'pt', 1); tap(SAM, 'pt', 1);
const ws = L.winState(live());
ok(ws.a === 7 && ws.b === 3 && ws.done, 'first to 7 by 2 is recognised as game over', ws);
click('[data-act="finish"]');
ok(/Finish game/.test($('#sheet').textContent), 'finishing asks for confirmation in the page');
click('[data-act="finish-yes"]');
const g1 = P.app.game(S.view.id);
ok(g1.status === 'final' && g1.ended, 'game is final');
ok(g1.scorer === SAM && g1.scorerPledge === true, 'the game records who kept the stats, and that they were a pledge');
ok(S.draft.scorer === SAM, 'the next game remembers who keeps stats');
const sentences = g1.summary.split(/(?<=\.)\s+/);
ok(sentences.length === 2 && /7–3/.test(g1.summary), 'recap is exactly two sentences with the score', g1.summary);
console.log('     recap: ' + g1.summary);

console.log('\n§9 Leaderboard');
click('[data-act="nav"][data-to="board"]');
const row = id => S.boardRows.find(r => r.pid === id) || S.allRows[id];
ok(row(J).thr === 9 && row(J).w === 1, 'Jake: 9 throws (5 points, 2 fair hits, 1 miss, 1 sink), 1 win', { thr: row(J).thr, w: row(J).w });
ok(row(R).gp === 1 && row(R).w === 1 && row(SAM).w === 1, 'subbed-out and subbed-in players both credited');
ok(row(M).l === 1, 'losers get the loss');
ok($('table.stats') && /Throws/.test($('table.stats').textContent), 'board shows a Throws column');
ok(!/pl[iou]nk/i.test(view()) && /Fair table/.test(view()) && /Short table/.test(view()), 'leaderboard uses the house stat names');
ok(row(M).pledgeLine.gp === 1, 'Matt’s game counts in his pledge split');
ok(S.awards.some(a => a.key === 'stat' && a.pids[0] === SAM) && /Best Pledge Statistician/.test(view()), 'Best Pledge Statistician goes to the pledge who tracked the game');

console.log('\n§10 Editing a finished game');
click('[data-act="nav"][data-to="games"]');
click(`[data-act="open-game"][data-id="${g1.id}"]`);
click(`[data-act="edit-game"][data-id="${g1.id}"]`);
ok(/Edit game/.test(view()), 'any finished game opens in the editor');
click(`[data-act="ed-step"][data-p="${M}"][data-k="pt"][data-d="1"]`);
click('[data-act="ed-save"]');
const g1b = P.app.game(g1.id);
ok(L.teamScore(g1b, 1) === 4 && /7–4/.test(g1b.summary), 'edit changes the score and rewrites the recap', g1b.summary);
ok(g1b.edits.length === 1, 'the edit is recorded');
click(`[data-act="edit-game"][data-id="${g1.id}"]`);
click('[data-act="ed-status"][data-v="void"]');
click('[data-act="ed-save"]');
P.app.render();
ok(!S.allRows[J].gp, '“Didn’t count” removes the game from every stat');
click(`[data-act="edit-game"][data-id="${g1.id}"]`);
click('[data-act="ed-status"][data-v="final"]');
click('[data-act="ed-save"]');
ok(S.allRows[J].gp === 1, 'and it can be counted again');
click(`[data-act="edit-game"][data-id="${g1.id}"]`);
click(`[data-act="ed-replace"][data-p="${C}"]`);
type('#pick-q', 'jake millr');
click($$('#pick-results [data-act="pick"]').find(b => b.textContent.includes('Jake Millr')));
click('[data-act="ed-save"]');
const JM = ids['Jake Millr'];
ok(P.app.game(g1.id).stats[JM].ctc === 2 && !P.app.game(g1.id).stats[C], '“Wrong person?” moves the whole line to the right player');
function setKeeper(q, name) {
  click(`[data-act="edit-game"][data-id="${g1.id}"]`);
  click('[data-act="ed-scorer"]'); type('#pick-q', q);
  click($$('#pick-results [data-act="pick"]').find(b => b.textContent.includes(name)));
  click('[data-act="ed-save"]');
}
setKeeper('jake miller', 'Jake Miller');
ok(P.app.game(g1.id).scorer === J && !P.app.game(g1.id).scorerPledge, 'who kept the stats can be fixed later; pledge status follows the person');
setKeeper('sam', 'Sam Ortiz');

console.log('\n§11 Rules & math');
const t = L.newGame({ teams: [[J, R], [M, C]] });
t.stats[J].pt = 7; t.stats[M].pt = 6;
ok(!L.winState(t).done, '7–6 is not over (win by 2)');
t.stats[J].pt = 6; t.stats[M].pt = 5;
ok(L.winState(t).point === 0, '6–5 is game point');
t.stats[J].pt = 9; t.stats[M].pt = 7;
ok(L.winState(t).done, '9–7 is over');
ok(L.lookalikes(S.players, 'Matt Pryce').near.some(p => p.name === 'Matt Price'), '"Matt Pryce" is caught as a likely duplicate');

console.log('\n§12 Awards need a sample');
function quick(a, b, ptsA, ptsB, catches) {
  const g = L.newGame({ teams: [a, b] });
  g.stats[a[0]].pt = ptsA; g.stats[b[0]].pt = ptsB; g.stats[a[0]].tbl = 10; g.stats[b[0]].tbl = 8; g.stats[b[1]].ctc = catches || 0;
  g.status = 'final'; g.summary = L.summarize(g, id => S.byId[id].name);
  return g;
}
const extra = [quick([J, R], [M, C], 7, 2, 3), quick([J, SAM], [M, R], 7, 4, 2), quick([J, C], [SAM, M], 7, 5, 1)];
const rows = L.leaderboard(S.games.concat(extra), S.players, 'all');
const aw = L.awards(rows, S.games.concat(extra), 'all');
ok(aw.find(a => a.key === 'mvp') && aw.find(a => a.key === 'mvp').pids[0] === J, 'MVP goes to the player carrying the scoring', aw.map(a => a.key));
ok(aw.find(a => a.key === 'iron'), 'Iron Man present');
ok(!L.awards(L.leaderboard([], S.players, 'all'), [], 'all').length, 'no games → no awards (nothing invented)');

console.log('\n§13 Pledges');
click('[data-act="nav"][data-to="group"]');
click('[data-act="initiate"]');
click('[data-act="initiate-yes"]');
ok(!S.players.some(p => p.pledge), 'initiating clears current pledge status');
ok(P.app.game(g1.id).pledges.includes(M), 'old games still show they played as pledges');
ok(L.awards(L.leaderboard(S.games, S.players, 'all'), S.games, 'all').some(a => a.key === 'stat' && a.pids[0] === SAM), 'games tracked as a pledge still count after initiation');

console.log('\n§14 Every screen renders; names are escaped');
click('[data-act="nav"][data-to="players"]');
addPlayer('<img src=x onerror=alert(1)>');
let threw = null;
for (const r of ['play', 'board', 'games', 'players', 'group']) {
  try { click(`[data-act="nav"][data-to="${r}"]`); } catch (e) { threw = r + ': ' + e.message; }
}
ok(!threw, 'all five tabs render', threw);
ok(!$('#view img'), 'a name containing HTML is shown as text, never run');

console.log('\n§15 Saved on this device survives a reload');
const saved = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); saved[k] = w.localStorage.getItem(k); }
const w2 = await boot(saved);
const S2 = w2.PLUNK.app.S;
ok(S2.group && S2.group.name === 'Alpha House' && S2.players.length === 7 && S2.games.length === 1, 'reopening restores the group, players and games',
  { group: S2.group && S2.group.name, players: S2.players.length, games: S2.games.length });

console.log('\n§16 Fair and short table hits');
const fg = L.newGame({ teams: [[J, R], [M, C]] });
[['pt'], ['tbl'], ['sht'], ['mis']].forEach(k => L.record(fg, [[J, k[0], 1]], false));
ok(L.throwsOf(fg.stats[J]) === 4, 'a short table hit counts as a throw');
ok(L.hitsOf(fg.stats[J]) === 2, 'but not as a hit (hit rate counts fair hits, cup hits and sinks)');
ok(L.fairOf(fg.stats[J]) === 2, 'fair table hits include the one that scored');
ok(L.teamScore(fg, 0) === 1, 'only the point scores');
fg.status = 'final';
const fr = L.leaderboard([fg], S.players, 'all').find(r => r.pid === J);
ok(fr.fair === 2 && fr.short === 1, 'the leaderboard carries fair and short table hits', { fair: fr.fair, short: fr.short });
const zero = L.newGame({ teams: [[J, R], [M, C]], rules: { plunkPts: 0 } });
zero.stats[J].snk = 2;
ok(L.teamScore(zero, 0) === 0, 'a sink set to be worth 0 really scores 0');
const kg = L.newGame({ teams: [[J, R], [M, C]], scorer: J, scorerPledge: false });
kg.status = 'final';
ok(!L.awards(L.leaderboard([kg], S.players, 'all'), [kg], 'all').some(a => a.key === 'stat'), 'tracking as a member doesn’t count toward the pledge award');

console.log('\n§19 Backups');
const bk = JSON.parse(JSON.stringify(P.app.backupData()));
ok(bk.app === 'dice-tracker' && bk.players.length === S.players.length && bk.games.length === S.games.length, 'a backup holds every player and game');
const samePlan = P.app.planImport(bk);
ok(!samePlan.players.length && !samePlan.games.length && samePlan.c.sameG === S.games.length, 'restoring it into the same group adds nothing');
click('[data-act="switch-group"]');
submit($('#sheet form[data-form="create-group"]'), { name: 'Beta House', kind: 'friends' });
addPlayer('Jake Miller');
const movePlan = P.app.planImport(bk);
ok(movePlan.c.matchedP === 1 && movePlan.c.newP === bk.players.length - 1 && movePlan.c.newG === bk.games.length, 'into another group: same-name players are matched, the rest are added', movePlan.c);
P.app.applyImport(movePlan);
const jakeHere = S.players.find(p => p.name === 'Jake Miller');
const moved = S.games[0];
ok(S.games.length === bk.games.length && moved.appeared[0].includes(jakeHere.id) && moved.stats[jakeHere.id], 'imported games point at this group’s own players');
ok(S.allRows[jakeHere.id].gp === 1, 'so their stats count on this group’s leaderboard');
const againPlan = P.app.planImport(bk);
ok(!againPlan.players.length && !againPlan.games.length, 'restoring the same file twice adds nothing the second time');
let refused = false; try { P.app.planImport({ hello: 1 }); } catch (e) { refused = true; }
ok(refused, 'a file that isn’t a backup is refused');

console.log('\n§18 The real website (sign-in + shared database), against a stand-in server');
const srv = fake.server();
const A1 = ui(await bootCloud(srv, 'http://127.0.0.1/die/'));
ok(/Sign in to Dice Tracker/.test(A1.view()), 'the website asks you to sign in first');
ok(/Continue with Google/.test(A1.view()), 'Google sign-in shows once it’s switched on');
A1.submit('form[data-form="auth"]', { email: 'nobody@example.com', password: 'wrong-pass' });
await settle();
ok(/don’t match/.test(A1.view()), 'a wrong password gets a plain-English error');
A1.click('[data-act="auth-mode"][data-v="up"]');
A1.submit('form[data-form="auth"]', { email: 'michael@example.com', password: 'secret1' });
await settle();
ok(!A1.S.needAuth && /Start a group/.test(A1.view()) && /Join a group/.test(A1.view()), 'creating an account lands on start-or-join');
A1.submit('form[data-form="create-group"]', { name: 'Psi Upsilon Omega', kind: 'house' });
await settle();
const GID = A1.S.gid;
ok(GID && srv.groups[GID] && srv.members.some(m => m.group_id === GID && m.role === 'owner'), 'the server creates the group and makes its creator the owner');
for (const n of ['Jake Miller', 'Ryan Cole', 'Matt Price', 'Chris Diaz']) { A1.click('[data-act="add-player"]'); A1.submit('form[data-form="player"]', { name: n }); }
await settle();
ok(Object.values(srv.players).filter(p => p.group_id === GID).length === 4, 'players are saved to the server');
ok(Object.values(srv.players).every(p => p.data.updated > 0), 'each with the time it was last changed (so newer wins)');
A1.click('[data-act="nav"][data-to="group"]');
const CODE = srv.groups[GID].join_code;
ok(A1.q('#invite-link') && A1.q('#invite-link').textContent === 'http://127.0.0.1/die/?join=' + CODE, 'House shows the group’s invite link');
function startGame(u) {
  u.click('[data-act="nav"][data-to="play"]');
  u.pick('[data-act="pick-slot"][data-t="0"][data-s="0"]', 'jake', 'Jake Miller');
  u.pick('[data-act="pick-slot"][data-t="0"][data-s="1"]', 'ryan', 'Ryan Cole');
  u.pick('[data-act="pick-slot"][data-t="1"][data-s="0"]', 'matt', 'Matt Price');
  u.pick('[data-act="pick-slot"][data-t="1"][data-s="1"]', 'chris', 'Chris Diaz');
  u.click('[data-act="start-game"]');
  return u.S.view.id;
}
const LIVE1 = startGame(A1);
const pidOf = (name) => A1.S.players.find(p => p.name === name).id;
const JK = pidOf('Jake Miller'), MP = pidOf('Matt Price');
for (let i = 0; i < 7; i++) A1.click(`.tap[data-p="${JK}"][data-k="pt"]`);
A1.click('[data-act="finish"]'); A1.click('[data-act="finish-yes"]');
await settle();
ok(srv.games[LIVE1] && srv.games[LIVE1].data.status === 'final' && srv.games[LIVE1].data.stats[JK].pt === 7, 'a finished game is saved to the server, every tap included');

console.log('   — a brother opens the invite link on his phone');
const A2 = ui(await bootCloud(srv, 'http://127.0.0.1/die/?join=' + CODE));
ok(/invited to a group/.test(A2.view()), 'the invite survives the sign-in screen');
A2.click('[data-act="auth-mode"][data-v="up"]');
A2.submit('form[data-form="auth"]', { email: 'brother@example.com', password: 'secret2' });
await settle(24);
ok(A2.S.gid === GID && A2.S.players.length === 4 && A2.S.games.length === 1, 'signing up through the link joins the group and loads its games', { gid: A2.S.gid === GID, players: A2.S.players.length, games: A2.S.games.length });
const LIVE2 = startGame(A1);
A1.click(`.tap[data-p="${JK}"][data-k="pt"]`);
await settle();
ok(A2.S.games.some(g => g.id === LIVE2 && g.stats[JK].pt === 1), 'a tap on one phone shows up on the other, live');

console.log('   — a stranger without the link');
const A3 = ui(await bootCloud(srv, 'http://127.0.0.1/die/'));
A3.click('[data-act="auth-mode"][data-v="up"]');
A3.submit('form[data-form="auth"]', { email: 'stranger@example.com', password: 'secret3' });
await settle();
ok(A3.S.groups.length === 0 && /Start a group/.test(A3.view()), 'someone without the invite sees no groups');
ok(fake.visibleTo(srv, A3.S.me, 'games').length === 0 && fake.visibleTo(srv, A3.S.me, 'players').length === 0, 'and the database hands them no games or players');

console.log('   — no signal in the basement');
srv.offline = true;
A1.click(`.tap[data-p="${JK}"][data-k="pt"]`);
A1.click(`.tap[data-p="${MP}"][data-k="tbl"]`);
await settle();
ok(A1.S.offline && /Offline/.test(A1.q('#saving').textContent), 'losing signal shows Offline');
ok(A1.q('.sync-pill') && /Offline · 1 to upload/.test(A1.q('.sync-pill').textContent), 'the phone’s top bar says how many changes are waiting to upload');
ok(A1.S.games.find(g => g.id === LIVE2).stats[JK].pt === 2, 'and the taps stay on screen');
ok((A1.win.localStorage.getItem('plunk.outbox.v1') || '').includes(LIVE2), 'the unsaved game is parked on the phone');
ok(srv.games[LIVE2].data.stats[JK].pt === 1, 'the server hasn’t seen those taps yet');
srv.offline = false;
A1.win.dispatchEvent(new A1.win.Event('online'));
await settle(24);
ok(srv.games[LIVE2].data.stats[JK].pt === 2 && srv.games[LIVE2].data.stats[MP].tbl === 1, 'when the signal comes back, the taps save on their own');
ok(A1.win.localStorage.getItem('plunk.outbox.v1') === '{}' && !A1.S.offline, 'the parked copy is cleared and Offline goes away');
ok(A2.S.games.find(g => g.id === LIVE2).stats[JK].pt === 2, 'and the other phone catches up');
ok(!A1.q('.sync-pill'), 'the Offline badge goes away');

console.log('   — two phones on one game, one of them offline (the newer save wins)');
srv.offline = true;
A1.click(`.tap[data-p="${JK}"][data-k="mis"]`);            // phone 1, no signal: an older change
await settle();
srv.offline = false;
A2.click('[data-act="nav"][data-to="games"]');
A2.click(`[data-act="open-game"][data-id="${LIVE2}"]`);
A2.click(`.tap[data-p="${MP}"][data-k="plk"]`);            // phone 2, online, a moment later
await settle();
ok(srv.games[LIVE2].data.stats[MP].plk === 1, 'the online phone’s tap reaches the server');
A1.win.dispatchEvent(new A1.win.Event('online'));         // phone 1 reconnects holding its older copy
await settle(24);
ok(srv.games[LIVE2].data.stats[MP].plk === 1 && !srv.games[LIVE2].data.stats[JK].mis, 'the older offline copy doesn’t overwrite the newer one');
ok(/more recently/.test(A1.q('#banner').textContent), 'the offline phone is told why its taps weren’t added');
ok(A1.S.games.find(g => g.id === LIVE2).stats[MP].plk === 1, 'and it switches to the newer version');

console.log('   — signing out');
A1.click('[data-act="nav"][data-to="group"]');
A1.click('[data-act="sign-out"]');
await settle();
ok(A1.S.needAuth && /Sign in to Dice Tracker/.test(A1.view()), 'signing out returns to the sign-in screen');

console.log('\n' + (fail ? 'SOME CHECKS FAILED' : 'ALL SMOKE TESTS PASSED') + ` — ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
