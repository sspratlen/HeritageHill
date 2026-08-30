# Admin Dashboard Mobile Navigation & Tables (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `admin/dashboard.html`'s completely broken mobile navigation (sidebar just disappears below 680px with no replacement) by turning it into a hamburger-triggered off-canvas drawer, and stop wide tables from silently clipping by making `.table-wrap` horizontally scrollable.

**Architecture:** Pure CSS/HTML/JS additions to the existing single-page admin app — a hamburger button (mobile-only via CSS), a backdrop element, an off-canvas transform applied only inside the existing `@media (max-width: 680px)` block, and two small JS functions (`toggleSidebar`/`closeSidebar`) wired into the existing `switchTab()` function so picking a tab closes the drawer.

**Tech Stack:** Static HTML/CSS/JS, no build step, no new files. Verification is via HTML tag-balance and JS syntax checks (this codebase's established pattern for `admin/dashboard.html`) plus manual browser verification at mobile width, since interaction behavior can't be fully exercised via a syntax check.

---

### Task 1: CSS — hamburger button, backdrop, drawer, table scrolling

**Files:**
- Modify: `admin/dashboard.html` (four separate, small CSS edits, all inside the existing `<style>` block)

- [ ] **Step 1: Add hamburger button and backdrop base styles**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```css
    .topbar { background: #fff; border-bottom: 1px solid var(--border); padding: 0 28px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
    .topbar h1 { font-size: 1.1rem; font-weight: 700; }
```

Replace with:

```css
    .topbar { background: #fff; border-bottom: 1px solid var(--border); padding: 0 28px; height: 60px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
    .topbar h1 { font-size: 1.1rem; font-weight: 700; }
    .mobile-hamburger { display: none; align-items: center; justify-content: center; width: 36px; height: 36px; background: transparent; border: none; cursor: pointer; color: var(--text); margin-right: 12px; padding: 0; }
    .sidebar-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 150; }
    .sidebar-backdrop.open { display: block; }
```

- [ ] **Step 2: Change `.table-wrap` to scroll horizontally instead of clipping**

Find this exact line:

```css
    .table-wrap { background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow: hidden; }
```

Replace with:

```css
    .table-wrap { background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow); overflow-x: auto; }
```

- [ ] **Step 3: Replace the broken mobile sidebar rule with a drawer**

Find this exact line:

```css
    @media (max-width: 680px) { .sidebar { display: none; } .main { margin-left: 0; } }
```

Replace with:

```css
    @media (max-width: 680px) {
      .sidebar { transform: translateX(-100%); transition: transform .25s ease; z-index: 200; }
      .sidebar.open { transform: translateX(0); }
      .main { margin-left: 0; }
      .mobile-hamburger { display: flex; }
    }
```

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add mobile hamburger/drawer and backdrop CSS, make tables scroll instead of clip"
```

---

### Task 2: HTML — hamburger button, backdrop element

**Files:**
- Modify: `admin/dashboard.html` (topbar markup, and the sidebar/main boundary)

- [ ] **Step 1: Add the hamburger button to the topbar**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```html
<div class="main">
  <div class="topbar">
    <h1 id="topbarTitle">Events</h1>
```

Replace with:

```html
<div class="main">
  <div class="topbar">
    <div style="display:flex;align-items:center;">
      <button class="mobile-hamburger" onclick="toggleSidebar()" aria-label="Toggle navigation">
        <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <h1 id="topbarTitle">Events</h1>
    </div>
```

This wraps the existing `<h1 id="topbarTitle">` and the new hamburger button together in a flex container; the `</div>` shown above closes that wrapper. The pre-existing right-side badge/avatar `<div style="display:flex;align-items:center;gap:12px;">...</div>` that already follows `<h1 id="topbarTitle">Events</h1>` in the file is untouched and becomes this new wrapper's sibling — do not modify it.

- [ ] **Step 2: Add the backdrop element between the sidebar and the main content**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```html
</aside>

<div class="main">
```

Replace with:

```html
</aside>

<div class="sidebar-backdrop" id="sidebarBackdrop" onclick="closeSidebar()"></div>

<div class="main">
```

- [ ] **Step 3: Verify div/tag balance**

Run:
```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('admin/dashboard.html', 'utf8');
const opens = (content.match(/<div/g) || []).length;
const closes = (content.match(/<\/div>/g) || []).length;
console.log('opens:', opens, 'closes:', closes, opens === closes ? 'BALANCED' : 'MISMATCH');
"
```
Expected: `BALANCED`. This task adds exactly 2 new `<div>...</div>` pairs (the hamburger+title wrapper, and the backdrop) — mandatory check before committing any HTML change to this file. If MISMATCH, do not commit; re-examine Steps 1–3 for a missed or extra tag.

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add mobile hamburger button and sidebar backdrop markup"
```

---

### Task 3: JS — drawer toggle + auto-close on tab switch

**Files:**
- Modify: `admin/dashboard.html` (`switchTab`, plus two new functions)

- [ ] **Step 1: Add `toggleSidebar`/`closeSidebar` and wire them into `switchTab`**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```js
function switchTab(tab) {
  // Block access to tabs the current role doesn't have
  const allowed = ROLE_TABS[window._userRole] || ROLE_TABS.admin;
  if (!allowed.includes(tab)) return;
```

Replace with:

```js
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('sidebarBackdrop').classList.toggle('open');
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
}

function switchTab(tab) {
  // Block access to tabs the current role doesn't have
  const allowed = ROLE_TABS[window._userRole] || ROLE_TABS.admin;
  if (!allowed.includes(tab)) return;
  closeSidebar();
```

`closeSidebar()` only removes an `.open` class that has no visual effect outside the `@media (max-width: 680px)` block added in Task 1 — calling it unconditionally on every tab switch is harmless at desktop/tablet widths, matching the design spec's stated behavior (no viewport-detection JS needed).

- [ ] **Step 2: Verify JS syntax**

Run:
```bash
node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK
```
Expected: `SYNTAX_OK`

- [ ] **Step 3: Verify div/tag balance is unchanged**

Run the same balance-check command from Task 2, Step 4 — expected count is identical to Task 2's result (this task only touches `<script>` content).

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Wire up mobile sidebar drawer toggle and auto-close on tab switch"
```

---

### Task 4: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (the project's existing `static-site` preview launch config). Confirm:

- `admin/dashboard.html` loads with no console errors (redirects to login when unauthenticated, as expected).
- The div-balance and JS-syntax checks from Tasks 2 and 3 both still pass.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

1. Log into `admin/dashboard.html` as admin on a desktop-width browser window. Confirm: no visible hamburger button, sidebar looks and behaves exactly as before this change, tables look unchanged (no visible scrollbar unless a table is actually wider than its card).
2. Resize the browser (or use device emulation) to a width under 680px, or open the page on an actual phone. Confirm: the sidebar is now hidden by default, a hamburger button appears in the topbar, and the page content fills the full width.
3. Tap the hamburger — confirm the sidebar slides in from the left with a dimmed backdrop behind it, covering the content.
4. Tap a nav link inside the open drawer — confirm it switches to that tab AND the drawer closes automatically.
5. Re-open the drawer, then tap the backdrop (not the sidebar itself) — confirm it closes without switching tabs.
6. Re-open the drawer, then tap the hamburger button again — confirm it closes the same way.
7. On a tab with a wide table (e.g. Members, Small Groups), at mobile width, confirm the table can be scrolled horizontally within its card (a finger swipe or scroll gesture reveals the clipped columns) rather than being cut off with no way to see them.
8. Resize back up past 680px while the drawer happens to be open — confirm the sidebar returns to its normal fixed desktop position with no leftover transform/backdrop artifact.

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
