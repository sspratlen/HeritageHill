-- ============================================================
-- Assessment Analytics: stores Claude-generated congregation-wide
-- DISC/Spiritual Gifts analyses, each with the aggregate stat
-- snapshot it was generated from. Run in the Supabase SQL editor.
-- Safe to re-run (idempotent).
-- ============================================================

create table if not exists assessment_analytics_reports (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  created_by    text,
  summary_stats jsonb not null,
  analysis_text text not null
);

alter table assessment_analytics_reports enable row level security;

drop policy if exists "Staff can view analytics reports" on assessment_analytics_reports;
drop policy if exists "Staff can insert analytics reports" on assessment_analytics_reports;
create policy "Staff can view analytics reports"
  on assessment_analytics_reports for select
  using (auth.role() = 'authenticated');
create policy "Staff can insert analytics reports"
  on assessment_analytics_reports for insert
  with check (auth.role() = 'authenticated');
