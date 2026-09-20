# Weekly Offerings Tracking Design Spec

## Purpose

The weekly `attendance` table already tracks worship headcount and (auto-computed) small group headcount per service date, entered via admin/dashboard.html's "Add Weekly Entry" card and visualized on the standalone Attendance Analytics page (`admin/attendance-dashboard.html`). This spec adds a third weekly figure — offerings (giving) — to the same entry flow and the same analytics page, alongside the existing attendance numbers.

## Scope

- One new nullable column on the existing `attendance` table: `offerings numeric`.
- Add an Offerings input to the existing "Add Weekly Entry" card and its edit modal in `admin/dashboard.html`, plus a column in that tab's own table.
- Add offerings to the Attendance Analytics page (`admin/attendance-dashboard.html`): its own chart card (different scale than headcounts), two new stat cards, a column in the Recent Entries table, and inclusion in CSV export.

**Out of scope:**
- No new offerings-specific table, no per-fund/per-campaign breakdown — this is a single weekly total, exactly as informal as the existing worship headcount field.
- No engagement-rate-style derived metric for offerings (the existing "SG Rate" chart is specific to small-group engagement vs. worship attendance; offerings has no analogous ratio requested).
- No change to how `small_group_count` is computed/persisted — untouched.

## Data Model

```sql
alter table public.attendance add column offerings numeric;
```

Nullable, no default — matches `worship_count`'s own nullability (a week can be entered with worship count but no offerings figure yet, or vice versa, exactly like today's worship/notes optionality). `numeric` (not `integer`) since offering totals are dollar amounts and may include cents.

## Backend (`js/db.js`)

`adminGetAllAttendance()`, `adminAddAttendance()`, and `adminUpdateAttendance()` all gain an `offerings` field, following the exact same pattern already used for `worshipCount`/`smallGroupCount`/`notes` (camelCase in the JS return shape, `offerings` column name matches already so no snake_case mapping needed beyond the existing `r.offerings` passthrough).

## Admin UI (`admin/dashboard.html`, Attendance tab)

- **"Add Weekly Entry" card**: a new "Offerings" field (`<input type="number" step="0.01" min="0">`, dollar-formatted placeholder like "e.g. 4250.00") added to the existing Date/Worship/Notes row.
- **Edit modal** (`#attEditModal`): same new field added.
- **Tab's own table**: a new "Offerings" column between "Small Groups" and "Notes", dollar-formatted (`$4,250`).

## Analytics Page (`admin/attendance-dashboard.html`)

- **Two new stat cards**, inserted after the existing "Avg Small Groups (4-wk)" card and before "SG Engagement Rate" (keeping the Worship/SG/Offerings groupings visually adjacent to their own kind): **"Latest Offerings"** and **"Avg Offerings (4-wk)"**, dollar-formatted, following the exact same latest/4-week-average computation pattern already used for worship and small groups.
- **New chart card**: "Offerings Over Time", its own `chart-card`/`canvas`, a bar chart (offerings are a single weekly total, not better served by a line's implied continuity the way attendance trends are — though this is a minor stylistic choice, not a hard requirement) with a dollar-formatted y-axis (`$` prefix, thousands separators) — kept as a separate chart rather than a third line on the existing trend chart specifically because a dollar-scale series plotted against headcount-scale series would visually flatten one or the other.
- **Recent Entries table**: a new "Offerings" column with a "vs Prior" diff column, following the exact same pattern already used for Worship and Small Groups (green/red pill showing the change from the prior entry).
- **CSV export**: offerings included as an additional column.

## Error Handling

None needed beyond what already exists — this is a plain optional numeric field following an established pattern with no new validation requirements (the existing "worship headcount is required, everything else optional" rule is unchanged; offerings joins notes as an optional field).

## Testing Plan

- Manual: add a new weekly entry with an offerings amount, confirm it saves and displays correctly in the admin tab's table.
- Manual: edit an existing entry to add/change an offerings amount, confirm it persists.
- Manual: leave offerings blank on an entry, confirm the analytics page's stat cards, chart, and table all handle the gap gracefully (matching how missing worship/SG figures already display as "–" or skip in the chart via `spanGaps`).
- Manual: confirm the new Offerings chart renders with a sensible dollar-formatted axis and doesn't visually interfere with the existing Worship/Small Groups trend chart.
- Manual: export CSV, confirm the offerings column and values are present and correctly formatted.

## Out of Scope (YAGNI)

- No fund/campaign-level breakdown.
- No offerings-vs-attendance ratio or derived metric.
- No historical backfill of offerings for past weeks — admins can add it retroactively via Edit if they have the figures, same as any other field on this table.
