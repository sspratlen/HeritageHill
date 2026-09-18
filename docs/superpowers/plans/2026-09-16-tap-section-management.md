# NFC Tag Section Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin add, rename, and delete chair-tag redirect sections from `admin/tap-control.html`, instead of the page only ever working with the single hardcoded "Main Auditorium" section.

**Architecture:** No schema or RLS changes — `tap_sections`' existing admin-only policy already permits insert/update/delete. Three new `SupaDB` methods exercise that. The page's static "Section: Main Auditorium" label becomes a `<select>` dropdown plus Add/Rename/Delete controls, all using the page's existing inline-edit-form conventions (matching how saved links already do add/edit).

**Tech Stack:** Static HTML/JS, Supabase Postgres (existing RLS, no migration). No build step — verification is via `node --check`-style syntax checks and manual browser/live testing.

**Spec:** `docs/superpowers/specs/2026-09-16-tap-section-management-design.md`

---

### Task 1: SupaDB methods

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Add the section-management methods**

Find:

```javascript
/* ── Tap Redirect (Chair Tags) ──────────────────────────── */
  async getTapSections() {
    if (!db()) return [];
    const { data, error } = await db().from('tap_sections').select('*').order('name');
    if (error) { console.error('[SupaDB] getTapSections:', error.message); return []; }
    return (data || []).map(r => ({ id: r.id, slug: r.slug, name: r.name }));
  },
  async getTapLinks() {
```

Replace with (adds the three new methods right after `getTapSections`):

```javascript
/* ── Tap Redirect (Chair Tags) ──────────────────────────── */
  async getTapSections() {
    if (!db()) return [];
    const { data, error } = await db().from('tap_sections').select('*').order('name');
    if (error) { console.error('[SupaDB] getTapSections:', error.message); return []; }
    return (data || []).map(r => ({ id: r.id, slug: r.slug, name: r.name }));
  },
  async adminAddTapSection({ slug, name }) {
    if (!db()) return { error: 'Not configured' };
    const { data, error } = await db().from('tap_sections').insert({ slug, name }).select().single();
    if (error) return { error: error.message };
    return { id: data.id, slug: data.slug, name: data.name };
  },
  async adminRenameTapSection(id, name) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('tap_sections').update({ name }).eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  },
  async adminDeleteTapSection(id) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('tap_sections').delete().eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  },
  async getTapLinks() {
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/db.js && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add js/db.js
git commit -m "Add SupaDB methods for managing tap sections" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Styles

**Files:**
- Modify: `admin/tap-control.html`

- [ ] **Step 1: Add the new CSS rules**

Find:

```html
    .section-label { font-size: .78rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
    .section-name { font-size: 1.1rem; font-weight: 700; margin-bottom: 18px; }
```

Replace with:

```html
    .section-label { font-size: .78rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
    .section-name { font-size: 1.1rem; font-weight: 700; margin-bottom: 18px; }
    .section-row { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
    .section-select { flex: 1; padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; font-size: .95rem; font-weight: 700; color: var(--text); background: #fff; }
    .section-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .rename-section-form { display: none; align-items: center; gap: 8px; margin-bottom: 14px; }
    .rename-section-form.open { display: flex; }
    .rename-section-form input { flex: 1; padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; font-size: .9rem; }
    .add-section-form { display: none; flex-direction: column; gap: 8px; margin-bottom: 14px; }
    .add-section-form.open { display: flex; }
    .add-section-form input { padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; font-size: .85rem; }
    .add-section-hint { font-size: .74rem; color: var(--text-muted); }
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/tap-control.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_tapctrl_check_t2.js', scripts.join('\n;\n'));
"
node --check /tmp/_tapctrl_check_t2.js && echo OK
rm -f /tmp/_tapctrl_check_t2.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add admin/tap-control.html
git commit -m "Add styles for tap section management" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Section switcher markup

**Files:**
- Modify: `admin/tap-control.html`

- [ ] **Step 1: Replace the static section label with the dropdown + forms**

Find:

```html
    <div class="section-label" id="sectionLabelWrap">Section</div>
    <div class="section-name" id="sectionName">–</div>

    <div class="current-label">Currently pointing to</div>
```

Replace with:

```html
    <div class="section-label">Section</div>
    <div class="section-row" id="sectionRow">
      <select class="section-select" id="sectionSelect" onchange="onSectionChange()"></select>
      <div class="section-actions">
        <button class="btn btn-secondary btn-sm" onclick="startAddSection()">+ Add</button>
        <button class="btn btn-secondary btn-sm" onclick="startRenameSection()">Rename</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSection()">Delete</button>
      </div>
    </div>
    <div class="rename-section-form" id="renameSectionForm">
      <input type="text" id="renameSectionInput" placeholder="Section name" />
      <button class="btn btn-primary btn-sm" onclick="saveRenameSection()">Save</button>
      <button class="btn btn-secondary btn-sm" onclick="cancelRenameSection()">Cancel</button>
    </div>
    <div class="add-section-form" id="addSectionForm">
      <input type="text" id="newSectionName" placeholder="Section name (e.g. Overflow Room)" oninput="onNewSectionNameInput()" />
      <input type="text" id="newSectionSlug" placeholder="url-slug" oninput="onNewSectionSlugInput()" />
      <div class="add-section-hint">This slug becomes part of the physical tag's URL and can't be changed later.</div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-primary btn-sm" onclick="saveNewSection()">Save Section</button>
        <button class="btn btn-secondary btn-sm" onclick="cancelAddSection()">Cancel</button>
      </div>
    </div>

    <div class="current-label">Currently pointing to</div>
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/tap-control.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_tapctrl_check_t3.js', scripts.join('\n;\n'));
"
node --check /tmp/_tapctrl_check_t3.js && echo OK
rm -f /tmp/_tapctrl_check_t3.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add admin/tap-control.html
git commit -m "Add section switcher and add/rename/delete form markup" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Section management JavaScript

**Files:**
- Modify: `admin/tap-control.html`

- [ ] **Step 1: Add `_sections`/`_slugManuallyEdited` state**

Find:

```javascript
let _user = null;
let _section = null;
let _links = [];
let _current = null;
let _editingLinkId = null;
```

Replace with:

```javascript
let _user = null;
let _sections = [];
let _section = null;
let _links = [];
let _current = null;
let _editingLinkId = null;
let _slugManuallyEdited = false;
```

- [ ] **Step 2: Replace `init()` and add the section-management functions**

Find:

```javascript
async function init() {
  const sections = await SupaDB.getTapSections();
  document.getElementById('loadingMsg').style.display = 'none';
  document.getElementById('pageContent').style.display = 'block';

  if (!sections.length) {
    document.getElementById('errorBox').innerHTML =
      '<div class="error-box">No tap sections configured yet — run supabase/tap-redirect-schema.sql in the Supabase SQL editor first.</div>';
    return;
  }

  _section = sections.find(s => s.slug === 'main-auditorium') || sections[0];
  document.getElementById('sectionCard').style.display = 'block';
  document.getElementById('manageCard').style.display = 'block';
  document.getElementById('statsCard').style.display = 'block';
  document.getElementById('sectionName').textContent = _section.name;

  await loadLinks();
  await loadCurrent();
  await refreshStats();

  document.getElementById('tagUrlBox').textContent =
    `${SUPABASE_URL}/functions/v1/tap-redirect?section=${_section.slug}`;
}

async function loadLinks() {
```

Replace with:

```javascript
async function init() {
  document.getElementById('loadingMsg').style.display = 'none';
  document.getElementById('pageContent').style.display = 'block';
  await loadLinks();
  await refreshSections();
}

async function refreshSections(preferredId) {
  _sections = await SupaDB.getTapSections();
  if (!_sections.length) {
    _section = null;
    document.getElementById('sectionCard').style.display = 'none';
    document.getElementById('manageCard').style.display = 'none';
    document.getElementById('statsCard').style.display = 'none';
    document.getElementById('errorBox').innerHTML =
      '<div class="error-box">No tap sections configured yet — run supabase/tap-redirect-schema.sql in the Supabase SQL editor first.</div>';
    return;
  }
  document.getElementById('errorBox').innerHTML = '';
  document.getElementById('sectionCard').style.display = 'block';
  document.getElementById('manageCard').style.display = 'block';
  document.getElementById('statsCard').style.display = 'block';
  const keepId = preferredId || (_section && _sections.some(s => s.id === _section.id) ? _section.id : null);
  await selectSection(keepId || _sections[0].id);
}

async function selectSection(id) {
  _section = _sections.find(s => s.id === id) || _sections[0];
  renderSectionSelect();
  await loadCurrent();
  await refreshStats();
  document.getElementById('tagUrlBox').textContent =
    `${SUPABASE_URL}/functions/v1/tap-redirect?section=${_section.slug}`;
}

function renderSectionSelect() {
  const sel = document.getElementById('sectionSelect');
  sel.innerHTML = _sections.map(s => `<option value="${s.id}" ${_section && _section.id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
}

function onSectionChange() {
  selectSection(document.getElementById('sectionSelect').value);
}

function startAddSection() {
  document.getElementById('sectionRow').style.display = 'none';
  document.getElementById('addSectionForm').classList.add('open');
  document.getElementById('newSectionName').value = '';
  document.getElementById('newSectionSlug').value = '';
  _slugManuallyEdited = false;
  document.getElementById('newSectionName').focus();
}

function cancelAddSection() {
  document.getElementById('addSectionForm').classList.remove('open');
  document.getElementById('sectionRow').style.display = 'flex';
}

function slugifySectionName(s) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
}

function onNewSectionNameInput() {
  if (_slugManuallyEdited) return;
  document.getElementById('newSectionSlug').value = slugifySectionName(document.getElementById('newSectionName').value);
}

function onNewSectionSlugInput() {
  _slugManuallyEdited = true;
}

async function saveNewSection() {
  const name = document.getElementById('newSectionName').value.trim();
  const slug = document.getElementById('newSectionSlug').value.trim();
  if (!name || !slug) { showToast('Name and slug are both required.', true); return; }
  const result = await SupaDB.adminAddTapSection({ slug, name });
  if (result.error) { showToast('Error: ' + result.error, true); return; }
  cancelAddSection();
  showToast(`✓ "${name}" added`);
  await refreshSections(result.id);
}

function startRenameSection() {
  if (!_section) return;
  document.getElementById('sectionRow').style.display = 'none';
  document.getElementById('renameSectionForm').classList.add('open');
  const input = document.getElementById('renameSectionInput');
  input.value = _section.name;
  input.focus();
}

function cancelRenameSection() {
  document.getElementById('renameSectionForm').classList.remove('open');
  document.getElementById('sectionRow').style.display = 'flex';
}

async function saveRenameSection() {
  const name = document.getElementById('renameSectionInput').value.trim();
  if (!name) { showToast('Name is required.', true); return; }
  const result = await SupaDB.adminRenameTapSection(_section.id, name);
  if (result.error) { showToast('Error: ' + result.error, true); return; }
  cancelRenameSection();
  showToast('✓ Renamed');
  await refreshSections(_section.id);
}

async function deleteSection() {
  if (!_section) return;
  if (!confirm(`Delete "${_section.name}"? This also erases its current destination and all tap history for this section. This can't be undone.`)) return;
  const result = await SupaDB.adminDeleteTapSection(_section.id);
  if (result.error) { showToast('Error: ' + result.error, true); return; }
  showToast('Section deleted.');
  await refreshSections();
}

async function loadLinks() {
```

- [ ] **Step 3: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/tap-control.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_tapctrl_check_t4.js', scripts.join('\n;\n'));
"
node --check /tmp/_tapctrl_check_t4.js && echo OK
rm -f /tmp/_tapctrl_check_t4.js
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add admin/tap-control.html
git commit -m "Add section add/rename/delete JavaScript logic" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification

Manual verification, no further code changes.

- [ ] **Step 1: Push the branch to staging**

```bash
git push staging claude/loving-darwin-e8d5ea:main
```

- [ ] **Step 2: Add a section**

Log into `admin/tap-control.html` on staging as admin. Click "+ Add." Type a name like "Overflow Room," confirm the slug field auto-fills as `overflow-room`. Save. Confirm the dropdown now shows both sections and has switched to the new one, and the tag URL box shows the right slug.

- [ ] **Step 3: Duplicate-slug handling**

Click "+ Add" again, type a name that generates the same slug as an existing section (e.g. "Overflow Room" again). Save and confirm a clear error toast appears rather than a silent failure or a duplicate row.

- [ ] **Step 4: Rename**

With the new section selected, click "Rename," change the name, save. Confirm the dropdown label updates and the tag URL box's slug is unchanged.

- [ ] **Step 5: Switching sections preserves independent state**

Set a different current destination on each of the two sections (e.g. one to "Give," one to "Prayer"). Switch between them in the dropdown and confirm each one's "Currently pointing to" and tap stats reflect only that section's own data.

- [ ] **Step 6: Delete**

Delete the test section. Confirm the confirmation dialog mentions losing its current-destination and tap history. Confirm the dropdown switches back to the remaining section afterward.

- [ ] **Step 7: Empty-state fallback**

If practical to test safely on staging (or by temporarily deleting all sections in the Supabase SQL editor and re-seeding afterward), confirm deleting the last remaining section correctly falls back to the "No tap sections configured yet" empty state rather than erroring.

- [ ] **Step 8: Report back**

Confirm to the user: staging deployment is live, add/rename/delete all work, and switching sections correctly loads each one's own current destination and stats independently.
