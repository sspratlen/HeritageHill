# Event Deep-Link for Announcement Banner Design Spec

## Purpose

The Settings tab's Announcement Banner already has a "Link URL" field, but there's no way to link directly to a specific event's detail popup — only to whole pages (e.g. `events.html`). This adds a URL query parameter that auto-opens a specific event's existing detail modal, plus a one-click way for admins to grab that URL from the Events tab, so the banner can point straight at "the thing happening this week" instead of just the general Events page.

## Public Page: `events.html`

### URL parameter behavior

After `_allEvents` loads (inside the existing `SupaDB.getPublishedEvents().then(data => {...})` block, where the existing `filter` query param is already handled), also check for an `event` query param:

- If present and its value matches the `id` of a loaded (published) event, call the existing `openEventDetail(eventId)` function — the exact same function a card click already triggers — so the detail modal opens automatically on page load.
- If the param is missing, doesn't parse to a valid id, or doesn't match any published event (e.g. a stale link to a deleted or since-unpublished event), the page simply loads normally with no error, no modal, and no console warning — silent no-op, consistent with how the existing `filter` param already degrades gracefully when it doesn't match anything.
- This check runs after the existing `filter` param handling and `filterEvents()` call already in that block — both params can coexist harmlessly (`filter` affects the grid behind the modal; `event` only affects whether the modal auto-opens on top of it).

### Scope note

Only `events.html` is touched. `openEventDetail` is a page-local function already defined there; this feature does not introduce any shared/cross-page module.

## Admin Page: `admin/dashboard.html` — Events tab

### New "Copy Link" action

Add a new button to each event row's Actions cell in the Events table (`renderEventsTable()`), alongside the existing "📣 Media" and "📅 Calendar" quick-action buttons, following their exact visual style (ghost button, small, colored icon-label text):

- Label: "🔗 Copy Link"
- On click: builds the relative URL `events.html?event=<id>` (relative, not absolute — consistent with the existing Banner "Link URL" field's own placeholder example of `events.html`, and with how every other internal link in this codebase is written) and copies it to the clipboard via `navigator.clipboard.writeText()`.
- On success: shows a confirmation via the existing `showToast()` helper (e.g. `"Link copied! Paste it into the Banner's Link URL field."`) — a small hint pointing the admin at where this URL is meant to be used, since that's the entire reason this button exists.
- On failure (e.g. `navigator.clipboard` unavailable in the admin's browser/context): shows an error toast via `showToast(msg, true)` rather than failing silently, so the admin isn't left wondering whether the click did anything.

No new modal, no new admin page — this is a single button addition to already-existing table row markup and its render function.

## Error Handling

- Public page: as described above, any non-matching or malformed `event` param is a silent no-op — this is public-facing and should never surface a raw error to a site visitor over something as low-stakes as a stale/bad link.
- Admin page: clipboard-copy failure is surfaced via toast (not silent), since this is an admin-facing action where silent failure would be confusing ("I clicked Copy Link, why is nothing in my clipboard?").

## Out of Scope (YAGNI)

- No slug-based URLs (e.g. `events.html?slug=fall-festival`) — the existing numeric event `id` is reused as-is, matching how this codebase already links things internally (e.g. `admin/dashboard.html?tab=events`).
- No UI change to the Banner settings card itself (Settings tab) — the admin still pastes the copied URL into the existing "Link URL" text field by hand; this spec only makes that URL easy to obtain, not auto-fills it.
- No deep-linking support added to any other page's cards/modals (e.g. small groups, sermons) — scoped to events only, per the request.
- No visual "you followed a direct link" indicator beyond the modal simply being open — e.g. no special banner-within-the-modal saying "shared link" or similar.
