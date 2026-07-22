# Growth Track Module — Design

**Date:** 2026-07-22
**Status:** Approved by Scott (pending final spec review)

## Purpose

Add a "Growth Track" program to the Heritage Hill website: a public page presenting
the three-part program (About Us / About You / Get Involved), each part with its
own editable date/time/location/description, with public per-part registration.
Admin side: publish/unpublish each part, edit its details, view/manually-add
registrants.

## Decisions Made (with user)

- **Registration granularity:** per-part, independently — a visitor can register
  for one, two, or all three parts, each with its own Register action.
- **Auth requirement:** none — public RSVP-style form (name/email/phone/notes).
  If the visitor has an active session, the form pre-fills from their
  `member_profiles` row (falls back to just their auth email if no profile row
  exists yet); they can still edit before submitting.
- **Session reuse:** each part is exactly one row, reused and rescheduled after
  it occurs — not a growing list of dated events.
- **Reschedule behavior:** changing a part's date/time does not delete existing
  registrations. Each registration stores a snapshot of the date/time it was
  made for. The admin roster view for a part shows only registrations whose
  snapshot matches the part's *current* date/time — so rescheduling naturally
  clears the visible roster while every prior registration remains in the
  database, queryable later (e.g., via direct SQL or a pre-reschedule CSV
  export). No dedicated "past sessions" browsing UI in this phase.
- **Visual pattern:** cards matching `small-groups.html`'s `.card.group-card`
  styling; admin management matching the Groups tab's card+modal conventions.
- **Content source:** book context (Church of the Highlands' three steps —
  Become a Member / Discover Your Design / Join the Team) confirms the
  three-part structure; Heritage Hill uses its own names (About Us / About You
  / Get Involved) and will supply its own description text (not committed to
  git, same content-licensing approach as the assessments module).

## Data Model

**`growth_track_parts`** — exactly 3 rows, seeded once, never inserted/deleted
via the app (only edited). `id` (bigint), `part` (`about_us`/`about_you`/
`get_involved`, unique), `title`, `description` (long text), `session_date`,
`session_time`, `location`, `published` (bool, default false).

**`growth_track_registrations`** — one row per signup. `id`, `part` (which of
the 3), `session_date`/`session_time` (snapshot of the part's date/time at
registration — this is what makes current-roster-vs-history work), `name`,
`email`, `phone`, `notes`, `added_by_admin` (bool, default false — true for
admin manual adds), `created_at`.

**Roster query:** "current registrants" for a part = registrations where
`session_date` equals that part's live `growth_track_parts.session_date`.
Same pattern as the existing `group_attendance` snapshot/window logic.

## Security (RLS)

- `growth_track_parts`: public (including anonymous) can SELECT where
  `published = true`; admin has full access — same shape as the `groups`
  table's existing policies.
- `growth_track_registrations`: anyone (including anonymous) can INSERT;
  SELECT/UPDATE/DELETE admin-only — same shape as `signups`/`rsvps`.

## Pages

**`growth-track.html`** (new public page) — three cards (only published parts
shown; empty-state message if none are published), each with title, full
description, date/time/location, and a "Register" button opening a modal
(styled like the existing "Join Group" modal) with name/email/phone/notes.
Pre-fills from the visitor's session if logged in. Submission inserts one
`growth_track_registrations` row with a snapshot of that part's current
date/time. A "Growth Track" nav link is added to all 8 public pages.

**`admin/dashboard.html`** gains a new "Growth Track" tab (admin-only): three
fixed part-cards, each showing current date/time/location, a published
toggle, an "Edit" button (modal: title/description/date/time/location/
published), and a "Registrants" button opening a roster modal — table of
current registrants with a manual "Add Registrant" form at the top (tags the
row `added_by_admin = true`), per-row delete, and CSV export.

## Edge Cases

- Unpublished parts are omitted from the public card grid; all-unpublished
  shows an empty-state message.
- No capacity/seat limits (registration is open-ended) — out of scope for
  this build, easy follow-up if ever needed.
- No duplicate-registration blocking (no unique constraint); admin can see
  and manually remove duplicates from the roster.
- Auto-prefill is best-effort: no session or no profile row → form opens
  blank, no error surfaced.

## Testing

Manual checklist: publish/unpublish toggles card visibility; editing a part's
date clears its live roster view while prior rows remain in the table
(verified via direct query); anonymous registration inserts correctly;
registering while logged in pre-fills from `member_profiles`; admin manual-add
tags the row correctly; CSV export; RLS verified both directions (anonymous
can insert registrations and read published parts only; cannot read/edit/
delete registrations or read unpublished parts).

## Rollout

Staging first, manual walkthrough, then staging → production per the
standard flow.
