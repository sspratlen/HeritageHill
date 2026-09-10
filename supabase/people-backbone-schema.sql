-- People backbone: canonical identity table + link columns.
-- Staging-only for now (project govvofbrhhpowtdnuzcw) — see
-- docs/superpowers/specs/2026-09-10-people-backbone-design.md

create table public.people (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users(id) on delete set null,
  name       text not null default '',
  email      text not null,
  phone      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index people_email_lower_key on public.people (lower(email));

create or replace function public.people_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger people_touch_updated_at
  before update on public.people
  for each row execute function public.people_set_updated_at();

alter table public.people enable row level security;

create policy "Admins manage all people" on public.people
  for all using (public.is_admin()) with check (public.is_admin());

create policy "A person can view their own row" on public.people
  for select using (user_id = auth.uid());

create policy "A person can update their own contact info" on public.people
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.upsert_person(
  p_name  text,
  p_email text,
  p_phone text default ''
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  select id into v_id from public.people where lower(email) = lower(p_email);
  if v_id is null then
    insert into public.people (name, email, phone)
    values (coalesce(nullif(trim(p_name), ''), p_email), lower(trim(p_email)), coalesce(p_phone, ''))
    returning id into v_id;
  else
    update public.people set
      name  = case when name  = '' then coalesce(nullif(trim(p_name), ''), name)   else name end,
      phone = case when phone = '' then coalesce(p_phone, phone)                    else phone end
    where id = v_id;
  end if;
  return v_id;
end $$;

alter table public.member_profiles              add column person_id uuid references public.people(id) on delete set null;
alter table public.group_memberships             add column person_id uuid references public.people(id) on delete set null;
alter table public.growth_track_registrations    add column person_id uuid references public.people(id) on delete set null;
alter table public.signups                       add column person_id uuid references public.people(id) on delete set null;
alter table public.applications                  add column person_id uuid references public.people(id) on delete set null;
alter table public.retreat_registrations         add column person_id uuid references public.people(id) on delete set null;
alter table public.event_rsvps                   add column person_id uuid references public.people(id) on delete set null;
alter table public.subscribers                   add column person_id uuid references public.people(id) on delete set null;
alter table public.user_roles                    add column person_id uuid references public.people(id) on delete set null;
