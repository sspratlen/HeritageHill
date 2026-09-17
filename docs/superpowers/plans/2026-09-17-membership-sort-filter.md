# Membership Tab Sorting & Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broaden the Membership tab's existing search box to also match small group name, phone, and years-attending, and add a Name (A–Z)/(Z–A) sort dropdown, replacing the current hardcoded "newest member first" ordering.

**Architecture:** Pure client-side change to `admin/dashboard.html` — one new `<select>` element and a rewrite of `applyPeopleFilter()`'s matching/sorting logic. No schema, RLS, or backend changes; `_pplProfiles` and `window._pplGroups` are already loaded by `renderPeoplePanel()`.

**Tech Stack:** Static HTML/JS, no build step. Verification via `node --check`-style syntax checks and manual browser testing.

**Spec:** `docs/superpowers/specs/2026-09-17-membership-sort-filter-design.md`

---

### Task 1: Add the sort dropdown and rewrite filter/sort logic

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Add the "Sort by" dropdown next to the search box**

Find:

```html
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
        <input id="pplSearch" placeholder="Search name or email…" oninput="applyPeopleFilter()"
               style="flex:1;min-width:180px;padding:.55rem .9rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;" />
      </div>
```

Replace with:

```html
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
        <input id="pplSearch" placeholder="Search name, email, group, phone…" oninput="applyPeopleFilter()"
               style="flex:1;min-width:180px;padding:.55rem .9rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;" />
        <select id="pplSort" onchange="applyPeopleFilter()" style="padding:.45rem .85rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.875rem;outline:none;">
          <option value="name-asc">Name (A&ndash;Z)</option>
          <option value="name-desc">Name (Z&ndash;A)</option>
        </select>
      </div>
```

**Note:** the placeholder text change (`"Search name or email…"` → `"Search name, email, group, phone…"`) is intentional — it reflects the broadened matching from Step 2 so admins know the box now searches more than just name/email.

- [ ] **Step 2: Rewrite `applyPeopleFilter()`**

Find:

```javascript
function applyPeopleFilter() {
  const q = document.getElementById('pplSearch').value.toLowerCase();
  let rows = _pplProfiles.filter(p => p.status === 'approved');
  if (q) rows = rows.filter(p => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  // Newest members first -- this tab is about membership, so that's the
  // one ordering that's actually meaningful here.
  rows = rows.slice().sort((a, b) => (b.memberSince || '').localeCompare(a.memberSince || ''));
  document.getElementById('peopleTableWrap').innerHTML = membershipTable(rows);
}
```

Replace with:

```javascript
function applyPeopleFilter() {
  const q = document.getElementById('pplSearch').value.toLowerCase();
  let rows = _pplProfiles.filter(p => p.status === 'approved');
  if (q) rows = rows.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.email.toLowerCase().includes(q) ||
    (p.phone || '').toLowerCase().includes(q) ||
    (p.yearsAttending || '').toLowerCase().includes(q) ||
    groupName(p.groupId).toLowerCase().includes(q)
  );
  const sortMode = document.getElementById('pplSort').value;
  rows = rows.slice().sort((a, b) => sortMode === 'name-desc'
    ? b.name.localeCompare(a.name)
    : a.name.localeCompare(b.name));
  document.getElementById('peopleTableWrap').innerHTML = membershipTable(rows);
}
```

**Note:** `groupName()` is already defined immediately above this function in the same file and already handles an ungrouped `groupId` by returning `'—'` — no new helper needed.

- [ ] **Step 3: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/dashboard.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_dash_check_mf.js', scripts.join('\n;\n'));
"
node --check /tmp/_dash_check_mf.js && echo OK
rm -f /tmp/_dash_check_mf.js
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add sort dropdown and broaden search on the Membership tab" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Deploy and verify

- [ ] **Step 1: Push to staging**

```bash
git push staging claude/loving-darwin-e8d5ea:main
```

- [ ] **Step 2: Verify the GitHub Pages build**

```bash
gh api repos/sspratlen/HeritageHill-staging/pages/builds/latest --jq '.status'
```

Poll until `built`.

- [ ] **Step 3: Manual verification**

Log into `admin/dashboard.html` on staging as admin, go to the Membership tab. Confirm:
- The table defaults to Name (A–Z) order (no longer newest-member-first).
- Switching the new dropdown to Name (Z–A) reverses the order.
- Typing a small group's name, a phone-number fragment, or a years-attending value into the search box filters the table to matching members, in addition to name/email still working as before.
- The Pending Approval section above the table is unaffected.

- [ ] **Step 4: Report back**

Confirm to the user: staging deployment is live, sorting and broadened search work as specified.
