-- Impact Teams: serving teams a person can join/lead, many-to-many.
-- Mirrors groups/group_memberships, except leadership lives on the
-- membership row (role) instead of a single leader field on the team,
-- so a person can lead and/or belong to any number of teams.
--
-- Backfilled into the repo on 2026-09-20 -- this schema was applied
-- directly to the staging database earlier and had no tracked .sql
-- file until now. See docs/superpowers/2026-09-20-production-deployment-readiness-report.md.
-- Run in the Supabase SQL editor. Not idempotent -- run once.

create table public.impact_teams (
  id bigint generated always as identity primary key,
  name text not null,
  department text,
  description text,
  image text,
  open boolean not null default true,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.impact_team_memberships (
  id bigint generated always as identity primary key,
  team_id bigint references public.impact_teams(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  phone text not null default '',
  role text not null default 'member' check (role in ('member','leader')),
  joined_at date not null default current_date,
  left_at date,
  notes text not null default ''
);

-- One active membership per person per team; unlimited distinct teams.
create unique index impact_team_memberships_active_unique
  on public.impact_team_memberships (team_id, person_id)
  where left_at is null;

alter table public.impact_teams enable row level security;
alter table public.impact_team_memberships enable row level security;

create policy "Admin full access to impact teams"
  on public.impact_teams for all
  using (auth.role() = 'authenticated');

create policy "Public can view published impact teams"
  on public.impact_teams for select
  using (published = true);

create policy "Admin full access to impact team memberships"
  on public.impact_team_memberships for all
  using (auth.role() = 'authenticated');
