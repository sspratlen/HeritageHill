# NFC Tag Section Management Design Spec

## Purpose

The chair-tag dynamic redirect system (`admin/tap-control.html`) currently only supports a single hardcoded section ("Main Auditorium"). Let an admin add, rename, and delete sections directly from that page, so a second physical area (an overflow room, a youth room, a lobby table, etc.) can get its own independently-controlled NFC tags without any code changes — matching what the original chair-tag design already anticipated ("more sections addable later by adding a database row and writing a new batch of tags") but never built a UI for.

## Scope

- Add Section, Rename, and Delete, all from `admin/tap-control.html`.
- No schema or RLS changes — `tap_sections`' existing `"Admins manage tap sections"` policy (`for all using (is_admin())`) already permits all three operations; this spec only adds the client methods and UI that exercise it.

**Out of scope:**
- Bulk import of sections.
- Any change to the saved-links list (`tap_links`), which is already shared across all sections and needs no per-section management.
- Any change to the `tap-redirect` Edge Function — it already resolves purely by `section` slug, so a newly added section works immediately once its row exists, no redeploy needed.

## Slug Immutability

A section's `slug` (e.g. `main-auditorium`) is the exact value physically written onto an NFC tag's URL (`...tap-redirect?section=<slug>`). **The slug is set once at creation and can never be changed afterward** — only the display `name` can be renamed. This is a deliberate, permanent constraint (not just a soft UI convention) because there is no way to know or update a tag that's already been physically written; allowing slug changes would silently break real hardware in the building with no way to detect it. The UI never exposes an "edit slug" control after a section is first created.

## Data Model

No schema changes. `tap_sections` already has exactly the columns needed (`id`, `slug`, `name`, `created_at`). Deleting a section already cascades correctly with no new cleanup logic required: `tap_current.section_id` and `tap_events.section_id` both reference `tap_sections(id) on delete cascade`, so removing a section also removes its current-destination pointer and its tap history — this spec's delete confirmation dialog must say so explicitly, since it's a real, permanent data loss, not just hiding the section.

## Backend (`js/db.js`)

Three new methods, following this file's existing `adminSaveTapLink`/`adminDeleteTapLink` conventions:

- `adminAddTapSection({ slug, name })` — inserts a new `tap_sections` row. Returns `{ id, slug, name }` on success or `{ error }` (the DB's `slug` unique constraint is the source of truth for collision handling — a duplicate slug surfaces as a normal error string via the existing `{ error: error.message }` pattern, no client-side pre-check needed).
- `adminRenameTapSection(id, name)` — updates only the `name` column for a given section id. Never touches `slug`.
- `adminDeleteTapSection(id)` — deletes the `tap_sections` row (cascading to `tap_current`/`tap_events` as described above).

## Admin UI (`admin/tap-control.html`)

**Section switcher**: the current static "Section" label + name display is replaced with a `<select>` populated from `getTapSections()` (already fetched today), showing every section by name. Changing the selection reloads that section's current destination, tap stats, and tag URL box — the saved-links list doesn't need reloading, since it's already shared across sections.

**Add Section**: a "+ Add Section" button opens an inline form (matching the page's existing "Manage saved links" collapsible-form pattern) with a Name field. As the admin types, a live-generated slug preview appears below it (lowercase, spaces/punctuation collapsed to hyphens — the same slugification a reader would expect, e.g. "Overflow Room" → `overflow-room`), which the admin can edit before saving, since this is their one chance to control exactly what gets written onto the physical tag. Saving calls `adminAddTapSection`, refreshes the section list, and switches the dropdown to the newly created section.

**Rename**: a "Rename" button next to the dropdown prompts for a new name for the *currently selected* section (pre-filled with its current name), calls `adminRenameTapSection`, and updates the dropdown option's label in place — no slug field shown or editable here at all.

**Delete**: a "Delete" button removes the currently selected section, behind a confirmation dialog that explicitly states this also erases that section's current-destination setting and its tap history, and cannot be undone. After deletion, the switcher moves to the first remaining section; if none remain, the page shows the existing "no sections configured" empty state it already has for a fresh, unmigrated database.

## Error Handling

- Duplicate slug on Add (two sections generating the same slug, e.g. two rooms both named "Overflow"): the insert's error message is shown via the existing toast pattern; the admin can just edit the slug preview before retrying.
- Renaming or deleting a section that's somehow already gone (e.g. deleted in another tab): the update/delete affects zero rows silently at the DB level — after either action the UI re-fetches the section list from `getTapSections()` rather than trusting local state, so a stale reference self-corrects on the next render instead of showing a phantom section.
- Deleting the currently-active section while its tag is mid-use isn't specially guarded against — the section simply stops existing, and any tap against its now-gone slug falls through the `tap-redirect` function's existing "unknown section → homepage" fallback path, exactly like any other invalid `section` parameter today.

## Testing Plan

- Manual: add a new section with a normal name, confirm the slug preview looks right, save, confirm it appears in the dropdown and its tag URL box shows the right slug.
- Manual: add a second section whose name would generate the same slug as an existing one, confirm the duplicate-slug error surfaces and the admin can adjust the slug field and retry successfully.
- Manual: rename a section, confirm the dropdown label updates and the slug (and therefore the copyable tag URL) is unchanged.
- Manual: set a current destination and generate some tap history for a test section, delete it, confirm it's gone from the dropdown and a fresh `tap_current`/`tap_events` query for that section id returns nothing.
- Manual: delete every section, confirm the page correctly falls back to its existing "no sections configured" empty state rather than erroring.

## Out of Scope (YAGNI)

- No per-section access control (all admins can manage all sections, matching every other admin-only tap control capability already built).
- No way to reorder sections in the dropdown (alphabetical-by-name via the existing `getTapSections()` query order is sufficient).
- No warning/lookup for "is this slug already printed on a tag" beyond the DB's own uniqueness check — there's no way to know that from software anyway.
