# Auto-Assign Current Semester to Sign-Ups & Applications Design Spec

## Purpose

Small groups already carry a `semester_id` (built in the "Small Group Semesters" feature). Small-group sign-up requests and leader applications — both submitted through public forms — currently have no semester association at all, making it impossible to tell which semester's activity a given request belongs to. This adds automatic semester tagging to both, using the same "current semester" logic already built.

## Data Model

### New columns

- `signups.semester_id text null`
- `applications.semester_id text null`

Both follow the exact pattern already established by `groups.semester_id`: an informal reference to a semester's `id` string (stored in the `site_settings` `'semesters'` JSON array), not a SQL foreign key — since semesters aren't a real table. `null` is valid and means "submitted with no semester context" (e.g. historical records from before this feature existed).

### Mapping functions (`js/db.js`)

- `signupFromDb`/`signupToDb` gain `semesterId` / `semester_id`, mirroring how `groupFromDb`/`groupToDb` already handle `semesterId`.
- `applicationFromDb`/`applicationToDb` gain the same.

## Auto-Assignment Logic

`SupaDB.submitSignup(signup)` and `SupaDB.submitApplication(app)` — the two existing methods the public forms already call — are each updated to fetch the current semester via the existing `SupaDB.getCurrentSemester()` (built in the semesters feature: returns the semester whose date range contains today, or the soonest upcoming one if today falls in a gap between semesters, or `null` if no semesters are configured) and attach its `id` to the record before inserting.

This is the only place the logic needs to live — `small-groups.html`'s join-a-group form and `lead-a-group.html`'s leader application form both already call these two methods and need no changes themselves. Centralizing it here also means any other future caller of these methods gets correct semester tagging automatically, with no risk of a caller forgetting to set it.

If `getCurrentSemester()` returns `null` (no semesters configured, or an edge case with no upcoming semester), the record is simply inserted with `semester_id: null` — submission is never blocked or degraded by missing semester data.

## Admin UI

### Sign-Up Requests tab (`#panelSignups`)

- New "Semester" column in the table (positioned consistently with how the Groups tab shows its Semester column — after the existing data columns, before Status), showing the semester's name or `—` if `semesterId` is `null` or doesn't match any current semester (e.g. a semester that was later deleted from the list).
- New Semester filter `<select>` added to the existing `.signup-filter-bar`, alongside the current Group and Status filters: options are "All Semesters" (default), "Current Semester", then each named semester (sorted newest-first by start date) — matching the exact filter pattern already built for the Groups tab.

### Leader Applications tab (`#panelApplications`)

- New "Semester" column in the table, same display rule as above.
- New Semester filter `<select>` added to the action bar, next to the existing Status filter — same three-tier option structure (All / Current Semester / named semesters).

## Error Handling

- `getCurrentSemester()` already fails safe (returns `null` on any DB error or missing/empty semester list) — `submitSignup`/`submitApplication` don't need additional error handling beyond what they already have; a `null` semester is simply stored as `null`, same as the "no semesters configured" case.
- Fetching the semester list adds one extra read before each submission's insert. If that read fails for any reason, the calling code treats it as "no current semester" (consistent with `getCurrentSemester()`'s existing fail-safe contract) rather than aborting the whole submission — a prospective member's sign-up or a leader's application must never be lost because of a semester-lookup hiccup.

## Out of Scope (YAGNI)

- No backfill of `semester_id` on existing sign-up/application rows — they remain `null` and display as `—`, exactly like groups that predate the semester feature.
- No change to the sign-up or application submission forms themselves, or to their success/confirmation messaging — semester assignment is invisible to the person submitting.
- No semester-based reporting, export, or analytics beyond the filter/column described above.
