/* ================================================================
   [STORE] Where the data lives. Two interchangeable backends with
   the SAME methods, so the rest of the app never knows which one:

   SharedStore  — the claude.ai shared database. Everyone who opens
                  the link sees the same groups, live. Used whenever
                  the page runs on claude.ai and the viewer is signed in.
   DeviceStore  — this browser only (localStorage). Used when there is
                  no shared database (opened as a plain file, signed
                  out, or in the test suite).

   A future public version swaps in a third backend (e.g. Supabase)
   with these same seven methods — nothing else has to change.

   Layout in the shared database:
     groups/{groupId}                     the house / friend group
     groups/{groupId}/players/{playerId}  one registered player
     groups/{groupId}/games/{gameId}      one game, live or finished
   ================================================================ */
(function (P) {
  'use strict';
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function vals(o) { return Object.keys(o || {}).map(function (k) { return clone(o[k]); }); }

  /* ---------------- this device only ---------------- */
  function DeviceStore() {
    var KEY = 'plunk.device.v1';
    var data = read();
    var groupFns = [], fns = {};
    function read() {
      try { var d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && d.groups) return d; } catch (e) { }
      return { groups: {} };
    }
    function persist() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { } }
    function bucket(gid) { return data.groups[gid] || (data.groups[gid] = { doc: null, players: {}, games: {} }); }
    function emitGroups() {
      var list = Object.keys(data.groups).map(function (k) { return data.groups[k].doc; }).filter(Boolean).map(clone);
      groupFns.slice().forEach(function (cb) { cb(list); });
    }
    function emit(gid) {
      var b = data.groups[gid] || { players: {}, games: {} };
      (fns[gid] || []).slice().forEach(function (cb) { cb({ players: vals(b.players), games: vals(b.games), ready: true }); });
    }
    function done() { persist(); return Promise.resolve(); }
    return {
      kind: 'device',
      listenGroups: function (cb) {
        groupFns.push(cb); emitGroups();
        return function () { groupFns = groupFns.filter(function (f) { return f !== cb; }); };
      },
      listenGroup: function (gid, cb) {
        (fns[gid] = fns[gid] || []).push(cb); emit(gid);
        return function () { fns[gid] = (fns[gid] || []).filter(function (f) { return f !== cb; }); };
      },
      saveGroup: function (g) { bucket(g.id).doc = clone(g); emitGroups(); return done(); },
      savePlayer: function (gid, p) { bucket(gid).players[p.id] = clone(p); emit(gid); return done(); },
      saveGame: function (gid, g) { bucket(gid).games[g.id] = clone(g); emit(gid); return done(); },
      removeGame: function (gid, id) { delete bucket(gid).games[id]; emit(gid); return done(); },
      pending: function () { return 0; },
      onPending: function () { }
    };
  }

  /* ---------------- shared database on claude.ai ---------------- */
  function SharedStore(db) {
    var queue = {}, busy = 0, pendingFns = [], errorFns = [];
    function setBusy(d) { busy += d; pendingFns.forEach(function (f) { f(busy); }); }
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function attempt(job, path) {
      var ref = db.doc(path);
      var run = function () { return job.op === 'del' ? ref['delete']() : ref.set(job.data); };
      return run()['catch'](function (e) {
        if (e && e.code === 'unavailable') return wait(400 + Math.random() * 800).then(run);  // one retry, as the platform asks
        throw e;
      });
    }
    /* One write at a time per document. Taps that land while a write is
       in flight collapse into a single follow-up write of the newest
       version, so ten quick taps cost two writes, not ten. */
    function enqueue(path, job) {
      var e = queue[path] || (queue[path] = { busy: false, next: null, waiters: [] });
      e.next = job;
      var p = new Promise(function (res, rej) { e.waiters.push({ res: res, rej: rej }); });
      if (!e.busy) pump(path);
      return p;
    }
    function pump(path) {
      var e = queue[path];
      e.busy = true; setBusy(1);
      (function step() {
        if (!e.next) { e.busy = false; setBusy(-1); return; }
        var job = e.next, waiters = e.waiters;
        e.next = null; e.waiters = [];
        attempt(job, path).then(function () {
          waiters.forEach(function (w) { w.res(); });
        }, function (err) {
          waiters.forEach(function (w) { w.rej(err); });
          errorFns.forEach(function (f) { f(err); });
        }).then(step);
      })();
    }
    function put(path, data) { return enqueue(path, { op: 'set', data: clone(data) }); }
    function del(path) { return enqueue(path, { op: 'del' }); }
    function docs(snap) { return snap.docs.map(function (d) { return clone(d.data()); }); }

    return {
      kind: 'shared',
      listenGroups: function (cb, onErr) {
        return db.collection('groups').onSnapshot(function (s) { cb(docs(s), s.metadata); }, onErr);
      },
      listenGroup: function (gid, cb, onErr) {
        var state = { players: [], games: [], ready: false }, got = { p: false, g: false };
        function out(meta) { state.ready = got.p && got.g; cb({ players: state.players, games: state.games, ready: state.ready, meta: meta }); }
        var u1 = db.collection('groups/' + gid + '/players').onSnapshot(function (s) { state.players = docs(s); got.p = true; out(s.metadata); }, onErr);
        var u2 = db.collection('groups/' + gid + '/games').orderBy('started', 'desc').limit(1000)
          .onSnapshot(function (s) { state.games = docs(s); got.g = true; out(s.metadata); }, onErr);
        return function () { u1(); u2(); };
      },
      saveGroup: function (g) { return put('groups/' + g.id, g); },
      savePlayer: function (gid, p) { return put('groups/' + gid + '/players/' + p.id, p); },
      saveGame: function (gid, g) { return put('groups/' + gid + '/games/' + g.id, g); },
      removeGame: function (gid, id) { return del('groups/' + gid + '/games/' + id); },
      pending: function () { return busy; },
      onPending: function (f) { pendingFns.push(f); },
      onWriteError: function (f) { errorFns.push(f); }
    };
  }

  /* Pick a backend. `window.claude` exists only inside the claude.ai
     viewer; `use()` resolves null when this viewer can't have the
     database (e.g. signed out), and we fall back to this device. */
  P.openStore = function () {
    var host = window.claude && typeof window.claude.use === 'function';
    if (!host) return Promise.resolve({ store: DeviceStore(), user: null, why: 'device' });
    return Promise.all([window.claude.use('db'), window.claude.use('user')]).then(function (r) {
      if (!r[0]) return { store: DeviceStore(), user: r[1], why: 'no-db' };
      return { store: SharedStore(r[0]), user: r[1], why: null };
    }, function () { return { store: DeviceStore(), user: null, why: 'no-db' }; });
  };
  P.DeviceStore = DeviceStore;
  P.SharedStore = SharedStore;
})(window.PLUNK);
