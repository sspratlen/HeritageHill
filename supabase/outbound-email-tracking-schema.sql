-- ============================================================
-- Outbound email delivery/open tracking for Email Group / Email
-- All Leaders sends. Reuses public.is_admin()/public.jwt_email()
-- from supabase/assessments-schema.sql — that migration must
-- already be applied. Run in the Supabase SQL editor.
-- Safe to re-run (idempotent).
-- ============================================================

create table if not exists public.outbound_email_sends (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sent_by    text not null,
  context    text not null default 'small_group',
  group_id   bigint,
  subject    text not null
);

create table if not exists public.outbound_email_recipients (
  id                bigint generated always as identity primary key,
  send_id           bigint not null references public.outbound_email_sends(id) on delete cascade,
  email             text not null,
  resend_email_id   text,
  status            text not null default 'pending',
  status_updated_at timestamptz
);

alter table public.outbound_email_sends enable row level security;
alter table public.outbound_email_recipients enable row level security;

drop policy if exists "view own or led group sends" on public.outbound_email_sends;
drop policy if exists "insert email sends" on public.outbound_email_sends;
create policy "view own or led group sends" on public.outbound_email_sends
  for select to authenticated using (
    public.is_admin()
    or group_id in (
      select id from public.groups where lower(leader_email) = public.jwt_email()
    )
  );
create policy "insert email sends" on public.outbound_email_sends
  for insert to authenticated with check (auth.role() = 'authenticated');

drop policy if exists "view recipients of visible sends" on public.outbound_email_recipients;
drop policy if exists "insert email recipients" on public.outbound_email_recipients;
create policy "view recipients of visible sends" on public.outbound_email_recipients
  for select to authenticated using (
    exists (
      select 1 from public.outbound_email_sends s
      where s.id = outbound_email_recipients.send_id
        and (
          public.is_admin()
          or s.group_id in (
            select id from public.groups where lower(leader_email) = public.jwt_email()
          )
        )
    )
  );
create policy "insert email recipients" on public.outbound_email_recipients
  for insert to authenticated with check (auth.role() = 'authenticated');
