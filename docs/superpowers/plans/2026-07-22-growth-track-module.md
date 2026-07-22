# Growth Track Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public "Growth Track" page with three registerable parts (About Us / About You / Get Involved), each independently editable (date/time/location/description/published) by admins, with a manual-add-capable roster per part.

**Architecture:** Static HTML + Supabase (Postgres/RLS), following this codebase's existing `groups`/`signups` pattern exactly (not the newer `assessments` module's uuid/is_admin() pattern — `growth_track_parts`/`growth_track_registrations` are public-content tables like `groups`, so they use the same `bigint identity` + `auth.role() = 'authenticated'` RLS shape already used by `groups`/`events`/`signups`). Reschedule-safe rosters via a date-snapshot column, mirroring the existing `group_attendance` snapshot pattern.

**Tech Stack:** Vanilla JS, Supabase JS v2 (`window._supabase` via `js/supabase-client.js`, `SupaDB` API in `js/db.js`).

**Spec:** `docs/superpowers/specs/2026-07-22-growth-track-design.md`

**Testing note:** Static site, no test framework — each task ends with manual/SQL verification.

**Key facts an implementer needs:**
- `groups`/`signups`/`events` all use `bigint generated always as identity primary key` and RLS shaped as: public SELECT where `published = true` (or public INSERT for signup-style tables), admin via `using (auth.role() = 'authenticated')`. Follow this, not the assessments module's `is_admin()` helper — that helper lives in `assessments-schema.sql` and this feature must not depend on it.
- `SupaDB` methods return camelCase objects; snake_case↔camelCase mappers live at the top of `js/db.js` (e.g. `groupFromDb`/`groupToDb`).
- Modal markup convention: `.modal-overlay`/`.modal` (add `.modal-lg` for wider ones)/`.modal-header`/`.modal-body`/`.modal-footer`, close button `<button class="modal-close" onclick="closeX()">✕</button>`.
- Form field convention: `.form-row` wrapping two `.field` divs (each a `<label>` + `<input>`/`<select>`/`<textarea>`), `.form-row.full` for a single full-width field.
- Publish toggle convention: `.publish-toggle-row` containing a label block and `<label class="toggle-switch"><input type="checkbox" id="..." /><span class="toggle-slider"></span></label>`.
- Table/badge convention: plain `<table>`, `.badge.badge-green/gray/blue/amber/red`, action buttons wrapped in `<div class="td-actions">`.
- Public pages needing nav edits: `index.html`, `about.html`, `events.html`, `small-groups.html`, `prayer.html`, `sermons.html`, `give.html`, `lead-a-group.html` — each has a desktop `.nav-links` block and a mobile `.nav-mobile` block; both need the new link.
- Admin-only floating edit button convention on public pages: `<div class="admin-edit-bar" id="adminBar"><a href="admin/dashboard.html?tab=X" class="admin-fab" title="Manage X">✏️</a></div>` shown via `isAdminLoggedIn().then(ok => { if (ok) document.getElementById('adminBar').classList.add('show'); });`.
- Site pushes: commit → `git push staging HEAD:main` → verify on staging → `git push origin HEAD:main`. NEVER push origin without staging first, and only when the user explicitly asks.

---

### Task 1: Database schema, RLS, and seed

**Files:**
- Create: `supabase/growth-track-schema.sql`

- [ ] **Step 1: Write the schema file**

```sql
-- ============================================================
-- Growth Track module: growth_track_parts, growth_track_registrations
-- + RLS + one-time seed of the 3 fixed parts. Run in the Supabase
-- SQL editor. Safe to re-run (idempotent) EXCEPT the seed insert,
-- which is guarded by ON CONFLICT DO NOTHING so it won't duplicate
-- or overwrite rows you've already edited.
-- ============================================================

create table if not exists growth_track_parts (
  id           bigint generated always as identity primary key,
  part         text        not null unique, -- 'about_us' | 'about_you' | 'get_involved'
  title        text        not null,
  description  text        not null default '',
  session_date date,
  session_time text        not null default '',
  location     text        not null default '',
  published    boolean     not null default false
);

alter table growth_track_parts enable row level security;

drop policy if exists "Public can view published growth track parts" on growth_track_parts;
drop policy if exists "Admin full access to growth track parts" on growth_track_parts;
create policy "Public can view published growth track parts"
  on growth_track_parts for select
  using (published = true);
create policy "Admin full access to growth track parts"
  on growth_track_parts for all
  using (auth.role() = 'authenticated');

create table if not exists growth_track_registrations (
  id              bigint generated always as identity primary key,
  part            text        not null, -- 'about_us' | 'about_you' | 'get_involved'
  session_date    date,
  session_time    text        not null default '',
  name            text        not null,
  email           text        not null,
  phone           text        not null default '',
  notes           text        not null default '',
  added_by_admin  boolean     not null default false,
  created_at      timestamptz not null default now()
);

alter table growth_track_registrations enable row level security;

drop policy if exists "Public can submit growth track registrations" on growth_track_registrations;
drop policy if exists "Admin full access to growth track registrations" on growth_track_registrations;
create policy "Public can submit growth track registrations"
  on growth_track_registrations for insert
  with check (true);
create policy "Admin full access to growth track registrations"
  on growth_track_registrations for all
  using (auth.role() = 'authenticated');

insert into growth_track_parts (part, title, description, session_time, location, published) values
  ('about_us',     'About Us',     '', '', '', false),
  ('about_you',    'About You',    '', '', '', false),
  ('get_involved', 'Get Involved', '', '', '', false)
on conflict (part) do nothing;
```

- [ ] **Step 2: Have Scott run it in the Supabase SQL editor** (paste the whole file, run once — same manual step as the assessments module's schema).

- [ ] **Step 3: Verify** — run in the SQL editor:

```sql
select tablename, rowsecurity from pg_tables
 where tablename in ('growth_track_parts','growth_track_registrations');
select part, title, published from growth_track_parts order by part;
```
Expected: both tables `rowsecurity = true`; 3 rows in `growth_track_parts` (`about_us`, `about_you`, `get_involved`), all `published = false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/growth-track-schema.sql
git commit -m "Add Growth Track schema, RLS, and seed rows"
```

---

### Task 2: SupaDB methods in `js/db.js`

**Files:**
- Modify: `js/db.js` (add mappers near the other `*FromDb`/`*ToDb` pairs, after `groupToDb`; add methods in two places — a `PUBLIC` section near `getPublishedGroups`/`submitSignup`, and an `ADMIN` section near `adminGetAllGroups`/`saveGroup`)

- [ ] **Step 1: Add mappers** (directly after the existing `groupToDb` function):

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
function growthTrackRegistrationFromDb(r) {
  return {
    id: r.id, part: r.part, sessionDate: r.session_date, sessionTime: r.session_time || '',
    name: r.name, email: r.email, phone: r.phone || '', notes: r.notes || '',
    addedByAdmin: !!r.added_by_admin, createdAt: r.created_at,
  };
}
```

- [ ] **Step 2: Add public methods** — insert right after `getGroupById` (end of the `/* ── PUBLIC: Groups ── */` section), as a new section:

```js
/* ── PUBLIC: Growth Track ───────────────────────────────── */
  async getPublishedGrowthTrackParts() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('growth_track_parts').select('*')
        .eq('published', true).order('part');
      if (error) throw error;
      return (data || []).map(growthTrackPartFromDb);
    } catch(e) { console.error('[SupaDB] getPublishedGrowthTrackParts:', e.message); return []; }
  },
  async submitGrowthTrackRegistration(reg) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
      });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] submitGrowthTrackRegistration:', e.message); return { error: e.message }; }
  },
```

- [ ] **Step 3: Add admin methods** — insert right after `deleteGroup` (end of the `/* ── ADMIN: Groups ── */` section), as a new section:

```js
/* ── ADMIN: Growth Track ─────────────────────────────────── */
  async adminGetAllGrowthTrackParts() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('growth_track_parts').select('*').order('part');
      if (error) throw error;
      return (data || []).map(growthTrackPartFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllGrowthTrackParts:', e.message); return []; }
  },
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
    if (!db()) return [];
    try {
      const { data, error } = await db().from('growth_track_registrations')
        .select('*').eq('part', part).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(growthTrackRegistrationFromDb);
    } catch(e) { console.error('[SupaDB] adminGetGrowthTrackRegistrations:', e.message); return []; }
  },
  async adminAddGrowthTrackRegistration(reg) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
        added_by_admin: true,
      });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminAddGrowthTrackRegistration:', e.message); return { error: e.message }; }
  },
  async adminDeleteGrowthTrackRegistration(id) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations').delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminDeleteGrowthTrackRegistration:', e.message); return { error: e.message }; }
  },
```

- [ ] **Step 4: Verify** — run:

```bash
node -e "new Function(require('fs').readFileSync('js/db.js','utf8'))" && echo SYNTAX_OK
grep -c "function growthTrackPartFromDb\|function growthTrackPartToDb\|function growthTrackRegistrationFromDb" js/db.js
grep -c "getPublishedGrowthTrackParts\|submitGrowthTrackRegistration\|adminGetAllGrowthTrackParts\|adminUpdateGrowthTrackPart\|adminGetGrowthTrackRegistrations\|adminAddGrowthTrackRegistration\|adminDeleteGrowthTrackRegistration" js/db.js
```
Expected: `SYNTAX_OK`; first grep count `3`; second grep count `7` (each method name appears once as a definition — if any name is reused elsewhere the count will be higher, which is fine as long as you can see each is a single `async methodName(...)` definition when you read the file).

- [ ] **Step 5: Commit**

```bash
git add js/db.js
git commit -m "Add Growth Track methods to SupaDB"
```

---

### Task 3: Public `growth-track.html` page

**Files:**
- Create: `growth-track.html`

- [ ] **Step 1: Write the page.** Base it on `small-groups.html`'s structure exactly (same `<head>` boilerplate, same nav markup copied verbatim from `small-groups.html` but with `growth-track.html` given `class="active"` in the desktop nav and a `Growth Track` link added to both desktop and mobile nav — read `small-groups.html` lines 1–60 for the exact nav HTML to copy, and note it does NOT yet have a Growth Track link since this task is what adds it here first), same page-hero pattern, same footer, same admin-fab pattern pointing at `admin/dashboard.html?tab=growthtrack`.

Page body (after the hero):

```html
<section class="section">
  <div class="container">
    <div class="section-header">
      <h2>The Growth Track</h2>
      <p>Three simple steps to get connected, discover how you're wired, and find your place to serve.</p>
    </div>
    <div id="gtEmpty" style="display:none; text-align:center; padding:60px 20px; color:var(--text-muted);">
      <p>Registration isn't open yet — check back soon!</p>
    </div>
    <div id="gtGrid" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:24px;"></div>
  </div>
</section>
```

Registration modal (place before the closing `</body>`, alongside where `small-groups.html` places `#joinModal` — copy that modal's exact CSS/structure, changing ids and copy):

```html
<!-- ── Growth Track Registration Modal ───────────────────────────────── -->
<div id="gtModal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:999; align-items:center; justify-content:center; padding:20px;">
  <div style="background:#fff; border-radius:16px; width:100%; max-width:480px; max-height:90vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,.3);">
    <div style="display:flex; justify-content:space-between; align-items:center; padding:22px 24px 18px; border-bottom:1px solid #e4e4e4;">
      <div>
        <h3 style="font-size:1.1rem; margin-bottom:3px;">Register</h3>
        <p id="gtPartDisplay" style="font-size:.85rem; color:var(--primary); font-weight:600;"></p>
      </div>
      <button onclick="closeGtModal()" style="width:32px; height:32px; border-radius:50%; background:#f4f4f2; border:none; cursor:pointer; font-size:1.1rem; color:#666; display:flex; align-items:center; justify-content:center;">✕</button>
    </div>
    <div style="padding:22px 24px;">
      <div id="gtSuccess" style="display:none; text-align:center; padding:24px 0;">
        <div style="font-size:2.5rem; margin-bottom:12px;">✅</div>
        <h4 style="margin-bottom:8px; color:var(--text);">You're Registered!</h4>
        <p style="color:var(--text-muted); font-size:.9rem;">We'll see you there.</p>
      </div>
      <form id="gtForm" onsubmit="handleGtSubmit(event)">
        <input type="hidden" id="gtPart" />
        <div style="margin-bottom:14px;">
          <label style="display:block; font-size:.82rem; font-weight:600; margin-bottom:5px;">Full Name *</label>
          <input type="text" id="gtName" required placeholder="Your full name"
            style="width:100%; padding:.62rem .9rem; border:1.5px solid #e4e4e4; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:.9rem; outline:none;" />
        </div>
        <div style="margin-bottom:14px;">
          <label style="display:block; font-size:.82rem; font-weight:600; margin-bottom:5px;">Email Address *</label>
          <input type="email" id="gtEmail" required placeholder="your@email.com"
            style="width:100%; padding:.62rem .9rem; border:1.5px solid #e4e4e4; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:.9rem; outline:none;" />
        </div>
        <div style="margin-bottom:14px;">
          <label style="display:block; font-size:.82rem; font-weight:600; margin-bottom:5px;">Phone <span style="font-weight:400; color:#888;">(optional)</span></label>
          <input type="tel" id="gtPhone" placeholder="(402) 555-1234"
            style="width:100%; padding:.62rem .9rem; border:1.5px solid #e4e4e4; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:.9rem; outline:none;" />
        </div>
        <div style="margin-bottom:20px;">
          <label style="display:block; font-size:.82rem; font-weight:600; margin-bottom:5px;">Notes <span style="font-weight:400; color:#888;">(optional)</span></label>
          <textarea id="gtNotes" rows="3" placeholder="Anything we should know?"
            style="width:100%; padding:.62rem .9rem; border:1.5px solid #e4e4e4; border-radius:8px; font-family:'DM Sans',sans-serif; font-size:.9rem; outline:none; resize:vertical;"></textarea>
        </div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button type="button" onclick="closeGtModal()" style="padding:.55rem 1.2rem; border-radius:50px; border:2px solid #e4e4e4; background:transparent; font-family:'DM Sans',sans-serif; font-size:.875rem; font-weight:600; cursor:pointer; color:#666;">Cancel</button>
          <button type="submit" class="btn btn-primary">Register</button>
        </div>
      </form>
    </div>
  </div>
</div>
```

Script (loads `js/supabase-client.js` + `js/db.js` + `js/main.js`, same as `small-groups.html`):

```js
document.getElementById('footerYear').textContent = new Date().getFullYear();
isAdminLoggedIn().then(ok => { if (ok) document.getElementById('adminBar').classList.add('show'); });

let _gtParts = [];

function fmtDate(d) {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return new Date(y, m-1, day).toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
}

function renderGtCard(p) {
  const meta = [fmtDate(p.sessionDate), p.sessionTime, p.location].filter(Boolean).join(' · ');
  return `
  <article class="card" data-reveal>
    <div class="card-body">
      <h3>${p.title}</h3>
      ${meta ? `<div class="card-meta"><span>${meta}</span></div>` : ''}
      <p style="font-size:.875rem;">${p.description}</p>
      <div style="margin-top:14px; text-align:right;">
        <button class="btn btn-primary btn-sm" onclick="openGtModal('${p.part}','${p.title.replace(/'/g,"\\'")}')">Register</button>
      </div>
    </div>
  </article>`;
}

async function loadGrowthTrack() {
  _gtParts = await SupaDB.getPublishedGrowthTrackParts();
  const grid = document.getElementById('gtGrid');
  const empty = document.getElementById('gtEmpty');
  if (!_gtParts.length) { grid.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  grid.innerHTML = _gtParts.map(renderGtCard).join('');
}
loadGrowthTrack();

async function openGtModal(part, title) {
  document.getElementById('gtPart').value = part;
  document.getElementById('gtPartDisplay').textContent = title;
  document.getElementById('gtForm').reset();
  document.getElementById('gtForm').style.display = '';
  document.getElementById('gtSuccess').style.display = 'none';

  // Best-effort pre-fill from an active session; never blocks the form opening.
  try {
    const user = await SupaDB.getUser();
    if (user) {
      const profile = await SupaDB.getMyProfile();
      document.getElementById('gtName').value = profile ? profile.name : '';
      document.getElementById('gtEmail').value = profile ? profile.email : user.email;
      document.getElementById('gtPhone').value = profile ? profile.phone : '';
    }
  } catch (e) { /* not logged in or no profile — leave form blank */ }

  document.getElementById('gtModal').style.display = 'flex';
}

function closeGtModal() {
  document.getElementById('gtModal').style.display = 'none';
}

async function handleGtSubmit(e) {
  e.preventDefault();
  const part = document.getElementById('gtPart').value;
  const p = _gtParts.find(x => x.part === part);
  const reg = {
    part, sessionDate: p ? p.sessionDate : null, sessionTime: p ? p.sessionTime : '',
    name: document.getElementById('gtName').value.trim(),
    email: document.getElementById('gtEmail').value.trim(),
    phone: document.getElementById('gtPhone').value.trim(),
    notes: document.getElementById('gtNotes').value.trim(),
  };
  const result = await SupaDB.submitGrowthTrackRegistration(reg);
  if (result.error) {
    alert('Sorry, there was an error submitting your registration. Please try again or email us directly.');
    return;
  }
  document.getElementById('gtForm').style.display = 'none';
  document.getElementById('gtSuccess').style.display = '';
  setTimeout(closeGtModal, 2800);
}

document.getElementById('gtModal').addEventListener('click', function(e) {
  if (e.target === this) closeGtModal();
});
```

`SupaDB.getMyProfile()` and `SupaDB.getUser()` already exist (from the assessments module) — confirm by reading `js/db.js` before writing this file.

- [ ] **Step 2: Verify** — open the page in the browser preview. With no parts published yet (fresh seed from Task 1), confirm the empty-state message shows instead of an empty grid. In the Supabase SQL editor, temporarily `update growth_track_parts set published = true, title = 'Test', session_date = '2026-08-02', session_time = '10:00 AM' where part = 'about_us';`, refresh — confirm the card renders with the date formatted and a working Register button that opens the modal, submits, shows the success state, and inserts a row (`select * from growth_track_registrations;`). Revert the test update (`published = false`) when done so Task 1's clean seed state is preserved for later tasks.

- [ ] **Step 3: Commit**

```bash
git add growth-track.html
git commit -m "Add public Growth Track page"
```

---

### Task 4: Add "Growth Track" nav link to the other 7 public pages

**Files:**
- Modify: `index.html`, `about.html`, `events.html`, `small-groups.html`, `prayer.html`, `sermons.html`, `give.html`, `lead-a-group.html`

- [ ] **Step 1: For each of these 7 files**, find the desktop nav block's `<a href="small-groups.html"...>Small Groups</a>` line (it may or may not have `class="active"` depending on which page you're editing) and add immediately after it:

```html
<a href="growth-track.html">Growth Track</a>
```

Then find the mobile nav block's `<a href="small-groups.html"...>Small Groups</a>` line and add immediately after it the same link.

Do this for all 7 files. Grep each file first to find the exact surrounding text (whitespace/attributes vary slightly file to file):

```bash
grep -n 'href="small-groups.html"' index.html about.html events.html small-groups.html prayer.html sermons.html give.html lead-a-group.html
```

Each file should show exactly 2 matches (desktop + mobile). If any file shows a different count, stop and report BLOCKED with what you found — don't guess.

- [ ] **Step 2: Verify** — after editing, re-run the same grep but for `growth-track.html`:

```bash
grep -c 'href="growth-track.html"' index.html about.html events.html small-groups.html prayer.html sermons.html give.html lead-a-group.html
```
Expected: `2` for every file.

- [ ] **Step 3: Commit**

```bash
git add index.html about.html events.html small-groups.html prayer.html sermons.html give.html lead-a-group.html
git commit -m "Add Growth Track link to site navigation"
```

---

### Task 5: Admin dashboard — Growth Track tab (part cards + edit modal)

**Files:**
- Modify: `admin/dashboard.html` — sidebar nav, `ROLE_TABS`/`ALL_TABS`/`titles`/`switchTab` dispatch, new panel HTML, new modal HTML, new JS section

- [ ] **Step 1: Sidebar entry.** In the Content nav section (near the Groups link), add:

```html
<a onclick="switchTab('growthtrack')" id="sideGrowthtrack" data-tab="growthtrack">
  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
  Growth Track
</a>
```

- [ ] **Step 2: Role wiring.** In `ROLE_TABS`, add `'growthtrack'` to `admin`'s array only (this is admin-only per the spec — do not add it to `event_manager` or `small_group_leader`). In `ALL_TABS`, add `'growthtrack'`. In `switchTab()`'s `titles` object, add `growthtrack:'Growth Track'`. In the dispatch chain, add:

```js
else if(tab==='growthtrack') renderGrowthTrackTab();
```

Note `switchTab()` computes element ids as `tab[0].toUpperCase()+tab.slice(1)`, so `'growthtrack'` → `panelGrowthtrack`/`sideGrowthtrack` (matches the sidebar id from Step 1).

- [ ] **Step 3: Panel HTML.** Add alongside the other `<div class="tab-panel" id="panelX">` divs:

```html
<div class="tab-panel" id="panelGrowthtrack">
  <div id="gtCards" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px;"></div>
</div>
```

- [ ] **Step 4: Edit modal HTML.** Add alongside the other modals (copy the `groupModal` skeleton style):

```html
<!-- GROWTH TRACK PART EDIT MODAL -->
<div class="modal-overlay" id="gtPartModal">
  <div class="modal">
    <div class="modal-header"><h3 id="gtPartModalTitle">Edit Part</h3><button class="modal-close" onclick="closeGtPartModal()">✕</button></div>
    <div class="modal-body">
      <input type="hidden" id="gtpId" />
      <div class="publish-toggle-row">
        <div><div class="ptlabel">Published</div><div class="ptsub">Visible to the public on the Growth Track page</div></div>
        <label class="toggle-switch"><input type="checkbox" id="gtpPublished" /><span class="toggle-slider"></span></label>
      </div>
      <div class="form-row full"><div class="field"><label>Title *</label><input type="text" id="gtpTitle" placeholder="e.g. About Us" /></div></div>
      <div class="form-row full"><div class="field"><label>Description *</label><textarea id="gtpDescription" placeholder="Describe this part of the Growth Track…"></textarea></div></div>
      <div class="form-row">
        <div class="field"><label>Date</label><input type="date" id="gtpDate" /></div>
        <div class="field"><label>Time</label><input type="text" id="gtpTime" placeholder="e.g. 9:00 AM" /></div>
      </div>
      <div class="form-row full"><div class="field"><label>Location</label><input type="text" id="gtpLocation" placeholder="e.g. Heritage Hill Main Campus" /></div></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeGtPartModal()">Cancel</button><button class="btn btn-primary" onclick="saveGtPart()">Save</button></div>
  </div>
</div>
```

- [ ] **Step 5: JS section.** Add near the Groups tab's JS functions:

```js
/* GROWTH TRACK */
let _gtPartsAdmin = [];
const GT_LABELS = { about_us: 'About Us', about_you: 'About You', get_involved: 'Get Involved' };

async function renderGrowthTrackTab() {
  _gtPartsAdmin = await SupaDB.adminGetAllGrowthTrackParts();
  document.getElementById('gtCards').innerHTML = _gtPartsAdmin.map(p => `
    <div class="chart-card" style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <h3 style="font-size:1.05rem;">${p.title || GT_LABELS[p.part]}</h3>
        ${p.published?'<span class="badge badge-green">Published</span>':'<span class="badge badge-gray">Draft</span>'}
      </div>
      <p style="font-size:.85rem;color:var(--text-muted);margin-bottom:12px;">
        ${p.sessionDate ? new Date(p.sessionDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'No date set'}
        ${p.sessionTime ? ' · ' + p.sessionTime : ''}${p.location ? ' · ' + p.location : ''}
      </p>
      <div class="td-actions">
        <button class="btn btn-secondary btn-sm" onclick="openGtPartModal('${p.part}')">Edit</button>
        <button class="btn btn-primary btn-sm" onclick="openGtRoster('${p.part}')">Registrants</button>
      </div>
    </div>`).join('');
}

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
  if (result.error) { showToast('Error: ' + result.error, true); return; }
  showToast('Growth Track part saved');
  closeGtPartModal();
  renderGrowthTrackTab();
}
```

Check the file for the exact modal open/close convention (`classList.add('open')` vs `style.display`) by reading an existing `.modal-overlay` modal's open/close functions (e.g. `groupModal`'s — search for `openGroupModal`/`closeGroupModal`) and match it exactly; adjust the code above if it differs from what's shown.

- [ ] **Step 6: Verify** — as admin, open the Growth Track tab: 3 cards render (About Us / About You / Get Involved, all "Draft" since Task 1's seed leaves them unpublished). Click Edit on one, fill in title/description/date/time/location, toggle Published, Save — card updates to "Published" with the new date shown. Refresh the public `growth-track.html` page — the part now appears there too (RLS: public `select` succeeds since `published = true`).

- [ ] **Step 7: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Growth Track tab to admin dashboard (part cards + edit modal)"
```

---

### Task 6: Admin dashboard — Growth Track roster modal

**Files:**
- Modify: `admin/dashboard.html` — new modal HTML, new JS functions (same file as Task 5, separate commit since it's a distinct, independently-testable unit)

- [ ] **Step 1: Roster modal HTML.** Add alongside the other modals, styled like `groupRosterModal` (use `modal-lg`):

```html
<!-- GROWTH TRACK ROSTER MODAL -->
<div class="modal-overlay" id="gtRosterModal">
  <div class="modal modal-lg">
    <div class="modal-header">
      <h3 id="gtRosterTitle">Registrants</h3>
      <button class="modal-close" onclick="closeGtRoster()">✕</button>
    </div>
    <div class="modal-body">
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:24px;">
        <h4 style="font-size:.95rem;font-weight:700;margin-bottom:16px;">Add a Registrant</h4>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="field"><label>Name *</label><input id="gtrName" type="text" placeholder="Full name" /></div>
          <div class="field"><label>Email *</label><input id="gtrEmail" type="email" placeholder="email@example.com" /></div>
        </div>
        <div class="form-row" style="margin-bottom:12px;">
          <div class="field"><label>Phone <span style="font-size:.75rem;color:var(--text-muted);font-weight:400;">(optional)</span></label><input id="gtrPhone" type="tel" placeholder="(402) 555-1234" /></div>
          <div class="field"><label>Notes <span style="font-size:.75rem;color:var(--text-muted);font-weight:400;">(optional)</span></label><input id="gtrNotes" type="text" placeholder="Optional note" /></div>
        </div>
        <div style="text-align:right;">
          <button class="btn btn-primary btn-sm" onclick="addGtRegistrant()">Add Registrant</button>
        </div>
        <p id="gtrError" style="color:var(--danger);font-size:.82rem;margin:8px 0 0;display:none;"></p>
      </div>
      <div class="table-wrap" style="margin:0;">
        <table>
          <thead><tr><th>Name</th><th>Contact</th><th>Notes</th><th>Registered</th><th>Actions</th></tr></thead>
          <tbody id="gtRosterTable"></tbody>
        </table>
        <div id="gtRosterEmpty" class="empty" style="display:none;padding:24px 0;">
          <p style="margin:0;color:var(--text-muted);">No registrants yet for this session.</p>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="exportGtRosterCsv()">Export CSV</button>
      <div style="flex:1;"></div>
      <button class="btn btn-ghost" onclick="closeGtRoster()">Close</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: JS functions.** Add right after `saveGtPart()` from Task 5:

```js
let _gtRosterPart = null, _gtRosterRows = [];

function escapeHtmlGt(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function openGtRoster(part) {
  const p = _gtPartsAdmin.find(x => x.part === part);
  if (!p) return;
  _gtRosterPart = p;
  document.getElementById('gtRosterTitle').textContent = (p.title || GT_LABELS[part]) + ' — Registrants';
  document.getElementById('gtrName').value = '';
  document.getElementById('gtrEmail').value = '';
  document.getElementById('gtrPhone').value = '';
  document.getElementById('gtrNotes').value = '';
  document.getElementById('gtrError').style.display = 'none';
  await loadGtRoster();
  document.getElementById('gtRosterModal').classList.add('open');
}
function closeGtRoster() { document.getElementById('gtRosterModal').classList.remove('open'); }

async function loadGtRoster() {
  const all = await SupaDB.adminGetGrowthTrackRegistrations(_gtRosterPart.part);
  // "Current" roster = registrations whose snapshot matches the part's live date/time.
  _gtRosterRows = all.filter(r =>
    r.sessionDate === _gtRosterPart.sessionDate && r.sessionTime === _gtRosterPart.sessionTime);
  const tbody = document.getElementById('gtRosterTable'), empty = document.getElementById('gtRosterEmpty');
  if (!_gtRosterRows.length) { tbody.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  tbody.innerHTML = _gtRosterRows.map(r => `
    <tr>
      <td><strong>${escapeHtmlGt(r.name)}</strong>${r.addedByAdmin ? ' <span class="badge badge-gray">manual</span>' : ''}</td>
      <td>${escapeHtmlGt(r.email)}${r.phone ? '<br><span style="font-size:.8rem;color:var(--text-muted);">' + escapeHtmlGt(r.phone) + '</span>' : ''}</td>
      <td>${escapeHtmlGt(r.notes)}</td>
      <td>${new Date(r.createdAt).toLocaleDateString()}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteGtRegistrant(${r.id})">Remove</button></td>
    </tr>`).join('');
}

async function addGtRegistrant() {
  const name = document.getElementById('gtrName').value.trim();
  const email = document.getElementById('gtrEmail').value.trim();
  const err = document.getElementById('gtrError');
  if (!name || !email) {
    err.textContent = 'Name and email are required.';
    err.style.display = '';
    return;
  }
  err.style.display = 'none';
  const result = await SupaDB.adminAddGrowthTrackRegistration({
    part: _gtRosterPart.part, sessionDate: _gtRosterPart.sessionDate, sessionTime: _gtRosterPart.sessionTime,
    name, email, phone: document.getElementById('gtrPhone').value.trim(),
    notes: document.getElementById('gtrNotes').value.trim(),
  });
  if (result.error) { err.textContent = result.error; err.style.display = ''; return; }
  document.getElementById('gtrName').value = '';
  document.getElementById('gtrEmail').value = '';
  document.getElementById('gtrPhone').value = '';
  document.getElementById('gtrNotes').value = '';
  showToast('Registrant added');
  await loadGtRoster();
}

async function deleteGtRegistrant(id) {
  if (!confirm('Remove this registrant?')) return;
  const result = await SupaDB.adminDeleteGrowthTrackRegistration(id);
  if (result.error) { showToast('Error: ' + result.error, true); return; }
  await loadGtRoster();
}

function csvSafeGt(v) {
  const s = String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function exportGtRosterCsv() {
  const headers = ['Name','Email','Phone','Notes','Added By Admin','Registered'];
  const rows = _gtRosterRows.map(r => [
    r.name, r.email, r.phone, r.notes, r.addedByAdmin ? 'yes' : 'no',
    new Date(r.createdAt).toLocaleDateString(),
  ]);
  const csv = [headers, ...rows].map(r =>
    r.map(v => `"${csvSafeGt(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = (_gtRosterPart.part) + '-registrants.csv';
  a.click();
}
```

- [ ] **Step 3: Verify** — with the "About Us" part published and dated from Task 5's verification, open its Registrants modal: shows the public registration submitted during Task 3's verification. Add a manual registrant — appears in the table tagged "manual", and `select * from growth_track_registrations where added_by_admin = true;` confirms `added_by_admin = true` in the DB. Remove a registrant — disappears from the table and the DB row is gone. In the Edit modal (Task 5), change the date to a different value, Save, reopen Registrants — the roster is now empty (old registrations still exist in the DB: `select count(*) from growth_track_registrations where part = 'about_us';` still returns the prior count). Click Export CSV — file downloads with the correct rows.

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Growth Track roster modal (view, manual add, remove, CSV export)"
```

---

### Task 7: End-to-end verification + staging deploy

- [ ] **Step 1: Fresh-eyes pass** — read through `growth-track.html` and the new `admin/dashboard.html` sections once more for any leftover test data from Task 3/5/6 verification steps; clean up test parts back to blank/unpublished if you don't want placeholder junk visible to Scott, OR leave a clearly-fake one part published so Scott can see the live rendering immediately — your call, note which you did in your report.
- [ ] **Step 2: Full flow as a public visitor** — visit `growth-track.html` with at least one part published, register for it, confirm the success state and that the registration lands in the admin roster.
- [ ] **Step 3: Full flow as admin** — edit a part's date, confirm the public page reflects the new date and the roster resets to empty while history is preserved in the DB; manually add a registrant; export CSV; toggle a part back to unpublished and confirm it disappears from the public page.
- [ ] **Step 4: RLS spot-check** — as an unauthenticated browser session (or via a fresh incognito tab), confirm `growth-track.html` only shows published parts and that registration submission works without being logged in.
- [ ] **Step 5: Deploy to staging**

```bash
git push staging HEAD:main
```
Verify on the staging URL, then wait for Scott's explicit go-ahead before:

```bash
git push origin HEAD:main
```

---

## Post-plan self-review (done at write time)

- **Spec coverage:** schema+RLS+seed (T1), SupaDB methods (T2), public page with per-part register + auto-prefill (T3), nav links (T4), admin edit/publish (T5), admin roster/manual-add/CSV (T6), reschedule-preserves-history behavior (T6's `loadGtRoster` date-match filter), rollout (T7). All spec sections have a corresponding task.
- **Types consistent:** `growthTrackPartFromDb`/`growthTrackRegistrationFromDb` camelCase fields (`sessionDate`, `sessionTime`, `addedByAdmin`, etc.) used identically across `growth-track.html` and the admin dashboard code in Tasks 3, 5, and 6.
- **Known scope boundary:** no dedicated "past sessions" browsing UI (per spec) — history exists in the DB and via CSV export before reschedule only, not a separate admin view. No capacity/seat limits. No duplicate-registration blocking.
