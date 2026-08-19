# Filter Draft Small Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Published/Draft status filter to the admin "Manage Small Groups" tab, alongside the existing Semester filter.

**Architecture:** A new static `<select>` (no dynamic population needed, unlike the Semester filter) is added to `#panelGroups`'s action-bar. `renderGroupsTable()` already loads each group's `published` boolean via `_cachedGroups` and already filters a local `groups` array by semester before rendering — this adds one more filter step to that same array, reading the new dropdown's value.

**Tech Stack:** Static HTML/JS, no build step — verification is via `node --check`-style syntax checks, HTML tag-balance checks (`admin/dashboard.html` has a history of dangling-`</div>` bugs), and manual browser verification.

---

### Task 1: Published/Draft filter on the Groups tab

**Files:**
- Modify: `admin/dashboard.html` — `#panelGroups` action-bar and `renderGroupsTable()` (locate both by exact text match — line numbers may have drifted slightly)

- [ ] **Step 1: Add the status filter dropdown to the action-bar**

Find this exact block:

```html
    <div class="tab-panel" id="panelGroups">
      <div class="action-bar">
        <h2>Manage Small Groups</h2>
        <select id="groupSemesterFilter" onchange="renderGroupsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
          <option value="">All Semesters</option>
          <option value="__current__">Current Semester</option>
        </select>
        <div style="display:flex;gap:8px;">
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
        <select id="groupPublishedFilter" onchange="renderGroupsTable()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
          <option value="">All Statuses</option>
          <option value="published">Published Only</option>
          <option value="draft">Draft Only</option>
        </select>
        <div style="display:flex;gap:8px;">
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
Expected: `BALANCED`. This file has a history of dangling-`</div>` bugs — mandatory before committing any HTML change here. This specific edit adds one `<select>` with no `<div>`/`</div>` at all, so the count should be unchanged from before this task; if it's not balanced, find and fix your edit before proceeding.

- [ ] **Step 3: Apply the filter in `renderGroupsTable()`**

Find this exact block:

```js
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
```

Replace with:

```js
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
  const pubSelEl = document.getElementById('groupPublishedFilter');
  const pubFilterVal = pubSelEl ? pubSelEl.value : '';
  if (pubFilterVal === 'published') {
    groups = groups.filter(g => g.published);
  } else if (pubFilterVal === 'draft') {
    groups = groups.filter(g => !g.published);
  }
  const tbody=document.getElementById('groupsTable'),empty=document.getElementById('groupsEmpty');
```

This mirrors the exact defensive style already used for `semSelEl`/`filterVal` (falling back to `''` if the element is ever missing), applied to the same local `groups` array right after the existing semester filter — the two filters stack independently, matching the spec.

- [ ] **Step 4: Verify div/tag balance again**

Run the same balance-check command from Step 2.
Expected: `BALANCED`

- [ ] **Step 5: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 6: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Published/Draft status filter to admin Manage Small Groups tab"
```

---

### Task 2: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (e.g. the project's existing `static-site` preview launch config). Since local testing can't fully exercise the admin dashboard without real credentials, at minimum confirm:

- `node --check`-equivalent JS syntax and div-balance checks from Task 1 still pass.
- Loading `admin/dashboard.html` locally (redirects to login when unauthenticated, as expected) throws no console errors.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

1. Log into `admin/dashboard.html`, open "Manage Small Groups".
2. Confirm the new "All Statuses / Published Only / Draft Only" dropdown appears next to the Semester filter.
3. Select "Draft Only" — confirm only groups with the gray "Draft" badge remain in the table.
4. Select "Published Only" — confirm only groups with the green "Published" badge remain.
5. Select "All Statuses" — confirm the full list returns.
6. Combine "Draft Only" with a specific semester in the Semester filter — confirm both filters apply together (only draft groups in that semester show).

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
