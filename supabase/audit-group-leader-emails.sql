-- ============================================================
-- Audit: find small groups whose Leader Email won't match the
-- leader's actual member profile, so their leadership silently
-- fails to show up in that person's Small Group History.
--
-- Run in the Supabase SQL editor. Read-only — makes no changes.
-- ============================================================

select
  g.id,
  g.name             as group_name,
  g.leader           as leader_name,
  g.leader_email,
  case
    when g.leader_email is null or g.leader_email = ''
      then 'NO LEADER EMAIL SET'
    when not exists (
      select 1 from member_profiles mp where lower(mp.email) = lower(g.leader_email)
    )
      then 'NO MATCHING MEMBER PROFILE'
    when g.leader_email !~* '@heritagehill\.church$'
      then 'NON-CHURCH DOMAIN (possible personal email)'
    else 'OK'
  end as issue
from groups g
where
  g.leader_email is null
  or g.leader_email = ''
  or not exists (
    select 1 from member_profiles mp where lower(mp.email) = lower(g.leader_email)
  )
  or g.leader_email !~* '@heritagehill\.church$'
order by g.name;
