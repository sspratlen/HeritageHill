# Printable Small Group Sign-Up Sheet Design Spec

## Purpose

Give admins a professional-looking, printable blank sign-up sheet for each small group — for use at an in-person table or kiosk (e.g. a connection fair, Sunday morning table) where visitors write down their info by hand rather than using the digital "Join Group" form. The sheet needs to look intentional, not like a plain photocopy: it carries the group's photo and description at the top, matching how the group is presented on the public site.

## Reused Pattern

This codebase already has an established "print a document from admin data" feature: `printPrayerRequests()` (`admin/dashboard.html`). It opens a new browser window/tab via `window.open('', '_blank')`, writes a complete self-contained HTML document into it via `win.document.write(...)` — including its own `<style>` block with `@page { size:letter portrait; margin:.3in; }` for clean paper sizing — and auto-triggers `window.print()` on load via a small inline script. This spec reuses that exact pattern for a new `printGroupSignupSheet(groupId)` function; no new page file, no shared print module — self-contained, matching the existing convention.

## Trigger

A new "🖨️ Print Sign-Up Sheet" button added to each group's row in the admin "Manage Small Groups" tab, alongside the existing Edit / 📣 Media / 📅 Calendar / 🔗 Copy Link / Delete buttons, following their exact visual style (ghost button, small).

## Sheet Content

Single page (one group per print action — no batching/multi-select, unlike the prayer-requests feature which supports printing several at once):

1. **Church name header** — small, uppercase, gold-accent label reading "Heritage Hill Church", matching the existing `.church-name`/`.card-header` styling already defined for prayer-request print cards (same font stack, same gold border-bottom accent).
2. **Group photo** — the group's `image` field, if present, shown as a prominent image near the top (a group with no image, or the default placeholder image already used elsewhere in this codebase for groups without a custom photo, still renders — no special "no image" case needed since every group already has *some* image value, per the existing `groupToDb`/admin group form behavior).
3. **Group name** — large heading.
4. **Meta line** — Leader name, Day + Time, and Location, on one readable line/block beneath the name.
5. **Description** — the group's full description text.
6. **Sign-up table** — a ruled table with three columns, **Name / Email / Phone**, and enough blank rows to comfortably fill the remainder of a standard 8.5×11 page below the header content (approximately 15–20 rows, single column of rows — not a two-column layout).

## Data Source

The admin dashboard already caches the full group list in `_cachedGroups` (populated by `renderGroupsTable()`, which is already loaded whenever the Groups tab is open — the same tab this new button lives on). `printGroupSignupSheet(groupId)` looks up the group from that existing cache — no new network request needed.

## Error Handling

- If the group can't be found in `_cachedGroups` for the given id (shouldn't normally happen, since the button is only ever rendered for a real cached group), the function does nothing rather than opening a broken/blank print window.
- All group fields interpolated into the generated HTML (name, leader, day, time, location, description) are HTML-escaped before insertion, using the same escaping approach as `printPrayerRequests()`'s existing `esc()` helper — group data ultimately originates from admin input, but this print output is still built via string concatenation into a `document.write()`, so the same defensive escaping already used for the identical pattern applies here too.

## Out of Scope (YAGNI)

- No multi-group / batch printing (e.g. "print sign-up sheets for all published groups at once") — one button per group, one sheet per click, matching the request.
- No PDF generation or download — this relies entirely on the browser's native print dialog (which already supports "Save as PDF" as a print destination on every modern browser/OS), matching how `printPrayerRequests()` already works.
- No customization of which columns appear in the sign-up table (e.g. no per-group toggle for "also collect address") — fixed to Name / Email / Phone.
- No pre-filling of the blank rows with existing sign-up data — this is intentionally a *blank* form for new in-person sign-ups, not a roster of people who already signed up online (confirmed with the user during brainstorming).
