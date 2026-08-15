# Floating "Need Prayer?" Button Design Spec

## Purpose

Make prayer requests more discoverable across the whole site by adding a persistent, draggable floating button ("Need Prayer?") to every public page, linking to `prayer.html`. Since it's always visible, the "Prayer" entry in the top navigation becomes redundant and is removed.

## Scope

- Add the floating button to 8 public pages: `index.html`, `about.html`, `events.html`, `small-groups.html`, `growth-track.html`, `sermons.html`, `give.html`, `lead-a-group.html`. Suppressed on `prayer.html` itself.
- Remove the `Prayer` link from the desktop nav and mobile nav menu on all 9 public pages (including `prayer.html`, for consistency — every page's nav currently has the same link list).
- Footer link lists and inline CTAs (e.g. the homepage's "Submit a Prayer Request" button, and the section on `index.html` titled "Need Prayer? We're Here.") are left untouched — only the top navigation link is removed.

## Component: the floating button

### Placement and appearance

- Fixed position, default bottom-left corner (24px from bottom, 24px from left) — deliberately not bottom-right, since `css/style.css`'s existing `.admin-edit-bar`/`.admin-fab` (an admin-only floating action button) already occupies bottom-right.
- Pill-shaped button: a simple heart-outline icon (inline SVG, `stroke="currentColor" stroke-width="2"`, matching the stroke-icon style already used elsewhere in this codebase, e.g. the card icons on `index.html`) plus the text "Need Prayer?", on the site's `--primary` gold background with white text — visually consistent with `.admin-fab`'s color/shadow (`box-shadow: var(--shadow-lg)`) but pill-shaped (`border-radius: 50px`) rather than circular, since it carries a text label.
- `z-index` around 950 — above normal page content, but below this site's modal overlays (which use `z-index: 999` and above), so any open modal correctly covers the button instead of floating awkwardly on top of it.

### Implementation location

`js/main.js` is already loaded on all 9 public pages (confirmed via grep — same file used for the profile-avatar nav swap built earlier). The button is created and injected entirely from there at runtime — no per-page HTML changes are needed to add it. On `prayer.html`, the injection is skipped (checked via `window.location.pathname`).

### Drag behavior

- Uses Pointer Events (`pointerdown`/`pointermove`/`pointerup`), which unify mouse and touch input in one code path — no separate touch-event handling needed.
- While the pointer is down and moving, the button follows it, with its position clamped so it can never be dragged fully or partially off-screen (its bounding box always stays within the viewport).
- On `pointerup`, the total distance moved since `pointerdown` is checked against a small threshold (6px). Below the threshold, the interaction is treated as a **click** — navigate to `prayer.html`. At or above the threshold, it's treated as a **completed drag** — the button simply stays where it was released, and no navigation happens.

### Position persistence

- On drag completion (movement ≥ threshold), the button's final `{left, top}` in pixels is saved to `localStorage` under a single key.
- On every page load (except `prayer.html`), `main.js` checks `localStorage` for a saved position. If present, the button is placed there instead of the default bottom-left corner. If the saved position would now be off-screen (e.g. the visitor resized their window or switched devices between visits), it's clamped back into the viewport the same way live dragging is clamped.
- No expiration on the saved position — it persists indefinitely until the visitor drags the button again or clears their browser storage.

### Accessibility

- The button is a real `<button>` element (not a styled `<div>`), keyboard-focusable and activatable via Enter/Space in addition to pointer interaction, with an `aria-label="Need Prayer? Contact us for prayer support"` for screen readers (the visible text is already descriptive, but the label is still added per this codebase's general practice of labeling icon-bearing interactive elements).
- Keyboard activation (Enter/Space) always navigates — the drag/click-distance distinction only applies to pointer interactions, since there's no equivalent "drag" concept for keyboard input.

## Nav Removal

Each of the 9 public pages has its own independently duplicated nav markup (this is a static multi-page site with no shared template/include system) — each page currently has two `<a href="prayer.html">Prayer</a>` links: one in the desktop nav list, one in the mobile nav list. Both are removed from all 9 pages. This is 18 total link removals, one desktop + one mobile per page.

## Error Handling

- If `localStorage` is unavailable or throws (e.g. private browsing mode in some browsers, or storage quota issues), reading/writing the saved position fails silently and the button simply falls back to the default bottom-left corner every load — this is a cosmetic feature, not something that should ever block the page or throw a visible error.
- If the button's position becomes invalid on resize (e.g. a saved position from a wide desktop viewport, now viewed on a narrow mobile one), the same clamping logic used during drag is applied on load, so it's never rendered partially or fully off-screen.

## Out of Scope (YAGNI)

- No animation/transition polish beyond what's needed for basic drag-follow (e.g. no bounce, no snap-to-edge behavior).
- No per-page customization of the button's default position — it's the same bottom-left default on every page that shows it.
- No server-side or cross-device sync of the dragged position — it's `localStorage`, so it's per-browser, per-device only.
- No changes to `prayer.html`'s own content, the footer link lists, or any existing inline prayer CTAs (e.g. `index.html`'s "Need Prayer? We're Here." section) — only the top nav link and the new floating button are in scope.
