# Sign-Up Requests: Cards → Table Design Spec

## Purpose

The "Sign-Up Requests" admin tab (`admin/dashboard.html`, `#panelSignups`) currently renders each small-group sign-up as a large padded card in a responsive CSS grid (`.signups-grid`, `minmax(300px, 1fr)`). This wastes vertical space compared to every other list tab in the dashboard (Applications, Prayer, Retreat, Groups, Events, Sermons, Subscribers), which all use a compact `<table>`. Converting Sign-Ups to match that pattern lets more requests fit on screen at once, and brings the tab in line with the rest of the dashboard.

## Current State

- CSS: `.signups-grid`, `.signup-card`, `.signup-card-name`, `.signup-card-group`, `.signup-card-detail`, `.signup-card-message`, `.signup-card-footer` (`admin/dashboard.html:132-140`)
- Markup: `<div class="signups-grid" id="signupsGrid"></div>` inside `#panelSignups` (`admin/dashboard.html:360`)
- Render function: `renderSignupsPanel()` (`admin/dashboard.html:2383` onward), which builds one `.signup-card` div per sign-up via template-literal string concatenation and sets `grid.innerHTML`
- Each sign-up (`s`) has: `id`, `name`, `email`, `phone` (optional), `groupName`, `groupId`, `date`, `contacted` (boolean), `message` (optional free text, can be long)
- **Existing bug**: `s.name`, `s.email`, `s.phone`, `s.groupName`, and `s.message` are interpolated directly into `innerHTML` with no escaping. All of these originate from a public, unauthenticated sign-up form on `small-groups.html`, so this is a live stored-XSS gap — any visitor can submit a sign-up with a name or message like `<img src=x onerror=alert(document.cookie)>` and have it execute in an admin's browser the next time they open this tab.

## Design

### Table structure

Replace `<div class="signups-grid" id="signupsGrid"></div>` with a `<table>` following the exact structure already used by the Applications tab (`admin/dashboard.html:379`, `.table-wrap` wrapper, `<thead>`/`<tbody>`, `td-actions` div for buttons):

| Column | Content |
|---|---|
| Name & Contact | Name (bold), email (mailto link, small), phone (small, if present) — same layout as Applications' first column |
| Group | Group name |
| Date | Submitted date, formatted like existing (`MMM D, YYYY`) |
| Message | Truncated preview (CSS `text-overflow: ellipsis`, single line, capped width) with the full message as a native `title` attribute (hover tooltip, zero JS) *and* a click handler that toggles the cell to show the full untruncated text (covers touch devices / accessibility, where hover isn't available). Empty message → em dash. |
| Status | `<span class="badge badge-green">Contacted</span>` or `<span class="badge badge-amber">New</span>`, replacing the current inline "✓ Contacted ·" text prefix |
| Actions | Same two buttons as today — "Mark Contacted"/"Mark Uncontacted" and "Delete" — in a `td-actions` div, same classes/behavior as today (`toggleSignupContacted`, `deleteItem`) |

The existing filter bar (`.signup-filter-bar`, group/status filters, count label, "Email Group" button) is unchanged — it filters the same `_cachedSignups` array and renders into the same container id (`signupsGrid`, which becomes a `<tbody id="signupsGrid">` instead of a grid div, keeping the same element id so `renderSignupsPanel()`'s `document.getElementById('signupsGrid')` lookup keeps working unmodified).

### XSS fix

While rewriting `renderSignupsPanel()`'s row-building code, wrap every field sourced from public sign-up data (`s.name`, `s.email`, `s.phone`, `s.groupName`, `s.message`) in the dashboard's existing `escapeHtml()` helper (`admin/dashboard.html:4897`), the same helper already used in the Members/People tab and elsewhere. This closes the stored-XSS gap described above. No other behavior changes — this is purely making the existing interpolation safe.

### Message expand behavior

- Truncated `<td>` content: `<span class="signup-msg-preview" title="${escapeHtml(fullMessage)}" onclick="this.classList.toggle('expanded')">${escapeHtml(truncatedMessage)}</span>`
- CSS: `.signup-msg-preview` truncates via `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; display: inline-block; cursor: pointer;`; `.signup-msg-preview.expanded` overrides with `white-space: normal; max-width: none;` so a click reveals the full text inline, pushing the row taller only for that one expanded row.
- Truncation is done client-side by slicing the message string (e.g., first 40 characters + `…` if longer) before escaping and inserting — not via CSS alone — because the `title` tooltip needs the *original* full message text, and the visible truncated text needs its own shorter string.

### Out of scope (YAGNI)

- No changes to the filter bar, "Email Group" button, or `_cachedSignups` data-fetching logic.
- No changes to `toggleSignupContacted` or `deleteItem` behavior — only how their trigger buttons are laid out (same buttons, now in a table cell instead of a card footer).
- No pagination — the existing screen already shows all filtered results at once; a table just fits more of them without scrolling as often. Adding pagination is a separate, unrequested change.
- `.signup-card*` CSS classes and the old `.signups-grid` class are removed since nothing references them after this change (confirm via a repo-wide grep before deleting, in case another page reuses them).
