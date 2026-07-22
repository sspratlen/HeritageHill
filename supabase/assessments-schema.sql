-- ============================================================
-- Assessments module: member_profiles, assessment_attempts,
-- assessment_content + RLS. Run in Supabase SQL editor.
-- Safe to re-run (idempotent).
-- Depends on: public.user_roles (created previously) and
-- public.groups (supabase/schema.sql)
-- ============================================================

-- ── Helper functions ─────────────────────────────────────────
create or replace function public.jwt_email() returns text
language sql stable as
$$ select lower(coalesce(auth.jwt()->>'email','')) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.user_roles
     where lower(email) = public.jwt_email() and role = 'admin'
   ) $$;

-- ── Tables ───────────────────────────────────────────────────
create table if not exists public.member_profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  name              text not null,
  email             text not null,
  phone             text not null default '',
  group_id          bigint references public.groups(id) on delete set null,
  years_attending   text not null default '',
  status            text not null default 'pending' check (status in ('pending','approved')),
  share_with_leader boolean not null default false,
  created_at        timestamptz not null default now()
);

create table if not exists public.assessment_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  assessment_type text not null check (assessment_type in ('disc','gifts')),
  answers         jsonb not null,
  scores          jsonb not null,
  result          text not null,
  completed_at    timestamptz not null default now()
);
create index if not exists assessment_attempts_user_type_idx
  on public.assessment_attempts (user_id, assessment_type, completed_at desc);

create table if not exists public.assessment_content (
  id    uuid primary key default gen_random_uuid(),
  kind  text not null check (kind in ('disc_question','disc_blend','gift_question','gift')),
  code  text not null default '',   -- disc_question: D/I/S/C · disc_blend: e.g. DI · gift_question: gift letter A-X · gift: letter A-X
  sort  int  not null default 0,    -- display order within kind
  text  text not null,              -- question text / description body
  extra jsonb not null default '{}'::jsonb  -- gift: {"name","scriptures","ministries":[]} · blend: {"name","scriptures"}
);

-- ── Prevent members from self-approving / changing email ────
create or replace function public.protect_member_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if TG_OP = 'INSERT' then
      new.status := 'pending';
      new.email  := public.jwt_email();
    else
      new.status := old.status;
      new.email  := old.email;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists member_profiles_protect on public.member_profiles;
create trigger member_profiles_protect
  before insert or update on public.member_profiles
  for each row execute function public.protect_member_profile_fields();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.member_profiles    enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_content enable row level security;

-- member_profiles
drop policy if exists "own profile insert"    on public.member_profiles;
drop policy if exists "own profile select"    on public.member_profiles;
drop policy if exists "own profile update"    on public.member_profiles;
drop policy if exists "admin all profiles"    on public.member_profiles;
drop policy if exists "leader shared profiles" on public.member_profiles;

create policy "own profile insert" on public.member_profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own profile select" on public.member_profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "own profile update" on public.member_profiles
  for update to authenticated using (auth.uid() = user_id);
create policy "admin all profiles" on public.member_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "leader shared profiles" on public.member_profiles
  for select to authenticated using (
    share_with_leader and status = 'approved' and group_id in (
      select id from public.groups
      where lower(leader_email) = public.jwt_email()
    )
  );

-- assessment_attempts (no update policy: attempts are immutable)
drop policy if exists "own attempts insert"   on public.assessment_attempts;
drop policy if exists "own attempts select"   on public.assessment_attempts;
drop policy if exists "admin all attempts"    on public.assessment_attempts;
drop policy if exists "leader shared attempts" on public.assessment_attempts;

create policy "own attempts insert" on public.assessment_attempts
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own attempts select" on public.assessment_attempts
  for select to authenticated using (auth.uid() = user_id);
create policy "admin all attempts" on public.assessment_attempts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "leader shared attempts" on public.assessment_attempts
  for select to authenticated using (
    user_id in (
      select mp.user_id from public.member_profiles mp
      where mp.share_with_leader and mp.status = 'approved' and mp.group_id in (
        select id from public.groups
        where lower(leader_email) = public.jwt_email()
      )
    )
  );

-- assessment_content
drop policy if exists "authed read content" on public.assessment_content;
drop policy if exists "admin write content" on public.assessment_content;

create policy "authed read content" on public.assessment_content
  for select to authenticated using (true);
create policy "admin write content" on public.assessment_content
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
