# Member Journey Dashboard — Design

**Date:** 2026-07-23
**Status:** Approved by Scott (pending final spec review)

## Purpose

Show, for any given member, their Growth Track progress and small group history
alongside their existing personality/gifts results — as a dashboard viewable by
the member themselves (`my-profile.html`, revamped) and by admins (a new
dedicated page, with the ability to cycle between members).

## Context / Gaps Discovered

- Growth Track (`growth_track_registrations`) currently tracks registration
  (intent) only — there is no "attended"/"completed" concept.
- The existing Groups tab "Members" roster is not a real membership table —
  it reuses `signups` (name/email/phone strings with no link to
  `member_profiles`, no history, no distinction between "public join
  request" and "official current member").

## Decisions Made (with user)

- **Growth Track completion:** admin-marked attendance, not automatic. Admin
  checks off who actually attended after each session.
- **Group history:** build a proper `group_memberships` table (member + group
  + joined/left dates), and migrate the Groups tab's "Members" roster feature
  to use it instead of `signups`. The Sign-Up Requests tab and the public
  "Join a Group" flow are unaffected — they keep using `signups` for what it
  already does (public lead capture).
- **Linkage strategy:** both `group_memberships` and `growth_track_registrations`
  gain a nullable `user_id`, auto-populated when the person is logged in at
  the time of the action (join/register). No retroactive email-matching —
  only actions taken after this ships (while logged in) populate the link.
- **Admin cycling:** Prev/Next arrows through the current member list, plus a
  search box to jump directly to someone by name.
- **Old admin member modal:** removed. The People tab's "View" button
  navigates to the new dedicated admin dashboard page instead.
- **Architecture:** one shared dashboard-rendering function, used by two thin
  host pages (`admin/member-dashboard.html` for admin, revamped
  `admin/my-profile.html` for the member's own view) — not duplicated markup,
  not one page branching on a viewing-someone-else flag.

## Data Model

**`group_memberships`** (new table). `id` (bigint), `group_id` (FK `groups`),
`user_id` (FK `auth.users`, nullable), `name`, `email`, `phone`, `joined_at`
(date), `left_at` (date, nullable — null = currently active), `notes`.

The Groups tab's roster modal switches its data source from `signups` to this
table:
- **Add Member** inserts a row with `joined_at = today`. If the email matches
  an approved `member_profiles` row, `user_id` is set automatically;
  otherwise it stays null (unlinked entries still show in the roster, just
  can't be shown on a dashboard).
- **Remove** sets `left_at = today` instead of deleting the row — this is
  what makes "past groups" history possible.
- The roster view shows only rows where `left_at is null` (current members).

**`growth_track_registrations`** gains two columns: `user_id` (nullable FK,
auto-set from the logged-in session at registration time — public
registration form and admin manual-add both attempt this, admin manual-add
via email match against `member_profiles`) and `attended` (boolean, default
false).

**No migration of existing `signups` data into `group_memberships`.** The two
concepts (public join request vs. official roster membership) have been
conflated in `signups` with no way to distinguish them after the fact.
`group_memberships` starts empty; admins rebuild each group's current roster
by re-adding members through the (now-migrated) Add Member flow. Past/removed
members from before this ships are not recoverable into history.

## RLS

- `group_memberships`: same shape as `groups`/`signups` — admin full access
  via `auth.role() = 'authenticated'`; no public read (roster is
  admin/leader-only, unlike the public-readable `groups` table itself).
- `growth_track_registrations`'s existing policies (public insert, admin all)
  are unchanged by the two new columns.

## Dashboard Content (shared renderer)

One JS function renders these sections into a container, given a member's
`userId`:

1. **Profile header** — name, email, phone, current group
   (`member_profiles.group_id`), tenure, share-with-leader status. Read-only
   when admin is viewing someone else; editable inline on the member's own
   view (existing `my-profile.html` behavior, carried over).
2. **Growth Track Progress** — three rows (About Us / About You / Get
   Involved), each showing Not Registered / Registered (date) / Attended
   (date), sourced from `growth_track_registrations` filtered by `user_id`.
   If multiple registrations exist for a part, prefer an attended one, else
   the most recent registration.
3. **Small Group History** — table from `group_memberships` filtered by
   `user_id`: current group(s) highlighted, past groups showing their date
   range (`joined_at`–`left_at`).
4. **Personality & Gifts** — DISC result and top gifts (existing
   `assessment_attempts` data, same content already shown today).
5. **Recommended Ministries** — existing gift-to-ministry badge list.

**Admin-only additions:** each Growth Track row gets an "Attended" checkbox
editable directly from this view. A slim top bar has Prev/Next arrows and a
search box for cycling between members.

## Pages

**`admin/member-dashboard.html`** (new) — admin-only, `?id=<userId>` in the
URL. Hosts the shared renderer plus the cycle-navigation top bar. The People
tab's "View" button now links here instead of opening a modal; the old modal
markup/JS is removed.

**`admin/my-profile.html`** (revamped) — same shared renderer, no cycle nav,
loads the logged-in user's own `userId`. Existing password-change and
editable-profile sections stay, positioned above or below the dashboard
sections.

## Edge Cases

- Registrations/group-joins made before this ships have no `user_id` and
  won't appear in anyone's history — known limitation of choosing proper
  linkage over fuzzy matching.
- `member_profiles.group_id` (quick-pick current group) and
  `group_memberships` (admin-managed official history) are intentionally
  independent and can drift — not a bug.
- Admin manually adding a Growth Track registrant or group member attempts
  email-match against `member_profiles` to set `user_id`; falls back to null
  (unlinked) if no match.

## Testing

Manual checklist: Add/Remove Member in the Groups tab correctly writes
`joined_at`/`left_at` to `group_memberships`; registering for Growth Track
while logged in stamps `user_id`; admin can toggle Attended and it persists;
admin dashboard page's Prev/Next and search correctly cycle members;
member's own `my-profile.html` shows the same dashboard content read-only
(except their own editable fields) with no cycle controls; RLS verified on
`group_memberships`.

## Rollout

Staging first, manual walkthrough (including rebuilding at least one group's
current roster via the new Add Member flow to confirm the migration path),
then staging → production per the standard flow.
