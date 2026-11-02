-- ================================================================
-- Dice Tracker — database setup for Supabase.
--
-- How to use: Supabase dashboard → SQL Editor → New query → paste this
-- whole file → Run. It's safe to run again; it never deletes data.
--
-- What it builds:
--   groups   one row per house / friend group (its settings live in `data`)
--   members  who belongs to which group
--   players  registered players, one row each, per group
--   games    every game, live or finished, per group
--
-- Who can see what (enforced by the database itself, not the app):
--   * Signed-out visitors can't read or write anything.
--   * You only see groups you're a member of, and their players and games.
--   * Any member can log and edit that group's players and games.
--   * You join a group only through its invite code (join_group below).
-- ================================================================

create table if not exists public.groups (
  id          text primary key,
  data        jsonb not null,
  join_code   text not null unique,
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  group_id   text not null references public.groups (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.players (
  id          text primary key,
  group_id    text not null references public.groups (id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.games (
  id          text primary key,
  group_id    text not null references public.groups (id) on delete cascade,
  data        jsonb not null,
  started     bigint,
  updated_at  timestamptz not null default now()
);

create index if not exists members_by_user  on public.members (user_id);
create index if not exists players_by_group on public.players (group_id);
create index if not exists games_by_group   on public.games (group_id, started desc);

-- Is the signed-in person a member of this group? Every rule below asks this.
-- (security definer so the check itself isn't blocked by the members table's own rule)
create or replace function public.is_member(gid text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.members where group_id = gid and user_id = auth.uid());
$$;

alter table public.groups  enable row level security;
alter table public.members enable row level security;
alter table public.players enable row level security;
alter table public.games   enable row level security;

drop policy if exists "members read their groups" on public.groups;
create policy "members read their groups" on public.groups
  for select to authenticated using (public.is_member(id));

drop policy if exists "members edit their groups" on public.groups;
create policy "members edit their groups" on public.groups
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

-- Members may change a group's settings (`data`), never its invite code or owner.
revoke update on public.groups from authenticated;
grant update (data) on public.groups to authenticated;

drop policy if exists "members see who else is in" on public.members;
create policy "members see who else is in" on public.members
  for select to authenticated using (public.is_member(group_id));

drop policy if exists "members manage players" on public.players;
create policy "members manage players" on public.players
  for all to authenticated using (public.is_member(group_id)) with check (public.is_member(group_id));

drop policy if exists "members manage games" on public.games;
create policy "members manage games" on public.games
  for all to authenticated using (public.is_member(group_id)) with check (public.is_member(group_id));

-- No insert/delete rules on groups or members: the two functions below are the only way in.

-- Create a group and make whoever called it the owner. Returns the invite code.
create or replace function public.create_group(p_id text, p_data jsonb)
returns text
language plpgsql security definer set search_path = public
as $$
declare code text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.groups (id, data, join_code, created_by) values (p_id, p_data, code, auth.uid());
  insert into public.members (group_id, user_id, role) values (p_id, auth.uid(), 'owner');
  return code;
end;
$$;

-- Join a group with its invite code. Returns the group's id. Joining twice is harmless.
create or replace function public.join_group(p_code text)
returns text
language plpgsql security definer set search_path = public
as $$
declare gid text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into gid from public.groups where join_code = upper(trim(p_code));
  if gid is null then raise exception 'No group has that invite code'; end if;
  insert into public.members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end;
$$;

revoke execute on function public.create_group(text, jsonb) from public, anon;
revoke execute on function public.join_group(text)         from public, anon;
revoke execute on function public.is_member(text)          from public, anon;
grant  execute on function public.create_group(text, jsonb) to authenticated;
grant  execute on function public.join_group(text)         to authenticated;
grant  execute on function public.is_member(text)          to authenticated;

-- Live updates: phones watching a game see every tap as it's logged.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games') then
    alter publication supabase_realtime add table public.games;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players') then
    alter publication supabase_realtime add table public.players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'groups') then
    alter publication supabase_realtime add table public.groups;
  end if;
end;
$$;
