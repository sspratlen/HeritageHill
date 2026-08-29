# Growth Track Recurring Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each Growth Track part runs on a fixed Sunday-of-month every month (instead of one manually-set date), with the next 3 occurrences shown on the public page and admin able to cancel/reinstate any specific occurrence.

**Architecture:** `growth_track_parts` gets a new `sunday_of_month` column; a new `growth_track_cancellations` table holds per-occurrence overrides. A shared date-arithmetic helper in `js/main.js` (loaded by both the public page and the admin dashboard) computes upcoming occurrence dates from a part's `sunday_of_month`. The public page and admin tab both consume this helper plus the cancellations list to decide what to show.

**Tech Stack:** Static HTML/JS, Supabase Postgres, no build step — verification is via `node --check`-style syntax checks, HTML tag-balance checks (`admin/dashboard.html`), a standalone date-arithmetic test, and manual browser verification.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/growth-track-recurring-schedule.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Growth Track recurring schedule: adds sunday_of_month to
-- growth_track_parts, and a new growth_track_cancellations table
-- for per-occurrence overrides. Run in the Supabase SQL editor.
-- Safe to re-run (idempotent).
--
-- The old growth_track_parts.session_date column is intentionally
-- left in place but unused going forward — no destructive change.
-- ============================================================

alter table public.growth_track_parts
  add column if not exists sunday_of_month smallint;

create table if not exists growth_track_cancellations (
  id           bigint generated always as identity primary key,
  part         text        not null, -- 'about_us' | 'about_you' | 'get_involved'
  session_date date        not null,
  created_at   timestamptz not null default now(),
  unique (part, session_date)
);

alter table growth_track_cancellations enable row level security;

drop policy if exists "Public can view growth track cancellations" on growth_track_cancellations;
drop policy if exists "Admin full access to growth track cancellations" on growth_track_cancellations;
create policy "Public can view growth track cancellations"
  on growth_track_cancellations for select
  using (true);
create policy "Admin full access to growth track cancellations"
  on growth_track_cancellations for all
  using (auth.role() = 'authenticated');
```

- [ ] **Step 2: Verify by inspection**

Confirm the `unique (part, session_date)` constraint and RLS policy shape match the pattern already used in `supabase/growth-track-schema.sql` for `growth_track_parts` (public `select`, admin-only `for all` via `auth.role() = 'authenticated'`).

- [ ] **Step 3: Commit**

```bash
git add supabase/growth-track-recurring-schedule.sql
git commit -m "Add migration for Growth Track recurring schedule and cancellations"
```

---

### Task 2: SupaDB mapping + cancellation CRUD methods

**Files:**
- Modify: `js/db.js:75-88` (`growthTrackPartFromDb`/`growthTrackPartToDb`)
- Modify: `js/db.js:426-434` (insert new methods after `adminUpdateGrowthTrackPart`, before `adminGetGrowthTrackRegistrations`)

- [ ] **Step 1: Add `sundayOfMonth` to the part mappers**

Current content at `js/db.js:75-88`:

```js
function growthTrackPartFromDb(r) {
  return {
    id: r.id, part: r.part, title: r.title, description: r.description || '',
    sessionDate: r.session_date, sessionTime: r.session_time || '',
    location: r.location || '', published: !!r.published,
  };
}
function growthTrackPartToDb(p) {
  return {
    title: p.title, description: p.description || '',
    session_date: p.sessionDate || null, session_time: p.sessionTime || '',
    location: p.location || '', published: !!p.published,
  };
}
```

Replace with:

```js
function growthTrackPartFromDb(r) {
  return {
    id: r.id, part: r.part, title: r.title, description: r.description || '',
    sessionDate: r.session_date, sessionTime: r.session_time || '',
    location: r.location || '', published: !!r.published,
    sundayOfMonth: r.sunday_of_month || null,
  };
}
function growthTrackPartToDb(p) {
  return {
    title: p.title, description: p.description || '',
    session_date: p.sessionDate || null, session_time: p.sessionTime || '',
    location: p.location || '', published: !!p.published,
    sunday_of_month: p.sundayOfMonth || null,
  };
}
```

- [ ] **Step 2: Add cancellation CRUD methods**

Current content at `js/db.js:426-435`:

```js
  async adminUpdateGrowthTrackPart(id, p) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_parts')
        .update(growthTrackPartToDb(p)).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminUpdateGrowthTrackPart:', e.message); return { error: e.message }; }
  },
  async adminGetGrowthTrackRegistrations(part) {
```

Replace with:

```js
  async adminUpdateGrowthTrackPart(id, p) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_parts')
        .update(growthTrackPartToDb(p)).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminUpdateGrowthTrackPart:', e.message); return { error: e.message }; }
  },
  async getGrowthTrackCancellations() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('growth_track_cancellations').select('*');
      if (error) throw error;
      return (data || []).map(r => ({ part: r.part, sessionDate: r.session_date }));
    } catch(e) { console.error('[SupaDB] getGrowthTrackCancellations:', e.message); return []; }
  },
  async adminCancelGrowthTrackOccurrence(part, sessionDate) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_cancellations')
        .upsert({ part, session_date: sessionDate }, { onConflict: 'part,session_date' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminCancelGrowthTrackOccurrence:', e.message); return { error: e.message }; }
  },
  async adminReinstateGrowthTrackOccurrence(part, sessionDate) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_cancellations')
        .delete().eq('part', part).eq('session_date', sessionDate);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminReinstateGrowthTrackOccurrence:', e.message); return { error: e.message }; }
  },
  async adminGetGrowthTrackRegistrations(part) {
```

`adminCancelGrowthTrackOccurrence` uses `upsert` (not `insert`) specifically so cancelling an already-cancelled occurrence is a harmless no-op instead of a constraint-violation error, matching the spec's error-handling requirement.

- [ ] **Step 3: Verify by inspection**

Run: `node --check js/db.js`
Expected: no output (exits 0)

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Add sundayOfMonth mapping and cancellation CRUD to SupaDB"
```

---

### Task 3: Shared occurrence-calculation helper

**Files:**
- Modify: `js/main.js` (insert new functions after `renderNavAvatar()`, before the `/* ── Floating "Need Prayer?" button` comment — this file is already loaded by both `growth-track.html` and `admin/dashboard.html`, matching the established pattern for cross-page shared helpers in this codebase)

- [ ] **Step 1: Add the occurrence-calculation functions**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```js
/* ── Floating "Need Prayer?" button ───────────────────── */
```

Insert immediately before it:

```js
/* ── Growth Track: recurring Sunday occurrence calculation ─
   Shared by growth-track.html (public) and admin/dashboard.html
   (Growth Track tab) — both load this file. */
function nthSundayOfMonth(year, month, n) {
  // month is 0-indexed (JS Date convention: 0 = January)
  const first = new Date(year, month, 1);
  const firstSundayDate = 1 + ((7 - first.getDay()) % 7);
  return new Date(year, month, firstSundayDate + (n - 1) * 7);
}

function growthTrackIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns the next `count` occurrence dates (as 'YYYY-MM-DD' strings) for a
// part that runs on the `sundayOfMonth`-th Sunday (1, 2, or 3) of every
// month, starting today, skipping any that have already passed. Returns
// [] if sundayOfMonth is falsy (part not yet configured with a schedule).
function computeGrowthTrackOccurrences(sundayOfMonth, count) {
  if (!sundayOfMonth) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dates = [];
  let year = today.getFullYear();
  let month = today.getMonth();
  while (dates.length < count) {
    const d = nthSundayOfMonth(year, month, sundayOfMonth);
    if (d >= today) dates.push(growthTrackIsoDate(d));
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return dates;
}

```

Every month has at least 3 Sundays, so `nthSundayOfMonth` with `n` of 1, 2, or 3 always produces a valid in-month date — no bounds checking needed.

- [ ] **Step 2: Verify JS syntax**

Run: `node --check js/main.js`
Expected: no output (exits 0)

- [ ] **Step 3: Verify the date arithmetic against known dates**

Run:
```bash
node -e "
$(sed -n '/^function nthSundayOfMonth/,/^}/p; /^function growthTrackIsoDate/,/^}/p' js/main.js)
console.log(growthTrackIsoDate(nthSundayOfMonth(2026, 8, 1))); // September 2026, 1st Sunday
console.log(growthTrackIsoDate(nthSundayOfMonth(2026, 1, 1))); // February 2026, 1st Sunday (starts on a Sunday)
"
```
Expected:
```
2026-09-06
2026-02-01
```
(September 1, 2026 is a Tuesday, so the 1st Sunday is the 6th; February 1, 2026 is itself a Sunday.)

- [ ] **Step 4: Commit**

```bash
git add js/main.js
git commit -m "Add shared Growth Track recurring-occurrence calculation helper"
```

---

### Task 4: Public page — recurring occurrences + per-date registration

**Files:**
- Modify: `growth-track.html:142` (add a hidden field for the chosen occurrence date)
- Modify: `growth-track.html` (`renderGtCard`, `loadGrowthTrack`, `openGtModal`, `handleGtSubmit`)

- [ ] **Step 1: Add a hidden field for the selected occurrence date**

Find this exact line:

```html
        <input type="hidden" id="gtPart" />
```

Replace with:

```html
        <input type="hidden" id="gtPart" />
        <input type="hidden" id="gtSessionDate" />
```

- [ ] **Step 2: Rewrite `renderGtCard` to list occurrences instead of one date**

Find this exact block:

```js
  function renderGtCard(p) {
    const meta = [fmtDate(p.sessionDate), p.sessionTime, p.location].filter(Boolean).join(' · ');
    return `
    <article class="card" data-reveal>
      <div class="card-body">
        <h3>${escapeHtml(p.title)}</h3>
        ${meta ? `<div class="card-meta"><span>${escapeHtml(meta)}</span></div>` : ''}
        <p style="font-size:.875rem;">${escapeHtml(p.description)}</p>
        <div style="margin-top:14px; text-align:right;">
          <button class="btn btn-primary btn-sm" onclick="openGtModal('${p.part}')">Register</button>
        </div>
      </div>
    </article>`;
  }
```

Replace with:

```js
  function renderGtCard(p) {
    const timeLocation = [p.sessionTime, p.location].filter(Boolean).join(' · ');
    const occurrences = computeGrowthTrackOccurrences(p.sundayOfMonth, 3);
    const occurrenceRows = occurrences.map(date => {
      const cancelled = _gtCancellations.some(c => c.part === p.part && c.sessionDate === date);
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid #eee;">
          <span style="font-size:.85rem; ${cancelled ? 'color:#999; text-decoration:line-through;' : ''}">${escapeHtml(fmtDate(date))}</span>
          ${cancelled
            ? '<span style="font-size:.78rem; color:#999; font-weight:600;">Cancelled</span>'
            : `<button class="btn btn-primary btn-sm" onclick="openGtModal('${p.part}','${date}')">Register</button>`}
        </div>`;
    }).join('');
    return `
    <article class="card" data-reveal>
      <div class="card-body">
        <h3>${escapeHtml(p.title)}</h3>
        ${timeLocation ? `<div class="card-meta"><span>${escapeHtml(timeLocation)}</span></div>` : ''}
        <p style="font-size:.875rem;">${escapeHtml(p.description)}</p>
        ${occurrenceRows ? `<div style="margin-top:14px;">${occurrenceRows}</div>` : ''}
      </div>
    </article>`;
  }
```

- [ ] **Step 3: Fetch cancellations alongside parts**

Find this exact block:

```js
  async function loadGrowthTrack() {
    _gtParts = await SupaDB.getPublishedGrowthTrackParts();
    const grid = document.getElementById('gtGrid');
    const empty = document.getElementById('gtEmpty');
    if (!_gtParts.length) { grid.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    grid.innerHTML = _gtParts.map(renderGtCard).join('');
  }
  loadGrowthTrack();
```

Replace with:

```js
  let _gtCancellations = [];
  async function loadGrowthTrack() {
    [_gtParts, _gtCancellations] = await Promise.all([
      SupaDB.getPublishedGrowthTrackParts(),
      SupaDB.getGrowthTrackCancellations(),
    ]);
    const grid = document.getElementById('gtGrid');
    const empty = document.getElementById('gtEmpty');
    if (!_gtParts.length) { grid.innerHTML = ''; empty.style.display = ''; return; }
    empty.style.display = 'none';
    grid.innerHTML = _gtParts.map(renderGtCard).join('');
  }
  loadGrowthTrack();
```

`SupaDB.getGrowthTrackCancellations()` already fails safe (returns `[]` on any error), so if this fetch fails, `_gtCancellations` stays empty and every occurrence is simply treated as not-cancelled — matching the spec's fail-open error handling.

- [ ] **Step 4: Update `openGtModal` to accept and store the chosen date**

Find this exact block:

```js
  async function openGtModal(part) {
    const p = _gtParts.find(x => x.part === part);
    document.getElementById('gtPart').value = part;
    document.getElementById('gtPartDisplay').textContent = p ? p.title : '';
    document.getElementById('gtForm').reset();
```

Replace with:

```js
  async function openGtModal(part, sessionDate) {
    const p = _gtParts.find(x => x.part === part);
    document.getElementById('gtPart').value = part;
    document.getElementById('gtSessionDate').value = sessionDate || '';
    document.getElementById('gtPartDisplay').textContent = p
      ? (sessionDate ? p.title + ' — ' + fmtDate(sessionDate) : p.title)
      : '';
    document.getElementById('gtForm').reset();
```

`document.getElementById('gtForm').reset()` (unchanged, still runs after setting `gtPart`/`gtSessionDate`) does not clear hidden `<input>` fields in practice — confirmed by testing this exact form in-browser — so `gtSessionDate` survives it the same way `gtPart` already does today. Keep this call in its existing position; no reordering needed.

- [ ] **Step 5: Update `handleGtSubmit` to use the selected date**

Find this exact block:

```js
  async function handleGtSubmit(e) {
    e.preventDefault();
    const part = document.getElementById('gtPart').value;
    const p = _gtParts.find(x => x.part === part);
    let userId = null;
    try { const user = await SupaDB.getUser(); if (user) userId = user.id; } catch (err) { /* not logged in */ }
    const reg = {
      part, sessionDate: p ? p.sessionDate : null, sessionTime: p ? p.sessionTime : '',
      name: document.getElementById('gtName').value.trim(),
      email: document.getElementById('gtEmail').value.trim(),
      phone: document.getElementById('gtPhone').value.trim(),
      notes: document.getElementById('gtNotes').value.trim(),
      userId,
    };
```

Replace with:

```js
  async function handleGtSubmit(e) {
    e.preventDefault();
    const part = document.getElementById('gtPart').value;
    const sessionDate = document.getElementById('gtSessionDate').value || null;
    const p = _gtParts.find(x => x.part === part);
    let userId = null;
    try { const user = await SupaDB.getUser(); if (user) userId = user.id; } catch (err) { /* not logged in */ }
    const reg = {
      part, sessionDate, sessionTime: p ? p.sessionTime : '',
      name: document.getElementById('gtName').value.trim(),
      email: document.getElementById('gtEmail').value.trim(),
      phone: document.getElementById('gtPhone').value.trim(),
      notes: document.getElementById('gtNotes').value.trim(),
      userId,
    };
```

This is the key behavior change: `sessionDate` now comes from which specific occurrence the visitor clicked "Register" on, instead of always being the part's single fixed date. `sessionTime`/`location` are unchanged — still read from the part itself, since every occurrence of a part shares the same time/location per the spec.

Important: because `document.getElementById('gtForm').reset()` (inside `openGtModal`, unchanged position from Step 4) resets the FORM's fields but `gtPart`/`gtSessionDate` are set via JS immediately before that call and `reset()` only reverts fields to their HTML-declared default (empty, since neither has a `value=""` attribute) — re-verify in Step 6 below that submitting actually sends the correct `sessionDate`, since this ordering was already present in the working codebase before this change (this plan does not alter that ordering) and Step 6 is the authoritative check, not this note.

- [ ] **Step 6: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('growth-track.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 7: Commit**

```bash
git add growth-track.html
git commit -m "Show recurring occurrences and register per-date on public Growth Track page"
```

---

### Task 5: Admin Growth Track tab — Sunday dropdown + occurrence cancel/reinstate

**Files:**
- Modify: `admin/dashboard.html:1385-1388` (part edit modal — swap Date field for Sunday-of-month dropdown)
- Modify: `admin/dashboard.html` (`renderGrowthTrackTab`, `openGtPartModal`, `saveGtPart`; add new `toggleGtOccurrence` function)

- [ ] **Step 1: Replace the Date field with a Sunday-of-month dropdown**

Find this exact block:

```html
      <div class="form-row">
        <div class="field"><label>Date</label><input type="date" id="gtpDate" /></div>
        <div class="field"><label>Time</label><input type="text" id="gtpTime" placeholder="e.g. 9:00 AM" /></div>
      </div>
```

Replace with:

```html
      <div class="form-row">
        <div class="field"><label>Which Sunday</label>
          <select id="gtpSundayOfMonth">
            <option value="">— Not Scheduled —</option>
            <option value="1">1st Sunday</option>
            <option value="2">2nd Sunday</option>
            <option value="3">3rd Sunday</option>
          </select>
        </div>
        <div class="field"><label>Time</label><input type="text" id="gtpTime" placeholder="e.g. 9:00 AM" /></div>
      </div>
```

- [ ] **Step 2: Verify div/tag balance was not disturbed**

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
Expected: `BALANCED`. Mandatory before committing any HTML change to this file. This edit adds no `<div>`/`</div>` at all, so the count should be unchanged from before this task.

- [ ] **Step 3: Update `openGtPartModal` and `saveGtPart` to use the dropdown**

Find this exact block:

```js
function openGtPartModal(part) {
  const p = _gtPartsAdmin.find(x => x.part === part);
  if (!p) return;
  document.getElementById('gtPartModalTitle').textContent = 'Edit ' + (p.title || GT_LABELS[part]);
  document.getElementById('gtpId').value = p.id;
  document.getElementById('gtpPublished').checked = p.published;
  document.getElementById('gtpTitle').value = p.title || '';
  document.getElementById('gtpDescription').value = p.description || '';
  document.getElementById('gtpDate').value = p.sessionDate || '';
  document.getElementById('gtpTime').value = p.sessionTime || '';
  document.getElementById('gtpLocation').value = p.location || '';
  document.getElementById('gtPartModal').classList.add('open');
}
function closeGtPartModal() { document.getElementById('gtPartModal').classList.remove('open'); }

async function saveGtPart() {
  const id = document.getElementById('gtpId').value;
  const result = await SupaDB.adminUpdateGrowthTrackPart(id, {
    title: document.getElementById('gtpTitle').value.trim(),
    description: document.getElementById('gtpDescription').value.trim(),
    sessionDate: document.getElementById('gtpDate').value || null,
    sessionTime: document.getElementById('gtpTime').value.trim(),
    location: document.getElementById('gtpLocation').value.trim(),
    published: document.getElementById('gtpPublished').checked,
  });
  if (result.error) { showToast(result.error, true); return; }
  showToast('Growth Track part saved');
  closeGtPartModal();
  renderGrowthTrackTab();
}
```

Replace with:

```js
function openGtPartModal(part) {
  const p = _gtPartsAdmin.find(x => x.part === part);
  if (!p) return;
  document.getElementById('gtPartModalTitle').textContent = 'Edit ' + (p.title || GT_LABELS[part]);
  document.getElementById('gtpId').value = p.id;
  document.getElementById('gtpPublished').checked = p.published;
  document.getElementById('gtpTitle').value = p.title || '';
  document.getElementById('gtpDescription').value = p.description || '';
  document.getElementById('gtpSundayOfMonth').value = p.sundayOfMonth || '';
  document.getElementById('gtpTime').value = p.sessionTime || '';
  document.getElementById('gtpLocation').value = p.location || '';
  document.getElementById('gtPartModal').classList.add('open');
}
function closeGtPartModal() { document.getElementById('gtPartModal').classList.remove('open'); }

async function saveGtPart() {
  const id = document.getElementById('gtpId').value;
  const sundayVal = document.getElementById('gtpSundayOfMonth').value;
  const result = await SupaDB.adminUpdateGrowthTrackPart(id, {
    title: document.getElementById('gtpTitle').value.trim(),
    description: document.getElementById('gtpDescription').value.trim(),
    sundayOfMonth: sundayVal ? parseInt(sundayVal, 10) : null,
    sessionTime: document.getElementById('gtpTime').value.trim(),
    location: document.getElementById('gtpLocation').value.trim(),
    published: document.getElementById('gtpPublished').checked,
  });
  if (result.error) { showToast(result.error, true); return; }
  showToast('Growth Track part saved');
  closeGtPartModal();
  renderGrowthTrackTab();
}
```

- [ ] **Step 4: Rewrite `renderGrowthTrackTab` to show upcoming occurrences with cancel/reinstate**

Find this exact block:

```js
/* GROWTH TRACK */
let _gtPartsAdmin = [];
const GT_LABELS = { about_us: 'About Us', about_you: 'About You', get_involved: 'Get Involved' };

async function renderGrowthTrackTab() {
  _gtPartsAdmin = await SupaDB.adminGetAllGrowthTrackParts();
  document.getElementById('gtCards').innerHTML = _gtPartsAdmin.map(p => `
    <div class="chart-card" style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <h3 style="font-size:1.05rem;">${escapeHtml(p.title || GT_LABELS[p.part])}</h3>
        ${p.published?'<span class="badge badge-green">Published</span>':'<span class="badge badge-gray">Draft</span>'}
      </div>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px;">
        ${p.sessionDate ? new Date(p.sessionDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'No date set'}
        ${p.sessionTime ? ' · ' + escapeHtml(p.sessionTime) : ''}${p.location ? ' · ' + escapeHtml(p.location) : ''}
      </p>
      <div class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="openGtPartModal('${p.part}')">Edit</button>
        <button class="btn btn-primary btn-sm" onclick="openGtRoster('${p.part}')">Registrants</button>
      </div>
    </div>`).join('');
}
```

Replace with:

```js
/* GROWTH TRACK */
let _gtPartsAdmin = [], _gtCancellationsAdmin = [];
const GT_LABELS = { about_us: 'About Us', about_you: 'About You', get_involved: 'Get Involved' };
const SUNDAY_LABELS = { 1: '1st Sunday', 2: '2nd Sunday', 3: '3rd Sunday' };

async function renderGrowthTrackTab() {
  [_gtPartsAdmin, _gtCancellationsAdmin] = await Promise.all([
    SupaDB.adminGetAllGrowthTrackParts(),
    SupaDB.getGrowthTrackCancellations(),
  ]);
  document.getElementById('gtCards').innerHTML = _gtPartsAdmin.map(p => {
    const occurrences = computeGrowthTrackOccurrences(p.sundayOfMonth, 6);
    const occurrenceRows = occurrences.map(date => {
      const cancelled = _gtCancellationsAdmin.some(c => c.part === p.part && c.sessionDate === date);
      const dateDisplay = new Date(date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:.82rem;">
          <span style="${cancelled?'color:var(--text-muted);text-decoration:line-through;':''}">${dateDisplay}</span>
          <button class="btn btn-ghost btn-sm" onclick="toggleGtOccurrence('${p.part}','${date}',${!cancelled})">${cancelled?'Reinstate':'Cancel'}</button>
        </div>`;
    }).join('');
    return `
    <div class="chart-card" style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <h3 style="font-size:1.05rem;">${escapeHtml(p.title || GT_LABELS[p.part])}</h3>
        ${p.published?'<span class="badge badge-green">Published</span>':'<span class="badge badge-gray">Draft</span>'}
      </div>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px;">
        ${p.sundayOfMonth ? escapeHtml(SUNDAY_LABELS[p.sundayOfMonth]) + ' of every month' : 'Not scheduled'}
        ${p.sessionTime ? ' · ' + escapeHtml(p.sessionTime) : ''}${p.location ? ' · ' + escapeHtml(p.location) : ''}
      </p>
      ${occurrenceRows ? `<div style="margin-bottom:12px;">
        <p style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:4px;">Upcoming Occurrences</p>
        ${occurrenceRows}
      </div>` : ''}
      <div class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="openGtPartModal('${p.part}')">Edit</button>
        <button class="btn btn-primary btn-sm" onclick="openGtRoster('${p.part}')">Registrants</button>
      </div>
    </div>`;
  }).join('');
}

async function toggleGtOccurrence(part, sessionDate, shouldCancel) {
  const result = shouldCancel
    ? await SupaDB.adminCancelGrowthTrackOccurrence(part, sessionDate)
    : await SupaDB.adminReinstateGrowthTrackOccurrence(part, sessionDate);
  if (result.error) { showToast(result.error, true); return; }
  showToast(shouldCancel ? 'Occurrence cancelled' : 'Occurrence reinstated');
  renderGrowthTrackTab();
}
```

- [ ] **Step 5: Verify div/tag balance again**

Run the same balance-check command from Step 2.
Expected: `BALANCED`

- [ ] **Step 6: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 7: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Sunday-of-month scheduling and occurrence cancel/reinstate to admin Growth Track tab"
```

---

### Task 6: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (e.g. the project's existing `static-site` preview launch config). Confirm:

- Opening `growth-track.html` throws no console errors, and (since no part has `sunday_of_month` set yet before the migration is manually applied and parts are manually reconfigured) each card gracefully shows no occurrence rows and no Register buttons rather than erroring.
- `admin/dashboard.html` loads with no console errors (redirects to login when unauthenticated, as expected).
- The date-arithmetic verification from Task 3, Step 3 still passes.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

1. Confirm the migration (`supabase/growth-track-recurring-schedule.sql`) has been run — if not, ask the user to run it before continuing.
2. Log into `admin/dashboard.html`, open the Growth Track tab, edit each of the 3 parts to set a "Which Sunday" value (e.g. About Us = 1st, About You = 2nd, Get Involved = 3rd), save.
3. Confirm each part's card now shows "Upcoming Occurrences" with 6 correctly-computed future Sundays, and that the summary line reads "1st Sunday of every month" (etc.) instead of a single date.
4. Click "Cancel" on one upcoming occurrence — confirm it immediately shows as cancelled (strikethrough) with a "Reinstate" button, and reloading the tab preserves that state.
5. Click "Reinstate" on it — confirm it returns to normal with a "Cancel" button.
6. Open `growth-track.html` on staging — confirm each published part now lists its next 3 occurrences, each with its own "Register" button, and that the occurrence you cancelled in step 4 (if still within the next-3 window and not yet reinstated) shows as "Cancelled" instead of a Register button.
7. Register for one specific occurrence — confirm the success screen appears, then check the admin Growth Track tab's "Registrants" list for that part shows the new registration with the correct specific date (not always the same date regardless of which occurrence was clicked).

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
