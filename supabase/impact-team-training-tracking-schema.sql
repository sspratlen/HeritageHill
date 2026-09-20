-- Adds training-completion tracking to Impact Team memberships.
-- Depends on: public.impact_team_memberships (impact-teams-schema.sql).
--
-- Backfilled into the repo on 2026-09-20 -- this schema was applied
-- directly to the staging database earlier and had no tracked .sql
-- file until now. See docs/superpowers/2026-09-20-production-deployment-readiness-report.md.
-- Run in the Supabase SQL editor. Not idempotent -- run once.

alter table public.impact_team_memberships
  add column trained boolean not null default false,
  add column trained_at date;
