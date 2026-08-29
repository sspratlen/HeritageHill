# Count Leading a Group as Attending It Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member's "Small Group History" table (admin Member Dashboard and their own profile page) shows groups they lead, not just groups they have a `group_memberships` row for.

**Architecture:** `MemberDashboard.renderGroupHistory()` (`js/member-dashboard.js`) gains a fourth parameter, the member's email, and internally merges in a synthesized "Leader" row for any group whose `leaderEmail` matches — skipping groups that already have a real membership row for the same `groupId`. Both call sites (`admin/member-dashboard.html`, `admin/my-profile.html`) are updated to pass that email.

**Tech Stack:** Static HTML/JS, no build step — verification is via `node --check`-style syntax checks and manual browser verification, matching this codebase's established pattern.

---

### Task 1: Merge led groups into `renderGroupHistory`

**Files:**
- Modify: `js/member-dashboard.js:37-59` (`renderGroupHistory`)
- Modify: `admin/member-dashboard.html:276` (caller)
- Modify: `admin/my-profile.html:155` (caller)

- [ ] **Step 1: Update `renderGroupHistory` to accept email and merge in led groups**

Current content at `js/member-dashboard.js:37-59`:

```js
  // Renders a small group history table into containerEl.
  // memberships: result of SupaDB.getGroupMembershipsForUser(userId)
  // groups: for name lookup — SupaDB.adminGetAllGroups() (admin caller) or
  // SupaDB.getPublishedGroups() (member's own page); a group unpublished
  // since a past membership falls back to "Unknown Group" in the latter case.
  renderGroupHistory(containerEl, memberships, groups) {
    if (!memberships.length) {
      containerEl.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;">No group history yet.</p>';
      return;
    }
    const groupName = id => {
      const g = groups.find(x => String(x.id) === String(id));
      return g ? g.name : 'Unknown Group';
    };
    const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    containerEl.innerHTML = `<table><thead><tr><th>Group</th><th>Joined</th><th>Status</th></tr></thead><tbody>` +
      memberships.map(m => `
        <tr>
          <td>${this.escapeHtml(groupName(m.groupId))}</td>
          <td>${fmt(m.joinedAt)}</td>
          <td>${m.leftAt ? 'Left ' + fmt(m.leftAt) : '<span class="badge badge-green">Current</span>'}</td>
        </tr>`).join('') + '</tbody></table>';
  },
```

Replace with:

```js
  // Renders a small group history table into containerEl.
  // memberships: result of SupaDB.getGroupMembershipsForUser(userId)
  // groups: for name lookup — SupaDB.adminGetAllGroups() (admin caller) or
  // SupaDB.getPublishedGroups() (member's own page); a group unpublished
  // since a past membership falls back to "Unknown Group" in the latter case.
  // email: the member's own email — used to also surface groups they lead
  // (matched against groups[].leaderEmail) even if they have no separate
  // group_memberships row for that group. Leading a group counts as having
  // attended it.
  renderGroupHistory(containerEl, memberships, groups, email) {
    const led = (email
      ? groups.filter(g => g.leaderEmail && g.leaderEmail.toLowerCase() === email.toLowerCase())
      : []
    ).filter(g => !memberships.some(m => String(m.groupId) === String(g.id)))
     .map(g => ({ groupId: g.id, joinedAt: null, leftAt: null, isLeader: true }));

    const rows = memberships.concat(led);

    if (!rows.length) {
      containerEl.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;">No group history yet.</p>';
      return;
    }
    const groupName = id => {
      const g = groups.find(x => String(x.id) === String(id));
      return g ? g.name : 'Unknown Group';
    };
    const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    containerEl.innerHTML = `<table><thead><tr><th>Group</th><th>Joined</th><th>Status</th></tr></thead><tbody>` +
      rows.map(m => `
        <tr>
          <td>${this.escapeHtml(groupName(m.groupId))}</td>
          <td>${m.isLeader ? '—' : fmt(m.joinedAt)}</td>
          <td>${m.isLeader ? '<span class="badge badge-blue">Leader</span>' : (m.leftAt ? 'Left ' + fmt(m.leftAt) : '<span class="badge badge-green">Current</span>')}</td>
        </tr>`).join('') + '</tbody></table>';
  },
```

Notes:
- `led` is computed by: filtering `groups` to ones led by this email (case-insensitive), then filtering out any whose `id` already appears as a `groupId` in `memberships` (so a group where the person is both a tracked member and the leader gets one row, not two), then mapping each remaining one into a plain object shaped like a membership row (`groupId`, `joinedAt: null`, `leftAt: null`) plus an `isLeader: true` marker the render step checks.
- The empty-state check moves from `!memberships.length` to `!rows.length`, so a person who leads a group but has zero real memberships still sees their led group instead of "No group history yet."
- `email` is optional (defaults to producing zero `led` matches if falsy/omitted) — matches the spec's defensive-handling requirement without needing an explicit early return.

- [ ] **Step 2: Verify JS syntax**

Run: `node --check js/member-dashboard.js`
Expected: no output (exits 0)

- [ ] **Step 3: Update the admin Member Dashboard caller**

Current content at `admin/member-dashboard.html:276`:

```js
  MemberDashboard.renderGroupHistory(document.getElementById('mdGroupHistory'), memberships, _groups);
```

Replace with:

```js
  MemberDashboard.renderGroupHistory(document.getElementById('mdGroupHistory'), memberships, _groups, p.email);
```

- [ ] **Step 4: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/member-dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 5: Update the my-profile.html caller**

Current content at `admin/my-profile.html:155`:

```js
  MemberDashboard.renderGroupHistory(document.getElementById('groupHistoryBox'), memberships, groups);
```

Replace with:

```js
  MemberDashboard.renderGroupHistory(document.getElementById('groupHistoryBox'), memberships, groups, _profile.email);
```

- [ ] **Step 6: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/my-profile.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 7: Commit**

```bash
git add js/member-dashboard.js admin/member-dashboard.html admin/my-profile.html
git commit -m "Count group leadership as attendance in Small Group History"
```

---

### Task 2: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (e.g. the project's existing `static-site` preview launch config). Since these are both authenticated admin/member pages, local testing without real credentials can only confirm:

- The syntax checks from Task 1 all pass.
- Loading `admin/member-dashboard.html` and `admin/my-profile.html` locally (each redirects to login when unauthenticated, as expected) throws no console errors.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

1. Log into `admin/dashboard.html`, open the Member Dashboard for a known group leader who has no separate `group_memberships` row for their own group (e.g. Ray Cluff / "Every Day Dudes", from the original bug report) — confirm the group now appears in Small Group History with a "Leader" badge and `—` in the Joined column, instead of "No group history yet."
2. Find (or temporarily make) a member who both leads a group AND has a real `group_memberships` row for that same group — confirm only one row appears for that group (their real membership row, not a duplicate "Leader" row).
3. Confirm a member with neither a membership nor a led group still correctly shows "No group history yet."
4. Log in as a member (not admin) and check their own `my-profile.html` — if they lead a group, confirm the same "Leader" row appears there too.

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
