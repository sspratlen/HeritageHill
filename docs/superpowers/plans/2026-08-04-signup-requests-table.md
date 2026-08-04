# Sign-Up Requests Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the admin dashboard's "Sign-Up Requests" tab from a padded card grid to a compact `<table>`, matching every other list tab in the dashboard, while fixing a pre-existing stored-XSS gap where public sign-up data was interpolated into `innerHTML` unescaped.

**Architecture:** Three surgical edits to `admin/dashboard.html`: (1) swap the `.signup-card*`/`.signups-grid` CSS for a small `.signup-msg-preview` truncation style (the shared `table`/`.table-wrap`/`.td-actions`/`.badge` CSS already exists and needs no changes), (2) swap the `<div class="signups-grid">` markup for a `<table>` skeleton matching the Applications tab's structure, (3) rewrite `renderSignupsPanel()`'s row-building code to emit `<tr>`s instead of card `<div>`s, using the existing `escapeHtml()` helper on every field sourced from the public sign-up form.

**Tech Stack:** Static HTML/CSS/JS, no build step, no test framework for this file (verification is via `node --check`-style syntax checks, HTML tag-balance checks, and manual browser verification, matching this codebase's established pattern for `admin/dashboard.html` changes).

---

### Task 1: CSS — remove card styles, add message-truncation style

**Files:**
- Modify: `admin/dashboard.html:132-140`

- [ ] **Step 1: Replace the card CSS block**

Current content at `admin/dashboard.html:132-143`:

```css
    .signups-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
    .signup-card { background: var(--bg-card); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow); border-left: 4px solid var(--primary); }
    .signup-card.contacted { border-left-color: var(--success); opacity: .75; }
    .signup-card-name { font-size: 1rem; font-weight: 700; margin-bottom: 4px; }
    .signup-card-group { font-size: .78rem; font-weight: 600; color: var(--primary); margin-bottom: 10px; }
    .signup-card-detail { font-size: .82rem; color: var(--text-muted); margin-bottom: 3px; display: flex; gap: 6px; }
    .signup-card-detail strong { color: var(--text); min-width: 50px; }
    .signup-card-message { margin-top: 10px; font-size: .82rem; background: var(--bg); padding: 8px 10px; border-radius: 6px; color: var(--text-muted); font-style: italic; }
    .signup-card-footer { display: flex; gap: 6px; justify-content: flex-end; margin-top: 14px; border-top: 1px solid var(--border); padding-top: 10px; }
    .signup-filter-bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; background: var(--bg-card); padding: 14px 18px; border-radius: var(--radius-lg); box-shadow: var(--shadow); }
    .signup-filter-bar select { padding: .5rem .9rem; border: 1.5px solid var(--border); border-radius: 8px; font-family: 'DM Sans',sans-serif; font-size: .875rem; outline: none; }
    .signup-filter-bar label { font-size: .82rem; font-weight: 600; color: var(--text-muted); }
```

Replace with (drops all `.signup-card*`/`.signups-grid` rules — confirmed via repo-wide grep that nothing outside this file references those classes; keeps `.signup-filter-bar*` unchanged since the filter bar itself is not changing; adds `.signup-msg-preview` for the new truncated/expandable message cell):

```css
    .signup-msg-preview { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; display: inline-block; cursor: pointer; }
    .signup-msg-preview.expanded { white-space: normal; max-width: none; cursor: default; }
    .signup-filter-bar { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 20px; background: var(--bg-card); padding: 14px 18px; border-radius: var(--radius-lg); box-shadow: var(--shadow); }
    .signup-filter-bar select { padding: .5rem .9rem; border: 1.5px solid var(--border); border-radius: 8px; font-family: 'DM Sans',sans-serif; font-size: .875rem; outline: none; }
    .signup-filter-bar label { font-size: .82rem; font-weight: 600; color: var(--text-muted); }
```

- [ ] **Step 2: Verify by inspection**

Run: `grep -c "signup-card\|signups-grid" admin/dashboard.html`
Expected: `0` (no remaining references to the removed classes anywhere in the file — if this is nonzero, Task 2 and Task 3 below haven't been done yet, which is fine at this point since this is Task 1; re-run this check after Task 3 and expect `0` then too).

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Replace signup card CSS with table message-truncation style"
```

---

### Task 2: HTML — swap the card grid container for a table skeleton

**Files:**
- Modify: `admin/dashboard.html:360` (inside `#panelSignups`)

- [ ] **Step 1: Replace the grid container**

Current content at `admin/dashboard.html:360`:

```html
      <div class="signups-grid" id="signupsGrid"></div>
```

Replace with (same structure as the Applications tab at `admin/dashboard.html:378-380`; keeps the same `id="signupsGrid"` so `renderSignupsPanel()`'s existing `document.getElementById('signupsGrid')` call in Task 3 continues to work without changes to that lookup — only what element type it now finds changes, from a `<div>` to a `<tbody>`):

```html
      <div class="table-wrap">
        <table><thead><tr><th>Name & Contact</th><th>Group</th><th>Date</th><th>Message</th><th>Status</th><th>Actions</th></tr></thead>
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
Expected: `BALANCED`. This file has a history of dangling-`</div>` bugs from careless HTML edits — this check is mandatory before committing any change to `admin/dashboard.html`. If it's not balanced, find and fix your edit before proceeding.

Note: this specific edit replaces one `<div>...</div>` pair with a `<div class="table-wrap">...</div>` wrapping a `<table>` — net `<div>` count is unchanged (one div removed, one div added), so the check should pass trivially, but run it anyway as a mandatory gate.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Swap sign-up card grid markup for a table skeleton"
```

---

### Task 3: JS — rewrite row rendering as table rows, with escaping

**Files:**
- Modify: `admin/dashboard.html:2417-2431` (inside `renderSignupsPanel()`)

- [ ] **Step 1: Replace the card-building code with row-building code**

Current content at `admin/dashboard.html:2417-2431`:

```js
    grid.innerHTML=signups.map(s=>{
      const ds=s.date?new Date(s.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
      return`<div class="signup-card${s.contacted?' contacted':''}" id="sc_${s.id}">
        <div class="signup-card-name">${s.name}</div>
        <div class="signup-card-group">${s.contacted?'✓ Contacted · ':''}${s.groupName}</div>
        <div class="signup-card-detail"><strong>Email</strong><a href="mailto:${s.email}" style="color:var(--primary);">${s.email}</a></div>
        ${s.phone?`<div class="signup-card-detail"><strong>Phone</strong>${s.phone}</div>`:''}
        <div class="signup-card-detail"><strong>Date</strong>${ds}</div>
        ${s.message?`<div class="signup-card-message">"${s.message}"</div>`:''}
        <div class="signup-card-footer">
          <button class="btn btn-sm ${s.contacted?'btn-ghost':'btn-success'}" onclick="toggleSignupContacted(${s.id})">${s.contacted?'↩ Mark Uncontacted':'✓ Mark Contacted'}</button>
          <button class="btn btn-danger btn-sm" onclick="deleteItem('signup',${s.id},'${s.name.replace(/'/g,"\\'")}')">Delete</button>
        </div>
      </div>`;
    }).join('');
```

Replace with:

```js
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
```

Notes on this change:
- `escapeHtml()` is defined at `admin/dashboard.html:4897` as a plain top-level `function` declaration, so it's hoisted and callable from `renderSignupsPanel()` regardless of their relative position in the file — no import or reordering needed.
- `s.name`, `s.email`, `s.phone`, `s.groupName`, and both the full and truncated forms of `s.message` are now passed through `escapeHtml()` before being placed in `innerHTML` — this is the XSS fix described in the spec.
- The `deleteItem('signup',${s.id},'${s.name.replace(/'/g,"\\'")}')` call is **left exactly as-is**, matching the identical pre-existing pattern used by every other table's delete button in this file (e.g. Applications' `deleteItem('application',${a.id},'${a.name} — ${a.groupName.replace(/'/g,"\\'")}')` at `admin/dashboard.html:2478`). It only escapes single-quotes for the JS-string-literal context inside the `onclick` attribute, not full HTML-escaping — that's a pre-existing, file-wide convention for this specific `onclick`-embedded-string pattern, not something introduced or worsened by this task, and changing it here alone (without changing every other table) is out of scope per the spec.
- `id="sc_${s.id}"` moves from the card `<div>` to the `<tr>` — confirmed via grep that nothing else in the codebase looks up elements by this `sc_` id prefix, so this is a safe like-for-like move.
- Message truncation (40 characters) is computed by JS string slicing on the *unescaped* original text, then both the truncated preview and the full text are escaped separately before insertion — this matters because escaping can change string length (e.g. `<` becomes `&lt;`), so truncating after escaping could cut an entity in half.

- [ ] **Step 2: Verify no remaining references to removed CSS classes**

Run: `grep -c "signup-card\|signups-grid" admin/dashboard.html`
Expected: `0`

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
Expected: `BALANCED`

- [ ] **Step 4: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 5: Commit**

```bash
git add admin/dashboard.html
git commit -m "Render sign-up requests as table rows with HTML-escaped fields"
```

---

### Task 4: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (e.g. via the project's existing `static-site` preview launch config, or `npx serve .`), log into `admin/dashboard.html` with real credentials, and open the Sign-Up Requests tab. Confirm:
- Rows render as a table (header row: Name & Contact / Group / Date / Message / Status / Actions), not cards.
- No JS console errors.
- A sign-up with no message shows `—` in the Message column.
- A sign-up with a long message shows a truncated preview; hovering shows the full text as a tooltip; clicking it expands the cell to show the full text inline, and clicking again (or navigating away and back) does not error.
- The Status column shows a green "Contacted" badge or amber "New" badge, matching each row's actual contacted state.
- "Mark Contacted" / "Mark Uncontacted" and "Delete" buttons still work exactly as before (functions `toggleSignupContacted` and `deleteItem` were not modified, only their buttons' container markup).
- The existing group/status filter dropdowns and count label still filter the table correctly (their logic in `applySignupsFilter`/`renderSignupsPanel` was not touched).
- **XSS check**: temporarily submit (or directly insert via the Supabase dashboard, then delete afterward) a test sign-up with a name or message containing `<img src=x onerror=alert(1)>` — confirm it renders as inert visible text in the table (e.g. literally shows `<img src=x onerror=alert(1)>` as text) rather than executing a JS alert. Remove the test row afterward.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

Repeat the checks from Step 1 against the deployed staging `admin/dashboard.html`, using real staging data (no need to repeat the XSS test if it already passed locally against the same code).

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
