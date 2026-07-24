-- ============================================================
-- Profile avatar: adds avatar_url to member_profiles.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- No RLS changes needed — existing "own profile update" and
-- "admin all profiles" policies already cover this column.
-- ============================================================

alter table public.member_profiles
  add column if not exists avatar_url text;
