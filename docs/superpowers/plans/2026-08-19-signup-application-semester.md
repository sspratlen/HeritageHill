# Auto-Assign Current Semester to Sign-Ups & Applications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every new small-group sign-up and leader application is automatically tagged with the semester that's current at submission time, and admins can see/filter by that semester on the Sign-Up Requests and Leader Applications tabs.

**Architecture:** `signups` and `applications` each get a nullable `semester_id` column, mirroring the existing `groups.semester_id` pattern (informal reference into the `site_settings` `'semesters'` list, no SQL foreign key). `SupaDB.submitSignup`/`submitApplication` — the only two places these tables are publicly inserted into — call the already-existing `SupaDB.getCurrentSemester()` before inserting, so no changes are needed to the public forms themselves. The admin dashboard's Sign-Up Requests and Leader Applications tabs each get a Semester column and filter dropdown, following the exact pattern already built for the Groups tab.

**Tech Stack:** Static HTML/CSS/JS, Supabase Postgres, no build step — verification is via `node --check`-style syntax checks, HTML tag-balance checks (for `admin/dashboard.html`), and manual browser verification, matching this codebase's established pattern.

---

### Task 1: Database migration — semester_id columns

**Files:**
- Create: `supabase/signup-application-semester-schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Semester tagging for small-group sign-ups and leader applications.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
--
-- Mirrors groups.semester_id: an informal reference to a semester's
-- id string (stored in site_settings, key='semesters') — no SQL
-- foreign key, since semesters aren't a real table. Existing rows
-- get semester_id = null, which the UI displays as "—".
-- ============================================================

alter table public.signups
  add column if not exists semester_id text;

alter table public.applications
  add column if not exists semester_id text;
```

- [ ] **Step 2: Verify by inspection**

Confirm `alter table ... add column if not exists` matches the pattern already used in `supabase/small-group-semesters-schema.sql` (`alter table public.groups add column if not exists semester_id text;`).

- [ ] **Step 3: Commit**

```bash
git add supabase/signup-application-semester-schema.sql
git commit -m "Add migration for signups.semester_id and applications.semester_id"
```

---

### Task 2: SupaDB mapping + auto-assignment on submit

**Files:**
- Modify: `js/db.js:106-140` (`signupFromDb`/`signupToDb`/`applicationFromDb`/`applicationToDb`)
- Modify: `js/db.js:328-346` (`submitSignup`/`submitApplication`)

- [ ] **Step 1: Add `semesterId` to the signup and application mappers**

Current content at `js/db.js:106-140`:

```js
function signupFromDb(r) {
  return {
    id: r.id, groupId: r.group_id, groupName: r.group_name,
    leaderName: r.leader_name, leaderEmail: r.leader_email || '',
    name: r.name, email: r.email, phone: r.phone || '', message: r.message || '',
    date: r.created_at, contacted: !!r.contacted,
  };
}
function signupToDb(s) {
  return {
    group_id: s.groupId || null, group_name: s.groupName,
    leader_name: s.leaderName, leader_email: s.leaderEmail || '',
    name: s.name, email: s.email, phone: s.phone || '', message: s.message || '',
    contacted: false,
  };
}

function applicationFromDb(r) {
  return {
    id: r.id, status: r.status || 'pending', submittedDate: r.submitted_date,
    name: r.name, email: r.email, phone: r.phone || '', attendance: r.attendance || '',
    groupName: r.group_name, type: r.type, audience: r.audience,
    day: r.day, time: r.time, location: r.location,
    description: r.description, why: r.why, notes: r.notes || '',
  };
}
function applicationToDb(a) {
  return {
    name: a.name, email: a.email, phone: a.phone || '', attendance: a.attendance || '',
    group_name: a.groupName, type: a.type, audience: a.audience,
    day: a.day, time: a.time, location: a.location,
    description: a.description, why: a.why, notes: a.notes || '',
    status: a.status || 'pending',
  };
}
```

Replace with:

```js
function signupFromDb(r) {
  return {
    id: r.id, groupId: r.group_id, groupName: r.group_name,
    leaderName: r.leader_name, leaderEmail: r.leader_email || '',
    name: r.name, email: r.email, phone: r.phone || '', message: r.message || '',
    date: r.created_at, contacted: !!r.contacted,
    semesterId: r.semester_id || null,
  };
}
function signupToDb(s) {
  return {
    group_id: s.groupId || null, group_name: s.groupName,
    leader_name: s.leaderName, leader_email: s.leaderEmail || '',
    name: s.name, email: s.email, phone: s.phone || '', message: s.message || '',
    contacted: false,
    semester_id: s.semesterId || null,
  };
}

function applicationFromDb(r) {
  return {
    id: r.id, status: r.status || 'pending', submittedDate: r.submitted_date,
    name: r.name, email: r.email, phone: r.phone || '', attendance: r.attendance || '',
    groupName: r.group_name, type: r.type, audience: r.audience,
    day: r.day, time: r.time, location: r.location,
    description: r.description, why: r.why, notes: r.notes || '',
    semesterId: r.semester_id || null,
  };
}
function applicationToDb(a) {
  return {
    name: a.name, email: a.email, phone: a.phone || '', attendance: a.attendance || '',
    group_name: a.groupName, type: a.type, audience: a.audience,
    day: a.day, time: a.time, location: a.location,
    description: a.description, why: a.why, notes: a.notes || '',
    status: a.status || 'pending',
    semester_id: a.semesterId || null,
  };
}
```

- [ ] **Step 2: Auto-assign the current semester in `submitSignup`/`submitApplication`**

Current content at `js/db.js:328-346`:

```js
  /* ── PUBLIC: Submit signup ──────────────────────────────── */
  async submitSignup(signup) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('signups').insert(signupToDb(signup));
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] submitSignup:', e.message); return { error: e.message }; }
  },

  /* ── PUBLIC: Submit application ─────────────────────────── */
  async submitApplication(app) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('applications').insert(applicationToDb(app));
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] submitApplication:', e.message); return { error: e.message }; }
  },
```

Replace with:

```js
  /* ── PUBLIC: Submit signup ──────────────────────────────── */
  async submitSignup(signup) {
    if (!db()) return { error: 'Not configured' };
    try {
      const current = await this.getCurrentSemester();
      const { error } = await db().from('signups').insert(signupToDb({ ...signup, semesterId: current ? current.id : null }));
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] submitSignup:', e.message); return { error: e.message }; }
  },

  /* ── PUBLIC: Submit application ─────────────────────────── */
  async submitApplication(app) {
    if (!db()) return { error: 'Not configured' };
    try {
      const current = await this.getCurrentSemester();
      const { error } = await db().from('applications').insert(applicationToDb({ ...app, semesterId: current ? current.id : null }));
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] submitApplication:', e.message); return { error: e.message }; }
  },
```

`this.getCurrentSemester()` is the existing method (added in the Small Group Semesters feature) that returns the semester whose date range contains today, the soonest upcoming one if today falls in a gap, or `null` if none are configured or on any DB error — it already fails safe, so no additional error handling is needed here. If it returns `null`, the record is inserted with `semester_id: null`, exactly like the "no semesters configured" case — submission is never blocked by this lookup.

- [ ] **Step 3: Verify by inspection**

Run: `node --check js/db.js`
Expected: no output (exits 0)

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Auto-assign current semester to signups and applications on submit"
```

---

### Task 3: Admin Sign-Up Requests tab — Semester column + filter

**Files:**
- Modify: `admin/dashboard.html:346-359` (filter bar + table header, inside `#panelSignups`)
- Modify: `admin/dashboard.html:2444-2496` (`renderSignupsPanel`/`applySignupsFilter`)

- [ ] **Step 1: Add the Semester filter select and table column header**

Current content at `admin/dashboard.html:346-359`:

```html
      <div class="signup-filter-bar">
        <label>Filter by Group:</label>
        <select id="signupFilterGroup" onchange="applySignupsFilter()"><option value="">All Groups</option></select>
        <label style="margin-left:8px;">Status:</label>
        <select id="signupFilterStatus" onchange="applySignupsFilter()">
          <option value="">All</option>
          <option value="new">New Only</option>
          <option value="contacted">Contacted Only</option>
        </select>
        <span id="signupCountLabel" style="margin-left:auto; font-size:.82rem; color:var(--text-muted);"></span>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Name & Contact</th><th>Group</th><th>Date</th><th>Message</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="signupsGrid"></tbody></table>
      </div>
```

Replace with:

```html
      <div class="signup-filter-bar">
        <label>Filter by Group:</label>
        <select id="signupFilterGroup" onchange="applySignupsFilter()"><option value="">All Groups</option></select>
        <label style="margin-left:8px;">Status:</label>
        <select id="signupFilterStatus" onchange="applySignupsFilter()">
          <option value="">All</option>
          <option value="new">New Only</option>
          <option value="contacted">Contacted Only</option>
        </select>
        <label style="margin-left:8px;">Semester:</label>
        <select id="signupFilterSemester" onchange="applySignupsFilter()">
          <option value="">All Semesters</option>
          <option value="__current__">Current Semester</option>
        </select>
        <span id="signupCountLabel" style="margin-left:auto; font-size:.82rem; color:var(--text-muted);"></span>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Name & Contact</th><th>Group</th><th>Date</th><th>Message</th><th>Semester</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="signupsGrid"></tbody></table>
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
Expected: `BALANCED`. This file has a history of dangling-`</div>` bugs — this check is mandatory before committing any HTML change here.

- [ ] **Step 3: Fetch semesters, populate the filter, and apply it**

Current content at `admin/dashboard.html:2444-2496`:

```js
async function renderSignupsPanel(){
  const isLeader = window._userRole === 'small_group_leader';
  [_cachedSignups, _cachedSignupGroups] = await Promise.all([
    SupaDB.adminGetAllSignups(), SupaDB.adminGetAllGroups()
  ]);
  // Populate filter dropdown once after data loads — don't touch it on filter changes
  const visibleGroups = isLeader ? _cachedSignupGroups.filter(g => window._myGroupIds.includes(g.id)) : _cachedSignupGroups;
  const sel=document.getElementById('signupFilterGroup');
  // Single-group leaders don't need "All" since there's nothing else to show
  const showAllOption = !isLeader || visibleGroups.length > 1;
  sel.innerHTML=(showAllOption?'<option value="">All Groups</option>':'')+visibleGroups.map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
  if (isLeader && visibleGroups.length === 1) sel.value = String(visibleGroups[0].id);
  sel.disabled = isLeader && visibleGroups.length <= 1;
  applySignupsFilter();
}
function applySignupsFilter(){
  const isLeader = window._userRole === 'small_group_leader';
  const filterGroupId=document.getElementById('signupFilterGroup').value;
  const filterStatus=document.getElementById('signupFilterStatus').value;
  let signups=[..._cachedSignups];
  // Leaders: first restrict to their own groups, then apply dropdown selection
  if (isLeader) signups=signups.filter(s=>window._myGroupIds.includes(s.groupId));
  // Apply group dropdown for everyone (leaders picking one of their groups, admins picking any)
  if(filterGroupId)signups=signups.filter(s=>String(s.groupId)===String(filterGroupId));
  if(filterStatus==='new')signups=signups.filter(s=>!s.contacted);
  if(filterStatus==='contacted')signups=signups.filter(s=>s.contacted);
  signups.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const grid=document.getElementById('signupsGrid'),empty=document.getElementById('signupsEmpty');
  const countLabel=document.getElementById('signupCountLabel');
  countLabel.textContent=`${signups.length} sign-up${signups.length!==1?'s':''}`;
  document.getElementById('emailLeaderBtn').style.display=filterGroupId?'inline-flex':'none';
  if(!signups.length){grid.innerHTML='';empty.style.display='';}
  else{
    empty.style.display='none';
    grid.innerHTML=signups.map(s=>{
      const ds=s.date?new Date(s.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
      const fullMsg=s.message||'';
      const previewMsg=fullMsg.length>40?fullMsg.slice(0,40)+'…':fullMsg;
      const msgCell=fullMsg?`<span class="signup-msg-preview" title="${escapeHtml(fullMsg)}" onclick="this.classList.toggle('expanded')">${escapeHtml(previewMsg)}</span>`:'—';
      return`<tr id="sc_${s.id}">
        <td><strong>${escapeHtml(s.name)}</strong><br><a href="mailto:${escapeHtml(s.email)}" style="font-size:.8rem;color:var(--primary);">${escapeHtml(s.email)}</a>${s.phone?`<br><span style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(s.phone)}</span>`:''}</td>
        <td>${escapeHtml(s.groupName)}</td>
        <td style="font-size:.82rem;color:var(--text-muted);">${ds}</td>
        <td>${msgCell}</td>
        <td>${s.contacted?'<span class="badge badge-green">Contacted</span>':'<span class="badge badge-amber">New</span>'}</td>
        <td><div class="td-actions">
          <button class="btn btn-sm ${s.contacted?'btn-ghost':'btn-success'}" onclick="toggleSignupContacted(${s.id})">${s.contacted?'↩ Mark Uncontacted':'✓ Mark Contacted'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteItem('signup',${s.id},'${s.name.replace(/'/g,"\\'")}')">Delete</button>
        </div></td>
      </tr>`;
    }).join('');
  }
}
```

Replace with:

```js
let _semestersForSignups = [];
async function renderSignupsPanel(){
  const isLeader = window._userRole === 'small_group_leader';
  [_cachedSignups, _cachedSignupGroups, _semestersForSignups] = await Promise.all([
    SupaDB.adminGetAllSignups(), SupaDB.adminGetAllGroups(), SupaDB.getSemesters()
  ]);
  // Populate filter dropdown once after data loads — don't touch it on filter changes
  const visibleGroups = isLeader ? _cachedSignupGroups.filter(g => window._myGroupIds.includes(g.id)) : _cachedSignupGroups;
  const sel=document.getElementById('signupFilterGroup');
  // Single-group leaders don't need "All" since there's nothing else to show
  const showAllOption = !isLeader || visibleGroups.length > 1;
  sel.innerHTML=(showAllOption?'<option value="">All Groups</option>':'')+visibleGroups.map(g=>`<option value="${g.id}">${g.name}</option>`).join('');
  if (isLeader && visibleGroups.length === 1) sel.value = String(visibleGroups[0].id);
  sel.disabled = isLeader && visibleGroups.length <= 1;
  const semSelEl = document.getElementById('signupFilterSemester');
  if (semSelEl && semSelEl.options.length <= 2) {
    semSelEl.innerHTML = '<option value="">All Semesters</option><option value="__current__">Current Semester</option>'
      + _semestersForSignups.slice().sort((a,b)=>b.startDate.localeCompare(a.startDate)).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }
  applySignupsFilter();
}
async function applySignupsFilter(){
  const isLeader = window._userRole === 'small_group_leader';
  const filterGroupId=document.getElementById('signupFilterGroup').value;
  const filterStatus=document.getElementById('signupFilterStatus').value;
  const filterSemester=document.getElementById('signupFilterSemester').value;
  let signups=[..._cachedSignups];
  // Leaders: first restrict to their own groups, then apply dropdown selection
  if (isLeader) signups=signups.filter(s=>window._myGroupIds.includes(s.groupId));
  // Apply group dropdown for everyone (leaders picking one of their groups, admins picking any)
  if(filterGroupId)signups=signups.filter(s=>String(s.groupId)===String(filterGroupId));
  if(filterStatus==='new')signups=signups.filter(s=>!s.contacted);
  if(filterStatus==='contacted')signups=signups.filter(s=>s.contacted);
  if(filterSemester==='__current__'){
    const current = await SupaDB.getCurrentSemester();
    signups = current ? signups.filter(s=>s.semesterId===current.id) : [];
  } else if(filterSemester){
    signups = signups.filter(s=>s.semesterId===filterSemester);
  }
  signups.sort((a,b)=>new Date(b.date)-new Date(a.date));
  const grid=document.getElementById('signupsGrid'),empty=document.getElementById('signupsEmpty');
  const countLabel=document.getElementById('signupCountLabel');
  countLabel.textContent=`${signups.length} sign-up${signups.length!==1?'s':''}`;
  document.getElementById('emailLeaderBtn').style.display=filterGroupId?'inline-flex':'none';
  if(!signups.length){grid.innerHTML='';empty.style.display='';}
  else{
    empty.style.display='none';
    grid.innerHTML=signups.map(s=>{
      const ds=s.date?new Date(s.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
      const fullMsg=s.message||'';
      const previewMsg=fullMsg.length>40?fullMsg.slice(0,40)+'…':fullMsg;
      const msgCell=fullMsg?`<span class="signup-msg-preview" title="${escapeHtml(fullMsg)}" onclick="this.classList.toggle('expanded')">${escapeHtml(previewMsg)}</span>`:'—';
      const semName = s.semesterId ? (_semestersForSignups.find(x=>x.id===s.semesterId)||{}).name || '—' : '—';
      return`<tr id="sc_${s.id}">
        <td><strong>${escapeHtml(s.name)}</strong><br><a href="mailto:${escapeHtml(s.email)}" style="font-size:.8rem;color:var(--primary);">${escapeHtml(s.email)}</a>${s.phone?`<br><span style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(s.phone)}</span>`:''}</td>
        <td>${escapeHtml(s.groupName)}</td>
        <td style="font-size:.82rem;color:var(--text-muted);">${ds}</td>
        <td>${msgCell}</td>
        <td>${escapeHtml(semName)}</td>
        <td>${s.contacted?'<span class="badge badge-green">Contacted</span>':'<span class="badge badge-amber">New</span>'}</td>
        <td><div class="td-actions">
          <button class="btn btn-sm ${s.contacted?'btn-ghost':'btn-success'}" onclick="toggleSignupContacted(${s.id})">${s.contacted?'↩ Mark Uncontacted':'✓ Mark Contacted'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteItem('signup',${s.id},'${s.name.replace(/'/g,"\\'")}')">Delete</button>
        </div></td>
      </tr>`;
    }).join('');
  }
}
```

`applySignupsFilter` becomes `async` because resolving `"__current__"` requires an extra `SupaDB.getCurrentSemester()` call; it's already invoked without `await` both from `onchange="applySignupsFilter()"` in HTML and from the end of `renderSignupsPanel()`, which is safe — fire-and-forget is fine here since nothing downstream depends on the DOM update completing synchronously (same as the existing `toggleSignupContacted` async handler already does in this file).

The `options.length <= 2` check on `signupFilterSemester` mirrors the exact pattern already used for `groupSemesterFilter` in the Groups tab — it only (re)populates the semester `<option>`s the first time, so a user's current filter selection survives repeated re-renders.

- [ ] **Step 4: Verify div/tag balance again**

Run the same balance-check command as Step 2.
Expected: `BALANCED`

- [ ] **Step 5: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 6: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Semester column and filter to admin Sign-Up Requests tab"
```

---

### Task 4: Admin Leader Applications tab — Semester column + filter, and fix a pre-existing XSS gap

**Files:**
- Modify: `admin/dashboard.html:368-377` (filter bar + table header, inside `#panelApplications`)
- Modify: `admin/dashboard.html:2518-2545` (`renderApplicationsTable`)

While rewriting this table's row template to add the Semester column, this task also wraps every field sourced from the public leader-application form (`a.name`, `a.email`, `a.phone`, `a.groupName`, `a.type`, `a.audience`, `a.day`, `a.time`) in `escapeHtml()`. This mirrors the identical fix already applied to the Sign-Up Requests table earlier in this codebase's history (commit that converted signups to a table also fixed unescaped `innerHTML` interpolation there) — the applications table has the exact same pre-existing gap: it's public, unauthenticated form data interpolated into `innerHTML` with no escaping, so a crafted application (e.g. a `groupName` of `<img src=x onerror=...>`) would execute in an admin's browser. Since this task already rewrites every line of this row template to add the Semester cell, applying the same fix here costs nothing extra and closes a real, live gap while the code is already open.

- [ ] **Step 1: Add the Semester filter select and table column header**

Current content at `admin/dashboard.html:368-377`:

```html
    <div class="tab-panel" id="panelApplications">
      <div class="action-bar">
        <h2>Leader Applications</h2>
        <select id="appFilterStatus" onchange="renderApplicationsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Applicant</th><th>Proposed Group</th><th>Type / Audience</th><th>Day & Time</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
```

Replace with:

```html
    <div class="tab-panel" id="panelApplications">
      <div class="action-bar">
        <h2>Leader Applications</h2>
        <select id="appFilterStatus" onchange="renderApplicationsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select id="appFilterSemester" onchange="renderApplicationsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
          <option value="">All Semesters</option>
          <option value="__current__">Current Semester</option>
        </select>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Applicant</th><th>Proposed Group</th><th>Type / Audience</th><th>Day & Time</th><th>Submitted</th><th>Semester</th><th>Status</th><th>Actions</th></tr></thead>
```

- [ ] **Step 2: Verify div/tag balance was not disturbed**

Run the same balance-check command used in Task 3.
Expected: `BALANCED`

- [ ] **Step 3: Fetch semesters, populate/apply the filter, and escape all interpolated fields**

Current content at `admin/dashboard.html:2518-2545`:

```js
/* APPLICATIONS */
let _cachedApplications = [];
async function renderApplicationsTable(){
  _cachedApplications = await SupaDB.adminGetAllApplications();
  const filterStatus=document.getElementById('appFilterStatus').value;
  let apps=[..._cachedApplications];
  if(filterStatus)apps=apps.filter(a=>a.status===filterStatus);
  apps.sort((a,b)=>new Date(b.submittedDate)-new Date(a.submittedDate));
  const tbody=document.getElementById('applicationsTable'),empty=document.getElementById('applicationsEmpty');
  if(!apps.length){tbody.innerHTML='';empty.style.display='';return;}empty.style.display='none';
  const sb={pending:'badge-amber',approved:'badge-green',rejected:'badge-red'};
  tbody.innerHTML=apps.map(a=>{
    const ds=a.submittedDate?new Date(a.submittedDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
    return`<tr>
      <td><strong>${a.name}</strong><br><a href="mailto:${a.email}" style="font-size:.8rem;color:var(--primary);">${a.email}</a>${a.phone?`<br><span style="font-size:.8rem;color:var(--text-muted);">${a.phone}</span>`:''}</td>
      <td><strong>${a.groupName}</strong></td>
      <td><span class="badge badge-blue">${a.type}</span><br><span style="font-size:.8rem;color:var(--text-muted);">${a.audience}</span></td>
      <td>${a.day}s at ${a.time}</td>
      <td style="font-size:.82rem;color:var(--text-muted);">${ds}</td>
      <td><span class="badge ${sb[a.status]||'badge-gray'}">${a.status[0].toUpperCase()+a.status.slice(1)}</span></td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="viewApplication(${a.id})">View</button>
        ${a.status==='pending'?`<button class="btn btn-success btn-sm" onclick="approveApplication(${a.id})">Approve</button><button class="btn btn-danger btn-sm" onclick="rejectApplication(${a.id})">Reject</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="deleteItem('application',${a.id},'${a.name} — ${a.groupName.replace(/'/g,"\\'")}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}
```

Replace with:

```js
/* APPLICATIONS */
let _cachedApplications = [];
let _semestersForApplications = [];
async function renderApplicationsTable(){
  [_cachedApplications, _semestersForApplications] = await Promise.all([
    SupaDB.adminGetAllApplications(), SupaDB.getSemesters()
  ]);
  const semSelEl = document.getElementById('appFilterSemester');
  if (semSelEl && semSelEl.options.length <= 2) {
    semSelEl.innerHTML = '<option value="">All Semesters</option><option value="__current__">Current Semester</option>'
      + _semestersForApplications.slice().sort((a,b)=>b.startDate.localeCompare(a.startDate)).map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
  }
  const filterStatus=document.getElementById('appFilterStatus').value;
  const filterSemester=semSelEl ? semSelEl.value : '';
  let apps=[..._cachedApplications];
  if(filterStatus)apps=apps.filter(a=>a.status===filterStatus);
  if(filterSemester==='__current__'){
    const current = await SupaDB.getCurrentSemester();
    apps = current ? apps.filter(a=>a.semesterId===current.id) : [];
  } else if(filterSemester){
    apps = apps.filter(a=>a.semesterId===filterSemester);
  }
  apps.sort((a,b)=>new Date(b.submittedDate)-new Date(a.submittedDate));
  const tbody=document.getElementById('applicationsTable'),empty=document.getElementById('applicationsEmpty');
  if(!apps.length){tbody.innerHTML='';empty.style.display='';return;}empty.style.display='none';
  const sb={pending:'badge-amber',approved:'badge-green',rejected:'badge-red'};
  tbody.innerHTML=apps.map(a=>{
    const ds=a.submittedDate?new Date(a.submittedDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
    const semName = a.semesterId ? (_semestersForApplications.find(x=>x.id===a.semesterId)||{}).name || '—' : '—';
    return`<tr>
      <td><strong>${escapeHtml(a.name)}</strong><br><a href="mailto:${escapeHtml(a.email)}" style="font-size:.8rem;color:var(--primary);">${escapeHtml(a.email)}</a>${a.phone?`<br><span style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(a.phone)}</span>`:''}</td>
      <td><strong>${escapeHtml(a.groupName)}</strong></td>
      <td><span class="badge badge-blue">${escapeHtml(a.type)}</span><br><span style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(a.audience)}</span></td>
      <td>${escapeHtml(a.day)}s at ${escapeHtml(a.time)}</td>
      <td style="font-size:.82rem;color:var(--text-muted);">${ds}</td>
      <td>${escapeHtml(semName)}</td>
      <td><span class="badge ${sb[a.status]||'badge-gray'}">${a.status[0].toUpperCase()+a.status.slice(1)}</span></td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="viewApplication(${a.id})">View</button>
        ${a.status==='pending'?`<button class="btn btn-success btn-sm" onclick="approveApplication(${a.id})">Approve</button><button class="btn btn-danger btn-sm" onclick="rejectApplication(${a.id})">Reject</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="deleteItem('application',${a.id},'${a.name} — ${a.groupName.replace(/'/g,"\\'")}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}
```

Notes:
- `escapeHtml()` is already defined elsewhere in this file (used by the Sign-Up Requests and Members tables) — hoisted, callable here without redefinition.
- The `deleteItem('application',${a.id},'${a.name} — ${a.groupName.replace(/'/g,"\\'")}')` call is left exactly as-is (not further escaped), matching the identical pre-existing pattern used by every other table's delete button in this file (including the Sign-Up Requests table) — that's a separate, file-wide convention for `onclick`-embedded strings, not something this task changes.
- `a.status` (badge label) and the `ds` (formatted date) are not user-supplied free text — `status` is one of three admin-controlled enum values (`pending`/`approved`/`rejected`) and `ds` is derived from a timestamp — so they don't need escaping, consistent with how dates/badges are handled in the already-fixed Sign-Up Requests table.

- [ ] **Step 4: Verify div/tag balance again**

Run the same balance-check command used in Task 3.
Expected: `BALANCED`

- [ ] **Step 5: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 6: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Semester column and filter to admin Leader Applications tab, escape interpolated fields"
```

---

### Task 5: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (e.g. the project's existing `static-site` preview launch config). Since local testing can't fully exercise the admin dashboard without real credentials, focus on:

- `small-groups.html`: open the "Join Group" modal, submit a test sign-up, confirm no console errors (the extra `getCurrentSemester()` read happens silently before the insert).
- `lead-a-group.html`: fill out and submit the application form, confirm no console errors.
- `node --check js/db.js` and the `admin/dashboard.html` syntax/balance checks from Tasks 3-4 all still pass together (run them once more after all tasks are committed, in case later edits touched overlapping regions).

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

1. Confirm the migration (`supabase/signup-application-semester-schema.sql`) has been run — if not, ask the user to run it before continuing (existing behavior expected until then: no `semester_id` column, `getSemesters`/`getCurrentSemester` still work off the already-seeded `semesters` list from the prior feature).
2. Submit a real test sign-up on `small-groups.html` and a real test application on `lead-a-group.html`.
3. Log into `admin/dashboard.html`, open Sign-Up Requests — confirm the new submission shows the correct current semester in its Semester column, and that filtering by "Current Semester" includes it while "All Semesters" still shows everything.
4. Repeat the same check on the Leader Applications tab.
5. Confirm older sign-ups/applications (submitted before this feature) show `—` in the Semester column and are excluded from "Current Semester" filtering but included in "All Semesters".

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
