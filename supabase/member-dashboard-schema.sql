-- ============================================================
-- Member journey dashboard: group_memberships table, plus
-- user_id/attended columns on growth_track_registrations.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- ============================================================

create table if not exists group_memberships (
  id         bigint generated always as identity primary key,
  group_id   bigint references groups(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  email      text not null,
  phone      text not null default '',
  joined_at  date not null default current_date,
  left_at    date,
  notes      text not null default ''
);

alter table group_memberships enable row level security;

drop policy if exists "Admin full access to group memberships" on group_memberships;
create policy "Admin full access to group memberships"
  on group_memberships for all
  using (auth.role() = 'authenticated');

alter table growth_track_registrations
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists attended boolean not null default false;
