# Small Group Semesters Design Spec

## Purpose

Small groups run on a semester cycle (Spring, Summer, Fall). Currently the `groups` table has no concept of semester at all — every group looks "ongoing" regardless of whether it's actually still running. This adds a semester field to each group and a way to filter down to just the groups running in the current semester, on both the public site and the admin dashboard.

## Semester Facts (from stakeholder)

- Three semesters per year: **Spring**, **Summer**, **Fall**.
- Spring starts the first week of February, runs 13 weeks.
- Summer starts in June, runs 6 weeks.
- Fall starts in September, runs 13 weeks.
- Exact start/end dates vary slightly year to year (e.g. "first week of February" isn't always Feb 1) — this is why semester dates are stored as **admin-editable data**, not hardcoded calendar math. The admin enters each semester's actual start and end date once per semester.

## Data Model

### Storage: reuse the `site_settings` key/value pattern

No new database table. A new `site_settings` row:

- `key = 'semesters'`
- `value` = JSON array of semester objects: `[{ id, name, startDate, endDate }, ...]`
  - `id`: a stable string, generated client-side when a semester is created — unlike Save the Dates (whose list items are addressed only by array index, since nothing else references them), semesters must have a stable id because `groups.semester_id` refers to it and array-index addressing would break if the list is ever reordered or an earlier semester deleted. Generated as a slug of the name (lowercase, spaces to hyphens) plus a short random suffix for uniqueness, e.g. `"spring-2026-a1b2"`.
  - `name`: display name, e.g. `"Spring 2026"`
  - `startDate` / `endDate`: `YYYY-MM-DD` strings
- No RLS changes needed — `site_settings` already has "Public can read site settings" (anyone) and "Admin full access to site settings" (`auth.role() = 'authenticated'`), which is exactly the access pattern needed here (public site reads the list to compute "current"; only admins add/edit/delete semesters).

This exactly mirrors the existing "Save the Dates" feature (`site_settings` key `'save_the_dates'`, `SupaDB.getSaveDates()`/`saveSaveDates()`, admin list UI in the Settings tab) — same storage shape, same CRUD pattern, same admin list-editing UI style. New methods: `SupaDB.getSemesters()` / `SupaDB.saveSemesters(list)`.

### Groups table: new nullable column

`groups.semester_id text null` — references a semester's `id` string (not a SQL foreign key, since semesters aren't a real table; validity is enforced only by the admin UI only ever writing ids that exist in the current semester list). `null` means "not tied to a semester" — a valid, supported state for groups that run year-round outside the semester cycle.

`groupFromDb`/`groupToDb` in `js/db.js` map this as `semesterId` (camelCase, consistent with every other field in that mapper).

### Current-semester logic: one shared helper

`SupaDB.getCurrentSemester()` in `js/db.js`:
1. Fetches the semester list via the same underlying read as `getSemesters()`.
2. Finds the semester whose `startDate <= today <= endDate` (using local calendar dates, not timestamps — a semester is "current" for its entire start day through its entire end day).
3. If none matches (a gap week between semesters), returns whichever semester has the soonest-upcoming `startDate` that is still `>= today`.
4. If the list is empty, or every semester's `endDate` is in the past with none upcoming, returns `null`.

Both the admin dashboard and the public `small-groups.html` page call this same method — since there's no shared JS module between admin and public pages other than `js/db.js` (loaded by both), this is the one correct place for the logic to live once instead of being duplicated.

## UI Changes

### Admin — Settings tab: new "Semesters" card

A new card in `#panelSettings`, placed near the existing "Save the Dates" card, following its exact UI pattern: a list of current semesters (name + start date + end date shown per row), each with Edit/Delete controls, plus an "Add Semester" control that reveals a small inline form (name, start date, end date) — same interaction shape as `saveDatesList`/`addSaveDate`/`editSaveDate`/`deleteSaveDate` in the existing code, adapted for three fields instead of Save-the-Dates' fields.

### Admin — Group edit modal: new Semester field

A new `<select id="grSemester">` in the group edit modal (`#groupModal`), populated from `SupaDB.getSemesters()` when the modal opens, with a first option `"— No Semester —"` (value empty, maps to `null`) followed by one `<option>` per semester. `saveGroup()` reads this value into the `semesterId` field sent to `SupaDB`.

### Admin — Groups tab table: new column + filter

- New "Semester" column in the groups table (`admin/dashboard.html` `#panelGroups`), showing the group's semester name or `"—"` if unassigned.
- New Semester filter `<select>` in the Groups tab's action bar, options: `"All Semesters"` (default), `"Current Semester"`, then one option per named semester (sorted newest-first by start date). Filtering client-side against the already-loaded groups list, same as the existing signup/status filters elsewhere in the dashboard.

### Public — small-groups.html: new filter

Same Semester `<select>` (All Semesters / Current Semester / named semesters) added to the existing `.filter-bar` alongside Day/Type/Audience, wired into the existing `filterGroups()` client-side filter function the same way the other three selects are.

## Error Handling

- `SupaDB.getSemesters()` and `getCurrentSemester()` return `[]` / `null` respectively on any DB error or missing row (fail to "no semester data" rather than throwing), matching the existing `getSaveDates()`/`getBannerSettings()` fail-safe pattern in this file.
- `SupaDB.saveSemesters()` returns `{ error }` on failure, `{ ok: true }` on success, matching `saveSaveDates()`.
- If an admin deletes a semester that groups still reference by `semester_id`, those groups keep the now-orphaned id and their Semester column/filter simply won't match any current semester name (falls back to behaving like "no semester assigned" for filtering and display purposes — no error, no orphan-cleanup logic needed for this feature).

## Out of Scope (YAGNI)

- No automatic semester creation/rollover — the admin manually adds each new semester's dates once per semester (3x/year), matching how "Save the Dates" already requires manual entry.
- No enforcement preventing overlapping or gapped semester date ranges — the admin is trusted to enter sensible dates, same trust level as every other admin-editable date field in this codebase.
- No per-group semester history/archive — a group either has a `semester_id` or doesn't; there's no tracking of which semesters a group has belonged to over time.
- No changes to how groups are created/deleted when a semester ends — that remains a manual admin action, unaffected by this feature.
