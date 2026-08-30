# Admin Dashboard Mobile Navigation & Tables (Phase 1) Design Spec

## Purpose

`admin/dashboard.html` is currently unusable on a phone in two concrete ways: below 680px, the sidebar nav is set to `display: none` with no replacement, so an admin on mobile is stuck on whichever tab loaded first with no way to switch tabs at all. Separately, every data table's wrapper (`.table-wrap`) uses `overflow: hidden`, so wide tables silently clip columns instead of allowing horizontal scroll. This is Phase 1 of making the admin app mobile-friendly: fix the shared shell (navigation + table scrolling) that every one of the app's ~16 tabs depends on. Per-tab content polish (modals, forms, touch targets, possible table→card conversions) is explicitly deferred to a future Phase 2, and the simpler portal.css-based pages (`my-profile.html`, `member-dashboard.html`, `login.html`) are deferred to a possible future Phase 3.

## Confirmed Decisions (from brainstorming)

- The sidebar becomes an off-canvas drawer below the existing 680px breakpoint, opened via a hamburger button that appears in the topbar only at that breakpoint, with a dimmed backdrop behind it — mirroring the interaction pattern the public site's mobile nav already uses in `js/main.js` (hamburger toggles an `.open` class, closes on outside click), applied here to a different element rather than reusing that exact code (this is a different DOM structure — a full sidebar drawer, not a simple dropdown).
- Tapping a sidebar link, tapping the backdrop, or tapping the hamburger again all close the drawer.
- `.table-wrap` switches from `overflow: hidden` to `overflow-x: auto` so wide tables scroll horizontally inside their card instead of clipping.
- Existing breakpoints (900px, 680px) are kept as-is — this only changes what happens at 680px, not where the tiers are.
- Scope is strictly the shared shell: the sidebar/topbar/hamburger/backdrop and the `.table-wrap` rule. No changes to individual tab panels, modals, forms, or the portal.css-based pages in this phase.

## Current State (for reference)

- `<aside class="sidebar">` (starts at `admin/dashboard.html:185`) — the full nav, currently `position: fixed`, width 240px (200px at ≤900px).
- `<div class="main">` (starts at `admin/dashboard.html:276`) containing `<div class="topbar">` (`admin/dashboard.html:277`), which currently has just a title (`#topbarTitle`) and a right-side badge/avatar group — no hamburger button exists yet.
- Current mobile breakpoint rule: `@media (max-width: 680px) { .sidebar { display: none; } .main { margin-left: 0; } }` — this is the rule being replaced.
- `.table-wrap { background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }` — used by all `.table-wrap` elements throughout the file (16 tables).

## Design

### Hamburger button

Added inside `.topbar`, before the existing right-side badge/avatar group. Hidden by default (desktop/tablet); shown only at the ≤680px tier via CSS (`display: none` at the base rule, overridden to `display: flex` inside the existing `@media (max-width: 680px)` block) — no JS-side viewport detection needed, matching how this codebase already gates mobile-only UI (e.g. the public site's `.hamburger` button) with pure CSS.

### Backdrop

A single `<div class="sidebar-backdrop" id="sidebarBackdrop" onclick="closeSidebar()"></div>`, added once in the markup (sibling to `.sidebar`, before `.main`). Styled `position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 150; display: none;` with a `.open` variant setting `display: block`. Sits between the sidebar (z-index 100 today, bumped to 200 only within the mobile tier so it draws above the backdrop) and the rest of the page.

### Drawer behavior (CSS, mobile tier only)

Inside the existing `@media (max-width: 680px)` block, the sidebar no longer disables itself — instead it becomes a slide-in panel:

```css
.sidebar { transform: translateX(-100%); transition: transform .25s ease; z-index: 200; }
.sidebar.open { transform: translateX(0); }
.main { margin-left: 0; }
.mobile-hamburger { display: flex; }
```

(`.mobile-hamburger { display: none; }` lives in the base, non-media-query CSS so it's hidden above 680px.)

### JS

Two small functions, `toggleSidebar()` and `closeSidebar()`, toggle an `.open` class on both `.sidebar` and `#sidebarBackdrop`. `switchTab()` (the existing function every nav link's `onclick` already calls) gets one added line calling `closeSidebar()`, so picking a tab on mobile automatically closes the drawer — harmless on desktop/tablet since the drawer's transform only applies inside the mobile media query, so toggling the class there has no visible effect above that breakpoint.

### Table scrolling

`.table-wrap`'s `overflow: hidden` becomes `overflow-x: auto`. This is a single rule-body edit affecting all 16 existing tables uniformly — no per-table markup changes.

## Error Handling / Edge Cases

- No JS state to get out of sync with the DOM — `toggleSidebar`/`closeSidebar` only ever add/remove a CSS class, so there's nothing to break if called when already in the target state (e.g., calling `closeSidebar()` when it's already closed is a harmless no-op class removal).
- Resizing from mobile to desktop width while the drawer is open: the `.open` class may still be present on `.sidebar`/`#sidebarBackdrop`, but since the drawer CSS only exists inside the ≤680px media query, growing past that width simply stops applying the transform/backdrop rules — no visual artifact, no JS resize listener needed.

## Out of Scope (YAGNI)

- No changes to any individual tab's content, modal, or form layout — that's Phase 2.
- No changes to `admin/my-profile.html`, `admin/member-dashboard.html`, or `admin/login.html` — those are a possible future Phase 3, and are already reasonably mobile-friendly by virtue of their simpler single-column card layout.
- No conversion of any table to a stacked-card mobile layout — horizontal scroll is the Phase 1 fix; card-based responsive tables (if ever wanted) are a Phase 2+ consideration.
- No new breakpoints — reuses the existing 680px tier as-is.
