-- People backbone backfill — staging only (govvofbrhhpowtdnuzcw).
-- Already run by hand via the Supabase MCP on 2026-09-10; this file is the
-- tracked record of exactly what ran, and the script to use if/when this
-- schema is promoted to production. Idempotent (safe to re-run) via
-- `on conflict (lower(email)) do nothing` and `... is null` guards on the
-- person_id updates.
--
-- Known exception found during backfill: 3 rows in user_roles
-- (sputnam@gmail.com, jwaller@gmail.com, jlcampbell@gmail.com) have no
-- matching email anywhere in the 7 source tables below, and remain with
-- person_id = null. This is a genuine pre-existing data-integrity issue
-- (an instance of the "leader email mismatch" bug class noted in the
-- design spec's Purpose section), not a bug in this script. One of the
-- three (sputnam@gmail.com) does match public.groups.leader_email, which
-- was deliberately not included as a backfill source in this phase (see
-- design spec "Confirmed Decisions" / "Backfill priority order" — groups
-- was never one of the 7 named source tables). Left unresolved here by
-- design; flagged for the human to decide on a follow-up.

-- ── Seed from real accounts (member_profiles + auth.users) ──────────────

insert into public.people (user_id, name, email, phone)
select mp.user_id, mp.name, lower(au.email), mp.phone
from public.member_profiles mp
join auth.users au on au.id = mp.user_id
where au.email is not null and au.email <> ''
on conflict (lower(email)) do nothing;

-- ── Seed from the remaining 6 sources, in priority order ────────────────

insert into public.people (name, email, phone)
select distinct on (lower(email)) name, lower(email), phone
from public.group_memberships where email <> ''
order by lower(email), joined_at asc
on conflict (lower(email)) do nothing;

insert into public.people (name, email, phone)
select distinct on (lower(email)) name, lower(email), coalesce(phone, '')
from public.applications where email <> ''
order by lower(email), submitted_date asc
on conflict (lower(email)) do nothing;

insert into public.people (name, email, phone)
select distinct on (lower(email)) name, lower(email), phone
from public.growth_track_registrations where email <> ''
order by lower(email), created_at asc
on conflict (lower(email)) do nothing;

insert into public.people (name, email, phone)
select distinct on (lower(email)) name, lower(email), coalesce(phone, '')
from public.signups where email <> ''
order by lower(email), created_at asc
on conflict (lower(email)) do nothing;

insert into public.people (name, email, phone)
select distinct on (lower(email)) full_name, lower(email), coalesce(phone, '')
from public.retreat_registrations where email <> ''
order by lower(email), created_at asc
on conflict (lower(email)) do nothing;

insert into public.people (name, email, phone)
select distinct on (lower(email)) coalesce(nullif(trim(first_name || ' ' || last_name), ''), email), lower(email), ''
from public.subscribers where email <> ''
order by lower(email), created_at asc
on conflict (lower(email)) do nothing;

-- ── Backfill person_id on every source table ─────────────────────────────

update public.member_profiles mp
set person_id = p.id
from auth.users au, public.people p
where au.id = mp.user_id and lower(au.email) = lower(p.email) and mp.person_id is null;

update public.group_memberships t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.growth_track_registrations t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.signups t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.applications t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.retreat_registrations t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.subscribers t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

update public.user_roles t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;

-- event_rsvps had 0 rows on staging at authoring time (no-op today), but is
-- included for completeness so future RSVP rows aren't silently missed.
update public.event_rsvps t
set person_id = p.id
from public.people p
where lower(t.email) = lower(p.email) and t.person_id is null;
