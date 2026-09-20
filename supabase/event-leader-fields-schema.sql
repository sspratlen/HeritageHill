-- Adds an optional named leader/contact email to events, shown on the
-- event detail page and used for leader-facing event communication.
-- Depends on: public.events (schema.sql).
--
-- Backfilled into the repo on 2026-09-20 -- this schema was applied
-- directly to the staging database earlier and had no tracked .sql
-- file until now. See docs/superpowers/2026-09-20-production-deployment-readiness-report.md.
-- Run in the Supabase SQL editor. Not idempotent -- run once.

alter table public.events
  add column leader text,
  add column leader_email text;
