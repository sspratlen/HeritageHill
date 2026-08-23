# Printable Small Group Sign-Up Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "🖨️ Print Sign-Up Sheet" button to each group's row in the admin "Manage Small Groups" tab that opens a print-ready, blank in-person sign-up sheet for that group — group photo, name, leader, day/time, location, description, plus a ruled Name/Email/Phone table with blank rows.

**Architecture:** A new `printGroupSignupSheet(groupId)` function in `admin/dashboard.html` mirrors the existing `printPrayerRequests()` function's exact pattern: look up data from an already-loaded cache (`_cachedGroups`, populated by `renderGroupsTable()` — the same tab this button lives on, so no new fetch is needed), open a blank window via `window.open('', '_blank')`, write a complete self-contained HTML document into it (its own `<style>` block, `@page` sizing, HTML-escaped interpolated fields), and auto-trigger `window.print()` on load via a small inline script.

**Tech Stack:** Static HTML/JS, `window.open`/`document.write`, browser print — no build step, no PDF library, no new page file. Verification is via `node --check`-style syntax checks, HTML tag-balance checks (`admin/dashboard.html` has a history of dangling-`</div>` bugs), and manual browser verification.

---

### Task 1: Print button + `printGroupSignupSheet` function

**Files:**
- Modify: `admin/dashboard.html` — Groups table row template (`renderGroupsTable()`) and a new function placed near the existing `printPrayerRequests()`

- [ ] **Step 1: Add the print button to each group row's Actions cell**

Find this exact block:

```js
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

Replace with:

```js
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="openGroupRoster(${g.id})">Members</button>
        <button class="btn btn-ghost btn-sm" onclick="openGroupAttendanceModal(${g.id})">Attendance</button>
        <button class="btn btn-ghost btn-sm" onclick="editGroup(${g.id})">Edit</button>
        <button class="btn btn-secondary btn-sm" onclick="openGroupEmailModal(${g.id})">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Email Group
        </button>
        <button class="btn btn-ghost btn-sm" onclick="printGroupSignupSheet(${g.id})">🖨️ Print Sign-Up Sheet</button>
        ${!isLeader?`<button class="btn btn-danger btn-sm" onclick="deleteItem('group',${g.id},'${g.name.replace(/'/g,"\\'")}')">Delete</button>`:''}
      </div></td>
    </tr>`;
  }).join('');
}
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
Expected: `BALANCED`. Mandatory before committing any HTML change to this file. This edit adds one `<button>`, no `<div>`/`</div>` at all, so the count should be unchanged from before this task; if it's not balanced, find and fix your edit before proceeding.

- [ ] **Step 3: Add the `printGroupSignupSheet` function**

Find this exact block (the end of `printPrayerRequests()`, immediately before `async function togglePrayed`):

```js
<script>window.onload = function(){ window.print(); };<\/script>
</body></html>`);
  win.document.close();
}

async function togglePrayed(id, prayed) {
```

Replace with:

```js
<script>window.onload = function(){ window.print(); };<\/script>
</body></html>`);
  win.document.close();
}

function printGroupSignupSheet(id) {
  const g = _cachedGroups.find(x => x.id === id);
  if (!g) return;

  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  const rows = Array.from({ length: 18 }).map(() => `
    <tr>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
    </tr>`).join('');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html><head>
<title>${esc(g.name)} — Sign-Up Sheet</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
@page { size:letter portrait; margin:.4in; }
body { font-family:Georgia,'Times New Roman',serif; background:#fff; color:#111; }
.church-name {
  font-family:Arial,sans-serif;
  font-size:9px;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:.1em;
  color:#BC7A1E;
  border-bottom:2px solid #BC7A1E;
  padding-bottom:8px;
  margin-bottom:16px;
}
.group-image {
  width:100%;
  max-height:2.6in;
  object-fit:cover;
  border-radius:8px;
  margin-bottom:16px;
  display:block;
}
.group-name {
  font-family:Arial,sans-serif;
  font-size:22px;
  font-weight:700;
  margin-bottom:6px;
}
.group-meta {
  font-family:Arial,sans-serif;
  font-size:11px;
  color:#555;
  margin-bottom:12px;
}
.group-description {
  font-size:12.5px;
  line-height:1.6;
  color:#333;
  margin-bottom:20px;
}
table { width:100%; border-collapse:collapse; }
th, td {
  border:1px solid #999;
  padding:10px 8px;
  text-align:left;
  font-family:Arial,sans-serif;
  font-size:10.5px;
}
th {
  background:#f4f4f2;
  text-transform:uppercase;
  letter-spacing:.05em;
  font-size:9px;
  color:#555;
}
th:nth-child(1), td:nth-child(1) { width:34%; }
th:nth-child(2), td:nth-child(2) { width:38%; }
th:nth-child(3), td:nth-child(3) { width:28%; }
td { height:.32in; }
@media print {
  body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
}
</style>
</head>
<body>
<div class="church-name">Heritage Hill Church</div>
<img class="group-image" src="${esc(g.image)}" alt="${esc(g.name)}" />
<div class="group-name">${esc(g.name)}</div>
<div class="group-meta">Led by ${esc(g.leader)} &nbsp;\u00b7&nbsp; ${esc(g.day)}s at ${esc(g.time)} &nbsp;\u00b7&nbsp; ${esc(g.location)}</div>
<div class="group-description">${esc(g.description)}</div>
<table>
  <thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<script>window.onload = function(){ window.print(); };<\/script>
</body></html>`);
  win.document.close();
}

async function togglePrayed(id, prayed) {
```

Notes on this implementation, matching the design spec:

- **Data source**: `_cachedGroups` is already populated by `renderGroupsTable()` (the same function that renders the button this triggers), so no new network request is needed — matches the spec's "Data Source" section exactly.
- **Not-found guard**: if `id` doesn't match any cached group, the function returns immediately without opening a window — matches the spec's error-handling requirement.
- **Escaping**: every interpolated group field (`name`, `leader`, `day`, `time`, `location`, `description`) goes through the same kind of local `esc()` helper `printPrayerRequests()` already defines for itself — a plain `&`/`<`/`>` replacer. `g.image` is also passed through `esc()` before being placed in the `src` attribute, since it's string-interpolated into HTML the same way every other field is here.
- **`<\/script>`**: the closing `</script>` tag inside the generated document is deliberately written as `<\/script>` (escaped forward slash) — this is not a typo; it's required because this whole HTML string is itself inside a `<script>` block in `admin/dashboard.html`, and an unescaped `</script>` inside the template literal would prematurely close that outer script tag. `printPrayerRequests()` already does this for the exact same reason — copy the pattern exactly.
- **Row count**: 18 blank rows, matching the spec's "approximately 15–20 rows" guidance.
- **No batching**: unlike `printPrayerRequests()` (which prints multiple selected requests across paginated `.page` divs), this function only ever handles one group per call — no `pages` array, no pagination logic, matching the spec's explicit "one sheet per click" scope.

- [ ] **Step 4: Verify div/tag balance again**

Run the same balance-check command from Step 2.
Expected: `BALANCED`

- [ ] **Step 5: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 6: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add printable sign-up sheet button to admin Groups tab"
```

---

### Task 2: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (e.g. the project's existing `static-site` preview launch config). Since local testing can't fully exercise the admin dashboard without real credentials, at minimum confirm:

- The syntax/balance checks from Task 1 pass.
- Loading `admin/dashboard.html` locally (redirects to login when unauthenticated, as expected) throws no console errors.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

1. Log into `admin/dashboard.html`, open "Manage Small Groups".
2. Click "🖨️ Print Sign-Up Sheet" on a real group — confirm a new tab/window opens with the browser's print dialog appearing automatically.
3. In the print preview, confirm: the group's photo appears, the group name/leader/day-time/location line is correct, the description is present, and a ruled table with Name/Email/Phone columns and ~18 blank rows fills the rest of the page.
4. Cancel the print dialog and confirm the underlying page itself (not just the print preview) also looks correct if viewed directly.
5. Try this on a group whose description or name contains an apostrophe or an `&` character — confirm it displays correctly (properly escaped, not broken or double-encoded).

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
