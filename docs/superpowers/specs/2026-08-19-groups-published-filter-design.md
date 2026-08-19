# Filter Draft Small Groups Design Spec

## Purpose

The admin "Manage Small Groups" tab already shows a Published/Draft badge per group, but there's no way to filter the table down to just one status. Admins reviewing drafts before publishing, or checking what's currently live, have to scan the whole list. This adds a status filter alongside the existing Semester filter.

## Scope

Only the main Groups tab table (`admin/dashboard.html`, `#panelGroups`). No other admin screen that lists groups (e.g. the "Filter by Group" dropdown on Sign-Up Requests) is changed — confirmed with the user as out of scope for this request.

## UI

A new `<select>` filter added to `#panelGroups`'s action-bar, immediately next to the existing `groupSemesterFilter` dropdown, following its exact visual style:

- `All Statuses` (value `""`, default)
- `Published Only` (value `"published"`)
- `Draft Only` (value `"draft"`)

Static options, unlike the Semester filter — published/draft is a fixed two-state field on `groups.published`, not admin-editable data requiring dynamic population.

## Filtering Logic

`renderGroupsTable()` (`admin/dashboard.html`) already loads `_cachedGroups` (which includes each group's `published` boolean) and applies the existing semester-filter logic to a local `groups` array before rendering. This adds one more filter step to that same array, using the new dropdown's value:

- `"published"` → keep only groups where `g.published` is `true`
- `"draft"` → keep only groups where `g.published` is `false`
- `""` (All Statuses) → no filtering, unchanged

No new data fetch is needed — `published` is already present on every cached group record.

## Interaction with Existing Filters

The new status filter and the existing Semester filter both narrow the same `groups` array independently and can be combined freely (e.g. "Draft Only" + "Fall 2026" shows only draft groups assigned to Fall 2026). This matches how the Semester filter itself doesn't interact specially with anything else on the tab — filters simply stack.

## Error Handling

None needed beyond what already exists — this is a synchronous client-side filter over already-loaded data, with no new network calls, no new failure modes, and a safe default (`""` / All Statuses) if the dropdown element is ever missing (matching the existing `semSelEl ? semSelEl.value : ''` defensive pattern already used for the Semester filter).

## Out of Scope (YAGNI)

- No changes to any other admin screen or dropdown that lists groups (Sign-Up Requests' group filter, Members/People tab, etc.) — scoped to the Groups tab table only, per the user's explicit answer.
- No change to the existing Published/Draft badge display itself, or to how a group's `published` value is set (still via the existing toggle in the group edit modal).
- No persistence of the selected filter across page reloads or tab switches — resets to "All Statuses" each time the tab is opened, matching how the existing Status filters on other tabs (e.g. Leader Applications) already behave.
