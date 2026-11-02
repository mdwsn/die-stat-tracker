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
  /* ---------------- the real website: Supabase ----------------
     Sign-in + one shared Postgres database for everyone. Who can see what
     is enforced by the database (supabase/schema.sql), not by this file.

     Offline-safe: every write is parked in this phone's storage the moment
     it's made and only removed once the server confirms it. A basement with
     no signal loses nothing; saves retry on their own when the signal comes
     back, and a reload still shows the unsynced taps. */
  P.SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js';
  function loadSupabase() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = P.SUPABASE_JS; s.async = true;
      s.onload = function () { window.supabase && window.supabase.createClient ? res(window.supabase) : rej(new Error('The sign-in library didn’t load.')); };
      s.onerror = function () { rej(new Error('Couldn’t reach Dice Tracker. Check your connection, then reload.')); };
      document.head.appendChild(s);
    });
  }
  function asError(e) {
    var msg = (e && (e.message || e.error_description)) || String(e || 'Unknown error');
    if (e && (e.code === '42501' || /row-level security|permission denied/i.test(msg))) return { code: 'denied', message: msg };
    if ((e && e.name === 'TypeError') || /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg)) return { code: 'unavailable', message: msg };
    return { code: (e && e.code) || 'error', message: msg };
  }
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked: the server copy still exists */ } }

  function CloudStore(sb) {
    var OUTBOX = 'plunk.outbox.v1', busy = 0, offline = false, stamp = 0;
    var pendingFns = [], errorFns = [], queue = {}, groupsLoad = null, groupListeners = {};
    function tellPending() { pendingFns.forEach(function (f) { f(busy, offline); }); }
    function setOffline(v) { if (offline !== v) { offline = v; tellPending(); } }
    function siteUrl() { return location.origin + location.pathname; }
    function run(q) { return q.then(function (r) { if (r.error) throw r.error; return r.data; }); }

    /* outbox: key → { table, op, row, stamp } */
    function outbox() { return lsGet(OUTBOX, {}); }
    function park(key, job) { var o = outbox(); o[key] = job; lsSet(OUTBOX, o); }
    function unpark(key, job) { var o = outbox(); if (o[key] && o[key].stamp === job.stamp) { delete o[key]; lsSet(OUTBOX, o); } }
    function exec(job) {
      if (job.op === 'delete') return run(sb.from(job.table).delete().eq('id', job.row.id));
      if (job.op === 'group') return run(sb.from('groups').update({ data: job.row.data }).eq('id', job.row.id));
      return run(sb.from(job.table).upsert(job.row));
    }
    /* One write at a time per row; bursts collapse into the newest version. */
    function enqueue(key, job) {
      job.stamp = Date.now() * 1000 + (stamp++ % 1000);
      park(key, job);
      var e = queue[key] || (queue[key] = { busy: false, next: null, waiters: [], tries: 0 });
      e.next = job;
      var p = new Promise(function (res, rej) { e.waiters.push({ res: res, rej: rej }); });
      if (!e.busy) pump(key);
      return p;
    }
    function pump(key) {
      var e = queue[key];
      if (!e.next) { if (e.busy) { e.busy = false; busy--; tellPending(); } return; }
      if (!e.busy) { e.busy = true; busy++; tellPending(); }
      var job = e.next, waiters = e.waiters;
      e.next = null; e.waiters = [];
      exec(job).then(function () {
        e.tries = 0; unpark(key, job); setOffline(false);
        waiters.forEach(function (w) { w.res(); });
        pump(key);
      }, function (raw) {
        var err = asError(raw);
        if (err.code === 'unavailable') {
          // no signal: keep it parked, try again soon (2s, 5s, 10s, then every 20s)
          setOffline(true);
          if (!e.next) e.next = job;
          e.waiters = waiters.concat(e.waiters);
          var wait = [2000, 5000, 10000][e.tries++] || 20000;
          e.timer = setTimeout(function () { e.timer = null; pump(key); }, wait);
          return;
        }
        unpark(key, job);                                   // the server said no; retrying won't change that
        waiters.forEach(function (w) { w.rej(err); });
        errorFns.forEach(function (f) { f(err); });
        pump(key);
      });
    }
    function retryNow() {
      Object.keys(queue).forEach(function (k) {
        var e = queue[k];
        if (e.timer) { clearTimeout(e.timer); e.timer = null; e.tries = 0; pump(k); }
      });
    }
    function flushOutbox() {
      var o = outbox();
      Object.keys(o).forEach(function (k) { if (!queue[k] || (!queue[k].busy && !queue[k].next)) enqueue(k, o[k])['catch'](function () { }); });
    }
    window.addEventListener('online', function () { retryNow(); flushOutbox(); });

    /* every row of a table for a group, 1000 at a time (the server's page size) */
    function fetchAll(table, gid) {
      var out = [], size = 1000;
      function page(from) {
        var q = sb.from(table).select('id,data').eq('group_id', gid);
        if (table === 'games') q = q.order('started', { ascending: false });
        return run(q.range(from, from + size - 1)).then(function (rows) {
          out = out.concat(rows);
          return rows.length === size ? page(from + size) : out;
        });
      }
      return page(0);
    }
    /* parked writes for this group, laid over what the server sent */
    function overlay(gid, table, map) {
      var o = outbox();
      Object.keys(o).forEach(function (k) {
        var j = o[k];
        if (j.table !== table || !j.row || j.row.group_id !== gid) return;
        if (j.op === 'delete') { delete map[j.row.id]; return; }
        var cur = map[j.row.id];
        if (!cur || (j.row.data.updated || 0) >= (cur.updated || 0)) map[j.row.id] = j.row.data;
      });
      return map;
    }

    var auth = {
      user: null,
      init: function () {
        return sb.auth.getSession().then(function (r) {
          auth.user = r && r.data && r.data.session ? r.data.session.user : null;
          if (/[?&]code=/.test(location.search)) try { history.replaceState(null, '', siteUrl() + location.hash); } catch (e) { }
          return auth.user;
        });
      },
      onChange: function (fn) {
        sb.auth.onAuthStateChange(function (ev, session) {
          var u = session ? session.user : null;
          var changed = (u && u.id) !== (auth.user && auth.user.id);
          auth.user = u;
          if (changed) fn(u);
        });
      },
      signIn: function (email, password) { return sb.auth.signInWithPassword({ email: email, password: password }).then(function (r) { if (r.error) throw r.error; return r.data; }); },
      signUp: function (email, password) {
        return sb.auth.signUp({ email: email, password: password, options: { emailRedirectTo: siteUrl() } })
          .then(function (r) { if (r.error) throw r.error; return r.data; });
      },
      google: function () { return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: siteUrl() } }); },
      signOut: function () { return sb.auth.signOut(); }
    };

    var store = {
      kind: 'cloud',
      auth: auth,
      siteUrl: siteUrl,
      listenGroups: function (cb, onErr) {
        var key = 'plunk.cache.groups.' + (auth.user && auth.user.id);
        var cached = lsGet(key, null);
        if (cached) cb(cached.map(clone));
        groupsLoad = function () {
          return run(sb.from('groups').select('id,data,join_code')).then(function (rows) {
            var list = rows.map(function (r) { return Object.assign({}, r.data, { id: r.id, joinCode: r.join_code }); });
            lsSet(key, list);
            cb(list.map(clone));
          }, function (e) { if (!cached && onErr) onErr(asError(e)); });
        };
        groupsLoad();
        var ch = sb.channel('dt-groups').on('postgres_changes', { event: '*', schema: 'public', table: 'groups' }, function () { groupsLoad(); }).subscribe();
        return function () { sb.removeChannel(ch); groupsLoad = null; };
      },
      refreshGroups: function () { return groupsLoad ? groupsLoad() : Promise.resolve(); },
      listenGroup: function (gid, cb, onErr) {
        var key = 'plunk.cache.group.' + gid;
        var players = {}, games = {}, alive = true, subscribedOnce = false;
        var cached = lsGet(key, null);
        function out(fromServer) {
          if (!alive) return;
          var p = overlay(gid, 'players', Object.assign({}, players)), g = overlay(gid, 'games', Object.assign({}, games));
          cb({ players: vals(p), games: vals(g), ready: true });
          if (fromServer) {
            var snap = { players: players, games: games };
            if (JSON.stringify(snap).length < 2e6) lsSet(key, snap);   // skip caching a huge group rather than fill the phone
          }
        }
        if (cached) { players = cached.players || {}; games = cached.games || {}; out(false); }
        function load() {
          return Promise.all([fetchAll('players', gid), fetchAll('games', gid)]).then(function (r) {
            players = {}; games = {};
            r[0].forEach(function (row) { players[row.id] = row.data; });
            r[1].forEach(function (row) { games[row.id] = row.data; });
            setOffline(false); out(true); flushOutbox();
          }, function (e) {
            var err = asError(e);
            if (err.code === 'unavailable') { setOffline(true); if (!cached) out(false); }
            else if (onErr) onErr(err);
          });
        }
        // looks the map up when the message arrives: load() replaces both maps wholesale
        function apply(table) {
          return function (msg) {
            var map = table === 'players' ? players : games;
            if (msg.eventType === 'DELETE') { if (msg.old && map[msg.old.id]) { delete map[msg.old.id]; out(true); } return; }
            if (msg['new'] && msg['new'].group_id === gid) { map[msg['new'].id] = msg['new'].data; out(true); }
          };
        }
        load();
        var ch = sb.channel('dt-group-' + gid)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: 'group_id=eq.' + gid }, apply('players'))
          .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: 'group_id=eq.' + gid }, apply('games'))
          .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'games' }, apply('games'))   // deletes can't be filtered
          .subscribe(function (status) {
            if (status !== 'SUBSCRIBED') return;
            if (subscribedOnce) load();           // reconnected: catch up on anything missed
            subscribedOnce = true;
          });
        function wake() { if (document.visibilityState === 'visible') load(); }
        document.addEventListener('visibilitychange', wake);
        window.addEventListener('online', load);
        groupListeners[gid] = load;
        return function () {
          alive = false; sb.removeChannel(ch);
          document.removeEventListener('visibilitychange', wake);
          window.removeEventListener('online', load);
          delete groupListeners[gid];
        };
      },
      createGroup: function (g) {
        var data = clone(g); delete data.joinCode;
        return run(sb.rpc('create_group', { p_id: g.id, p_data: data })).then(function (code) {
          return store.refreshGroups().then(function () { return code; });
        }, function (e) { throw asError(e); });
      },
      joinGroup: function (code) {
        return run(sb.rpc('join_group', { p_code: String(code || '').trim() })).then(function (gid) {
          return store.refreshGroups().then(function () { return gid; });
        }, function (e) { throw asError(e); });
      },
      saveGroup: function (g) {
        var data = clone(g); delete data.joinCode;
        return enqueue('groups:' + g.id, { table: 'groups', op: 'group', row: { id: g.id, data: data } });
      },
      savePlayer: function (gid, p) {
        return enqueue('players:' + p.id, { table: 'players', op: 'upsert', row: { id: p.id, group_id: gid, data: clone(p), updated_at: new Date().toISOString() } });
      },
      saveGame: function (gid, g) {
        return enqueue('games:' + g.id, { table: 'games', op: 'upsert', row: { id: g.id, group_id: gid, data: clone(g), started: g.started || g.created || 0, updated_at: new Date().toISOString() } });
      },
      removeGame: function (gid, id) {
        return enqueue('games:' + id, { table: 'games', op: 'delete', row: { id: id, group_id: gid } });
      },
      pending: function () { return busy; },
      isOffline: function () { return offline; },
      onPending: function (f) { pendingFns.push(f); },
      onWriteError: function (f) { errorFns.push(f); },
      retryNow: retryNow
    };
    return store;
  }

  /* Pick a backend, in this order:
     1. claude.ai viewer present → its shared database (artifact.html)
     2. PLUNK.BACKEND filled in (config.js) → the real website on Supabase
     3. neither → this browser only */
  var openArtifact = P.openStore;
  P.openStore = function () {
    var host = window.claude && typeof window.claude.use === 'function';
    var B = P.BACKEND || {};
    if (host || !(B.url && B.key)) return openArtifact();
    return loadSupabase().then(function (lib) {
      var sb = lib.createClient(B.url, B.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
      var st = CloudStore(sb);
      return st.auth.init().then(function () { return { store: st, user: null, why: null }; });
    })['catch'](function (e) { return { store: null, user: null, why: 'cloud-failed', error: e }; });
  };
  P.DeviceStore = DeviceStore;
  P.SharedStore = SharedStore;
  P.CloudStore = CloudStore;
})(window.PLUNK);
