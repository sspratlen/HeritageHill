# Small Group Semesters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a semester field to small groups (Spring/Summer/Fall, admin-editable dates) and a "Current Semester" filter on both the admin dashboard and the public Small Groups page.

**Architecture:** Semesters are stored as a JSON array in one `site_settings` row (`key='semesters'`), following the exact pattern already used for "Save the Dates" — no new database table. Each `groups` row gets a nullable `semester_id` text column referencing a semester's client-generated id. `js/db.js` gets `getSemesters`/`saveSemesters`/`getCurrentSemester` methods shared by both admin and public pages. The admin Settings tab gets a new "Semesters" card (mirroring the existing Save the Dates card's add/edit/delete list UI), the group edit modal gets a Semester dropdown, the admin Groups table gets a Semester column + filter, and the public Small Groups page gets a matching filter.

**Tech Stack:** Static HTML/CSS/JS, Supabase Postgres (`site_settings` reuse + one new `groups` column), no build step, no test framework — verification is via `node --check`-style syntax checks, HTML tag-balance checks (for `admin/dashboard.html`), and manual browser verification, matching this codebase's established pattern.

---

### Task 1: Database migration — semester_id column + seed Fall 2026

**Files:**
- Create: `supabase/small-group-semesters-schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Small group semesters.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Semesters themselves are NOT a new table — they're stored as a
-- JSON array in site_settings (key='semesters'), reusing that
-- table's existing RLS ("Public can read site settings" / "Admin
-- full access to site settings"). Each groups row gets a nullable
-- semester_id column referencing a semester's id string informally
-- (no SQL foreign key, since semesters aren't a real table).
-- ============================================================

alter table public.groups
  add column if not exists semester_id text;

insert into site_settings (key, value)
values ('semesters', '[{"id":"fall-2026-a1b2","name":"Fall 2026","startDate":"2026-09-06","endDate":"2026-12-05"}]'::jsonb)
on conflict (key) do nothing;
```

- [ ] **Step 2: Verify by inspection**

Confirm `alter table ... add column if not exists` matches the pattern already used in `supabase/profile-avatar-schema.sql` (`alter table public.member_profiles add column if not exists avatar_url text;`), and that the seeded JSON matches the `{id, name, startDate, endDate}` shape defined in the design spec (`docs/superpowers/specs/2026-08-14-small-group-semesters-design.md`).

- [ ] **Step 3: Commit**

```bash
git add supabase/small-group-semesters-schema.sql
git commit -m "Add migration for groups.semester_id and seed Fall 2026 semester"
```

---

### Task 2: SupaDB methods — semesters CRUD + current-semester logic + group mapping

**Files:**
- Modify: `js/db.js:54-71` (`groupFromDb`/`groupToDb`)
- Modify: `js/db.js:910` (insert new methods after `saveSaveDates`, before `getBannerSettings`)

- [ ] **Step 1: Add `semesterId` to the group mappers**

Current content at `js/db.js:54-71`:

```js
function groupFromDb(r) {
  return {
    id: r.id, name: r.name, leader: r.leader, leaderEmail: r.leader_email || '',
    day: r.day, time: r.time, location: r.location, type: r.type,
    audience: r.audience, description: r.description, image: r.image,
    open: r.open !== false, published: r.published !== false,
  };
}
function groupToDb(g) {
  const o = {
    name: g.name, leader: g.leader, leader_email: g.leaderEmail || '',
    day: g.day, time: g.time, location: g.location, type: g.type || 'Life Group',
    audience: g.audience || 'All Ages', description: g.description, image: g.image,
    open: g.open !== false, published: g.published !== false,
  };
  if (g.id) o.id = g.id;
  return o;
}
```

Replace with:

```js
function groupFromDb(r) {
  return {
    id: r.id, name: r.name, leader: r.leader, leaderEmail: r.leader_email || '',
    day: r.day, time: r.time, location: r.location, type: r.type,
    audience: r.audience, description: r.description, image: r.image,
    open: r.open !== false, published: r.published !== false,
    semesterId: r.semester_id || null,
  };
}
function groupToDb(g) {
  const o = {
    name: g.name, leader: g.leader, leader_email: g.leaderEmail || '',
    day: g.day, time: g.time, location: g.location, type: g.type || 'Life Group',
    audience: g.audience || 'All Ages', description: g.description, image: g.image,
    open: g.open !== false, published: g.published !== false,
    semester_id: g.semesterId || null,
  };
  if (g.id) o.id = g.id;
  return o;
}
```

- [ ] **Step 2: Add semester methods after `saveSaveDates`**

Current content at `js/db.js:902-912`:

```js
  async saveSaveDates(items) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'save_the_dates', value: items, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] saveSaveDates:', e.message); return { error: e.message }; }
  },

  async getBannerSettings() {
```

Replace with:

```js
  async saveSaveDates(items) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'save_the_dates', value: items, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] saveSaveDates:', e.message); return { error: e.message }; }
  },

  /* ── Site Settings: Small Group Semesters ──────────────── */
  async getSemesters() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('site_settings').select('value').eq('key', 'semesters').single();
      if (error) return [];
      return Array.isArray(data?.value) ? data.value : [];
    } catch(e) { console.error('[SupaDB] getSemesters:', e.message); return []; }
  },
  async saveSemesters(items) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'semesters', value: items, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] saveSemesters:', e.message); return { error: e.message }; }
  },
  async getCurrentSemester() {
    const list = await this.getSemesters();
    if (!list.length) return null;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const active = list.find(s => s.startDate <= today && today <= s.endDate);
    if (active) return active;
    const upcoming = list.filter(s => s.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
    return upcoming.length ? upcoming[0] : null;
  },

  async getBannerSettings() {
```

`getCurrentSemester` computes "today" from local date parts (year/month/day), not `Date.toISOString()`, because `toISOString()` converts to UTC first — for a US Central-timezone site, that can silently roll the date forward by one day in the evening, which would make a semester boundary compute wrong on its last evening. String comparison on `YYYY-MM-DD` dates works correctly because that format sorts lexicographically the same as chronologically.

- [ ] **Step 3: Verify by inspection**

Run: `node --check js/db.js`
Expected: no output (exits 0)

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Add semester CRUD and current-semester logic to SupaDB, map groups.semesterId"
```

---

### Task 3: Admin Settings tab — Semesters card

**Files:**
- Modify: `admin/dashboard.html:961` (insert new card after the Save the Dates card, inside `#panelSettings`)
- Modify: `admin/dashboard.html:1985` (`switchTab`, hook up loading)
- Modify: `admin/dashboard.html:4587` (insert new JS functions after `saveSaveDates`)

- [ ] **Step 1: Add the Semesters card HTML**

Current content at `admin/dashboard.html:957-963` (end of the Save the Dates card, and the closing of the settings `<div style="max-width:680px;">` wrapper):

```html
          <div style="margin-top:16px;display:flex;gap:10px;align-items:center;">
            <button class="btn btn-primary" onclick="saveSaveDates()">Save</button>
            <span id="sdSaveMsg" style="font-size:.82rem;display:none;"></span>
          </div>
        </div>
      </div>
    </div>
```

Replace with (adds a new card, same structural pattern as Save the Dates, before the closing `</div></div>` of the settings wrapper):

```html
          <div style="margin-top:16px;display:flex;gap:10px;align-items:center;">
            <button class="btn btn-primary" onclick="saveSaveDates()">Save</button>
            <span id="sdSaveMsg" style="font-size:.82rem;display:none;"></span>
          </div>
        </div>

        <!-- Semesters Card -->
        <div style="background:var(--bg-card);border:1.5px solid var(--border);border-radius:14px;padding:28px 32px;margin-top:24px;">
          <div style="margin-bottom:20px;">
            <h3 style="margin:0 0 4px;font-size:1.05rem;">Semesters</h3>
            <p style="margin:0;font-size:.85rem;color:var(--text-muted);">Spring, Summer, and Fall date ranges used to tag small groups and filter to the current semester.</p>
          </div>

          <!-- Existing items list -->
          <div id="semestersList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;"></div>

          <!-- Add new item form -->
          <div style="border:1px solid var(--border);border-radius:10px;padding:16px;background:var(--bg);">
            <p style="font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin:0 0 12px;">Add Semester</p>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px;">
              <div class="field" style="margin:0;">
                <label style="font-size:.8rem;">Name *</label>
                <input type="text" id="semName" placeholder="e.g. Spring 2027" />
              </div>
              <div class="field" style="margin:0;">
                <label style="font-size:.8rem;">Start Date *</label>
                <input type="date" id="semStart" />
              </div>
              <div class="field" style="margin:0;">
                <label style="font-size:.8rem;">End Date *</label>
                <input type="date" id="semEnd" />
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="addSemester()">+ Add</button>
          </div>

          <div style="margin-top:16px;display:flex;gap:10px;align-items:center;">
            <button class="btn btn-primary" onclick="saveSemesters()">Save</button>
            <span id="semSaveMsg" style="font-size:.82rem;display:none;"></span>
          </div>
        </div>
      </div>
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
Expected: `BALANCED`. This file has a history of dangling-`</div>` bugs — this check is mandatory before committing any HTML change here. This edit adds one new self-contained card `<div>...</div>` inside the existing wrapper, so div count should increase by an equal number of opens and closes; if it's not balanced, find and fix your edit before proceeding.

- [ ] **Step 3: Hook loading into the Settings tab switch**

Current content at `admin/dashboard.html:1985`:

```js
  else if(tab==='settings') { loadBannerSettings(); loadSaveDatesSettings(); }
```

Replace with:

```js
  else if(tab==='settings') { loadBannerSettings(); loadSaveDatesSettings(); loadSemesters(); }
```

- [ ] **Step 4: Add the Semesters list-management JS**

Current content at `admin/dashboard.html:4579-4589` (end of `saveSaveDates`, start of the Retreat Registrations section comment):

```js
async function saveSaveDates() {
  const msg = document.getElementById('sdSaveMsg');
  const result = await SupaDB.saveSaveDates(_saveDates);
  if (result && result.error) { showToast('Error saving: ' + result.error, true); return; }
  msg.textContent = 'Saved! ✓';
  msg.style.color = 'var(--primary)';
  msg.style.display = '';
  setTimeout(() => msg.style.display = 'none', 3000);
}

/* ── Retreat Registrations ───────────────────────────────── */
```

Replace with:

```js
async function saveSaveDates() {
  const msg = document.getElementById('sdSaveMsg');
  const result = await SupaDB.saveSaveDates(_saveDates);
  if (result && result.error) { showToast('Error saving: ' + result.error, true); return; }
  msg.textContent = 'Saved! ✓';
  msg.style.color = 'var(--primary)';
  msg.style.display = '';
  setTimeout(() => msg.style.display = 'none', 3000);
}

/* ── Semesters ────────────────────────────────────────────── */
let _semesters = [];

function genSemesterId(name) {
  const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug}-${suffix}`;
}

async function loadSemesters() {
  _semesters = await SupaDB.getSemesters();
  renderSemestersList();
}

function renderSemestersList() {
  const el = document.getElementById('semestersList');
  if (!_semesters.length) {
    el.innerHTML = '<p style="font-size:.85rem;color:var(--text-muted);margin:0;">No semesters yet — add one below.</p>';
    return;
  }
  el.innerHTML = _semesters.map((item, i) => `
    <div id="semRow${i}" style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 14px;">
      <!-- View mode -->
      <div id="semView${i}" style="display:flex;align-items:center;gap:10px;">
        <div style="flex:1;min-width:0;">
          <span style="font-weight:700;color:var(--primary);font-size:.85rem;">${item.name}</span>
          <span style="color:var(--text-muted);font-size:.78rem;margin-left:10px;">${item.startDate} → ${item.endDate}</span>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="editSemester(${i})">Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteSemester(${i})" style="color:#ef4444;">Remove</button>
      </div>
      <!-- Edit mode (hidden by default) -->
      <div id="semEdit${i}" style="display:none;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px;">
          <div class="field" style="margin:0;"><label style="font-size:.78rem;">Name *</label><input type="text" id="semEName${i}" value="${item.name||''}" placeholder="e.g. Spring 2027" /></div>
          <div class="field" style="margin:0;"><label style="font-size:.78rem;">Start Date *</label><input type="date" id="semEStart${i}" value="${item.startDate||''}" /></div>
          <div class="field" style="margin:0;"><label style="font-size:.78rem;">End Date *</label><input type="date" id="semEEnd${i}" value="${item.endDate||''}" /></div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="commitSemester(${i})">Save</button>
          <button class="btn btn-ghost btn-sm" onclick="cancelEditSemester(${i})">Cancel</button>
        </div>
      </div>
    </div>`).join('');
}

function editSemester(i) {
  document.getElementById('semView'+i).style.display = 'none';
  document.getElementById('semEdit'+i).style.display = '';
  document.getElementById('semEName'+i).focus();
}

function cancelEditSemester(i) {
  document.getElementById('semEdit'+i).style.display = 'none';
  document.getElementById('semView'+i).style.display = 'flex';
}

async function commitSemester(i) {
  const name      = document.getElementById('semEName'+i).value.trim();
  const startDate = document.getElementById('semEStart'+i).value;
  const endDate   = document.getElementById('semEEnd'+i).value;
  if (!name || !startDate || !endDate) { showToast('Name, Start Date, and End Date are required.', true); return; }
  _semesters[i] = { id: _semesters[i].id, name, startDate, endDate };
  renderSemestersList();
  await saveSemesters();
}

function addSemester() {
  const name      = document.getElementById('semName').value.trim();
  const startDate = document.getElementById('semStart').value;
  const endDate   = document.getElementById('semEnd').value;
  if (!name || !startDate || !endDate) { showToast('Name, Start Date, and End Date are required.', true); return; }
  _semesters.push({ id: genSemesterId(name), name, startDate, endDate });
  renderSemestersList();
  document.getElementById('semName').value = '';
  document.getElementById('semStart').value = '';
  document.getElementById('semEnd').value = '';
}

function deleteSemester(index) {
  _semesters.splice(index, 1);
  renderSemestersList();
}

async function saveSemesters() {
  const msg = document.getElementById('semSaveMsg');
  const result = await SupaDB.saveSemesters(_semesters);
  if (result && result.error) { showToast('Error saving: ' + result.error, true); return; }
  msg.textContent = 'Saved! ✓';
  msg.style.color = 'var(--primary)';
  msg.style.display = '';
  setTimeout(() => msg.style.display = 'none', 3000);
}

/* ── Retreat Registrations ───────────────────────────────── */
```

This mirrors the Save the Dates functions exactly (`loadSaveDatesSettings`/`renderSaveDatesList`/`editSaveDate`/`cancelEditSaveDate`/`commitSaveDate`/`addSaveDate`/`deleteSaveDate`/`saveSaveDates`), with one addition: `genSemesterId` generates the stable id a semester needs (Save the Dates items don't need stable ids since nothing else references them by id; semesters do, because `groups.semester_id` refers to them). `commitSemester` preserves the existing item's `id` when editing (only `name`/`startDate`/`endDate` are editable after creation) so editing a semester's dates doesn't break any group already assigned to it.

- [ ] **Step 5: Verify div/tag balance again (JS changes don't add divs, but re-run as the mandatory gate for any commit touching this file)**

Run the same balance-check command as Step 2.
Expected: `BALANCED`

- [ ] **Step 6: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 7: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Semesters management card to admin Settings tab"
```

---

### Task 4: Admin Groups tab — semester dropdown, table column, filter

**Files:**
- Modify: `admin/dashboard.html:1274` (group modal — add Semester field)
- Modify: `admin/dashboard.html:2206-2227` (`openGroupModal`)
- Modify: `admin/dashboard.html:2317-2336` (`saveGroup`)
- Modify: `admin/dashboard.html:311-330` (`#panelGroups` — action-bar filter + table header)
- Modify: `admin/dashboard.html:2175-2205` (`renderGroupsTable`)

- [ ] **Step 1: Add the Semester field to the group edit modal**

Current content at `admin/dashboard.html:1270-1275`:

```html
      <div class="form-row">
        <div class="field"><label>Audience *</label>
          <select id="grAudience"><option value="All Ages">All Ages</option><option value="Men">Men</option><option value="Women">Women</option><option value="Youth (6–12th grade)">Youth (6–12th grade)</option><option value="Families">Families</option><option value="Seniors">Seniors</option><option value="Young Adults">Young Adults</option></select>
        </div>
        <div class="field"><label>Location *</label><input type="text" id="grLocation" placeholder="e.g. Heritage Hill Room A" /></div>
      </div>
```

Replace with (adds a third field by turning this into a two-row group; `grSemester`'s `<option>`s are populated at runtime by `openGroupModal`, not hardcoded here, since the semester list is admin-editable data):

```html
      <div class="form-row">
        <div class="field"><label>Audience *</label>
          <select id="grAudience"><option value="All Ages">All Ages</option><option value="Men">Men</option><option value="Women">Women</option><option value="Youth (6–12th grade)">Youth (6–12th grade)</option><option value="Families">Families</option><option value="Seniors">Seniors</option><option value="Young Adults">Young Adults</option></select>
        </div>
        <div class="field"><label>Location *</label><input type="text" id="grLocation" placeholder="e.g. Heritage Hill Room A" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Semester <span style="font-weight:400;color:var(--text-muted);font-size:.78rem;">(optional — leave blank for an ongoing group)</span></label>
          <select id="grSemester"><option value="">— No Semester —</option></select>
        </div>
      </div>
```

- [ ] **Step 2: Verify div/tag balance was not disturbed**

Run the same balance-check command used in Task 3 Step 2.
Expected: `BALANCED`

- [ ] **Step 3: Populate the semester dropdown and set its value when the modal opens**

Current content at `admin/dashboard.html:2206-2227`:

```js
function openGroupModal(g){
  document.getElementById('groupModalTitle').textContent=g?'Edit Group':'Add Group';
  document.getElementById('grId').value=g?g.id:'';
  document.getElementById('grPublished').checked=g?g.published!==false:true;
  document.getElementById('grName').value=g?g.name:'';
  document.getElementById('grLeader').value=g?g.leader:'';
  document.getElementById('grLeaderEmail').value=g?(g.leaderEmail||''):'';
  document.getElementById('grDay').value=g?g.day:'Sunday';
  document.getElementById('grTime').value=g?g.time:'';
  document.getElementById('grType').value=g?g.type:'Life Group';
  document.getElementById('grAudience').value=g?g.audience:'All Ages';
  document.getElementById('grLocation').value=g?g.location:'';
  document.getElementById('grDescription').value=g?g.description:'';
  document.getElementById('grOpen').checked=g?g.open:true;
  switchImgTab('url',document.querySelector('#groupModal .img-tab'));
  document.getElementById('grImageUrl').value=g?(g.image||''):'';
  document.getElementById('grImageFinal').value=g?(g.image||''):'';
  document.getElementById('aiStatus').textContent='';
  document.getElementById('grAiPrompt').value='';
  ['previewUrl','previewUpload','previewAi'].forEach(id=>{const el=document.getElementById(id);el.classList.remove('visible');el.src='';});
  if(g&&g.image&&!g.image.startsWith('data:')){const p=document.getElementById('previewUrl');p.src=g.image;p.classList.add('visible');}
  document.getElementById('groupModal').classList.add('open');
}
```

Replace with:

```js
function openGroupModal(g){
  document.getElementById('groupModalTitle').textContent=g?'Edit Group':'Add Group';
  document.getElementById('grId').value=g?g.id:'';
  document.getElementById('grPublished').checked=g?g.published!==false:true;
  document.getElementById('grName').value=g?g.name:'';
  document.getElementById('grLeader').value=g?g.leader:'';
  document.getElementById('grLeaderEmail').value=g?(g.leaderEmail||''):'';
  document.getElementById('grDay').value=g?g.day:'Sunday';
  document.getElementById('grTime').value=g?g.time:'';
  document.getElementById('grType').value=g?g.type:'Life Group';
  document.getElementById('grAudience').value=g?g.audience:'All Ages';
  document.getElementById('grLocation').value=g?g.location:'';
  document.getElementById('grDescription').value=g?g.description:'';
  document.getElementById('grOpen').checked=g?g.open:true;
  const semSel=document.getElementById('grSemester');
  semSel.innerHTML='<option value="">— No Semester —</option>'+_semestersForGroupModal.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  semSel.value=g?(g.semesterId||''):'';
  switchImgTab('url',document.querySelector('#groupModal .img-tab'));
  document.getElementById('grImageUrl').value=g?(g.image||''):'';
  document.getElementById('grImageFinal').value=g?(g.image||''):'';
  document.getElementById('aiStatus').textContent='';
  document.getElementById('grAiPrompt').value='';
  ['previewUrl','previewUpload','previewAi'].forEach(id=>{const el=document.getElementById(id);el.classList.remove('visible');el.src='';});
  if(g&&g.image&&!g.image.startsWith('data:')){const p=document.getElementById('previewUrl');p.src=g.image;p.classList.add('visible');}
  document.getElementById('groupModal').classList.add('open');
}
```

- [ ] **Step 4: Fetch the semester list into `_semestersForGroupModal` when the Groups table renders**

Current content at `admin/dashboard.html:2175-2185`:

```js
async function renderGroupsTable(){
  _cachedGroups = await SupaDB.adminGetAllGroups();
  const isLeader = window._userRole === 'small_group_leader';
  const groups = isLeader ? _cachedGroups.filter(g => window._myGroupIds.includes(g.id)) : _cachedGroups;
  // Show/hide Add Group and Email All Leaders buttons based on role
  const addBtn = document.getElementById('addGroupBtn');
  if (addBtn) addBtn.style.display = isLeader ? 'none' : '';
  const emailAllBtn = document.getElementById('emailAllLeadersBtn');
  if (emailAllBtn) emailAllBtn.style.display = isLeader ? 'none' : '';
  const tbody=document.getElementById('groupsTable'),empty=document.getElementById('groupsEmpty');
  if(!groups.length){tbody.innerHTML='';empty.style.display='';return;}empty.style.display='none';
```

Replace with (adds a module-level `_semestersForGroupModal` cache, populated here so it's fresh whenever the Groups tab is viewed, and a `groupSemesterFilter` value read for filtering below):

```js
let _semestersForGroupModal = [];
async function renderGroupsTable(){
  _cachedGroups = await SupaDB.adminGetAllGroups();
  _semestersForGroupModal = await SupaDB.getSemesters();
  const isLeader = window._userRole === 'small_group_leader';
  let groups = isLeader ? _cachedGroups.filter(g => window._myGroupIds.includes(g.id)) : _cachedGroups;
  // Show/hide Add Group and Email All Leaders buttons based on role
  const addBtn = document.getElementById('addGroupBtn');
  if (addBtn) addBtn.style.display = isLeader ? 'none' : '';
  const emailAllBtn = document.getElementById('emailAllLeadersBtn');
  if (emailAllBtn) emailAllBtn.style.display = isLeader ? 'none' : '';
  const semSelEl = document.getElementById('groupSemesterFilter');
  if (semSelEl && semSelEl.options.length <= 2) {
    semSelEl.innerHTML = '<option value="">All Semesters</option><option value="__current__">Current Semester</option>'
      + _semestersForGroupModal.slice().sort((a,b)=>b.startDate.localeCompare(a.startDate)).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }
  const filterVal = semSelEl ? semSelEl.value : '';
  if (filterVal === '__current__') {
    const current = await SupaDB.getCurrentSemester();
    groups = current ? groups.filter(g => g.semesterId === current.id) : [];
  } else if (filterVal) {
    groups = groups.filter(g => g.semesterId === filterVal);
  }
  const tbody=document.getElementById('groupsTable'),empty=document.getElementById('groupsEmpty');
  if(!groups.length){tbody.innerHTML='';empty.style.display='';return;}empty.style.display='none';
```

The `semSelEl.options.length <= 2` check avoids rebuilding (and thus losing the user's current selection) every time `renderGroupsTable()` re-runs — it only (re)populates the semester `<option>`s the first time, when only the two static placeholder options exist.

- [ ] **Step 5: Add the Semester column to the table row template**

Current content at `admin/dashboard.html:2186-2205` (this is inside the same function edited in Step 4; find this specific block within it):

```js
  tbody.innerHTML=groups.map(g=>`
    <tr>
      <td><strong>${g.name}</strong><br><span style="font-size:.8rem;color:var(--text-muted);">Led by ${g.leader}</span></td>
      <td>${g.day}s at ${g.time}<br><span style="font-size:.8rem;color:var(--text-muted);">${(g.location||'').split('–')[0].trim()}</span></td>
      <td><span class="badge badge-blue">${g.type}</span></td>
      <td>${g.audience}</td>
      <td>${g.published?'<span class="badge badge-green">Published</span>':'<span class="badge badge-gray">Draft</span>'}</td>
      <td>${g.open?'<span class="badge badge-amber">Open</span>':'<span class="badge badge-red">Full</span>'}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="openGroupRoster(${g.id})">Members</button>
        <button class="btn btn-ghost btn-sm" onclick="openGroupAttendanceModal(${g.id})">Attendance</button>
        <button class="btn btn-ghost btn-sm" onclick="editGroup(${g.id})">Edit</button>
        <button class="btn btn-secondary btn-sm" onclick="openGroupEmailModal(${g.id})">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Email Group
        </button>
        ${!isLeader?`<button class="btn btn-danger btn-sm" onclick="deleteItem('group',${g.id},'${g.name.replace(/'/g,"\\'")}')">Delete</button>`:''}
      </div></td>
    </tr>`).join('');
}
```

Replace with:

```js
  tbody.innerHTML=groups.map(g=>{
    const semName = g.semesterId ? (_semestersForGroupModal.find(s=>s.id===g.semesterId)||{}).name || '—' : '—';
    return `<tr>
      <td><strong>${g.name}</strong><br><span style="font-size:.8rem;color:var(--text-muted);">Led by ${g.leader}</span></td>
      <td>${g.day}s at ${g.time}<br><span style="font-size:.8rem;color:var(--text-muted);">${(g.location||'').split('–')[0].trim()}</span></td>
      <td><span class="badge badge-blue">${g.type}</span></td>
      <td>${g.audience}</td>
      <td>${semName}</td>
      <td>${g.published?'<span class="badge badge-green">Published</span>':'<span class="badge badge-gray">Draft</span>'}</td>
      <td>${g.open?'<span class="badge badge-amber">Open</span>':'<span class="badge badge-red">Full</span>'}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="openGroupRoster(${g.id})">Members</button>
        <button class="btn btn-ghost btn-sm" onclick="openGroupAttendanceModal(${g.id})">Attendance</button>
        <button class="btn btn-ghost btn-sm" onclick="editGroup(${g.id})">Edit</button>
        <button class="btn btn-secondary btn-sm" onclick="openGroupEmailModal(${g.id})">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Email Group
        </button>
        ${!isLeader?`<button class="btn btn-danger btn-sm" onclick="deleteItem('group',${g.id},'${g.name.replace(/'/g,"\\'")}')">Delete</button>`:''}
      </div></td>
    </tr>`;
  }).join('');
}
```

- [ ] **Step 6: Update the group edit save to include `semesterId`**

Current content at `admin/dashboard.html:2327`:

```js
  const newGr={id:id?parseInt(id):undefined,published:document.getElementById('grPublished').checked,name,leader:lead,leaderEmail,day:document.getElementById('grDay').value,time,location:loc,type:document.getElementById('grType').value,audience:document.getElementById('grAudience').value,description:desc,image,open:document.getElementById('grOpen').checked};
```

Replace with:

```js
  const newGr={id:id?parseInt(id):undefined,published:document.getElementById('grPublished').checked,name,leader:lead,leaderEmail,day:document.getElementById('grDay').value,time,location:loc,type:document.getElementById('grType').value,audience:document.getElementById('grAudience').value,description:desc,image,open:document.getElementById('grOpen').checked,semesterId:document.getElementById('grSemester').value||null};
```

- [ ] **Step 7: Add the Semester column header and filter select to the Groups tab markup**

Current content at `admin/dashboard.html:311-325`:

```html
    <div class="tab-panel" id="panelGroups">
      <div class="action-bar">
        <h2>Manage Small Groups</h2>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="emailAllLeadersBtn" onclick="openAllLeadersEmailModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Email All Leaders
          </button>
          <button class="btn btn-primary" id="addGroupBtn" onclick="openGroupModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Group
          </button>
        </div>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Group Name</th><th>Day & Time</th><th>Type</th><th>Audience</th><th>Published</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="groupsTable"></tbody></table>
```

Replace with:

```html
    <div class="tab-panel" id="panelGroups">
      <div class="action-bar">
        <h2>Manage Small Groups</h2>
        <select id="groupSemesterFilter" onchange="renderGroupsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
          <option value="">All Semesters</option>
          <option value="__current__">Current Semester</option>
        </select>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="emailAllLeadersBtn" onclick="openAllLeadersEmailModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Email All Leaders
          </button>
          <button class="btn btn-primary" id="addGroupBtn" onclick="openGroupModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Group
          </button>
        </div>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Group Name</th><th>Day & Time</th><th>Type</th><th>Audience</th><th>Semester</th><th>Published</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="groupsTable"></tbody></table>
```

The filter select starts with exactly 2 `<option>`s (`All Semesters`, `Current Semester`), matching the `options.length <= 2` check added in Step 4 that decides whether to (re)populate it with named semesters.

- [ ] **Step 8: Verify div/tag balance was not disturbed**

Run the same balance-check command used in earlier steps.
Expected: `BALANCED`

- [ ] **Step 9: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 10: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add semester dropdown, table column, and filter to admin Groups tab"
```

---

### Task 5: Public Small Groups page — semester filter

**Files:**
- Modify: `small-groups.html:107-108` (filter bar — add the Semester select)
- Modify: `small-groups.html:303-326` (`filterGroups`)
- Modify: `small-groups.html:328-341` (group-loading block)

- [ ] **Step 1: Add the Semester filter select to the filter bar**

Current content at `small-groups.html:99-108`:

```html
        <select id="groupAudience" class="filter-select" onchange="filterGroups()">
          <option value="">All Ages</option>
          <option value="Men">Men</option>
          <option value="Women">Women</option>
          <option value="Youth (6–12th grade)">Youth</option>
          <option value="Families">Families</option>
          <option value="Seniors">Seniors</option>
          <option value="All Ages">All Ages</option>
        </select>
      </div>
```

Replace with (options beyond the two static placeholders are populated at runtime, same reasoning as the admin filter — the semester list is admin-editable data, not a fixed enum):

```html
        <select id="groupAudience" class="filter-select" onchange="filterGroups()">
          <option value="">All Ages</option>
          <option value="Men">Men</option>
          <option value="Women">Women</option>
          <option value="Youth (6–12th grade)">Youth</option>
          <option value="Families">Families</option>
          <option value="Seniors">Seniors</option>
          <option value="All Ages">All Ages</option>
        </select>
        <select id="groupSemester" class="filter-select" onchange="filterGroups()">
          <option value="">All Semesters</option>
          <option value="__current__">Current Semester</option>
        </select>
      </div>
```

- [ ] **Step 2: Filter by semester in `filterGroups()`**

Current content at `small-groups.html:303-314`:

```js
  function filterGroups() {
    const q        = document.getElementById('groupSearch').value.toLowerCase();
    const day      = document.getElementById('groupDay').value;
    const type     = document.getElementById('groupType').value;
    const audience = document.getElementById('groupAudience').value;
    let groups = [..._allGroups];

    if (q)        groups = groups.filter(g => g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q) || g.leader.toLowerCase().includes(q));
    if (day)      groups = groups.filter(g => g.day === day);
    if (type)     groups = groups.filter(g => g.type === type);
    if (audience) groups = groups.filter(g => g.audience === audience);
```

Replace with:

```js
  function filterGroups() {
    const q        = document.getElementById('groupSearch').value.toLowerCase();
    const day      = document.getElementById('groupDay').value;
    const type     = document.getElementById('groupType').value;
    const audience = document.getElementById('groupAudience').value;
    const semester = document.getElementById('groupSemester').value;
    let groups = [..._allGroups];

    if (q)        groups = groups.filter(g => g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q) || g.leader.toLowerCase().includes(q));
    if (day)      groups = groups.filter(g => g.day === day);
    if (type)     groups = groups.filter(g => g.type === type);
    if (audience) groups = groups.filter(g => g.audience === audience);
    if (semester === '__current__') groups = groups.filter(g => g.semesterId === _currentSemesterId);
    else if (semester) groups = groups.filter(g => g.semesterId === semester);
```

- [ ] **Step 3: Populate the semester dropdown and cache the current-semester id when groups load**

Current content at `small-groups.html:328-341`:

```js
  // Load groups from Supabase then apply any URL param filter
  SupaDB.getPublishedGroups().then(data => {
    _allGroups = data;

    // URL param pre-filter
    const urlParams = new URLSearchParams(window.location.search);
    const fp = urlParams.get('filter');
    if (fp) {
      const sel = document.getElementById('groupType');
      for (let o of sel.options) { if (o.value === fp) { sel.value = fp; break; } }
    }

    filterGroups();
  });
```

Replace with:

```js
  // Load groups from Supabase then apply any URL param filter
  let _currentSemesterId = null;
  Promise.all([SupaDB.getPublishedGroups(), SupaDB.getSemesters(), SupaDB.getCurrentSemester()]).then(([groups, semesters, current]) => {
    _allGroups = groups;
    _currentSemesterId = current ? current.id : null;
    const semSel = document.getElementById('groupSemester');
    semesters.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      semSel.appendChild(opt);
    });

    // URL param pre-filter
    const urlParams = new URLSearchParams(window.location.search);
    const fp = urlParams.get('filter');
    if (fp) {
      const sel = document.getElementById('groupType');
      for (let o of sel.options) { if (o.value === fp) { sel.value = fp; break; } }
    }

    filterGroups();
  });
```

Semester `<option>` text is set via `opt.textContent`, not string-interpolated `innerHTML`, so semester names (admin-entered, but still worth being careful with) can't break out of the `<option>` markup — this is the same escaping-by-construction approach already used in this codebase wherever admin-entered strings need to go into `<option>` elements.

- [ ] **Step 4: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('small-groups.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 5: Commit**

```bash
git add small-groups.html
git commit -m "Add semester filter to public Small Groups page"
```

---

### Task 6: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (e.g. the project's existing `static-site` preview launch config), open `small-groups.html`, and confirm:
- No JS console errors.
- The new Semester filter select appears in the filter bar, with "All Semesters" and "Current Semester" as the first two options.
- Since the only seeded semester is Fall 2026 (Sept 6 – Dec 5), and Fall 2026 is upcoming relative to Aug 2026, "Current Semester" should resolve to "Fall 2026" once that date range starts (or, before Sept 6, resolve to it anyway via the roll-forward-to-next-upcoming rule in `getCurrentSemester`) — confirm this by checking `SupaDB.getCurrentSemester()`'s return value in the browser console matches expectations for today's date.
- Log into `admin/dashboard.html`, open the Settings tab, confirm the new Semesters card shows "Fall 2026" with the correct dates, and that Add/Edit/Delete/Save all work.
- Open the Groups tab, confirm the new Semester column and filter dropdown appear, and that editing a group shows the new Semester dropdown in the modal with "Fall 2026" selectable.
- Assign a group to Fall 2026, save, and confirm both the admin table's Semester column and the public page (after a refresh) reflect it, and that filtering by "Current Semester" / "Fall 2026" on both pages shows that group while filtering by "All Semesters" still shows everything.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

Repeat the checks from Step 1 against the deployed staging site, using real staging data.

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
