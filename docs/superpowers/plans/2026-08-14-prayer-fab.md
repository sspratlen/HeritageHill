# Floating "Need Prayer?" Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, draggable "Need Prayer?" floating button to 8 public pages (linking to `prayer.html`), and remove the now-redundant `Prayer` link from the top navigation on all 9 public pages.

**Architecture:** The button is created and controlled entirely from `js/main.js` (already loaded on all 9 public pages) — no per-page HTML is needed to add it, and it self-suppresses on `prayer.html`. Its CSS lives in `css/style.css` (also loaded on all 9 pages). Pointer Events unify mouse/touch drag handling; a movement-distance threshold distinguishes a click (navigate) from a drag (reposition); the final position persists to `localStorage`. Removing the nav link requires editing each page's own duplicated nav markup, since this is a static multi-page site with no shared template/include system.

**Tech Stack:** Static HTML/CSS/JS, Pointer Events API, `localStorage`, no build step, no test framework — verification is via `node --check`-style syntax checks and manual browser verification, matching this codebase's established pattern.

---

### Task 1: CSS for the floating button

**Files:**
- Modify: `css/style.css` (insert after the existing `.admin-fab:hover` rule)

- [ ] **Step 1: Add the `.prayer-fab` styles**

Find this exact block:

```css
.admin-fab {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  border: none;
  font-size: 1.4rem;
  transition: background var(--transition), transform var(--transition);
}
.admin-fab:hover { background: var(--primary-dark); transform: scale(1.08); }
```

Replace with:

```css
.admin-fab {
  width: 56px; height: 56px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-lg);
  cursor: pointer;
  border: none;
  font-size: 1.4rem;
  transition: background var(--transition), transform var(--transition);
}
.admin-fab:hover { background: var(--primary-dark); transform: scale(1.08); }

/* ── Floating "Need Prayer?" button ────────────────────── */
.prayer-fab {
  position: fixed;
  bottom: 24px; left: 24px;
  z-index: 950;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px 14px 16px;
  border-radius: 50px;
  background: var(--primary);
  color: #fff;
  border: none;
  box-shadow: var(--shadow-lg);
  font-family: 'DM Sans', sans-serif;
  font-size: .9rem;
  font-weight: 600;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.prayer-fab:active { cursor: grabbing; }
.prayer-fab svg { flex-shrink: 0; }
```

`touch-action: none;` is required so touch-dragging the button doesn't also scroll the page underneath it. `z-index: 950` sits above normal page content but below this site's modal overlays (`z-index: 999` and above, e.g. `.ev-modal-overlay`, `#gtModal`, `#joinModal`), so an open modal correctly covers the button.

- [ ] **Step 2: Verify by inspection**

Run: `grep -c "prayer-fab" css/style.css`
Expected: a number greater than 0 (confirms the rules were added; exact count depends on how many selectors reference the class).

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "Add CSS for floating Need Prayer button"
```

---

### Task 2: JS behavior for the floating button

**Files:**
- Modify: `js/main.js` (insert after `renderNavAvatar()`, before the `/* ── Legacy localStorage helpers` comment)

- [ ] **Step 1: Add the `initPrayerFab` function and its call**

Find this exact block:

```js
async function renderNavAvatar() {
  if (!window.SupaDB) return;
  try {
    const user = await SupaDB.getUser();
    if (!user) return;
    const [roleData, profile] = await Promise.all([
      SupaDB.getUserRoleByEmail(user.email), SupaDB.getMyProfile(),
    ]);
    const dest = roleData ? 'admin/dashboard.html' : 'admin/my-profile.html';
    const name = profile ? profile.name : '';
    const avatarUrl = profile ? profile.avatarUrl : null;
    const html = buildAvatarHtml({ name, email: user.email, avatarUrl }, 34);
    ['navLoginBtn', 'navLoginBtnMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.outerHTML = `<a href="${dest}" id="${id}" style="display:inline-flex;align-items:center;">${html}</a>`;
    });
  } catch (e) { console.error('[renderNavAvatar]', e.message); }
}

/* ── Legacy localStorage helpers (kept for backwards compat) ── */
```

Replace with:

```js
async function renderNavAvatar() {
  if (!window.SupaDB) return;
  try {
    const user = await SupaDB.getUser();
    if (!user) return;
    const [roleData, profile] = await Promise.all([
      SupaDB.getUserRoleByEmail(user.email), SupaDB.getMyProfile(),
    ]);
    const dest = roleData ? 'admin/dashboard.html' : 'admin/my-profile.html';
    const name = profile ? profile.name : '';
    const avatarUrl = profile ? profile.avatarUrl : null;
    const html = buildAvatarHtml({ name, email: user.email, avatarUrl }, 34);
    ['navLoginBtn', 'navLoginBtnMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.outerHTML = `<a href="${dest}" id="${id}" style="display:inline-flex;align-items:center;">${html}</a>`;
    });
  } catch (e) { console.error('[renderNavAvatar]', e.message); }
}

/* ── Floating "Need Prayer?" button ───────────────────── */
function initPrayerFab() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  if (path === 'prayer.html') return;

  const STORAGE_KEY = 'hhc_prayerFabPos';
  const DRAG_THRESHOLD = 6;

  const btn = document.createElement('button');
  btn.className = 'prayer-fab';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Need Prayer? Contact us for prayer support');
  btn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg><span>Need Prayer?</span>';
  document.body.appendChild(btn);

  function clamp(x, y) {
    const rect = btn.getBoundingClientRect();
    const maxX = Math.max(window.innerWidth - rect.width, 0);
    const maxY = Math.max(window.innerHeight - rect.height, 0);
    return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
  }

  function applyPosition(x, y) {
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  }

  function loadSavedPosition() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const pos = JSON.parse(raw);
      if (typeof pos.left !== 'number' || typeof pos.top !== 'number') return null;
      return pos;
    } catch { return null; }
  }

  function savePosition(x, y) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: x, top: y })); } catch {}
  }

  const saved = loadSavedPosition();
  if (saved) {
    const c = clamp(saved.left, saved.top);
    applyPosition(c.x, c.y);
  }

  let dragging = false;
  let startX = 0, startY = 0, originLeft = 0, originTop = 0, moved = 0;

  btn.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    startX = e.clientX;
    startY = e.clientY;
    const rect = btn.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    btn.setPointerCapture(e.pointerId);
  });

  btn.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    moved = Math.max(moved, Math.hypot(dx, dy));
    const c = clamp(originLeft + dx, originTop + dy);
    applyPosition(c.x, c.y);
  });

  btn.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    if (moved < DRAG_THRESHOLD) {
      window.location.href = 'prayer.html';
      return;
    }
    const rect = btn.getBoundingClientRect();
    savePosition(rect.left, rect.top);
  });

  btn.addEventListener('pointercancel', () => { dragging = false; });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.location.href = 'prayer.html';
    }
  });

  window.addEventListener('resize', () => {
    const rect = btn.getBoundingClientRect();
    const c = clamp(rect.left, rect.top);
    applyPosition(c.x, c.y);
  });
}
initPrayerFab();

/* ── Legacy localStorage helpers (kept for backwards compat) ── */
```

Notes on this implementation, matching the design spec:

- **Click vs. drag**: `moved` tracks the largest distance from the `pointerdown` origin seen during the gesture (via `Math.hypot`). On `pointerup`, if that peak distance is under `DRAG_THRESHOLD` (6px), it's treated as a click and navigates; otherwise the button's final dropped position is saved. This matches the spec's threshold-based distinction exactly.
- **No separate `click` listener is used or needed** — navigation only happens from the `pointerup` handler (for pointer interactions) or the `keydown` handler (for keyboard). Since nothing listens for the native `click` event, there's no risk of double-navigating when a `<button>`'s default click behavior fires alongside `pointerup`.
- **Keyboard access**: a real `<button>` element is used (not a styled `<div>`), so it's natively focusable and included in tab order; the explicit `keydown` handler makes Enter/Space navigate immediately, with no drag-distance gate — matching the spec's note that the click/drag distinction only applies to pointer interactions.
- **Persistence and fallback**: `loadSavedPosition`/`savePosition` wrap `localStorage` access in `try`/`catch`, so if storage is unavailable (e.g. private browsing), the button silently falls back to its CSS default position (`bottom:24px; left:24px`, from Task 1) instead of throwing.
- **Resize handling**: the `resize` listener re-clamps the button's current position on every window resize, so a position saved on a wide viewport can't leave the button off-screen after a resize or on a narrower device — matching the spec's clamp-on-load-and-resize requirement. (This does not itself re-save to `localStorage`; the saved value is only updated on a completed drag, per spec — a resize alone shouldn't overwrite the visitor's chosen drag position.)
- **Suppressed on `prayer.html`**: the function returns immediately if the current page's filename is `prayer.html`, before creating any DOM element.

- [ ] **Step 2: Verify by inspection**

Run: `node --check js/main.js`
Expected: no output (exits 0)

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "Add floating Need Prayer button with drag-to-move and click-to-navigate"
```

---

### Task 3: Remove the Prayer nav link from all 9 public pages

**Files:**
- Modify: `index.html`, `about.html`, `events.html`, `small-groups.html`, `growth-track.html`, `sermons.html`, `give.html`, `lead-a-group.html`, `prayer.html`

Each page has its own independently duplicated nav markup (no shared template). The `Prayer` link appears in up to two places per page — the desktop `.nav-links` block and the `.nav-mobile` block — but **not consistently**: `small-groups.html`, `growth-track.html`, and `sermons.html` are missing it from `.nav-links` already (only `.nav-mobile` has it there). Remove it from wherever it currently appears in nav markup on each page; **do not touch** footer `<li>` links or inline CTA buttons (e.g. `index.html`'s "Submit a Prayer Request" button, or any page's footer "Navigate" link list) — those are explicitly out of scope per the spec.

- [ ] **Step 1: `index.html`**

Find (desktop nav, inside `.nav-links`):
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="prayer.html">Prayer</a>
      <a href="sermons.html">Watch</a>
```
Replace with:
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="sermons.html">Watch</a>
```

Find (mobile nav, inside `.nav-mobile`):
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="prayer.html">Prayer</a>
  <a href="sermons.html">Watch</a>
```
Replace with:
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="sermons.html">Watch</a>
```

Leave the homepage's `<a href="prayer.html" class="btn btn-white btn-lg">Submit a Prayer Request</a>` CTA and its footer `<li><a href="prayer.html">Prayer</a></li>` untouched.

- [ ] **Step 2: `about.html`**

Find (desktop nav):
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="prayer.html">Prayer</a>
      <a href="sermons.html">Watch</a>
```
Replace with:
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="sermons.html">Watch</a>
```

Find (mobile nav):
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="prayer.html">Prayer</a>
  <a href="sermons.html">Watch</a>
```
Replace with:
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="sermons.html">Watch</a>
```

Leave the footer `<li><a href="prayer.html">Prayer</a></li>` untouched.

- [ ] **Step 3: `events.html`**

Find (desktop nav):
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="prayer.html">Prayer</a>
      <a href="sermons.html">Watch</a>
```
Replace with:
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="sermons.html">Watch</a>
```

Find (mobile nav):
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="prayer.html">Prayer</a>
  <a href="sermons.html">Watch</a>
```
Replace with:
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="sermons.html">Watch</a>
```

Leave the footer `<li><a href="prayer.html">Prayer</a></li>` untouched.

- [ ] **Step 4: `small-groups.html`**

No desktop `.nav-links` occurrence to remove (already absent). Find (mobile nav only):
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="prayer.html">Prayer</a>
  <a href="sermons.html">Watch</a>
```
Replace with:
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="sermons.html">Watch</a>
```

Leave the footer `<li><a href="prayer.html">Prayer</a></li>` untouched.

- [ ] **Step 5: `growth-track.html`**

No desktop `.nav-links` occurrence to remove (already absent). Find (mobile nav only):
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="prayer.html">Prayer</a>
  <a href="sermons.html">Watch</a>
```
Replace with:
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="sermons.html">Watch</a>
```

Leave the footer `<li><a href="prayer.html">Prayer</a></li>` untouched.

- [ ] **Step 6: `sermons.html`**

No desktop `.nav-links` occurrence to remove (already absent). Find (mobile nav only):
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="prayer.html">Prayer</a>
  <a href="sermons.html">Watch</a>
```
Replace with:
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="sermons.html">Watch</a>
```

Leave the footer `<li><a href="prayer.html">Prayer</a></li>` untouched.

- [ ] **Step 7: `give.html`**

Find (desktop nav):
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="prayer.html">Prayer</a>
      <a href="sermons.html">Watch</a>
```
Replace with:
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="sermons.html">Watch</a>
```

Find (mobile nav):
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="prayer.html">Prayer</a>
  <a href="sermons.html">Watch</a>
```
Replace with:
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="sermons.html">Watch</a>
```

Leave the footer's `<a href="prayer.html">Prayer</a>` (inside the "Navigate" footer column's `<li>` list) untouched.

- [ ] **Step 8: `lead-a-group.html`**

Find (desktop nav):
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="prayer.html">Prayer</a>
      <a href="sermons.html">Watch</a>
```
Replace with:
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="sermons.html">Watch</a>
```

Find (mobile nav):
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="prayer.html">Prayer</a>
  <a href="sermons.html">Watch</a>
```
Replace with:
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="sermons.html">Watch</a>
```

Leave the footer `<li><a href="prayer.html">Prayer</a></li>` untouched.

- [ ] **Step 9: `prayer.html`**

Find (desktop nav — note this one has `class="active"` since it's the current page):
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="prayer.html" class="active">Prayer</a>
      <a href="sermons.html">Watch</a>
```
Replace with:
```html
      <a href="growth-track.html">Growth Track</a>
      <a href="sermons.html">Watch</a>
```

Find (mobile nav):
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="prayer.html">Prayer</a>
  <a href="sermons.html">Watch</a>
```
Replace with:
```html
  <a href="growth-track.html">Growth Track</a>
  <a href="sermons.html">Watch</a>
```

Leave the footer `<li><a href="prayer.html">Prayer</a></li>` untouched. (Removing the current-page's own `active`-marked nav link is intentional and consistent with removing it everywhere else — the page no longer advertises itself in the top nav on any page, matching the spec's explicit inclusion of `prayer.html` itself in the nav-removal scope.)

- [ ] **Step 10: Verify — the link should be gone from every page's nav, but still present in every footer**

Run:
```bash
for f in index.html about.html events.html small-groups.html growth-track.html sermons.html give.html lead-a-group.html prayer.html; do
  echo "=== $f ==="
  grep -n 'href="prayer.html"' "$f"
done
```

Expected: for each file, the only remaining `href="prayer.html"` occurrences are inside a `<li>` (footer link) or, on `index.html` only, also the `class="btn btn-white btn-lg"` CTA button — none should appear as a bare `<a href="prayer.html">Prayer</a>` (or with `class="active"`) that isn't inside an `<li>`.

- [ ] **Step 11: Commit**

```bash
git add index.html about.html events.html small-groups.html growth-track.html sermons.html give.html lead-a-group.html prayer.html
git commit -m "Remove Prayer link from top navigation on all public pages"
```

---

### Task 4: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (e.g. the project's existing `static-site` preview launch config) and check, for at least `index.html` and one or two other pages (e.g. `small-groups.html`, `give.html`):

- No JS console errors.
- The "Need Prayer?" button appears fixed in the bottom-left corner.
- The top nav (desktop width and mobile/hamburger menu) no longer shows a "Prayer" link, but the footer link list still does.
- Clicking the button without moving it navigates to `prayer.html`.
- Clicking-and-dragging the button moves it, following the pointer, and it cannot be dragged off-screen (try dragging toward each edge).
- After dragging and releasing, reloading the page (or navigating to a different page) shows the button in the dropped position, not the default corner.
- Opening the browser's dev tools mobile/touch emulation (or an actual touch device) confirms the button can also be dragged via touch without the page scrolling underneath it.
- Open `prayer.html` directly — confirm the floating button does NOT appear there.
- Resize the browser window narrower after dragging the button near the right/bottom edge — confirm it re-clamps into view rather than ending up partially off-screen.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

Repeat the checks from Step 1 against the deployed staging site, including on an actual mobile device if convenient (touch-drag behavior is easiest to fully confirm on real hardware).

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
