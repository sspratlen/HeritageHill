# Membership Tab Sorting & Filtering Design Spec

## Purpose

The admin dashboard's Membership tab (`admin/dashboard.html`, `#panelPeople`) already has a live free-text search box (`#pplSearch` → `applyPeopleFilter()`) that filters approved members by name or email substring, and a fixed sort order (newest `member_since` first, hardcoded in `applyPeopleFilter()`). This spec broadens the search to match more fields, and adds a real sort control so admins aren't stuck with one fixed ordering.

## Scope

- Broaden `applyPeopleFilter()`'s matching to also check small group name, phone number, and years-attending, not just name/email.
- Add a "Sort by" dropdown next to the search box with two options: **Name (A–Z)** and **Name (Z–A)**. This replaces the current hardcoded "member since, newest first" ordering — Name (A–Z) becomes the new default.

**Out of scope:**
- Filtering by small group, date range, or years-attending as separate structured controls (the group name still becomes searchable text via the broadened free-text match, just not a dedicated filter UI).
- Sorting by Member Since or Small Group (explicitly not requested — Name A–Z/Z-A only).
- Clickable/sortable table column headers (a dropdown was chosen instead, matching the existing pattern already used by the Impact Teams tab's `#teamPublishedFilter` select in this same file).
- Any change to the Pending Approval list above the table, which is unrelated to this filter/sort control.

## Current Behavior (for reference)

```javascript
function applyPeopleFilter() {
  const q = document.getElementById('pplSearch').value.toLowerCase();
  let rows = _pplProfiles.filter(p => p.status === 'approved');
  if (q) rows = rows.filter(p => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  // Newest members first -- this tab is about membership, so that's the
  // one ordering that's actually meaningful here.
  rows = rows.slice().sort((a, b) => (b.memberSince || '').localeCompare(a.memberSince || ''));
  document.getElementById('peopleTableWrap').innerHTML = membershipTable(rows);
}
```

`_pplProfiles` rows (from `memberProfileFromDb` in `js/db.js`) carry: `userId, name, email, phone, groupId, yearsAttending, status, shareWithLeader, createdAt, avatarUrl, personId, memberSince`. Group *name* isn't on the row directly — it's resolved via the existing `groupName(id)` helper (looks up `window._pplGroups`, set in `renderPeoplePanel()`), so the broadened search needs to call that helper per row to get a matchable string.

## New Behavior

### Broadened search matching

For a given profile `p` and lowercase query `q`, a row matches if `q` is a substring of any of:
- `p.name`
- `p.email`
- `p.phone`
- `p.yearsAttending`
- `groupName(p.groupId)` (resolves to `'—'` when ungrouped, which is fine — a query like `-` would just rarely match anything meaningful, no special-casing needed)

All comparisons lowercase both sides, matching the existing convention.

### Sort control

A new `<select id="pplSort" onchange="applyPeopleFilter()">` placed in the existing filter row (`admin/dashboard.html`, the `<div style="display:flex;gap:10px;...">` that currently holds only `#pplSearch`), with two `<option>`s:
- `name-asc` — **Name (A–Z)** (default/first option)
- `name-desc` — **Name (Z–A)**

`applyPeopleFilter()` reads this value and sorts accordingly using `localeCompare` on `name`, replacing the current hardcoded `memberSince` sort entirely.

## Admin UI

Visually, the sort dropdown sits to the right of the search input in the same flex row, styled consistently with the existing `#teamPublishedFilter` select in the Impact Teams tab (same padding/border/border-radius/font values), so it looks native to this codebase rather than introducing a new control style.

## Error Handling

None needed — this is pure client-side array filtering/sorting over already-loaded data (`_pplProfiles`, `window._pplGroups`), with no new network calls, no new failure modes.

## Testing Plan

- Manual: type a small group's name into the search box, confirm only members of that group appear.
- Manual: type a phone number fragment, confirm the matching member appears.
- Manual: type a years-attending value, confirm matching members appear.
- Manual: switch the sort dropdown between Name (A–Z) and Name (Z–A), confirm the table re-orders correctly each way.
- Manual: confirm search and sort compose correctly together (e.g. a filtered subset is still sorted per the selected option).
- Manual: confirm the Pending Approval section above the table is unaffected by either control.

## Out of Scope (YAGNI)

- No dedicated small-group filter dropdown, date-range filter, or years-attending filter control.
- No Member Since or Small Group sort options.
- No sortable column headers.
- No server-side/query-level filtering or sorting — the member list is already fully loaded client-side, so array operations are sufficient.
