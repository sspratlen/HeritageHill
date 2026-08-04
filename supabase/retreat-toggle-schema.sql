-- ============================================================
-- Men's Retreat registration on/off toggle.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Reuses the existing site_settings table and its RLS policies
-- ("Public can read site settings" / "Admin full access to site
-- settings") — no schema or policy changes needed.
--
-- Seeds the row CLOSED (false) so registration is off the moment
-- this runs. Toggle it from the admin dashboard's Retreat 2026 tab.
-- ============================================================

insert into site_settings (key, value)
values ('retreat_registration_open', 'false'::jsonb)
on conflict (key) do nothing;
