# Production Deployment Readiness Report

**Date:** 2026-09-20
**Scope:** Deep comparison of staging (branch `claude/loving-darwin-e8d5ea`, Supabase project `govvofbrhhpowtdnuzcw`) against production (branch `origin/main`, Supabase project `ktyplbmawlaerzohkdqy`).
**Nature of this document:** Analysis only. Nothing was deployed, migrated, or pushed to production as part of producing this report.

---

## Bottom line

No destructive SQL, no lost functionality, and no hardcoded staging leakage were found anywhere in the diff. The real risk in this promotion isn't code — it's **process**: production is not simply "behind" staging, it has its own independent history (one security fix, one deliberate revert, and two edge functions with live content never tracked in this git repo at all). And critically: **the SQL files tracked in this git repo do not fully describe what's actually live on staging's database** — four schema changes exist only as ad-hoc database edits, never saved to a `.sql` file. Anyone trying to "promote by running the repo's SQL files" would silently miss an entire feature (Impact Teams).

---

## 1. Production has already diverged — it is not a clean subset of staging

`git log HEAD..origin/main` shows production has **2 commits this branch doesn't have**:

- `f2550c1` — "Fix admin-create-user: require an authenticated staff caller" (a real security fix, closing an unauthenticated account-creation hole).
- `7bb1bb8` — "Revert people-backbone tracking files from production repo," with an explicit stated rationale: *"staging-only work stays on the staging remote; origin (production) is untouched by this phase."*

**Good news:** `supabase/functions/admin-create-user/index.ts` is **byte-identical** between staging and production right now — this branch independently landed the same auth fix, so nothing is lost here. Re-diff this one file immediately before the actual merge anyway, since it's the one place history genuinely forked and re-converged.

**The important nuance:** production's maintainer deliberately pulled the people-backbone SQL files back out once already. This branch re-adds them. That's not a bug — it looks like the intended direction all along — but the fact that this happened once already means **"promote everything now" is a real decision to make consciously**, not something to wave through because "the diff looks fine."

Separately: **43% of this branch's 118 commits (51 commits) carry an explicit "(staging only)" marker** in their message. These read as a running log of the phase this work was in, not per-commit "don't ship this" warnings — no commit body says "known broken, do not merge." But the pattern is consistent enough, and paired with the one prior revert, that it's worth naming explicitly: this whole branch was, until this conversation, scoped to stay off production.

---

## 2. Database schema: what's missing from production

Production is missing **9 tables** entirely that the app now depends on:

| Table | Staging rows | Purpose |
|---|---|---|
| `people` | 118 | Canonical identity backbone |
| `person_milestones` | 35 | Timeline events per person |
| `impact_teams` | 0 | Serving-team directory |
| `impact_team_memberships` | 0 | Team membership/leadership |
| `tap_sections` | 2 | NFC chair-tag sections |
| `tap_links` | 4 | Saved chair-tag redirect targets |
| `tap_current` | 2 | Live per-section redirect pointer |
| `tap_events` | 56 | Chair-tag tap analytics log |
| `connect_submissions` | 2 | "Scan to Connect" card submissions |

Production's `member_profiles` is also missing 3 columns the app now writes to: `person_id`, `member_since`, `approved_by_person_id`.

### ⚠️ Critical gap: the repo's SQL files do not fully describe what's live on staging

I pulled the **actual applied migration history directly from Supabase** (`supabase_migrations.schema_migrations`, live database — the source of truth, not git) and found **10 migrations applied to staging**. The repo only has **7 corresponding `.sql` files**. Four schema changes exist **only** as live database state, with no tracked file anywhere in this repo:

- **The entire `impact_teams` / `impact_team_memberships` schema** — no `.sql` file exists for this at all. This is a whole feature (the admin "Manage Impact Teams" tab) with zero corresponding tracked source.
- `impact_team_memberships.trained` / `trained_at` columns — not in any file.
- `public.link_person_user_id()` RPC function — not in any file.
- `public.events.leader` / `events.leader_email` columns — not in any file.

**This means: promoting by "running the SQL files in `supabase/`" would silently skip the Impact Teams feature entirely**, and production's `events` table would be missing the leader fields the admin dashboard's event-editing UI now writes to. Anyone building a migration checklist from the repo alone — including a future me, working from git history without re-checking the live database — would miss these.

I captured the exact SQL for all 4 missing pieces directly from the live migration history while producing this report (see §6 below for the full text) so they aren't lost.

### What IS safe: every migration is additive

I read the full SQL of all 10 live migrations. **None contain `DROP`, `DELETE`, `TRUNCATE`, `RENAME`, or a destructive `ALTER COLUMN ... TYPE`.** Every table-altering statement is either a new table or a nullable `ADD COLUMN` with no forced default. Every RLS policy that's new targets a table that is itself new in this diff — **no existing policy that production currently relies on is dropped, replaced, or narrowed.** I confirmed this directly by comparing `pg_policies` between both live databases: every policy on a table that exists in both environments is byte-identical.

Two files are **not idempotent** (no `if not exists`/`on conflict` guard) and must be run exactly once: `people-backbone-schema.sql`, `member-since-approved-by-schema.sql`. Running either twice will error (loudly, not silently) — not corrupt data.

Two are **one-time data backfills that must be re-run against production's real dataset**, not treated as already-applied: `people-backbone-backfill.sql` (populates `people` from 6 existing tables, `on conflict do nothing`, already documents a known pre-existing gap of 3 unmatched `user_roles` emails as an accepted limitation) and `backfill-small-group-counts.sql` (computes `attendance.small_group_count`, guarded so it never overwrites an existing non-null value).

**Deploy ordering that must be respected:** `people` must exist before `connect_submissions` or `person_milestones` (both reference it); `is_admin()` already exists in production today, so no new dependency there.

---

## 3. Edge Functions: production has its own untracked content

Every function that exists in **both** environments was diffed byte-for-byte against its live production deployment:

| Function | Status |
|---|---|
| `admin-create-user` | **Identical** |
| `send-group-email` | **Identical** |
| `notify-pastors` | **Identical** |
| `analyze-assessments` | **Identical** |
| `resend-webhook` | **Identical** |
| `notify-retreat-registrant` | **Differs** — see below |
| `send-contact-email` | **Differs — real behavior change** |
| `mailchimp` | **Differs — security fix, good** |

**`send-contact-email` — flag before deploying.** Production's live `TO_EMAIL` is `scottspratlen@heritagehill.church`. This repo's tracked version has `heritagehillchurch@gmail.com`. This looks like a deliberate change made directly in production (outside this repo/workflow) that would be **silently reverted** if this function is redeployed from the repo. Confirm which address should actually receive contact-form notifications before shipping this function. (The repo version also adds a honeypot spam-trap field — that part is a safe, pure addition.)

**`mailchimp` — this is a security improvement, not a regression.** Production's live version has **no authentication check at all** on `send_campaign`, `get_members`, `get_campaigns`, or `tag_member` — anyone with the function's URL can currently send a Mailchimp campaign or read the full subscriber list. This repo's version adds a Supabase session check before those actions. Deploying this function to production closes a real, currently-open hole.

**`notify-retreat-registrant` — content update, not a bug.** The repo version adds `cookingRole`/`tshirtSize`/`lodging` fields and updates the event year from 2025 to 2026 (next year's retreat). Intentional and safe, just worth knowing this changes live guest-facing email content the moment it deploys.

**Two brand-new functions**, present in neither production's function list nor any git history before this branch: `admin-invite-user` (this session's branded-invite feature) and `tap-redirect` (the NFC chair-tag resolver, needs `--no-verify-jwt` at deploy time — its own header comment says so).

**Existing production-only functions untouched by any of this:** `send-contact-email`, `mailchimp`, and the rest all remain deployed and working in production regardless of what's promoted — nothing in this plan removes or breaks them, only `send-contact-email` and `mailchimp` have content that would change on redeploy per above.

---

## 4. Functionality changes worth a deliberate look

- **`admin/member-dashboard.html`** — the old separate "Growth Track Progress," "Small Group History," "DISC," and "Spiritual Gifts" cards were replaced by one consolidated Journey Pipeline component. Confirmed the new component's inputs cover the same underlying data as what was removed — this is a genuine UI consolidation, not a silent feature drop, but it's a visible change for any admin using that page today and is worth a quick look after deploy.
- **`small_group_leader` role retirement** — this role was removed from the admin dashboard's role UI; anyone still holding it gets redirected to `my-profile.html` on next login instead of their old dashboard view (their `user_roles` row itself isn't deleted). **Worth checking production's `user_roles` table for any real `role = 'small_group_leader'` rows before deploying**, so no one is surprised.
- **Growth Track part renames** (`About Us` → `Plant`, etc.) only change display labels — the underlying storage keys (`about_us`, `about_you`, `get_involved`) are unchanged, so this is cosmetic only.
- **`js/db.js`** — purely additive; no exported method was removed or renamed, so nothing that already calls it should break.
- **PWA icons** — 4 icon PNGs were redesigned (2 commits, marked staging-only). Purely visual, but worth a glance before shipping since it changes the production home-screen icon.

---

## 5. What's confirmed clean

- **Staging/production branching logic** (`js/supabase-client.js`'s `HHC_IS_STAGING` check and both Supabase project refs/anon keys) is byte-identical to production and untouched by this branch. No new page hardcodes a Supabase URL — everything new loads the shared client and picks up the right environment automatically.
- **No route collisions** — the two new top-level directories (`connect/`, `tap/`) don't exist in production today under any name.
- **RLS policies** on every table shared between environments are identical, live-verified via `pg_policies` on both projects — nothing existing was narrowed or widened.
- **Shared helper functions** (`is_admin()`, `jwt_email()`) are byte-identical between both live databases.
- **Security advisors** on both projects show the same baseline warning categories (function search-path, anon-callable `SECURITY DEFINER` functions) — staging's additional warnings are just the new intentionally-public functions (`upsert_person`, `record_milestone`, `link_person_user_id`) following the exact same pattern already accepted in production for `is_admin()`. Nothing new or alarming.

---

## 6. Exact SQL for the 4 untracked schema pieces (captured live, for reference)

```sql
-- Impact Teams (no .sql file exists anywhere in the repo for this)
create table public.impact_teams (
  id bigint generated always as identity primary key,
  name text not null,
  department text,
  description text,
  image text,
  open boolean not null default true,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.impact_team_memberships (
  id bigint generated always as identity primary key,
  team_id bigint references public.impact_teams(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  phone text not null default '',
  role text not null default 'member' check (role in ('member','leader')),
  joined_at date not null default current_date,
  left_at date,
  notes text not null default ''
);

create unique index impact_team_memberships_active_unique
  on public.impact_team_memberships (team_id, person_id)
  where left_at is null;

alter table public.impact_teams enable row level security;
alter table public.impact_team_memberships enable row level security;

create policy "Admin full access to impact teams"
  on public.impact_teams for all
  using (auth.role() = 'authenticated');

create policy "Public can view published impact teams"
  on public.impact_teams for select
  using (published = true);

create policy "Admin full access to impact team memberships"
  on public.impact_team_memberships for all
  using (auth.role() = 'authenticated');

-- Training tracking (also untracked)
alter table public.impact_team_memberships
  add column trained boolean not null default false,
  add column trained_at date;

-- link_person_user_id RPC (also untracked)
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

-- Event leader fields (also untracked)
alter table public.events
  add column leader text,
  add column leader_email text;
```

---

## 7. Suggested pre-deploy checklist (not executed — for your review)

1. Decide, consciously, that the "staging-only" phase is over — this report exists because that boundary is about to move.
2. Resolve the `send-contact-email` `TO_EMAIL` discrepancy (repo vs. live production) before redeploying that function.
3. Save the 4 untracked schema pieces above into real `.sql` files in the repo, so the repo becomes a true record again (currently it silently under-describes staging).
4. Check production's `user_roles` for any `small_group_leader` rows before deploying the role retirement.
5. Run production's migrations in dependency order: `people` → backfill → (`connect_submissions`, `person_milestones`, `member_since_and_approved_by`) → `impact_teams`/training-tracking → `link_person_user_id` → `events` leader fields → `tap_*` schema+seed → `backfill-small-group-counts`.
6. Deploy `tap-redirect` with `--no-verify-jwt` explicitly (its own header comment says so — easy to forget).
7. Ensure `RESEND_API_KEY` is set on the production Supabase project's secrets before deploying `admin-invite-user` (mirrors the exact staging gotcha already hit once this session).
8. Re-diff `admin-create-user`'s function file immediately before the actual merge, as the one file with genuine parallel history.
9. Glance at the 4 new PWA icon assets before shipping — they change production's home-screen icon.
