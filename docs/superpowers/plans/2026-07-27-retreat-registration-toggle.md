# Men's Retreat Registration Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin turn Men's Retreat registration on/off from the dashboard, closing the public `mensretreat/index.html` page (replacing its content with a "closed" message) the moment it's off — seeded closed by default.

**Architecture:** Reuse the existing `site_settings` key/value table (already has public-read/admin-write RLS) with a new `retreat_registration_open` boolean key. `js/db.js` gets two new SupaDB methods matching the existing `getBannerSettings`/`saveBannerSettings` pattern. The admin dashboard's Retreat tab gets a checkbox toggle wired to those methods. The public retreat page — which is a standalone HTML file with its own inline `fetch`-based Supabase calls, not using `js/db.js` — gets a same-origin REST fetch at the top of its existing script that gates whether the page content or a "closed" message is shown.

**Tech Stack:** Static HTML/JS, Supabase Postgres (via `site_settings`), Supabase JS client (`admin/dashboard.html`) and raw REST `fetch` (`mensretreat/index.html`).

---

### Task 1: Database migration — seed the toggle row

**Files:**
- Create: `supabase/retreat-toggle-schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Men's Retreat registration on/off toggle.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Reuses the existing site_settings table and its RLS policies
-- ("Public can read site settings" / "Admin full access to site
-- settings") — no schema or policy changes needed.
--
-- Seeds the row CLOSED (false) so registration is off the moment
-- this runs. Toggle it from the admin dashboard's Retreat 2026 tab.
-- ============================================================

insert into site_settings (key, value)
values ('retreat_registration_open', 'false'::jsonb)
on conflict (key) do nothing;
```

- [ ] **Step 2: Verify the file is valid SQL by inspection**

Confirm the statement matches the existing `site_settings` table shape (`key text primary key`, `value jsonb`) defined in `supabase/schema.sql` around line 271. No automated test — this file is run manually by the site owner in the Supabase SQL editor (not part of this repo's CI).

- [ ] **Step 3: Commit**

```bash
git add supabase/retreat-toggle-schema.sql
git commit -m "Add migration to seed retreat registration toggle (closed by default)"
```

---

### Task 2: SupaDB methods in js/db.js

**Files:**
- Modify: `js/db.js:928` (insert new methods immediately after the existing `saveBannerSettings` method, before the `/* ── Attendance ─────` comment)

- [ ] **Step 1: Locate the exact insertion point**

Current content at `js/db.js:920-930`:

```js
  async saveBannerSettings(settings) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'announcement_bar', value: settings, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { success: true };
    } catch(e) { console.error('[SupaDB] saveBannerSettings:', e.message); return { error: e.message }; }
  },

  /* ── Attendance ─────────────────────────────────────────── */
  async adminGetAllAttendance() {
```

- [ ] **Step 2: Insert the two new methods between the closing `},` of `saveBannerSettings` and the `/* ── Attendance` comment**

Replace that block with:

```js
  async saveBannerSettings(settings) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'announcement_bar', value: settings, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { success: true };
    } catch(e) { console.error('[SupaDB] saveBannerSettings:', e.message); return { error: e.message }; }
  },

  /* ── Site Settings: Retreat Registration Toggle ────────── */
  async getRetreatRegistrationOpen() {
    if (!db()) return true;
    try {
      const { data, error } = await db().from('site_settings').select('value').eq('key','retreat_registration_open').single();
      if (error) return true;
      return data?.value !== false;
    } catch(e) { console.error('[SupaDB] getRetreatRegistrationOpen:', e.message); return true; }
  },
  async setRetreatRegistrationOpen(isOpen) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'retreat_registration_open', value: isOpen, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { success: true };
    } catch(e) { console.error('[SupaDB] setRetreatRegistrationOpen:', e.message); return { error: e.message }; }
  },

  /* ── Attendance ─────────────────────────────────────────── */
  async adminGetAllAttendance() {
```

`getRetreatRegistrationOpen` fails open (`true`) on any read error or missing row — a transient DB hiccup reading the admin dashboard's toggle state should not read as "closed" and confuse an admin into thinking something is broken that isn't.

- [ ] **Step 3: Verify by inspection**

Run: `node --check js/db.js`
Expected: no output (exits 0), confirming valid JS syntax. This codebase has no unit test suite for `js/db.js` — syntax check plus the manual dashboard verification in Task 3/5 is the established verification pattern (see prior features' plans in `docs/superpowers/plans/`).

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Add getRetreatRegistrationOpen/setRetreatRegistrationOpen to SupaDB"
```

---

### Task 3: Admin toggle in Retreat 2026 tab

**Files:**
- Modify: `admin/dashboard.html:971-975` (action-bar header row of `#panelRetreat`)
- Modify: `admin/dashboard.html:4590-4593` (`renderRetreatTable` function)

- [ ] **Step 1: Add the toggle checkbox to the tab header**

Current content at `admin/dashboard.html:971-975`:

```html
      <div class="action-bar">
        <h2>Retreat Registrations</h2>
        <span id="retreatCount" style="font-size:.85rem;color:var(--text-muted);"></span>
        <button class="btn btn-secondary btn-sm" onclick="downloadRetreatCSV()" style="margin-left:auto;">⬇ Download CSV</button>
      </div>
```

Replace with:

```html
      <div class="action-bar">
        <h2>Retreat Registrations</h2>
        <span id="retreatCount" style="font-size:.85rem;color:var(--text-muted);"></span>
        <label style="display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--text-muted);cursor:pointer;">
          <input type="checkbox" id="retreatOpenToggle" onchange="toggleRetreatOpen(this.checked)" style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;" />
          Registration Open
        </label>
        <button class="btn btn-secondary btn-sm" onclick="downloadRetreatCSV()" style="margin-left:auto;">⬇ Download CSV</button>
      </div>
```

- [ ] **Step 2: Load and persist the toggle state**

Current content at `admin/dashboard.html:4587-4593`:

```js
/* ── Retreat Registrations ───────────────────────────────── */
let _allRetreatRegs = [];

async function renderRetreatTable() {
  _allRetreatRegs = await SupaDB.adminGetAllRetreatRegistrations();
  filterRetreatRegs();
}
```

Replace with:

```js
/* ── Retreat Registrations ───────────────────────────────── */
let _allRetreatRegs = [];

async function renderRetreatTable() {
  _allRetreatRegs = await SupaDB.adminGetAllRetreatRegistrations();
  filterRetreatRegs();
  loadRetreatOpenState();
}

async function loadRetreatOpenState() {
  const isOpen = await SupaDB.getRetreatRegistrationOpen();
  const el = document.getElementById('retreatOpenToggle');
  if (el) el.checked = isOpen;
}

async function toggleRetreatOpen(isOpen) {
  const res = await SupaDB.setRetreatRegistrationOpen(isOpen);
  if (res.error) {
    showToast('Failed to update registration status: ' + res.error, true);
    loadRetreatOpenState(); // revert checkbox to actual persisted state
  }
}
```

`showToast(msg, isError)` is the existing toast helper defined at `admin/dashboard.html:3983` — pass `true` as the second argument so a failed save shows as an error toast (red), matching its existing signature.

- [ ] **Step 3: Verify div/tag balance was not disturbed**

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
Expected: `BALANCED` (opens === closes). This file has a history of dangling-`</div>` bugs from careless HTML edits — this check is mandatory before committing any change to `admin/dashboard.html`.

- [ ] **Step 4: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 5: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add registration open/closed toggle to admin Retreat tab"
```

---

### Task 4: Gate the public retreat page

**Files:**
- Modify: `mensretreat/index.html:661-663` (open a wrapper div right after `<body>`)
- Modify: `mensretreat/index.html:945-947` (close the wrapper div, add the closed-message div, right after `</footer>` and before `<script>`)
- Modify: `mensretreat/index.html:947-951` (top of the existing script IIFE)

- [ ] **Step 1: Wrap the page content in a hidden-by-default container**

Current content at `mensretreat/index.html:661-664`:

```html
<body>

<!-- ══ 1. HERO ══════════════════════════════════════════════ -->
<header class="hero">
```

Replace with:

```html
<body>

<div id="page-content" style="visibility:hidden;">

<!-- ══ 1. HERO ══════════════════════════════════════════════ -->
<header class="hero">
```

- [ ] **Step 2: Close the wrapper and add the closed-message markup**

Current content at `mensretreat/index.html:938-947` (the footer block, ending right before the script tag):

```html
<!-- ══ 6. FOOTER ════════════════════════════════════════════ -->
<footer>
  <div class="container">
    <p class="footer-logo">Heritage <span>Hill</span> Church</p>
    <p class="footer-tagline">A Church of the Nazarene — Papillion, Nebraska</p>
    <p class="footer-copy">&copy; 2026 Heritage Hill Church. All rights reserved.</p>
  </div>
</footer>

<script>
```

Replace with:

```html
<!-- ══ 6. FOOTER ════════════════════════════════════════════ -->
<footer>
  <div class="container">
    <p class="footer-logo">Heritage <span>Hill</span> Church</p>
    <p class="footer-tagline">A Church of the Nazarene — Papillion, Nebraska</p>
    <p class="footer-copy">&copy; 2026 Heritage Hill Church. All rights reserved.</p>
  </div>
</footer>

</div>
<!-- /#page-content -->

<div id="closed-message" style="display:none;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:40px 16px;background:#1a1a1a;color:#F5F0E8;">
  <div>
    <h1 style="font-size:1.8rem;margin-bottom:12px;">Registration Is Currently Closed</h1>
    <p style="opacity:.7;">Check back soon, or reach out to <a href="mailto:scottspratlen@heritagehill.church" style="color:#E8891A;">scottspratlen@heritagehill.church</a> with questions.</p>
  </div>
</div>

<script>
```

- [ ] **Step 3: Add the gate check at the top of the existing script IIFE**

Current content at `mensretreat/index.html:947-952`:

```js
<script>
(function () {
  var SUPA_URL = 'https://ktyplbmawlaerzohkdqy.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0eXBsYm1hd2xhZXJ6b2hrZHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjU4MDgsImV4cCI6MjA5MzY0MTgwOH0.Pe0_syQjPqkwrdl8cno9YliY2i1i8x77R8bYCG8KXr4';

  window.handleRetreatSubmit = async function (e) {
```

Replace with:

```js
<script>
(function () {
  var SUPA_URL = 'https://ktyplbmawlaerzohkdqy.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0eXBsYm1hd2xhZXJ6b2hrZHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjU4MDgsImV4cCI6MjA5MzY0MTgwOH0.Pe0_syQjPqkwrdl8cno9YliY2i1i8x77R8bYCG8KXr4';

  fetch(SUPA_URL + '/rest/v1/site_settings?key=eq.retreat_registration_open&select=value', {
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
  })
    .then(function (res) { return res.ok ? res.json() : []; })
    .then(function (rows) {
      var isOpen = rows.length ? rows[0].value !== false : true;
      if (isOpen) {
        document.getElementById('page-content').style.visibility = 'visible';
      } else {
        document.getElementById('closed-message').style.display = 'flex';
      }
    })
    .catch(function () {
      // Network/parse failure: fail OPEN, matching the admin-side default,
      // rather than blocking legitimate registration due to a transient error.
      document.getElementById('page-content').style.visibility = 'visible';
    });

  window.handleRetreatSubmit = async function (e) {
```

This runs before `handleRetreatSubmit` is even defined, and does not touch `handleRetreatSubmit` or the registration POST logic at all — the toggle only gates whether the form is shown, not the submit path itself.

- [ ] **Step 4: Verify tag balance in the modified region**

Run:
```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('mensretreat/index.html', 'utf8');
const opens = (content.match(/<div/g) || []).length;
const closes = (content.match(/<\/div>/g) || []).length;
console.log('opens:', opens, 'closes:', closes, opens === closes ? 'BALANCED' : 'MISMATCH');
"
```
Expected: `BALANCED`

- [ ] **Step 5: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('mensretreat/index.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 6: Commit**

```bash
git add mensretreat/index.html
git commit -m "Gate mensretreat/index.html on retreat_registration_open setting"
```

---

### Task 5: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (e.g. `npx serve .` on a free port) and open `mensretreat/index.html` in a browser. Since there is no local Supabase network access assumption to rely on, check via browser dev tools / preview tooling that:
- The page does not throw a JS console error.
- Either `#page-content` becomes visible or `#closed-message` becomes visible within a second or two (whichever the live `site_settings` row currently says) — it should never show both, and it should never show neither (a fetch failure must still resolve to the `.catch` fail-open branch making `#page-content` visible).

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

On the deployed staging site:
1. Visit the Men's Retreat page — since Task 1's migration seeds the row `false`, confirm it shows the "Registration Is Currently Closed" message, not the form.
2. Log into `admin/dashboard.html`, go to the Retreat 2026 tab, confirm the "Registration Open" checkbox is unchecked.
3. Check the checkbox. Confirm no error toast appears.
4. Reload the Men's Retreat page — confirm it now shows the full page and registration form.
5. Uncheck the checkbox from the admin dashboard again, reload the public page, confirm it returns to the closed message (this restores the intended "off" state you asked for).

- [ ] **Step 4: Report results back to the user**

Summarize what was verified in steps 1-3 above and confirm current live state (open/closed) before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
