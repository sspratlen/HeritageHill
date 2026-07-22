# Church Management System: Assessments Module — Design

**Date:** 2026-07-22
**Status:** Approved by Scott (pending final spec review)

## Purpose

Add a member-facing assessments module to the Heritage Hill website: congregation
members create profiles, take a DISC-style personality assessment and a spiritual
gifts assessment (Heritage Hill's Growth Track materials), and see their results.
Pastors/admins get a roster, individual drill-in, and church-wide analytics.

## Decisions Made (with user)

- **Registration:** self-registration with admin approval (option B).
- **Visibility:** two tiers + opt-in sharing (option C) — members see only their own
  results; admins see everyone; small group leaders see only members of their groups
  who toggled sharing on.
- **Retakes:** allowed anytime, full history kept (option A). Latest attempt per test
  type is "current."
- **Profile fields:** name, email, phone, optional small group (FK to existing groups),
  years attending (option C).
- **Analytics:** all of — church-wide distributions, gap analysis, filterable roster,
  per-group breakdowns.
- **Architecture:** Approach 1 — extend existing pattern (static HTML pages + Supabase
  + RLS + Chart.js), no SPA, no third-party ChMS.

## Assessment Mechanics (from Growth Track book)

- **Personality (DISC):** 20 statements, 4 sections of 5, each rated 1–5
  (Never→Always). Section totals map to D, I, S, C. Top two totals form the blend
  (e.g. "DI", "SC"); 16 blend descriptions exist (4 pure + 12 combinations).
- **Spiritual gifts:** 72 statements rated 1–3 (Almost never / Sometimes / Almost
  always). Gift score for row n = answers n + (n+24) + (n+48), so each of the 24
  gifts (A–X, Administration → Wisdom) scores 3–9. Top 3 totals = the member's gifts.
- Each gift has a description, scripture references, and mapped ministry areas.
  Book mappings are Highlands-specific; we map to Heritage Hill ministries instead.

**Content licensing:** question text and descriptions are Church of the Highlands'
Growth Track material. The build ships schema + seed-SQL template; Heritage Hill
populates the actual text under its own permission from CoTH. No copyrighted text
is committed to this repo by Claude.

## Pages

| Page | Audience | Purpose |
|---|---|---|
| `admin/register.html` | Public | Self-registration form |
| `admin/my-profile.html` | Members (any authed user) | Profile hub: info, test status, results, sharing toggle |
| `admin/test-personality.html` | Members | 20-question DISC assessment |
| `admin/test-gifts.html` | Members | 72-question gifts assessment |
| `admin/gifts-dashboard.html` | Admin | Analytics (modeled on attendance-dashboard.html) |
| `admin/dashboard.html` (existing) | Admin / leaders | New "People" tab; leaders get trimmed "My Group" view |

**Login routing:** login page checks role — admins/leaders → dashboard (as today);
members → my-profile. New role `member` added to existing role set. Staff/leaders can
also take tests; My Profile link added to dashboard topbar.

**Member flow:** register → auth user + `pending` member_profile created → can log in
and take tests immediately (banner shows "awaiting approval") → admin approves from
People tab → member appears in roster/analytics. Rejected/spam accounts deleted
(profile + auth user).

## Data Model

**`member_profiles`** — one row per person. `user_id` (PK, FK auth.users), `name`,
`email`, `phone`, `group_id` (FK groups, nullable), `years_attending`, `status`
(`pending`/`approved`), `share_with_leader` (bool, default false), `created_at`.
Separate from `user_roles`, which stays the staff-only role table. Members get NO
`user_roles` row (allowing client inserts there would be a privilege-escalation
hole, and it would flood the User Permissions panel). Login routing instead checks:
staff role found in `user_roles` → dashboard; otherwise → My Profile. All users
(members and staff alike) get a `member_profiles` row lazily on first My Profile
visit, built from auth metadata captured at registration.

**`assessment_attempts`** — one row per completed test. `id`, `user_id`,
`assessment_type` (`disc`/`gifts`), `answers` (JSONB, raw responses), `scores`
(JSONB, computed totals), `result` (text: blend like `"DI"`, or JSON array of top-3
gift names), `completed_at`. Latest row per type per user = current result; older
rows = history. Raw answers kept so results can be rescored.

**`assessment_content`** — questions, blend/gift descriptions, scriptures, and
gift→Heritage Hill ministry mappings as rows, editable via SQL without a deploy.
Readable by any authenticated user.

## Security (RLS)

- Members: SELECT/UPDATE own profile; INSERT/SELECT own attempts; nothing else.
- Admins: full access (matches existing admin policies).
- Leaders: SELECT profiles + attempts only where member's `group_id` is one of the
  leader's groups AND `share_with_leader` = true.
- Scoring runs client-side (existing trust model); raw answers stored server-side so
  tampering is detectable and rescorable.
- Analytics and roster count only `approved` members' latest attempts.

## Admin Experience

**People tab (admin-only):**
- Pending approvals on top (name, email, group, date; Approve/Delete). Pending-count
  badge on tab.
- Roster: search + filters (gift in top 3, DISC type, group). Columns: name, group,
  DISC blend, top 3 gifts, last test date.
- Drill-in modal: contact info, DISC scores per dimension, all 24 gift scores with
  top 3 highlighted, attempt history, sharing status.

**Leader view:** trimmed "My Group" panel — shared members of their groups only,
same drill-in minus contact editing.

**Analytics page (`gifts-dashboard.html`):**
- Stat cards: approved members, tests completed + completion %, most common gift,
  most common DISC type.
- Gift distribution: horizontal bar, 24 gifts, count of members with gift in top 3,
  sorted descending; "Least represented gifts" callout (bottom 5) = gap analysis.
- DISC: donut of primary types + bar of the 16 blends.
- Ministry coverage: per Heritage Hill ministry area, count of approved members with
  a mapped gift.
- Per-group breakdown: select a group, see its gift/DISC makeup. (Admins see all
  approved members regardless of sharing — sharing governs leaders, not staff.)
- CSV export.

## Edge Cases

- **Abandoned test:** answers held in localStorage until submit; resume on return;
  no DB write until complete.
- **Ties:** DISC top-two ties broken by section order D > I > S > C (book box order);
  gift ties at 3rd place include all tied gifts.
- **Group change:** `group_id` editable on profile; leader visibility follows current
  group.
- **Duplicate email:** registration surfaces "account exists — log in instead."
- **Spam/pending deletion:** removes profile + auth user via the admin edge function
  (extend `admin-create-user` pattern with a delete action).

## Testing

- Manual checklist per role (member/leader/admin): registration → approval → test →
  results → sharing.
- RLS verified by querying as each role.
- Scoring verified against a hand-worked example from the book.

## Rollout

Staging first; Scott + staff run end-to-end; then staging → production per the
standard flow (`git push staging HEAD:main`, then `git push origin HEAD:main`).
