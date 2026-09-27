-- ============================================================
-- Require user_roles to reference an existing member.
-- See docs/superpowers/specs/2026-09-27-permissions-require-membership-design.md
--
-- This file is intentionally staged in two parts:
--
-- PART 1 (safe to run anytime, idempotent): adds a nullable user_id
-- column with a real FK to member_profiles, and backfills it for
-- existing rows by matching email. Run this on staging first, then
-- production, same as any other migration in this repo.
--
-- PART 2 (DO NOT RUN YET): tightening user_id to NOT NULL. This must
-- only be run after confirming, in that specific environment, that
-- the verification query below returns zero rows. Staging and
-- production are separate checks — a clean staging result does not
-- imply production is clean. See the design doc's "Schema design"
-- section for the full phased rationale.
-- ============================================================

-- PART 1 --------------------------------------------------------

alter table public.user_roles
  add column if not exists user_id uuid references public.member_profiles(user_id) on delete cascade;

update public.user_roles ur
set user_id = mp.user_id
from public.member_profiles mp
where lower(mp.email) = lower(ur.email)
  and ur.user_id is null;

-- Run this after PART 1 to check for orphans (staff with a role but
-- no resolvable member profile). If this returns any rows, resolve
-- them manually before ever considering PART 2 in this environment.
--
-- select email, display_name, role, created_at
-- from public.user_roles
-- where user_id is null;

-- PART 2 (DO NOT RUN until the query above returns zero rows in
-- THIS environment) ---------------------------------------------
--
-- alter table public.user_roles alter column user_id set not null;
