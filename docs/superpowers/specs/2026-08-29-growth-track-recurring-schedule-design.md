# Growth Track Recurring Schedule Design Spec

## Purpose

Growth Track currently schedules each of its three parts (About Us, About You, Get Involved) as a single fixed calendar date, set once by an admin and manually updated every time it needs to move forward. This replaces that with a recurring rule — each part always runs on the same Sunday-of-month (1st, 2nd, or 3rd) — plus the ability for an admin to cancel a specific occurrence (e.g. skip the 2nd Sunday of a particular month) without disrupting the recurring pattern for every other month.

This is the first of two related sub-projects. The second — historical completion analytics — is deliberately out of scope here; it will be designed and built separately once this scheduling change is in place. The existing registration data model (`growth_track_registrations`, storing `part`, `session_date`, `user_id`, `attended` per registration) is not being restructured by this spec — it already records enough detail to support that follow-up work.

## Confirmed Decisions (from brainstorming)

- Each part has its own fixed Sunday slot, every month — About Us might always be the 1st Sunday, About You the 2nd, Get Involved the 3rd (exact assignment is admin-configurable per part, not hardcoded to that specific mapping).
- Every month has a 1st, 2nd, and 3rd Sunday, so this calculation never fails to produce a date.
- Cancelling a specific Sunday keeps it visible on the public page, shown as "Cancelled" rather than disappearing.
- The public page shows each part's next 3 upcoming (non-past) occurrences, not just the soonest one — so a single cancelled date doesn't leave a part with nothing to register for.

## Data Model

### `growth_track_parts` — replace fixed date with a recurrence rule

- Add `sunday_of_month smallint` (values `1`, `2`, or `3`) — which Sunday of every month this part runs on.
- The existing `session_date date` column is left in place but no longer read or written by any code path this spec touches — it becomes dead data going forward (not deleted, to avoid a destructive migration; simply superseded). A future cleanup could drop it once confidence in the new model is established, but that's explicitly out of scope here.
- `session_time` and `location` are unchanged — same time/location every month for a given part.

### New table: `growth_track_cancellations` — per-occurrence overrides

```
id           bigint identity primary key
part         text not null           -- 'about_us' | 'about_you' | 'get_involved'
session_date date not null
created_at   timestamptz not null default now()
unique (part, session_date)
```

- RLS: public can read (the public page needs to know which dates are cancelled to render them correctly), admin-only write — mirroring the existing `growth_track_parts` policy pattern (`using (auth.role() = 'authenticated')` for writes, unrestricted `select` for reads).
- The unique constraint on `(part, session_date)` prevents duplicate cancellation rows for the same occurrence and lets "cancel" be a simple insert and "reinstate" be a simple delete, keyed on that pair.

## Occurrence Calculation

A shared helper (used by both the public page and the admin tab) computes, for a given `(part, sundayOfMonth)`:

1. The actual calendar date of the Nth Sunday of a given `(year, month)`.
2. Starting from the current month, walk forward month by month, computing that month's Nth Sunday, skipping any that fall before today, until 3 non-past occurrences are collected.
3. For each of those 3 dates, check whether it appears in `growth_track_cancellations` for that part — if so, mark it cancelled.

This calculation is pure date arithmetic (no network calls) once the cancellations list has been fetched, so it can run entirely client-side after one fetch of `growth_track_parts` + `growth_track_cancellations`.

## Public Page (`growth-track.html`)

- Each published part's card now lists its next 3 occurrences (date, formatted like the existing `fmtDate` helper already does) instead of a single date line.
- A non-cancelled occurrence gets a "Register" button, which opens the existing registration modal pre-filled for that specific date (the modal and submission flow — `submitGrowthTrackRegistration`, storing `part` + `sessionDate` + `sessionTime` — are unchanged; only which date gets passed in changes, since there are now up to 3 choices per part instead of exactly 1).
- A cancelled occurrence renders as a greyed-out "Cancelled" label in place of the Register button — not clickable, not hidden.
- A part with `sunday_of_month` unset (e.g. a legacy row from before this migration, or a genuinely not-yet-configured part) shows no occurrences and no Register buttons — same graceful-empty behavior as the existing "no parts published" empty state, just scoped to one part instead of the whole page.

## Admin (Growth Track tab, `admin/dashboard.html`)

### Part edit modal

The existing `<input type="date" id="gtpDate" />` field is replaced with a "Which Sunday" `<select id="gtpSundayOfMonth">` with three options: 1st Sunday, 2nd Sunday, 3rd Sunday. `session_time` and `location` fields are unchanged. Saving writes `sunday_of_month` instead of `session_date`.

### New "Upcoming Occurrences" section

For each published part, list its next 6 occurrences (reusing the same occurrence-calculation helper described above, extended further out than the public page's 3, so admins can plan cancellations ahead of time) with a toggle button per date: "Cancel" for a currently-active date, "Reinstate" for a currently-cancelled one. This mirrors the existing list-style admin UI pattern already used for Semesters and Save the Dates (a simple list of rows, each with an action button, no full-page reload needed to toggle one).

## Error Handling

- If `growth_track_cancellations` fails to load (network error), the public page and admin section both fail open — treat as "nothing is cancelled" rather than blocking the whole Growth Track page from rendering, consistent with this codebase's established fail-safe pattern for secondary data (e.g. how `getCurrentSemester()` and `getSaveDates()` already degrade gracefully on error).
- Cancelling an occurrence that's already cancelled (e.g. a double-click race) is a harmless no-op given the `unique (part, session_date)` constraint — the insert either succeeds once or fails with a constraint violation that the UI treats the same as "already cancelled, nothing to do."

## Out of Scope (YAGNI)

- No historical completion analytics/dashboard — that's the explicitly separate second sub-project.
- No migration/backfill of the old `session_date` column into the new model — admins will set each part's `sunday_of_month` once, manually, after this ships (there are only 3 parts).
- No per-occurrence override of time/location (e.g. "this specific Sunday starts at a different time") — every occurrence of a part uses that part's single `session_time`/`location`; only whether an occurrence happens at all is overridable.
- No UI to change how many upcoming occurrences are computed/shown beyond the fixed values chosen here (3 on the public page, further out in the admin list) — not admin-configurable.
- No changes to `growth_track_registrations` itself, to `submitGrowthTrackRegistration`'s signature, or to how attendance is marked — this spec only changes which dates are offered for registration, not how registration or attendance tracking work.
