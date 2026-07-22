-- ============================================================
-- Growth Track module: growth_track_parts, growth_track_registrations
-- + RLS + one-time seed of the 3 fixed parts. Run in the Supabase
-- SQL editor. Safe to re-run (idempotent) EXCEPT the seed insert,
-- which is guarded by ON CONFLICT DO NOTHING so it won't duplicate
-- or overwrite rows you've already edited.
-- ============================================================

create table if not exists growth_track_parts (
  id           bigint generated always as identity primary key,
  part         text        not null unique, -- 'about_us' | 'about_you' | 'get_involved'
  title        text        not null,
  description  text        not null default '',
  session_date date,
  session_time text        not null default '',
  location     text        not null default '',
  published    boolean     not null default false
);

alter table growth_track_parts enable row level security;

drop policy if exists "Public can view published growth track parts" on growth_track_parts;
drop policy if exists "Admin full access to growth track parts" on growth_track_parts;
create policy "Public can view published growth track parts"
  on growth_track_parts for select
  using (published = true);
create policy "Admin full access to growth track parts"
  on growth_track_parts for all
  using (auth.role() = 'authenticated');

create table if not exists growth_track_registrations (
  id              bigint generated always as identity primary key,
  part            text        not null, -- 'about_us' | 'about_you' | 'get_involved'
  session_date    date,
  session_time    text        not null default '',
  name            text        not null,
  email           text        not null,
  phone           text        not null default '',
  notes           text        not null default '',
  added_by_admin  boolean     not null default false,
  created_at      timestamptz not null default now()
);

alter table growth_track_registrations enable row level security;

drop policy if exists "Public can submit growth track registrations" on growth_track_registrations;
drop policy if exists "Admin full access to growth track registrations" on growth_track_registrations;
create policy "Public can submit growth track registrations"
  on growth_track_registrations for insert
  with check (true);
create policy "Admin full access to growth track registrations"
  on growth_track_registrations for all
  using (auth.role() = 'authenticated');

insert into growth_track_parts (part, title, description, session_time, location, published) values
  ('about_us',     'About Us',     '', '', '', false),
  ('about_you',    'About You',    '', '', '', false),
  ('get_involved', 'Get Involved', '', '', '', false)
on conflict (part) do nothing;
