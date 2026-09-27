-- ============================================================
-- Require user_roles to reference an existing member.
-- See docs/superpowers/specs/2026-09-27-permissions-require-membership-design.md
--
-- Status: fully applied and verified on both staging
-- (govvofbrhhpowtdnuzcw) and production (ktyplbmawlaerzohkdqy) as
-- of 2026-09-27 — user_id is populated on every row and the column
-- is NOT NULL on both. Kept idempotent below so this file is safe
-- to re-run against either project.
--
-- Fixing the orphans found along the way: several existing
-- user_roles rows (staff added before this feature existed) had no
-- member_profiles row at all. A one-off backfill (upsert_person +
-- insert into member_profiles per orphaned email) resolved those on
-- both projects before PART 1 could complete cleanly — that backfill
-- isn't repeated here since it was a one-time data fix, not a
-- repeatable schema change.
--
-- Note for future inserts/updates against member_profiles done via
-- the SQL Editor or any non-authenticated (service-role) connection:
-- the member_profiles_protect trigger silently overwrites email to
-- '' and status to 'pending' unless the caller resolves as an admin
-- via JWT (which a raw SQL session never does). Wrap any such
-- SQL-Editor-run insert/update in
--   alter table public.member_profiles disable trigger member_profiles_protect;
--   ... your insert/update ...
--   alter table public.member_profiles enable trigger member_profiles_protect;
-- or the row will silently end up with a blank email / wrong status.
-- ============================================================

-- PART 1 (idempotent) ---------------------------------------------

alter table public.user_roles
  add column if not exists user_id uuid references public.member_profiles(user_id) on delete cascade;

update public.user_roles ur
set user_id = mp.user_id
from public.member_profiles mp
where lower(mp.email) = lower(ur.email)
  and ur.user_id is null;

-- Verification query — should return zero rows on both projects now.
--
-- select email, display_name, role, created_at
-- from public.user_roles
-- where user_id is null;

-- PART 2 (already applied on both projects; guarded so it's a no-op
-- if user_id is somehow already NOT NULL, and fails loudly rather
-- than silently if a future orphan ever reappears) ------------------

do $$
begin
  if exists (select 1 from public.user_roles where user_id is null) then
    raise exception 'user_roles has rows with null user_id; resolve before tightening NOT NULL';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_roles'
      and column_name = 'user_id' and is_nullable = 'YES'
  ) then
    alter table public.user_roles alter column user_id set not null;
  end if;
end $$;
