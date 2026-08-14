-- ============================================================
-- Small group semesters.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Semesters themselves are NOT a new table — they're stored as a
-- JSON array in site_settings (key='semesters'), reusing that
-- table's existing RLS ("Public can read site settings" / "Admin
-- full access to site settings"). Each groups row gets a nullable
-- semester_id column referencing a semester's id string informally
-- (no SQL foreign key, since semesters aren't a real table).
-- ============================================================

alter table public.groups
  add column if not exists semester_id text;

insert into site_settings (key, value)
values ('semesters', '[{"id":"fall-2026-a1b2","name":"Fall 2026","startDate":"2026-09-06","endDate":"2026-12-05"}]'::jsonb)
on conflict (key) do nothing;
