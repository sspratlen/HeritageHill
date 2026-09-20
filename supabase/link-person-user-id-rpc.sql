-- people.user_id was never being set anywhere (upsert_person only matches
-- on email), which silently breaks the "a person can view their own row /
-- their own milestones" RLS policies -- they gate on people.user_id =
-- auth.uid(), which was always null. This links a person's row to their
-- own auth account, once, only when the email matches the caller's own.
-- Depends on: public.people (people-backbone-schema.sql).
--
-- Backfilled into the repo on 2026-09-20 -- this function was created
-- directly on the staging database earlier and had no tracked .sql
-- file until now. See docs/superpowers/2026-09-20-production-deployment-readiness-report.md.
-- Run in the Supabase SQL editor. Safe to re-run (create or replace).

create or replace function public.link_person_user_id(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.people
  set user_id = auth.uid()
  where id = p_person_id
    and user_id is null
    and lower(email) = lower((select email from auth.users where id = auth.uid()));
end;
$$;
