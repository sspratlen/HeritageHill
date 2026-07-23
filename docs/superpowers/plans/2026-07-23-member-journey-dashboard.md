# Member Journey Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Growth Track progress (registered/attended per part) and small group join/leave history for any member, on both the member's own `my-profile.html` and a new admin `member-dashboard.html` page with cycling between members.

**Architecture:** New `group_memberships` table replaces `signups` as the Groups tab's roster backing store (join/leave dates instead of delete-on-remove); `growth_track_registrations` gains `user_id`/`attended` columns. A shared JS module (`js/member-dashboard.js`) renders the two genuinely-new, genuinely-shared sections — Growth Track Progress and Small Group History — since those don't exist anywhere yet. The existing DISC/gifts/profile-header rendering already lives in two slightly different working forms (the old admin modal, and `my-profile.html`'s own code) and is **not** unified in this plan — that's a refinement of the spec for a lower-risk path: the admin modal's content block gets relocated (not rewritten) into the new page, and `my-profile.html`'s existing rendering is left as-is, both gaining the two new shared-module sections alongside what they already show.

**Tech Stack:** Vanilla JS, Supabase JS v2, existing `SupaDB` API pattern in `js/db.js`.

**Spec:** `docs/superpowers/specs/2026-07-23-member-journey-dashboard-design.md`

**Testing note:** Static site, no test framework — each task ends with manual/SQL verification.

**Key facts an implementer needs:**
- `growth_track_registrations`'s existing RLS policy "Admin full access to growth track registrations" uses `auth.role() = 'authenticated'` — this grants full access to **any logged-in user**, not just staff/admin (a pre-existing pattern copied from the original `groups`/`signups` tables, from before member self-registration existed). This means a member viewing their own dashboard can already read `growth_track_registrations`/`group_memberships` rows via this policy — no new "own rows" RLS policy is needed for the dashboard to function; client code just filters by `user_id` for display purposes. **This broader-than-ideal access pattern is a pre-existing condition across several tables, not something this plan introduces or is scoped to fix** — flag it to Scott after this plan ships, don't attempt to fix it here (it's a cross-cutting RLS change touching many already-shipped features, out of scope for this spec).
- Modal/table/badge/toggle conventions are identical to prior work in this codebase — reuse them, don't reinvent: `.modal-overlay`/`.modal`/`.modal-lg`/`.modal-header`/`.modal-body`/`.modal-footer`, plain `<table>`, `.badge.badge-green/gray/blue/amber/red`, `.publish-toggle-row`+`.toggle-switch`, `.form-row`/`.field`, `showToast(msg, isError)`, `escapeHtml(s)` (already defined once in `admin/dashboard.html`).
- `member_profiles` has `email` (unique-ish in practice, not DB-unique) and `status` (`pending`/`approved`) — email-matching for auto-linking `user_id` should only match `status = 'approved'` rows.
- Site pushes: commit → `git push staging HEAD:main` → verify → `git push origin HEAD:main`, only when Scott explicitly asks, staging first always.

---

### Task 1: Schema — `group_memberships` table + `growth_track_registrations` columns

**Files:**
- Create: `supabase/member-dashboard-schema.sql`

- [ ] **Step 1: Write the schema file**

```sql
-- ============================================================
-- Member journey dashboard: group_memberships table, plus
-- user_id/attended columns on growth_track_registrations.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- ============================================================

create table if not exists group_memberships (
  id         bigint generated always as identity primary key,
  group_id   bigint references groups(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null,
  email      text not null,
  phone      text not null default '',
  joined_at  date not null default current_date,
  left_at    date,
  notes      text not null default ''
);

alter table group_memberships enable row level security;

drop policy if exists "Admin full access to group memberships" on group_memberships;
create policy "Admin full access to group memberships"
  on group_memberships for all
  using (auth.role() = 'authenticated');

alter table growth_track_registrations
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists attended boolean not null default false;
```

- [ ] **Step 2: Have Scott run it in the Supabase SQL editor.**

- [ ] **Step 3: Verify** — run in the SQL editor:

```sql
select tablename, rowsecurity from pg_tables where tablename = 'group_memberships';
select column_name, data_type from information_schema.columns
 where table_name = 'growth_track_registrations' and column_name in ('user_id','attended');
```
Expected: `group_memberships` exists with `rowsecurity = true`; both new columns present on `growth_track_registrations` (`user_id` uuid, `attended` boolean).

- [ ] **Step 4: Commit**

```bash
git add supabase/member-dashboard-schema.sql
git commit -m "Add group_memberships table and Growth Track attendance/linking columns"
```

---

### Task 2: SupaDB methods

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Update `growthTrackRegistrationFromDb` and add a new mapper.** `growthTrackRegistrationFromDb` predates this plan's schema changes and doesn't map the new `user_id`/`attended` columns yet. Find:

```js
function growthTrackRegistrationFromDb(r) {
  return {
    id: r.id, part: r.part, sessionDate: r.session_date, sessionTime: r.session_time || '',
    name: r.name, email: r.email, phone: r.phone || '', notes: r.notes || '',
    addedByAdmin: !!r.added_by_admin, createdAt: r.created_at,
  };
}
```
Replace with:
```js
function growthTrackRegistrationFromDb(r) {
  return {
    id: r.id, part: r.part, sessionDate: r.session_date, sessionTime: r.session_time || '',
    name: r.name, email: r.email, phone: r.phone || '', notes: r.notes || '',
    addedByAdmin: !!r.added_by_admin, createdAt: r.created_at,
    userId: r.user_id, attended: !!r.attended,
  };
}
```

Then add a new mapper right after it:

```js
function groupMembershipFromDb(r) {
  return {
    id: r.id, groupId: r.group_id, userId: r.user_id, name: r.name,
    email: r.email, phone: r.phone || '', joinedAt: r.joined_at,
    leftAt: r.left_at, notes: r.notes || '',
  };
}
```

- [ ] **Step 2: Add a shared email-lookup helper.** Add right after the `/* ── PUBLIC: Growth Track ── */` section (after `submitGrowthTrackRegistration`), inside the object literal:

```js
  async adminFindMemberByEmail(email) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().from('member_profiles')
        .select('*').eq('email', email.toLowerCase()).eq('status', 'approved').maybeSingle();
      if (error) throw error;
      return data ? { userId: data.user_id } : null;
    } catch(e) { console.error('[SupaDB] adminFindMemberByEmail:', e.message); return null; }
  },
```

- [ ] **Step 3: Update `submitGrowthTrackRegistration`** (in the same `/* ── PUBLIC: Growth Track ── */` section) to stamp `user_id` when the caller passes one. Find:

```js
  async submitGrowthTrackRegistration(reg) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
      });
```
Change the insert object to add one line:
```js
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
        user_id: reg.userId || null,
      });
```

- [ ] **Step 4: Update `adminAddGrowthTrackRegistration`** (in `/* ── ADMIN: Growth Track ── */`) to auto-link via email match. Find:

```js
  async adminAddGrowthTrackRegistration(reg) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
        added_by_admin: true,
      });
```
Replace with:
```js
  async adminAddGrowthTrackRegistration(reg) {
    if (!db()) return { error: 'Not configured' };
    try {
      const match = await this.adminFindMemberByEmail(reg.email);
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
        added_by_admin: true, user_id: match ? match.userId : null,
      });
```

- [ ] **Step 5: Add `adminSetGtAttended` and `getGrowthTrackRegistrationsForUser`.** Add right after `adminAddGrowthTrackRegistration`'s closing `},`:

```js
  async adminSetGtAttended(id, attended) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations')
        .update({ attended: !!attended }).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminSetGtAttended:', e.message); return { error: e.message }; }
  },
  async getGrowthTrackRegistrationsForUser(userId) {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('growth_track_registrations')
        .select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(growthTrackRegistrationFromDb);
    } catch(e) { console.error('[SupaDB] getGrowthTrackRegistrationsForUser:', e.message); return []; }
  },
```

- [ ] **Step 6: Add group_memberships methods.** Add right after `getGrowthTrackRegistrationsForUser`'s closing `},`:

```js
  async adminGetGroupMembers(groupId) {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('group_memberships')
        .select('*').eq('group_id', groupId).is('left_at', null).order('joined_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(groupMembershipFromDb);
    } catch(e) { console.error('[SupaDB] adminGetGroupMembers:', e.message); return []; }
  },
  async adminAddGroupMember(m) {
    if (!db()) return { error: 'Not configured' };
    try {
      const match = await this.adminFindMemberByEmail(m.email);
      const { error } = await db().from('group_memberships').insert({
        group_id: m.groupId, name: m.name, email: m.email, phone: m.phone || '',
        notes: m.notes || '', user_id: match ? match.userId : null,
      });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminAddGroupMember:', e.message); return { error: e.message }; }
  },
  async adminRemoveGroupMember(id) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('group_memberships')
        .update({ left_at: new Date().toISOString().slice(0, 10) }).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminRemoveGroupMember:', e.message); return { error: e.message }; }
  },
  async getGroupMembershipsForUser(userId) {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('group_memberships')
        .select('*').eq('user_id', userId).order('joined_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(groupMembershipFromDb);
    } catch(e) { console.error('[SupaDB] getGroupMembershipsForUser:', e.message); return []; }
  },
```

Note: `this.adminFindMemberByEmail(...)` relies on these being called as `SupaDB.adminAddGroupMember(...)` (method call on the object, so `this` is `SupaDB`) — confirm that's how every existing method in this file is invoked (it is; `window.SupaDB = { ... }` and all call sites use `SupaDB.methodName(...)`).

- [ ] **Step 7: Verify**

```bash
node -e "new Function(require('fs').readFileSync('js/db.js','utf8'))" && echo SYNTAX_OK
grep -c "groupMembershipFromDb\|adminFindMemberByEmail\|adminSetGtAttended\|getGrowthTrackRegistrationsForUser\|adminGetGroupMembers\|adminAddGroupMember\|adminRemoveGroupMember\|getGroupMembershipsForUser" js/db.js
```
Expected: `SYNTAX_OK`; each name found (definition + any internal `this.` call sites, so counts ≥1 each — read the file to confirm no duplicate definitions).

- [ ] **Step 8: Commit**

```bash
git add js/db.js
git commit -m "Add group membership and Growth Track attendance/linking methods to SupaDB"
```

---

### Task 3: Migrate the Groups tab roster to `group_memberships`

**Files:**
- Modify: `admin/dashboard.html`

## Context
Find `async function openGroupRoster`, `async function renderGroupRoster`, `async function saveGroupMember`, `async function removeGroupMember` in `admin/dashboard.html` (all currently call `SupaDB.adminGetSignupsByGroup`/`SupaDB.submitSignup`/`SupaDB.deleteSignup`). Read them first — they're the exact functions shown in this plan's context notes above.

- [ ] **Step 1: Replace `renderGroupRoster`'s data source and remove-button semantics.** Find:

```js
async function renderGroupRoster() {
  const container = document.getElementById('rosterList');
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.9rem;">Loading…</div>';
  const members = await SupaDB.adminGetSignupsByGroup(_rosterGroupId);
  if (!members.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:.9rem;">No members yet — add the first one above.</div>';
    return;
  }
  container.innerHTML = `
    <h4 style="font-size:.95rem;font-weight:700;margin-bottom:12px;">Current Members (${members.length})</h4>
    <div class="table-wrap" style="margin:0;">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Note</th><th>Added</th><th></th></tr></thead>
        <tbody>
          ${members.map(m => `
            <tr>
              <td><strong>${m.name}</strong></td>
              <td><a href="mailto:${m.email}" style="color:var(--primary);">${m.email}</a></td>
              <td>${m.phone || '—'}</td>
              <td style="font-size:.82rem;color:var(--text-muted);">${m.message || '—'}</td>
              <td style="font-size:.82rem;color:var(--text-muted);">${new Date(m.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
              <td><button class="btn btn-danger btn-sm" onclick="removeGroupMember(${m.id})">Remove</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}
```

Replace with (source table changed to `group_memberships`, fields renamed to match, all name/email/phone/notes escaped since these came from the same public/admin-writable path as before — `escapeHtml` already exists in this file):

```js
async function renderGroupRoster() {
  const container = document.getElementById('rosterList');
  container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.9rem;">Loading…</div>';
  const members = await SupaDB.adminGetGroupMembers(_rosterGroupId);
  if (!members.length) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);font-size:.9rem;">No members yet — add the first one above.</div>';
    return;
  }
  container.innerHTML = `
    <h4 style="font-size:.95rem;font-weight:700;margin-bottom:12px;">Current Members (${members.length})</h4>
    <div class="table-wrap" style="margin:0;">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Note</th><th>Joined</th><th></th></tr></thead>
        <tbody>
          ${members.map(m => `
            <tr>
              <td><strong>${escapeHtml(m.name)}</strong></td>
              <td><a href="mailto:${escapeHtml(m.email)}" style="color:var(--primary);">${escapeHtml(m.email)}</a></td>
              <td>${escapeHtml(m.phone || '—')}</td>
              <td style="font-size:.82rem;color:var(--text-muted);">${escapeHtml(m.notes || '—')}</td>
              <td style="font-size:.82rem;color:var(--text-muted);">${new Date(m.joinedAt+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
              <td><button class="btn btn-danger btn-sm" onclick="removeGroupMember(${m.id})">Remove</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}
```

- [ ] **Step 2: Update `saveGroupMember`.** Find the `SupaDB.submitSignup({...})` call inside it:

```js
  const result = await SupaDB.submitSignup({
    groupId:     group.id,
    groupName:   group.name,
    leaderName:  group.leader,
    leaderEmail: group.leaderEmail || '',
    name, email, phone, message: note,
  });
```
Replace with:
```js
  const result = await SupaDB.adminAddGroupMember({
    groupId: group.id, name, email, phone, notes: note,
  });
```
(The rest of `saveGroupMember` — validation, error display, form-clearing, `showToast`, `renderGroupRoster()` refresh — is unchanged; only this one call and its argument shape change.)

- [ ] **Step 3: Update `removeGroupMember`.** Find:

```js
async function removeGroupMember(signupId) {
  if (!confirm('Remove this member from the group?')) return;
  await SupaDB.deleteSignup(signupId);
  showToast('Member removed.');
```
Replace with:
```js
async function removeGroupMember(membershipId) {
  if (!confirm('Remove this member from the group?')) return;
  await SupaDB.adminRemoveGroupMember(membershipId);
  showToast('Member removed.');
```
(rename the parameter for clarity; the rest of the function — likely a call to `renderGroupRoster()` after — is unchanged; read the full function to confirm nothing else references `signupId` by name.)

- [ ] **Step 4: Verify** — extract the script and run `node --check`-equivalent (`new Function(...)`), confirm no syntax errors. As admin: open a group's Members roster, add a member — appears in the "Current Members" list with today's date under "Joined". `select * from group_memberships;` in the SQL editor confirms the row (with `user_id` set if the email matches an approved member, null otherwise). Click Remove — the row disappears from the roster view; `select left_at from group_memberships where id = <that id>;` shows today's date, not deleted.

- [ ] **Step 5: Commit**

```bash
git add admin/dashboard.html
git commit -m "Migrate Groups tab roster from signups to group_memberships"
```

---

### Task 4: Growth Track "Attended" toggle + registration linking

**Files:**
- Modify: `admin/dashboard.html` (roster table gains an Attended column)
- Modify: `growth-track.html` (public registration stamps `user_id` when logged in)

- [ ] **Step 1: Admin roster — add the Attended column.** In `admin/dashboard.html`, find `loadGtRoster` (added in the Growth Track module). Find the table header and row-rendering:

```js
  tbody.innerHTML = _gtRosterRows.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.name)}</strong>${r.addedByAdmin ? ' <span class="badge badge-gray">manual</span>' : ''}</td>
      <td>${escapeHtml(r.email)}${r.phone ? '<br><span style="font-size:.8rem;color:var(--text-muted);">' + escapeHtml(r.phone) + '</span>' : ''}</td>
      <td>${escapeHtml(r.notes)}</td>
      <td>${new Date(r.createdAt).toLocaleDateString()}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteGtRegistrant(${r.id})">Remove</button></td>
    </tr>`).join('');
```
Replace with (adds an Attended checkbox cell):
```js
  tbody.innerHTML = _gtRosterRows.map(r => `
    <tr>
      <td><strong>${escapeHtml(r.name)}</strong>${r.addedByAdmin ? ' <span class="badge badge-gray">manual</span>' : ''}</td>
      <td>${escapeHtml(r.email)}${r.phone ? '<br><span style="font-size:.8rem;color:var(--text-muted);">' + escapeHtml(r.phone) + '</span>' : ''}</td>
      <td>${escapeHtml(r.notes)}</td>
      <td>${new Date(r.createdAt).toLocaleDateString()}</td>
      <td style="text-align:center;"><input type="checkbox" ${r.attended?'checked':''} onchange="toggleGtAttended(${r.id}, this.checked)" /></td>
      <td><button class="btn btn-danger btn-sm" onclick="deleteGtRegistrant(${r.id})">Remove</button></td>
    </tr>`).join('');
```

Find the table's `<thead>` (in the `gtRosterModal` HTML, `<thead><tr><th>Name</th><th>Contact</th><th>Notes</th><th>Registered</th><th>Actions</th></tr></thead>`) and add an "Attended" column before "Actions":

```html
<thead><tr><th>Name</th><th>Contact</th><th>Notes</th><th>Registered</th><th>Attended</th><th>Actions</th></tr></thead>
```

Add the toggle handler right after `loadGtRoster`'s closing `}`:

```js
async function toggleGtAttended(id, attended) {
  const result = await SupaDB.adminSetGtAttended(id, attended);
  if (result.error) { showToast(result.error, true); await loadGtRoster(); }
}
```
(On error, reload the roster to revert the checkbox visually rather than leaving it in a state that doesn't match the DB.)

Note `growthTrackRegistrationFromDb` (added in Task 2) already maps `attended` — check `js/db.js` to confirm the field name is `attended` (not `isAttended` or similar) before writing this; adjust `r.attended` above if it differs.

- [ ] **Step 2: Public registration — stamp `user_id`.** In `growth-track.html`, find `handleGtSubmit`:

```js
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
```
Change to add a `userId` field, sourced from the session (best-effort, same pattern as the existing pre-fill try/catch in `openGtModal`):
```js
async function handleGtSubmit(e) {
  e.preventDefault();
  const part = document.getElementById('gtPart').value;
  const p = _gtParts.find(x => x.part === part);
  let userId = null;
  try { const user = await SupaDB.getUser(); if (user) userId = user.id; } catch (e) { /* not logged in */ }
  const reg = {
    part, sessionDate: p ? p.sessionDate : null, sessionTime: p ? p.sessionTime : '',
    name: document.getElementById('gtName').value.trim(),
    email: document.getElementById('gtEmail').value.trim(),
    phone: document.getElementById('gtPhone').value.trim(),
    notes: document.getElementById('gtNotes').value.trim(),
    userId,
  };
```

- [ ] **Step 3: Verify** — extract and syntax-check both files' scripts. As admin, open a Growth Track part's Registrants roster: Attended column with checkboxes present; toggling one persists (`select attended from growth_track_registrations where id = <id>;` reflects the change, and reloading the modal keeps the checked state). As a logged-in member, register for a published part on the public page: `select user_id from growth_track_registrations order by created_at desc limit 1;` shows your user id, not null.

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html growth-track.html
git commit -m "Add Growth Track attendance tracking and registration-to-account linking"
```

---

### Task 5: Shared dashboard renderer (`js/member-dashboard.js`)

**Files:**
- Create: `js/member-dashboard.js`

- [ ] **Step 1: Write the module.** This renders ONLY the two new, genuinely-shared sections — Growth Track Progress and Small Group History — into container elements the host page provides. It does not touch profile-header or DISC/gifts rendering (those stay in each host page, per this plan's architecture note).

```js
/* ================================================================
   Heritage Hill — shared Growth Track progress + group history
   rendering, used by admin/member-dashboard.html and my-profile.html
   ================================================================ */
const MemberDashboard = {
  escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  },

  GT_LABELS: { about_us: 'About Us', about_you: 'About You', get_involved: 'Get Involved' },
  GT_ORDER: ['about_us', 'about_you', 'get_involved'],

  // Renders a 3-row Growth Track checklist into containerEl.
  // registrations: result of SupaDB.getGrowthTrackRegistrationsForUser(userId)
  renderGrowthTrackProgress(containerEl, registrations) {
    const byPart = {};
    registrations.forEach(r => {
      const existing = byPart[r.part];
      if (!existing || (r.attended && !existing.attended)) byPart[r.part] = r;
    });
    containerEl.innerHTML = this.GT_ORDER.map(part => {
      const r = byPart[part];
      const label = this.GT_LABELS[part];
      if (!r) {
        return `<div class="gt-progress-row"><span>${label}</span><span style="color:var(--text-muted);">Not Registered</span></div>`;
      }
      const dateStr = r.sessionDate ? new Date(r.sessionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      if (r.attended) {
        return `<div class="gt-progress-row"><span>${label}</span><span style="color:var(--success,#16a34a);font-weight:600;">✓ Attended${dateStr ? ' · ' + dateStr : ''}</span></div>`;
      }
      return `<div class="gt-progress-row"><span>${label}</span><span>Registered${dateStr ? ' · ' + dateStr : ''}</span></div>`;
    }).join('');
  },

  // Renders a small group history table into containerEl.
  // memberships: result of SupaDB.getGroupMembershipsForUser(userId)
  // groups: result of SupaDB.adminGetAllGroups() (for name lookup)
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
};
```

- [ ] **Step 2: Verify** — run:

```bash
node -e "
$(cat js/member-dashboard.js)
const doc = { innerHTML: '' };
MemberDashboard.renderGrowthTrackProgress(doc, [
  { part: 'about_us', attended: true, sessionDate: '2026-08-02' },
  { part: 'about_you', attended: false, sessionDate: '2026-08-09' },
]);
console.assert(doc.innerHTML.includes('✓ Attended'), 'attended row missing');
console.assert(doc.innerHTML.includes('Not Registered'), 'not-registered row missing for get_involved');
console.log('member-dashboard.js self-check OK');
"
```
Expected: `member-dashboard.js self-check OK` with no assertion failures printed above it.

- [ ] **Step 3: Commit**

```bash
git add js/member-dashboard.js
git commit -m "Add shared Growth Track progress and group history renderer"
```

---

### Task 6: New admin page `admin/member-dashboard.html`

**Files:**
- Create: `admin/member-dashboard.html`

## Context
This replaces the old `memberModal` (the modal that used to open from the People tab's "View" button — you'll remove that modal in Task 7, this task only builds its replacement). Base the page's visual chrome on `admin/gifts-dashboard.html` (same `<style>` block copied verbatim — CSS variables, `.topbar`, `.page`, `.stat-card` etc. — read that file first) since it's the closest existing admin sub-page pattern (topbar with back-link, full-width content page, admin-role auth guard). This page needs its own auth guard requiring admin role (copy the exact guard pattern from `admin/gifts-dashboard.html`).

- [ ] **Step 1: Write the page.** Head: same boilerplate as `admin/gifts-dashboard.html` (title "Member Dashboard | Heritage Hill Church Admin", same font/icon links, same `<style>` block copied verbatim). Topbar: back-link to `dashboard.html?tab=people`, title "Member Dashboard".

Body:

```html
<div class="page" id="pageContent" style="display:none;">
  <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px; flex-wrap:wrap;">
    <button class="range-btn" onclick="cycleMember(-1)" id="prevBtn">← Previous</button>
    <button class="range-btn" onclick="cycleMember(1)" id="nextBtn">Next →</button>
    <input id="mdSearch" placeholder="Jump to a member…" oninput="filterMdSearch()"
      style="flex:1; min-width:200px; padding:8px 12px; border:1.5px solid var(--border); border-radius:8px;" />
    <div id="mdSearchResults" style="position:relative;"></div>
  </div>

  <div class="stat-card" style="margin-bottom:20px;">
    <h2 id="mdName" style="font-size:1.3rem;"></h2>
    <p id="mdContact" style="font-size:.9rem; color:var(--text-muted); margin-top:4px;"></p>
  </div>

  <div class="charts-grid">
    <div class="chart-card">
      <div class="chart-title">Growth Track Progress</div>
      <div id="mdGtProgress"></div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Small Group History</div>
      <div id="mdGroupHistory"></div>
    </div>
  </div>

  <div class="chart-card" style="margin-bottom:24px;">
    <div class="chart-title">Personality</div>
    <div id="mdDisc"></div>
  </div>
  <div class="chart-card" style="margin-bottom:24px;">
    <div class="chart-title">Spiritual Gifts</div>
    <div id="mdGifts"></div>
  </div>
  <div class="chart-card">
    <div class="chart-title">Recommended Ministries</div>
    <div id="mdMinistries"></div>
  </div>
</div>

<div class="loading" id="loadingMsg">Loading…</div>
```

Add this CSS to the `<style>` block (near `.chart-title`):
```css
.gt-progress-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:.9rem; }
.gt-progress-row:last-child { border-bottom:none; }
```

- [ ] **Step 2: Script.** Load order: supabase CDN, `../js/supabase-client.js`, `../js/db.js`, `../js/assessments.js`, `../js/member-dashboard.js`, then inline script:

```js
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

let _allMembers = [], _currentIndex = -1, _content = null, _groups = [];

(async () => {
  try {
    const user = await SupaDB.getUser();
    if (!user) { window.location.href = 'login.html'; return; }
    const roleData = await SupaDB.getUserRoleByEmail(user.email);
    if (!roleData || roleData.role !== 'admin') { window.location.href = 'dashboard.html'; return; }

    const [profiles, contentRows, groups] = await Promise.all([
      SupaDB.adminGetAllMemberProfiles(), SupaDB.getAssessmentContent(), SupaDB.adminGetAllGroups(),
    ]);
    _allMembers = profiles.filter(p => p.status === 'approved').sort((a, b) => a.name.localeCompare(b.name));
    _content = Assessments.splitContent(contentRows);
    _groups = groups;

    const startId = new URLSearchParams(window.location.search).get('id');
    _currentIndex = Math.max(0, _allMembers.findIndex(p => p.userId === startId));
    if (!_allMembers.length) { document.getElementById('mdName').textContent = 'No approved members yet.'; }

    document.getElementById('loadingMsg').style.display = 'none';
    document.getElementById('pageContent').style.display = '';
    await loadCurrentMember();
  } catch(err) {
    document.getElementById('loadingMsg').textContent = 'Error loading page: ' + err.message;
  }
})();

function cycleMember(delta) {
  if (!_allMembers.length) return;
  _currentIndex = (_currentIndex + delta + _allMembers.length) % _allMembers.length;
  loadCurrentMember();
}

function filterMdSearch() {
  const q = document.getElementById('mdSearch').value.toLowerCase();
  const box = document.getElementById('mdSearchResults');
  if (!q) { box.innerHTML = ''; return; }
  const matches = _allMembers.filter(p => p.name.toLowerCase().includes(q)).slice(0, 6);
  box.innerHTML = matches.length ? `<div style="position:absolute; top:4px; left:0; right:0; background:#fff; border:1px solid var(--border); border-radius:8px; box-shadow:var(--shadow); z-index:10;">
    ${matches.map(p => `<div style="padding:8px 12px; cursor:pointer;" onclick="jumpToMember('${p.userId}')">${escapeHtml(p.name)}</div>`).join('')}
  </div>` : '';
}

function jumpToMember(userId) {
  const idx = _allMembers.findIndex(p => p.userId === userId);
  if (idx === -1) return;
  _currentIndex = idx;
  document.getElementById('mdSearch').value = '';
  document.getElementById('mdSearchResults').innerHTML = '';
  loadCurrentMember();
}

function giftNames(a) { try { const n = JSON.parse(a.result); return Array.isArray(n) ? n : []; } catch(e) { return []; } }
function recommendedMinistries(names) {
  const set = new Set();
  (names || []).forEach(n => {
    const g = _content.gifts.find(x => x.extra.name === n);
    (g && g.extra.ministries || []).forEach(m => set.add(m));
  });
  return [...set];
}
function groupName(id) {
  const g = _groups.find(x => String(x.id) === String(id));
  return g ? g.name : '—';
}

async function loadCurrentMember() {
  const p = _allMembers[_currentIndex];
  if (!p) return;
  history.replaceState(null, '', '?id=' + encodeURIComponent(p.userId));

  document.getElementById('mdName').textContent = p.name;
  document.getElementById('mdContact').textContent =
    `${p.email}${p.phone ? ' · ' + p.phone : ''} · ${groupName(p.groupId)} · ${p.yearsAttending || 'tenure not set'}`;

  const [attempts, gtRegs, memberships] = await Promise.all([
    SupaDB.getVisibleAttempts(), SupaDB.getGrowthTrackRegistrationsForUser(p.userId),
    SupaDB.getGroupMembershipsForUser(p.userId),
  ]);
  const d = attempts.find(a => a.userId === p.userId && a.assessmentType === 'disc');
  const g = attempts.find(a => a.userId === p.userId && a.assessmentType === 'gifts');

  MemberDashboard.renderGrowthTrackProgress(document.getElementById('mdGtProgress'), gtRegs);
  MemberDashboard.renderGroupHistory(document.getElementById('mdGroupHistory'), memberships, _groups);

  document.getElementById('mdDisc').innerHTML = d
    ? `<strong style="font-size:1.2rem;">${escapeHtml(d.result)}</strong>
       ${['D','I','S','C'].map(k => `<div style="font-size:.85rem;">${k}: ${escapeHtml(d.scores[k])}</div>`).join('')}
       <p style="font-size:.8rem; color:var(--text-muted);">Taken ${new Date(d.completedAt).toLocaleDateString()}</p>`
    : '<p style="color:var(--text-muted);">Not taken yet.</p>';

  const rec = g ? recommendedMinistries(giftNames(g)) : [];
  document.getElementById('mdGifts').innerHTML = g
    ? `<p><strong>${giftNames(g).map(escapeHtml).join(', ')}</strong></p>
       <div style="columns:2; font-size:.82rem;">${Object.entries(g.scores)
         .sort((a,b) => b[1]-a[1]).map(([c,s]) => `<div>${escapeHtml(c)}: ${escapeHtml(s)}</div>`).join('')}</div>
       <p style="font-size:.8rem; color:var(--text-muted);">Taken ${new Date(g.completedAt).toLocaleDateString()}</p>`
    : '<p style="color:var(--text-muted);">Not taken yet.</p>';
  document.getElementById('mdMinistries').innerHTML = !g
    ? '<p style="color:var(--text-muted); font-size:.85rem;">Take the gifts assessment to see recommendations.</p>'
    : rec.length ? rec.map(m => `<span class="badge badge-amber" style="margin:0 6px 6px 0;">${escapeHtml(m)}</span>`).join('')
    : '<p style="color:var(--text-muted); font-size:.85rem;">No ministry matches yet.</p>';
}
```

`SupaDB.getVisibleAttempts()` already returns all attempts visible to an admin (existing method from the assessments module) — filtering client-side by `userId` here avoids needing a new per-user attempts method.

- [ ] **Step 3: Verify** — as admin, navigate to `admin/member-dashboard.html` with no `?id=` — loads the first member alphabetically. Click Next/Previous — cycles through approved members, URL's `?id=` updates. Type a name in the search box — matching results appear, clicking one jumps directly. Growth Track Progress and Small Group History sections render (using data from Tasks 3/4). DISC/Gifts/Ministries sections match what the old modal used to show.

- [ ] **Step 4: Commit**

```bash
git add admin/member-dashboard.html
git commit -m "Add admin member dashboard page with cycling and search"
```

---

### Task 7: Remove the old member modal; point "View" at the new page

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Change the View button.** Find (in `memberTable`, from the People tab):

```js
      <td><button class="btn btn-secondary btn-sm" onclick="openMemberModal('${p.userId}')">View</button></td>
```
Replace with:
```js
      <td><a class="btn btn-secondary btn-sm" href="member-dashboard.html?id=${encodeURIComponent(p.userId)}">View</a></td>
```

- [ ] **Step 2: Remove the old modal HTML.** Delete the entire `<div class="modal-overlay" id="memberModal" onclick="if(event.target===this)closeMemberModal()">...</div>` block (found earlier at the `<!-- USER MODAL -->`-adjacent area — search for `id="memberModal"` to locate it precisely).

- [ ] **Step 3: Remove the now-unused JS.** Delete `function openMemberModal(userId) { ... }` and `function closeMemberModal() { ... }` in full (search for `function openMemberModal`).

- [ ] **Step 4: Verify** — grep to confirm zero remaining references:

```bash
grep -c "openMemberModal\|closeMemberModal\|memberModal" admin/dashboard.html
```
Expected: `0`. Extract and syntax-check the script. As admin, click "View" on any member in the People tab — navigates to `member-dashboard.html?id=<their id>` and shows their data (not a modal).

- [ ] **Step 5: Commit**

```bash
git add admin/dashboard.html
git commit -m "Remove old member modal; People tab View now opens the member dashboard page"
```

---

### Task 8: Revamp `my-profile.html` with the shared sections

**Files:**
- Modify: `admin/my-profile.html`

- [ ] **Step 1: Add two new cards** to the body, after the `giftsCard` and before the "Change Password" card:

```html
  <div class="portal-card">
    <h2>Growth Track</h2>
    <p class="sub">Your progress through About Us, About You, and Get Involved.</p>
    <div id="gtProgressBox"></div>
  </div>

  <div class="portal-card">
    <h2>Small Group History</h2>
    <p class="sub">Groups you've been part of at Heritage Hill.</p>
    <div id="groupHistoryBox"></div>
  </div>
```

Add this CSS to `css/portal.css` (append at the end of the file):
```css
.gt-progress-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--border); font-size:.9rem; }
.gt-progress-row:last-child { border-bottom:none; }
```

- [ ] **Step 2: Load the shared module.** Add `<script src="../js/member-dashboard.js"></script>` to the script-tag list, after `../js/assessments.js` and before the inline `<script>`.

- [ ] **Step 3: Fetch and render the new sections.** Find the existing boot IIFE's results block:

```js
  // Results
  const [attempts, content] = await Promise.all([
    SupaDB.getMyAttempts(), SupaDB.getAssessmentContent(),
  ]);
  _content = Assessments.splitContent(content);
  renderResult('disc',  attempts.filter(a => a.assessmentType === 'disc'));
  renderResult('gifts', attempts.filter(a => a.assessmentType === 'gifts'));
})();
```
Replace with:
```js
  // Results
  const [attempts, content, gtRegs, memberships, allGroups] = await Promise.all([
    SupaDB.getMyAttempts(), SupaDB.getAssessmentContent(),
    SupaDB.getGrowthTrackRegistrationsForUser(user.id), SupaDB.getGroupMembershipsForUser(user.id),
    SupaDB.getPublishedGroups(),
  ]);
  _content = Assessments.splitContent(content);
  renderResult('disc',  attempts.filter(a => a.assessmentType === 'disc'));
  renderResult('gifts', attempts.filter(a => a.assessmentType === 'gifts'));
  MemberDashboard.renderGrowthTrackProgress(document.getElementById('gtProgressBox'), gtRegs);
  MemberDashboard.renderGroupHistory(document.getElementById('groupHistoryBox'), memberships, allGroups);
})();
```

Note: `SupaDB.getPublishedGroups()` only returns published groups — if a member's group history includes a group that's since been unpublished, its name would fail to resolve via this list. This is an acceptable minor gap (matches how `pfGroup`'s dropdown already only offers published groups elsewhere on this same page) — not worth a separate admin-groups fetch just for name lookup on a member-facing page.

- [ ] **Step 4: Verify** — extract and syntax-check the script. As a member with at least one Growth Track registration and one group membership (created via Tasks 3/4's manual admin adds during their verification), log in and view `my-profile.html` — both new cards render with the same content shown on the admin dashboard for that same person.

- [ ] **Step 5: Commit**

```bash
git add admin/my-profile.html css/portal.css
git commit -m "Add Growth Track progress and group history to member profile page"
```

---

### Task 9: End-to-end verification + staging deploy

- [ ] **Step 1: Full admin flow** — from the People tab, click View on a member with no Growth Track/group activity yet — dashboard shows "Not Registered" for all three parts and "No group history yet." Add them to a group via the Groups tab roster, register them for a Growth Track part via the GT roster, mark them Attended — return to their member dashboard page and confirm both sections now reflect this.
- [ ] **Step 2: Cycling** — Prev/Next moves through the member list in alphabetical order without errors at the list boundaries (wraps around). Search jumps directly to a typed name.
- [ ] **Step 3: Member's own view** — log in as that same member, confirm `my-profile.html` shows the identical Growth Track and group history content, read-only, no cycle controls.
- [ ] **Step 4: Regression check** — confirm the Groups tab's existing "Sign-Up Requests" tab and public "Join a Group" flow on `small-groups.html` still work unchanged (they still use `signups`, untouched by this plan).
- [ ] **Step 5: RLS spot-check** — as an unauthenticated session, confirm `group_memberships` and the new `growth_track_registrations` columns aren't reachable for write (existing admin-all policy already covers this the same way as every other table using this pattern — no new gap introduced, though note the pre-existing broader-than-ideal "any authenticated user" access called out in this plan's header).
- [ ] **Step 6: Deploy to staging**

```bash
git push staging HEAD:main
```
Verify on staging, then wait for Scott's explicit go-ahead before:

```bash
git push origin HEAD:main
```

---

## Post-plan self-review (done at write time)

- **Spec coverage:** `group_memberships` table + roster migration (T1, T3), Growth Track `user_id`/`attended` + admin toggle + registration linking (T1, T2, T4), shared renderer for GT progress + group history (T5), admin dashboard page with cycling/search (T6), old modal removal (T7), member's own revamped view (T8), rollout (T9). All spec sections covered.
- **Scope refinement flagged explicitly:** the spec's "one shared renderer for everything" is narrowed to "shared renderer for the two genuinely new sections; existing DISC/gifts/profile-header code stays where it already works" — called out in the plan header, not silently done.
- **Pre-existing security note flagged, not silently fixed:** the `auth.role() = 'authenticated'` RLS pattern (used by `group_memberships` per the approved spec, matching existing `groups`/`signups`) grants any logged-in member broader read access than ideal — called out for Scott's attention after this ships, correctly scoped out of this plan.
- **Type consistency:** `groupMembershipFromDb` fields (`groupId`, `userId`, `joinedAt`, `leftAt`, `notes`) used identically across Tasks 2, 5, 6, 8. `growthTrackRegistrationFromDb` explicitly updated in Task 2 Step 1 to map the new `userId`/`attended` columns before any later task relies on them.
