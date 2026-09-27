# Permissions Require Membership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real foreign key so `user_roles` can only reference an existing member, reorganize the two related admin-dashboard flows around that rule (Create User moves to the Members tab; Add User becomes an existing-member-only "Add Permissions"), and add the promised Delete button on the approved-members table — completed by this FK, since deleting a member now cascades away their permissions too.

**Architecture:** A phased schema migration (nullable column → backfill → human-verified safety check → deferred `NOT NULL` tightening), a small backend signature change (`adminUpsertUserRole` takes `userId` now, not just `email`), a new reusable "search and select an existing member" picker modeled directly on the already-shipped Record Assessment picker (same CSS classes, same interaction pattern, new `aup`-prefixed JS), and one small standalone UI addition (a Delete button on the approved-members table, reusing the already-shipped `deleteMember` function).

**Tech Stack:** Static HTML/JS (no build step), Supabase Postgres + Auth + Edge Functions, inline `<script>` blocks.

**Full design context:**
- `docs/superpowers/specs/2026-09-27-permissions-require-membership-design.md`
- `docs/superpowers/specs/2026-09-27-members-table-delete-design.md`

**Testing note:** No automated test suite in this repo. Verification uses this repo's established pattern: reading deployed source via `curl`, direct SQL checks, and asking Scott to click through (no admin credentials available to Claude), per `CLAUDE.md`'s "Admin login / testing limitation."

**Critical sequencing note:** This plan's schema task only goes as far as the nullable column + backfill + a verification query. It deliberately does **not** include making the column `NOT NULL` — that step depends on confirming zero orphaned rows in each specific environment (staging and production are separate checks), which is a human judgment call, not something to automate blindly. Task 6 spells out exactly what to check and what to do if the check isn't clean.

---

### Task 1: Delete button on the approved members table

**Files:**
- Modify: `admin/dashboard.html:6631-6646` (`membershipTable`)

- [ ] **Step 1: Add the Delete button**

Find:

```js
function membershipTable(rows) {
  if (!rows.length) return '<p style="color:var(--text-muted); padding:20px;">No members match.</p>';
  const isAdmin = window._userRole === 'admin';
  const fmt = d => d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const sortArrow = _pplSortDir === 'desc' ? ' ▾' : ' ▴';
  return `<table><thead><tr>
    <th onclick="togglePeopleSort()" style="cursor:pointer;user-select:none;">Name${sortArrow}</th><th>Email</th><th>Member Since</th><th></th>
  </tr></thead><tbody>${rows.map(p => `
    <tr>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td><a href="mailto:${escapeHtml(p.email)}" style="color:var(--primary);">${escapeHtml(p.email)}</a></td>
      <td>${fmt(p.memberSince)}</td>
      <td>${isAdmin ? `<a class="btn btn-secondary btn-sm" href="member-dashboard.html?id=${encodeURIComponent(p.userId)}">View</a>` : ''}</td>
    </tr>`).join('')}</tbody></table>`;
}
```

Replace with:

```js
function membershipTable(rows) {
  if (!rows.length) return '<p style="color:var(--text-muted); padding:20px;">No members match.</p>';
  const isAdmin = window._userRole === 'admin';
  const fmt = d => d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const sortArrow = _pplSortDir === 'desc' ? ' ▾' : ' ▴';
  return `<table><thead><tr>
    <th onclick="togglePeopleSort()" style="cursor:pointer;user-select:none;">Name${sortArrow}</th><th>Email</th><th>Member Since</th><th></th>
  </tr></thead><tbody>${rows.map(p => `
    <tr>
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td><a href="mailto:${escapeHtml(p.email)}" style="color:var(--primary);">${escapeHtml(p.email)}</a></td>
      <td>${fmt(p.memberSince)}</td>
      <td>${isAdmin ? `<a class="btn btn-secondary btn-sm" href="member-dashboard.html?id=${encodeURIComponent(p.userId)}">View</a> <button class="btn btn-danger btn-sm" onclick="deleteMember('${p.userId}')">Delete</button>` : ''}</td>
    </tr>`).join('')}</tbody></table>`;
}
```

- [ ] **Step 2: Verify**

```bash
grep -n "deleteMember('\${p.userId}')" admin/dashboard.html
```

Expected: two matches now (the pre-existing one in the pending-members box, plus this new one in `membershipTable`).

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Delete button to the approved members table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Schema — nullable `user_id` column, FK, and backfill

**Files:**
- Create: `supabase/user-roles-require-member-schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Require user_roles to reference an existing member.
-- See docs/superpowers/specs/2026-09-27-permissions-require-membership-design.md
--
-- This file is intentionally staged in two parts:
--
-- PART 1 (safe to run anytime, idempotent): adds a nullable user_id
-- column with a real FK to member_profiles, and backfills it for
-- existing rows by matching email. Run this on staging first, then
-- production, same as any other migration in this repo.
--
-- PART 2 (DO NOT RUN YET): tightening user_id to NOT NULL. This must
-- only be run after confirming, in that specific environment, that
-- the verification query below returns zero rows. Staging and
-- production are separate checks — a clean staging result does not
-- imply production is clean. See the design doc's "Schema design"
-- section for the full phased rationale.
-- ============================================================

-- PART 1 --------------------------------------------------------

alter table public.user_roles
  add column if not exists user_id uuid references public.member_profiles(user_id) on delete cascade;

update public.user_roles ur
set user_id = mp.user_id
from public.member_profiles mp
where lower(mp.email) = lower(ur.email)
  and ur.user_id is null;

-- Run this after PART 1 to check for orphans (staff with a role but
-- no resolvable member profile). If this returns any rows, resolve
-- them manually before ever considering PART 2 in this environment.
--
-- select email, display_name, role, created_at
-- from public.user_roles
-- where user_id is null;

-- PART 2 (DO NOT RUN until the query above returns zero rows in
-- THIS environment) ---------------------------------------------
--
-- alter table public.user_roles alter column user_id set not null;
```

- [ ] **Step 2: Apply Part 1 to staging**

If Supabase MCP is connected and scoped to staging, run Part 1's two statements (the `alter table ... add column` and the `update ... set user_id`) via `execute_sql`. If MCP is not connected, give Scott the exact SQL to paste into the staging project's SQL Editor (`https://supabase.com/dashboard/project/govvofbrhhpowtdnuzcw/sql/new`).

- [ ] **Step 3: Run the verification query on staging and report the result**

```sql
select email, display_name, role, created_at
from public.user_roles
where user_id is null;
```

If this returns any rows: stop and flag them to Scott by name/email — each one needs to either get a member profile first (re-run the earlier global-provisioning backfill for them specifically) or have a deliberate decision made about their role. Do not proceed with the rest of this plan's staging rollout until this is empty, since Task 4's code changes assume every future `user_roles` row is written with a valid `user_id`.

- [ ] **Step 4: Commit**

```bash
git add supabase/user-roles-require-member-schema.sql
git commit -m "Add user_id FK to user_roles (nullable, backfilled)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Backend — `adminUpsertUserRole` requires `userId`

**Files:**
- Modify: `js/db.js` (`adminGetAllUserRoles`, `getUserRoleByEmail`, `adminUpsertUserRole`)

- [ ] **Step 1: Add `userId` to the two read mappers**

Find:

```js
  async getUserRoleByEmail(email) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().from('user_roles').select('*').eq('email', email.toLowerCase()).single();
      if (error) return null;
      return data ? {
        email: data.email, displayName: data.display_name || '', role: data.role,
        createdAt: data.created_at, forcePasswordChange: !!data.force_password_change,
      } : null;
    } catch(e) { return null; }
  },
```

Replace with:

```js
  async getUserRoleByEmail(email) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().from('user_roles').select('*').eq('email', email.toLowerCase()).single();
      if (error) return null;
      return data ? {
        email: data.email, displayName: data.display_name || '', role: data.role,
        createdAt: data.created_at, forcePasswordChange: !!data.force_password_change,
        userId: data.user_id || null,
      } : null;
    } catch(e) { return null; }
  },
```

Find:

```js
  async adminGetAllUserRoles() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('user_roles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => ({ email: r.email, displayName: r.display_name || '', role: r.role, createdAt: r.created_at, forcePasswordChange: !!r.force_password_change }));
    } catch(e) { console.error('[SupaDB] adminGetAllUserRoles:', e.message); return []; }
  },
```

Replace with:

```js
  async adminGetAllUserRoles() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('user_roles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => ({ email: r.email, displayName: r.display_name || '', role: r.role, createdAt: r.created_at, forcePasswordChange: !!r.force_password_change, userId: r.user_id || null }));
    } catch(e) { console.error('[SupaDB] adminGetAllUserRoles:', e.message); return []; }
  },
```

- [ ] **Step 2: Require `userId` in `adminUpsertUserRole`**

Find:

```js
  async adminUpsertUserRole({ email, displayName, role, forcePasswordChange }) {
    if (!db()) return { error: 'No DB' };
    try {
      const personId = await this.upsertPerson({ name: displayName, email });
      const { error } = await db().from('user_roles')
        .upsert({ email: email.toLowerCase(), display_name: displayName || '', role, force_password_change: !!forcePasswordChange, person_id: personId }, { onConflict: 'email' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminUpsertUserRole:', e.message); return { error: e.message }; }
  },
```

Replace with:

```js
  async adminUpsertUserRole({ userId, email, displayName, role, forcePasswordChange }) {
    if (!db()) return { error: 'No DB' };
    if (!userId) return { error: 'A member must be selected' };
    try {
      const personId = await this.upsertPerson({ name: displayName, email });
      const { error } = await db().from('user_roles')
        .upsert({ user_id: userId, email: email.toLowerCase(), display_name: displayName || '', role, force_password_change: !!forcePasswordChange, person_id: personId }, { onConflict: 'email' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminUpsertUserRole:', e.message); return { error: e.message }; }
  },
```

- [ ] **Step 3: Verify**

```bash
grep -n "userId: r.user_id\|userId: data.user_id\|if (!userId) return" js/db.js
```

Expected: three matches (one per function touched).

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Require an existing member's userId when assigning a dashboard role

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Rebuild the Add User modal into an existing-member picker ("Add Permissions")

**Files:**
- Modify: `admin/dashboard.html:2190-2234` (`userModal` HTML)
- Modify: `admin/dashboard.html:7413-7469` (`renderUsersTable`, `openUserModal`, `closeUserModal`, `editUser`)
- Modify: `admin/dashboard.html:7471-7486` (`saveUser`)

- [ ] **Step 1: Replace the modal HTML**

Find:

```html
  <div class="modal-overlay" id="userModal" onclick="if(event.target===this)closeUserModal()">
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <h3 id="userModalTitle">Add User</h3>
        <button class="modal-close" onclick="closeUserModal()">✕</button>
      </div>
      <div class="modal-body">
        <input type="hidden" id="userEditEmail" />
        <div class="form-row full" style="margin-bottom:16px;">
          <div class="field">
            <label>Email Address <span style="color:var(--danger);">*</span></label>
            <input type="email" id="userEmail" placeholder="jane@example.com" />
            <p style="margin-top:5px;font-size:.78rem;color:var(--text-muted);">Must match the login email in Supabase Authentication.</p>
          </div>
        </div>
        <div class="form-row full" style="margin-bottom:16px;">
          <div class="field">
            <label>Display Name</label>
            <input type="text" id="userDisplayName" placeholder="Jane Smith" />
          </div>
        </div>
        <div class="form-row full" style="margin-bottom:16px;">
          <div class="field">
            <label>Role <span style="color:var(--danger);">*</span></label>
            <select id="userRole">
              <option value="">Select a role…</option>
              <option value="admin">Admin — Full access to all sections</option>
              <option value="event_manager">Event Manager — Events (including sign-ups), Sermons, Email</option>
            </select>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg);border-radius:8px;border:1.5px solid var(--border);">
          <input type="checkbox" id="userForcePasswordChange" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);" />
          <div>
            <label for="userForcePasswordChange" style="font-size:.875rem;font-weight:600;cursor:pointer;margin:0;">Require password change on next login</label>
            <p style="margin:2px 0 0;font-size:.78rem;color:var(--text-muted);">User will be prompted to set a new password before accessing the dashboard.</p>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeUserModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUser()">Save</button>
      </div>
    </div>
  </div>
```

Replace with:

```html
  <div class="modal-overlay" id="userModal" onclick="if(event.target===this)closeUserModal()">
    <div class="modal" style="max-width:520px;">
      <div class="modal-header">
        <h3 id="userModalTitle">Add Permissions</h3>
        <button class="modal-close" onclick="closeUserModal()">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-row full" style="margin-bottom:16px;">
          <div class="field">
            <label>Member <span style="color:var(--danger);">*</span></label>
            <div id="aupPersonPicker">
              <input type="text" id="aupSearchInput" placeholder="Search by name or email…" oninput="aupFilterPeople()"
                style="width:100%;box-sizing:border-box;padding:.65rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;" />
              <div class="raa-search-results" id="aupSearchResults" style="display:none;"></div>
            </div>
            <div id="aupPersonChip" style="display:none;">
              <span class="raa-person-chip">Assigning: <strong id="aupPersonName"></strong> (<span id="aupPersonEmail"></span>) <button type="button" onclick="aupClearPerson()">Change</button></span>
            </div>
          </div>
        </div>
        <div class="form-row full" style="margin-bottom:16px;">
          <div class="field">
            <label>Role <span style="color:var(--danger);">*</span></label>
            <select id="userRole">
              <option value="">Select a role…</option>
              <option value="admin">Admin — Full access to all sections</option>
              <option value="event_manager">Event Manager — Events (including sign-ups), Sermons, Email</option>
            </select>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg);border-radius:8px;border:1.5px solid var(--border);">
          <input type="checkbox" id="userForcePasswordChange" style="width:16px;height:16px;cursor:pointer;accent-color:var(--primary);" />
          <div>
            <label for="userForcePasswordChange" style="font-size:.875rem;font-weight:600;cursor:pointer;margin:0;">Require password change on next login</label>
            <p style="margin:2px 0 0;font-size:.78rem;color:var(--text-muted);">User will be prompted to set a new password before accessing the dashboard.</p>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeUserModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveUser()">Save</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 2: Load member profiles alongside the roles table, and add the picker functions**

Find:

```js
async function renderUsersTable() {
  _cachedUsers = await SupaDB.adminGetAllUserRoles();
  applyUsersFilter();
}
```

Replace with:

```js
let _aupProfiles = [];
let _aupSelectedPerson = null;

async function renderUsersTable() {
  const [users, profiles] = await Promise.all([
    SupaDB.adminGetAllUserRoles(), SupaDB.adminGetAllMemberProfiles(),
  ]);
  _cachedUsers = users;
  _aupProfiles = profiles;
  applyUsersFilter();
}

function aupFilterPeople() {
  const q = document.getElementById('aupSearchInput').value.trim().toLowerCase();
  const results = document.getElementById('aupSearchResults');
  if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
  const matches = _aupProfiles.filter(p =>
    (p.name && p.name.toLowerCase().includes(q)) || (p.email && p.email.toLowerCase().includes(q))
  ).slice(0, 8);
  results.style.display = 'block';
  if (!matches.length) {
    results.innerHTML = '<div class="raa-search-row" style="color:var(--text-muted);">No matches</div>';
    return;
  }
  results.innerHTML = matches.map(p => `
    <div class="raa-search-row" onclick="aupSelectPerson('${p.userId}')">
      <div>${escapeHtml(p.name || '(no name)')}</div>
      <div class="email">${escapeHtml(p.email)}</div>
    </div>`).join('');
}

function aupSelectPerson(userId) {
  const p = _aupProfiles.find(x => x.userId === userId);
  if (!p) return;
  _aupSelectedPerson = p;
  document.getElementById('aupPersonPicker').style.display = 'none';
  document.getElementById('aupPersonChip').style.display = 'block';
  document.getElementById('aupPersonName').textContent = p.name || '(no name)';
  document.getElementById('aupPersonEmail').textContent = p.email;
  document.getElementById('aupSearchInput').value = '';
  document.getElementById('aupSearchResults').style.display = 'none';
}
function aupClearPerson() {
  _aupSelectedPerson = null;
  document.getElementById('aupPersonPicker').style.display = 'block';
  document.getElementById('aupPersonChip').style.display = 'none';
}
```

- [ ] **Step 3: Update `openUserModal`/`closeUserModal`/`editUser` to drive the picker**

Find:

```js
function openUserModal(email) {
  document.getElementById('userModalTitle').textContent = email ? 'Edit User' : 'Add User';
  document.getElementById('userEditEmail').value  = email || '';
  document.getElementById('userEmail').value      = email || '';
  document.getElementById('userEmail').disabled   = !!email;
  document.getElementById('userDisplayName').value = '';
  document.getElementById('userRole').value        = '';
  document.getElementById('userForcePasswordChange').checked = false;
  if (email) {
    const u = _cachedUsers.find(x => x.email === email);
    if (u) {
      document.getElementById('userDisplayName').value = u.displayName || '';
      document.getElementById('userRole').value        = u.role || '';
      document.getElementById('userForcePasswordChange').checked = !!u.forcePasswordChange;
    }
  }
  document.getElementById('userModal').classList.add('open');
}
function closeUserModal() { document.getElementById('userModal').classList.remove('open'); }
function editUser(email) { openUserModal(email); }
```

Replace with:

```js
function openUserModal(email) {
  document.getElementById('userModalTitle').textContent = email ? 'Edit User' : 'Add Permissions';
  document.getElementById('userRole').value        = '';
  document.getElementById('userForcePasswordChange').checked = false;
  aupClearPerson();
  if (email) {
    const u = _cachedUsers.find(x => x.email === email);
    if (u) {
      document.getElementById('userRole').value        = u.role || '';
      document.getElementById('userForcePasswordChange').checked = !!u.forcePasswordChange;
      if (u.userId) aupSelectPerson(u.userId);
    }
  }
  document.getElementById('userModal').classList.add('open');
}
function closeUserModal() { document.getElementById('userModal').classList.remove('open'); aupClearPerson(); }
function editUser(email) { openUserModal(email); }
```

- [ ] **Step 4: Update `saveUser` to use the selected person**

Find:

```js
async function saveUser() {
  const editEmail = document.getElementById('userEditEmail').value;
  const email = editEmail || document.getElementById('userEmail').value.trim().toLowerCase();
  const displayName = document.getElementById('userDisplayName').value.trim();
  const role = document.getElementById('userRole').value;
  const forcePasswordChange = document.getElementById('userForcePasswordChange').checked;
  if (!email) { alert('Email is required.'); return; }
  if (!role)  { alert('Please select a role.'); return; }
  const res = await SupaDB.adminUpsertUserRole({ email, displayName, role, forcePasswordChange });
  if (res.error) { alert('Error: ' + res.error); return; }
  // Fire-and-forget: ensures this staff member also has a member profile
  // (every user should also be a member), without eagerly creating an
  // account if one doesn't exist yet (createIfMissing: false — stays
  // pre-authorized only until "Set Up Account" is used).
  SupaDB.adminProvisionMember({ name: displayName, email, phone: '', groupId: null, createIfMissing: false }).catch(() => {});
  closeUserModal();
  showToast('User saved.');
  renderUsersTable();
}
```

Replace with:

```js
async function saveUser() {
  const role = document.getElementById('userRole').value;
  const forcePasswordChange = document.getElementById('userForcePasswordChange').checked;
  if (!_aupSelectedPerson) { alert('Please select a member.'); return; }
  if (!role) { alert('Please select a role.'); return; }
  const { userId, name: displayName, email } = _aupSelectedPerson;
  const res = await SupaDB.adminUpsertUserRole({ userId, email, displayName, role, forcePasswordChange });
  if (res.error) { alert('Error: ' + res.error); return; }
  closeUserModal();
  showToast('User saved.');
  renderUsersTable();
}
```

(Note: the old fire-and-forget `adminProvisionMember(..., createIfMissing:false)` call is intentionally removed here — it's now dead code, since the picker only ever offers people who are already members, so that call would always immediately no-op.)

- [ ] **Step 5: Verify**

```bash
grep -n "aupFilterPeople\|aupSelectPerson\|aupClearPerson\|_aupSelectedPerson\|_aupProfiles" admin/dashboard.html | wc -l
```

Expected: a healthy double-digit count (definitions plus call sites across the modal HTML, the new functions, and the updated `openUserModal`/`saveUser`).

```bash
grep -n "userEmail\b\|userDisplayName\b\|userEditEmail" admin/dashboard.html
```

Expected: no matches at all — confirms the old fields were fully removed, not left as dead HTML/JS.

- [ ] **Step 6: Commit**

```bash
git add admin/dashboard.html
git commit -m "Rebuild Add User as an existing-member-only Add Permissions picker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Move Create User to the Members tab

**Files:**
- Modify: `admin/dashboard.html:1230-1241` (User Permissions toolbar)
- Modify: `admin/dashboard.html:1268-1273` (Membership toolbar)

- [ ] **Step 1: Remove the Create User button from User Permissions**

Find:

```html
    <!-- USER PERMISSIONS -->
    <div class="tab-panel" id="panelUsers">
      <div class="action-bar">
        <h2>User Permissions</h2>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="openCreateUserModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Create User
          </button>
          <button class="btn btn-primary" onclick="openUserModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add User
          </button>
        </div>
      </div>
```

Replace with:

```html
    <!-- USER PERMISSIONS -->
    <div class="tab-panel" id="panelUsers">
      <div class="action-bar">
        <h2>User Permissions</h2>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-primary" onclick="openUserModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Permissions
          </button>
        </div>
      </div>
```

- [ ] **Step 2: Add the Create User button to the Membership toolbar**

Find:

```html
    <!-- PEOPLE (admin) -->
    <div class="tab-panel active" id="panelPeople">
      <div class="action-bar">
        <h2>Membership</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" id="bulkRegisterBtn" onclick="bulkRegisterLeadersAttendees()">Register Leaders &amp; Attendees</button>
          <a href="gifts-dashboard.html" class="btn btn-secondary">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Analytics
          </a>
        </div>
      </div>
```

Replace with:

```html
    <!-- PEOPLE (admin) -->
    <div class="tab-panel active" id="panelPeople">
      <div class="action-bar">
        <h2>Membership</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" onclick="openCreateUserModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Create User
          </button>
          <button class="btn btn-secondary" id="bulkRegisterBtn" onclick="bulkRegisterLeadersAttendees()">Register Leaders &amp; Attendees</button>
          <a href="gifts-dashboard.html" class="btn btn-secondary">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Analytics
          </a>
        </div>
      </div>
```

- [ ] **Step 3: Verify**

```bash
grep -n "openCreateUserModal()" admin/dashboard.html
```

Expected: two matches — the button's `onclick` (now inside `panelPeople`) and the function definition itself (unchanged, still further down the file).

```bash
grep -n "openUserModal()\">" admin/dashboard.html
```

Expected: one match, inside `panelUsers`, labeled "Add Permissions" (confirm by reading the surrounding line).

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Move Create User button to the Membership tab

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed dashboard has the changes**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "Add Permissions\|aupFilterPeople\|deleteMember('\${p.userId}')" | sort -u
```

Expected: all three strings present.

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

Since no admin credentials are available in this session, ask Scott to:
1. Open "Add Permissions" (User Permissions tab) — confirm the modal now shows a member search box instead of a free-text email field, and that searching only ever returns real members.
2. Assign a role to an existing member via the new picker — confirm it saves correctly and the member now appears in the Users table with the right role.
3. Edit that same person's role — confirm the picker pre-selects them (locked, not re-searchable) and the role/checkbox fields are pre-filled correctly.
4. Confirm "Create User" now lives on the Membership tab and still works exactly as before (sends the invite email).
5. Delete a test member from the Membership tab's new Delete button — confirm they disappear from both the Members table and the Users/Permissions table (the cascade).

- [ ] **Step 4: Report the Task 2 verification-query result and STOP**

Report back whatever the Step 3 verification query from Task 2 returned on staging. If it was empty, this plan's automated scope is complete — but do not run PART 2 (`NOT NULL`) or push anything to production yet. Both of those require Scott's separate, explicit approval per the standing deployment rule in `CLAUDE.md`, and PART 2 additionally requires its own clean verification run against production specifically (not just staging).

---

## Self-Review Notes

- **Spec coverage:** Delete button (Task 1, from `2026-09-27-members-table-delete-design.md`), phased schema + safety check (Task 2, from `2026-09-27-permissions-require-membership-design.md`'s "Schema design" section), backend `userId` requirement (Task 3), Add Permissions picker rebuild (Task 4), Create User relocation (Task 5), and the full rollout checklist (Task 6) all map to their respective design sections. `NOT NULL` tightening (Phase D) is deliberately left out of this plan's automated scope per the design's explicit phased-rollout requirement.
- **Placeholder scan:** No TBD/TODO; every step has literal code, exact SQL, or an exact command.
- **Type/name consistency:** `userId` is spelled identically across `adminGetAllUserRoles`, `getUserRoleByEmail`, `adminUpsertUserRole`, `_aupSelectedPerson`, and the picker functions. The `aup` prefix (search input, results div, chip elements, JS functions) is used consistently and doesn't collide with the existing `raa` prefix it's modeled on — only the CSS classes (`raa-search-results`, `raa-search-row`, `raa-person-chip`) are intentionally shared/reused, not redefined.
