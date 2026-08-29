-- ============================================================
-- Growth Track recurring schedule: adds sunday_of_month to
-- growth_track_parts, and a new growth_track_cancellations table
-- for per-occurrence overrides. Run in the Supabase SQL editor.
-- Safe to re-run (idempotent).
--
-- The old growth_track_parts.session_date column is intentionally
-- left in place but unused going forward — no destructive change.
-- ============================================================

alter table public.growth_track_parts
  add column if not exists sunday_of_month smallint;

create table if not exists growth_track_cancellations (
  id           bigint generated always as identity primary key,
  part         text        not null, -- 'about_us' | 'about_you' | 'get_involved'
  session_date date        not null,
  created_at   timestamptz not null default now(),
  unique (part, session_date)
);

alter table growth_track_cancellations enable row level security;

drop policy if exists "Public can view growth track cancellations" on growth_track_cancellations;
drop policy if exists "Admin full access to growth track cancellations" on growth_track_cancellations;
create policy "Public can view growth track cancellations"
  on growth_track_cancellations for select
  using (true);
create policy "Admin full access to growth track cancellations"
  on growth_track_cancellations for all
  using (auth.role() = 'authenticated');
