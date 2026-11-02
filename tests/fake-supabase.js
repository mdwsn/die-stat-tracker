/* A stand-in for Supabase, used only by smoke.js.
   It runs in memory and copies just enough of the real thing to test the
   website path: sign-up/sign-in, the four tables, the membership rules from
   supabase/schema.sql (you only see and change groups you belong to), the two
   join/create functions, live updates, and a switch that pretends the signal
   dropped (`server.offline = true`). It is not the real database — the real
   rules live in schema.sql and get checked against the real project. */
'use strict';

function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
const later = (fn) => setTimeout(fn, 0);

function server() {
  return { users: {}, byEmail: {}, groups: {}, members: [], players: {}, games: {}, channels: new Set(), offline: false, n: 0 };
}

function isMember(srv, uid, gid) { return !!uid && srv.members.some((m) => m.group_id === gid && m.user_id === uid); }
const NET = { message: 'TypeError: Failed to fetch', code: '' };
const RLS = { message: 'new row violates row-level security policy', code: '42501' };

/* push a change to every live subscriber allowed to see it */
function notify(srv, table, eventType, row, old) {
  srv.channels.forEach((ch) => {
    const uid = ch.client.uid();
    ch.subs.forEach((sub) => {
      const f = sub.filter;
      if (f.table !== table) return;
      if (f.event !== '*' && f.event !== eventType) return;
      if (eventType === 'DELETE') {
        if (f.filter) return;                               // like the real service: deletes ignore filtered subscriptions
      } else {
        const gid = table === 'groups' ? row.id : row.group_id;
        if (f.filter) {
          const m = /^group_id=eq\.(.+)$/.exec(f.filter);
          if (!m || m[1] !== row.group_id) return;
        }
        if (!isMember(srv, uid, gid)) return;               // row-level security applies to live updates too
      }
      later(() => sub.cb({ eventType, table, new: eventType === 'DELETE' ? {} : clone(row), old: old ? { id: old.id } : {} }));
    });
  });
}

function client(srv) {
  let session = null;
  const authFns = [];
  const uid = () => (session ? session.user.id : null);
  function emit(ev) { later(() => authFns.forEach((f) => f(ev, session))); }
  function reply(data, error) { return Promise.resolve({ data: error ? null : data, error: error || null }); }

  const auth = {
    getSession: () => Promise.resolve({ data: { session }, error: null }),
    onAuthStateChange(cb) { authFns.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
    signUp({ email, password }) {
      if (srv.offline) return reply(null, NET);
      if (srv.byEmail[email]) return reply(null, { message: 'User already registered' });
      if (!password || password.length < 6) return reply(null, { message: 'Password should be at least 6 characters.' });
      const user = { id: 'u' + (++srv.n), email };
      srv.users[user.id] = { user, password }; srv.byEmail[email] = user.id;
      session = { user }; emit('SIGNED_IN');
      return reply({ user, session });
    },
    signInWithPassword({ email, password }) {
      if (srv.offline) return reply(null, NET);
      const id = srv.byEmail[email];
      if (!id || srv.users[id].password !== password) return reply(null, { message: 'Invalid login credentials' });
      session = { user: srv.users[id].user }; emit('SIGNED_IN');
      return reply({ user: session.user, session });
    },
    signInAnonymously() {
      if (srv.offline) return reply(null, NET);
      const user = { id: 'u' + (++srv.n), email: '', is_anonymous: true };
      srv.users[user.id] = { user, password: null };
      session = { user }; emit('SIGNED_IN');
      return reply({ user, session });
    },
    signOut() { session = null; emit('SIGNED_OUT'); return reply({}); },
    signInWithOAuth() { return reply({}); }
  };

  function builder(table) {
    const q = { op: 'select', filters: [], order: null, range: null, payload: null };
    const b = {
      select() { return b; },
      eq(col, val) { q.filters.push([col, val]); return b; },
      order(col, opt) { q.order = [col, !(opt && opt.ascending === false)]; return b; },
      range(a, z) { q.range = [a, z]; return b; },
      limit(n) { q.range = [0, n - 1]; return b; },
      upsert(row) { q.op = 'upsert'; q.payload = row; return b; },
      update(patch) { q.op = 'update'; q.payload = patch; return b; },
      delete() { q.op = 'delete'; return b; },
      then(res, rej) { return run().then(res, rej); }
    };
    const match = (row) => q.filters.every(([c, v]) => row[c] === v);
    function run() {
      if (srv.offline) return reply(null, NET);
      const me = uid();
      if (q.op === 'select') {
        if (table === 'groups') {
          return reply(Object.values(srv.groups).filter((g) => isMember(srv, me, g.id)).map((g) => ({ id: g.id, data: clone(g.data), join_code: g.join_code })));
        }
        let rows = Object.values(srv[table]).filter((r) => isMember(srv, me, r.group_id) && match(r));
        if (q.order) rows.sort((x, y) => ((x[q.order[0]] || 0) - (y[q.order[0]] || 0)) * (q.order[1] ? 1 : -1));
        if (q.range) rows = rows.slice(q.range[0], q.range[1] + 1);
        return reply(rows.map((r) => ({ id: r.id, data: clone(r.data) })));
      }
      if (q.op === 'upsert') {
        const row = clone(q.payload), prev = srv[table][row.id];
        if (!isMember(srv, me, row.group_id) || (prev && !isMember(srv, me, prev.group_id))) return reply(null, RLS);
        srv[table][row.id] = row;
        notify(srv, table, prev ? 'UPDATE' : 'INSERT', row);
        return reply(null);
      }
      if (q.op === 'update' && table === 'groups') {
        const g = Object.values(srv.groups).find(match);
        if (!g || !isMember(srv, me, g.id)) return reply(null, RLS);
        g.data = clone(q.payload.data);
        notify(srv, 'groups', 'UPDATE', g);
        return reply(null);
      }
      if (q.op === 'delete') {
        const r = Object.values(srv[table]).find(match);
        if (r && isMember(srv, me, r.group_id)) { delete srv[table][r.id]; notify(srv, table, 'DELETE', r, r); }
        return reply(null);
      }
      return reply(null, { message: 'fake: unsupported ' + q.op + ' on ' + table });
    }
    return b;
  }

  const c = {
    uid,
    auth,
    from: builder,
    rpc(name, args) {
      if (srv.offline) return reply(null, NET);
      const me = uid();
      if (!me) return reply(null, { message: 'Sign in first' });
      if (name === 'create_group') {
        const code = Math.random().toString(16).slice(2, 10).toUpperCase().padEnd(8, '0');
        srv.groups[args.p_id] = { id: args.p_id, data: clone(args.p_data), join_code: code, created_by: me };
        srv.members.push({ group_id: args.p_id, user_id: me, role: 'owner' });
        return reply(code);
      }
      if (name === 'save_game' || name === 'save_player') {
        // same rule as schema.sql: members only, and never overwrite a newer copy
        const table = name === 'save_game' ? 'games' : 'players', prev = srv[table][args.p_id];
        if (!isMember(srv, me, args.p_group) || (prev && !isMember(srv, me, prev.group_id))) return reply(null, RLS);
        if (prev && (prev.data.updated || 0) > (args.p_data.updated || 0)) return reply(false);
        const row = { id: args.p_id, group_id: args.p_group, data: clone(args.p_data) };
        if (table === 'games') row.started = Math.floor(args.p_data.started || 0);
        srv[table][args.p_id] = row;
        notify(srv, table, prev ? 'UPDATE' : 'INSERT', row);
        return reply(true);
      }
      if (name === 'join_group') {
        const g = Object.values(srv.groups).find((x) => x.join_code === String(args.p_code).trim().toUpperCase());
        if (!g) return reply(null, { message: 'No group has that invite code' });
        if (!isMember(srv, me, g.id)) srv.members.push({ group_id: g.id, user_id: me, role: 'member' });
        return reply(g.id);
      }
      return reply(null, { message: 'fake: unknown function ' + name });
    },
    channel() {
      const ch = {
        client: c, subs: [],
        on(type, filter, cb) { ch.subs.push({ filter, cb }); return ch; },
        subscribe(statusCb) { srv.channels.add(ch); if (statusCb) later(() => statusCb('SUBSCRIBED')); return ch; }
      };
      return ch;
    },
    removeChannel(ch) { srv.channels.delete(ch); return Promise.resolve('ok'); }
  };
  return c;
}

module.exports = {
  server,
  lib: (srv) => ({ createClient: () => client(srv) }),
  /* what the database would hand a given person — for "can an outsider see it?" checks */
  visibleTo(srv, userId, table) { return Object.values(srv[table]).filter((r) => isMember(srv, userId, r.group_id)); }
};
