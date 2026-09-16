-- ============================================================
-- Chair Tag Dynamic Redirect: sections, saved links, current
-- destination per section, and a tap analytics log.
-- Staging-only for now (project govvofbrhhpowtdnuzcw) — see
-- docs/superpowers/specs/2026-09-15-chair-tag-redirect-design.md
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Depends on: public.is_admin() (created in
-- supabase/assessments-schema.sql)
-- ============================================================

create table if not exists public.tap_sections (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tap_links (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  url        text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tap_current (
  section_id uuid primary key references public.tap_sections(id) on delete cascade,
  link_id    uuid references public.tap_links(id) on delete set null,
  custom_url text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.tap_events (
  id             uuid primary key default gen_random_uuid(),
  section_id     uuid not null references public.tap_sections(id) on delete cascade,
  resolved_url   text not null,
  resolved_label text,
  tapped_at      timestamptz not null default now()
);

create index if not exists tap_events_section_tapped_at_idx
  on public.tap_events (section_id, tapped_at desc);

alter table public.tap_sections enable row level security;
alter table public.tap_links    enable row level security;
alter table public.tap_current  enable row level security;
alter table public.tap_events   enable row level security;

-- Sections, links, and the live pointer are admin-managed only, per the
-- design spec's access-control decision (no "Service Operator" role yet).
drop policy if exists "Admins manage tap sections" on public.tap_sections;
create policy "Admins manage tap sections" on public.tap_sections
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage tap links" on public.tap_links;
create policy "Admins manage tap links" on public.tap_links
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage tap current" on public.tap_current;
create policy "Admins manage tap current" on public.tap_current
  for all using (public.is_admin()) with check (public.is_admin());

-- tap_events is written only by the tap-redirect Edge Function using the
-- service-role key (which bypasses RLS entirely) — this policy only
-- covers the admin panel's read of the tap-count stat.
drop policy if exists "Admins view tap events" on public.tap_events;
create policy "Admins view tap events" on public.tap_events
  for select using (public.is_admin());

-- Seed data: one section, four starter saved links, and a default
-- current destination so the very first tap after setup doesn't hit
-- the homepage fallback.
insert into public.tap_sections (slug, name)
values ('main-auditorium', 'Main Auditorium')
on conflict (slug) do nothing;

insert into public.tap_links (label, url, sort_order)
values
  ('Welcome / Connect', 'https://heritagehill.church/', 1),
  ('Give', 'https://heritagehill.church/give.html', 2),
  ('Message Notes', 'https://heritagehill.church/', 3),
  ('Prayer', 'https://heritagehill.church/prayer.html', 4)
on conflict (label) do nothing;

insert into public.tap_current (section_id, link_id, updated_by)
select s.id, l.id, 'system'
from public.tap_sections s, public.tap_links l
where s.slug = 'main-auditorium' and l.label = 'Welcome / Connect'
on conflict (section_id) do nothing;
