-- ============================================================
-- Connect page submissions: staff follow-up tracking for the
-- digital "Scan to Connect" card at heritagehill.church/connect.
-- Staging-only for now (project govvofbrhhpowtdnuzcw) — see
-- docs/superpowers/specs/2026-09-16-connect-page-design.md
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Depends on: public.is_admin() (created in
-- supabase/assessments-schema.sql), public.people (created in
-- supabase/people-backbone-schema.sql)
-- ============================================================

create table if not exists public.connect_submissions (
  id           bigint generated always as identity primary key,
  person_id    uuid references public.people(id) on delete set null,
  name         text not null,
  email        text not null,
  phone        text not null default '',
  contacted    boolean not null default false,
  contacted_at timestamptz,
  contacted_by text,
  created_at   timestamptz not null default now()
);

alter table public.connect_submissions enable row level security;

-- Public (unauthenticated) visitors submit the card.
drop policy if exists "Public can submit connect cards" on public.connect_submissions;
create policy "Public can submit connect cards"
  on public.connect_submissions for insert
  with check (true);

-- Only admins can read or update submissions (contact info, tighter than
-- this app's older tables which use a blanket authenticated-role check).
drop policy if exists "Admins view connect submissions" on public.connect_submissions;
create policy "Admins view connect submissions"
  on public.connect_submissions for select
  using (public.is_admin());

drop policy if exists "Admins update connect submissions" on public.connect_submissions;
create policy "Admins update connect submissions"
  on public.connect_submissions for update
  using (public.is_admin()) with check (public.is_admin());
