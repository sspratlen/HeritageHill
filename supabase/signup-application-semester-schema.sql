-- ============================================================
-- Semester tagging for small-group sign-ups and leader applications.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Mirrors groups.semester_id: an informal reference to a semester's
-- id string (stored in site_settings, key='semesters') — no SQL
-- foreign key, since semesters aren't a real table. Existing rows
-- get semester_id = null, which the UI displays as "—".
-- ============================================================

alter table public.signups
  add column if not exists semester_id text;

alter table public.applications
  add column if not exists semester_id text;
