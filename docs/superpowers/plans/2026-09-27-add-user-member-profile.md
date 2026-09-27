# Global Member Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Add User" also ensure a member profile exists for that email (without eagerly creating an account for brand-new emails), and make the "already a member" rule consistent everywhere `adminProvisionMember` is called — no longer skipping just because someone is staff.

**Architecture:** A new side-effect-free `lookup` action on the `admin-create-user` edge function, a `createIfMissing` option on `SupaDB.adminProvisionMember` that switches between the existing eager-creation behavior (default, unchanged for existing callers) and the new lookup-only behavior, and one new fire-and-forget call from the Add User flow using `createIfMissing: false`.

**Tech Stack:** Static HTML/JS (no build step), Supabase Postgres + Auth + Edge Functions (Deno), inline `<script>` blocks.

**Full design context:** `docs/superpowers/specs/2026-09-27-add-user-member-profile-design.md`

**Testing note:** No automated test suite in this repo. Verification uses this repo's established pattern: reading deployed source via `curl`, and asking Scott to click through and confirm (no admin credentials available to Claude), per `CLAUDE.md`'s "Admin login / testing limitation."

**Deployment note:** This plan touches an Edge Function (`admin-create-user`), which is not deployed by a normal `git push` — it must be deployed separately (via Supabase CLI or the dashboard's Edge Functions editor). No Supabase CLI is available in this environment and MCP access to the correct Supabase account isn't currently working, so Task 1's edge function change needs Scott to deploy it manually, in the same way SQL migrations have been handed off in this repo.

---

### Task 1: Add a side-effect-free `lookup` action to `admin-create-user`

**Files:**
- Modify: `supabase/functions/admin-create-user/index.ts:74-80`

- [ ] **Step 1: Insert the new action branch**

Find:

```ts
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Try to create the user first
```

Replace with:

```ts
    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // action: 'lookup' — side-effect-free "does an account exist for this
    // email?" check. Never creates or modifies anything, unlike every other
    // branch below. Used by adminProvisionMember when createIfMissing is
    // false, so it can decide whether to provision a member profile without
    // ever risking creating an account as a side effect of checking.
    if (action === 'lookup') {
      const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
      if (listErr) throw listErr
      const existing = list.users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase())
      return new Response(JSON.stringify({ ok: true, exists: !!existing, userId: existing ? existing.id : null }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Try to create the user first
```

- [ ] **Step 2: Verify the edit**

```bash
grep -n "action === 'lookup'" supabase/functions/admin-create-user/index.ts
```

Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-create-user/index.ts
git commit -m "Add side-effect-free lookup action to admin-create-user

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Rewrite `adminProvisionMember` with `createIfMissing`

**Files:**
- Modify: `js/db.js:880-915`

- [ ] **Step 1: Replace the full function body**

Find:

```js
  async adminProvisionMember({ name, email, phone, groupId }) {
    if (!db() || !email) return { error: 'Email required' };
    try {
      const lower = email.toLowerCase();
      const [profileCheck, roleCheck] = await Promise.all([
        db().from('member_profiles').select('user_id').eq('email', lower).maybeSingle(),
        db().from('user_roles').select('email').eq('email', lower).maybeSingle(),
      ]);
      if (profileCheck.data || roleCheck.data) return { skipped: true };

      const { data: { session } } = await db().auth.getSession();
      const res = await fetch(SUPABASE_URL + '/functions/v1/admin-create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (session ? session.access_token : ''),
          'apikey': SUPABASE_ANON_KEY,
        },
        // action: 'createIfNew' — if this email already has an auth account
        // (e.g. self-registered but hasn't visited my-profile.html yet to get
        // a member_profiles row), never touch its password. Just report the
        // existing userId so we can still create the missing profile row.
        body: JSON.stringify({ email: lower, action: 'createIfNew' }),
      });
      const json = await res.json();
      if (!res.ok || json.error) return { error: json.error || ('HTTP ' + res.status) };

      const personId = await this.upsertPerson({ name: name || lower, email: lower, phone });
      const { error: insertErr } = await db().from('member_profiles').insert({
        user_id: json.userId, name: name || lower, email: lower, phone: phone || '',
        group_id: groupId || null, status: 'approved', person_id: personId,
      });
      if (insertErr) return { error: insertErr.message };
      return { created: true, userId: json.userId };
    } catch(e) { console.error('[SupaDB] adminProvisionMember:', e.message); return { error: e.message }; }
  },
```

Replace with:

```js
  async adminProvisionMember({ name, email, phone, groupId, createIfMissing = true }) {
    if (!db() || !email) return { error: 'Email required' };
    try {
      const lower = email.toLowerCase();
      // Only skip if a member profile already exists — staff status
      // (a user_roles row) no longer exempts someone from also being a
      // member. Every user should also be a member.
      const profileCheck = await db().from('member_profiles').select('user_id').eq('email', lower).maybeSingle();
      if (profileCheck.data) return { skipped: true };

      const { data: { session } } = await db().auth.getSession();
      const authHeaders = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (session ? session.access_token : ''),
        'apikey': SUPABASE_ANON_KEY,
      };

      let userId;
      if (createIfMissing) {
        // action: 'createIfNew' — if this email already has an auth account
        // (e.g. self-registered but hasn't visited my-profile.html yet to get
        // a member_profiles row), never touch its password. Just report the
        // existing userId so we can still create the missing profile row.
        // Creates a brand-new account (default temp password) if none exists.
        const res = await fetch(SUPABASE_URL + '/functions/v1/admin-create-user', {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify({ email: lower, action: 'createIfNew' }),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { error: json.error || ('HTTP ' + res.status) };
        userId = json.userId;
      } else {
        // action: 'lookup' — side-effect-free existence check. Never creates
        // an account; if none exists yet, this email stays pre-authorized
        // only (e.g. via Add User) until "Set Up Account" is used separately.
        const res = await fetch(SUPABASE_URL + '/functions/v1/admin-create-user', {
          method: 'POST', headers: authHeaders,
          body: JSON.stringify({ email: lower, action: 'lookup' }),
        });
        const json = await res.json();
        if (!res.ok || json.error) return { error: json.error || ('HTTP ' + res.status) };
        if (!json.exists) return { skipped: true };
        userId = json.userId;
      }

      const personId = await this.upsertPerson({ name: name || lower, email: lower, phone });
      const { error: insertErr } = await db().from('member_profiles').insert({
        user_id: userId, name: name || lower, email: lower, phone: phone || '',
        group_id: groupId || null, status: 'approved', person_id: personId,
      });
      if (insertErr) return { error: insertErr.message };
      return { created: true, userId };
    } catch(e) { console.error('[SupaDB] adminProvisionMember:', e.message); return { error: e.message }; }
  },
```

- [ ] **Step 2: Verify the edit**

```bash
grep -n "createIfMissing" js/db.js
```

Expected: at least 3 matches (the parameter default, and both branches referencing it).

- [ ] **Step 3: Confirm the three existing callers still compile logically (no signature break)**

```bash
grep -n "adminProvisionMember(" admin/dashboard.html
```

Expected: the three existing call sites (`saveGroup`, `bulkRegisterLeadersAttendees`, `submitCreateUser`) still call it with object literals that don't set `createIfMissing` — confirm none of them pass a conflicting value, since they should keep relying on the `true` default.

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Add createIfMissing option to adminProvisionMember; skip only on existing profile

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire Add User to provision a member profile

**Files:**
- Modify: `admin/dashboard.html:7471-7484` (`saveUser`)

- [ ] **Step 1: Add the fire-and-forget call**

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
  closeUserModal();
  showToast('User saved.');
  renderUsersTable();
}
```

Replace with:

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

- [ ] **Step 2: Verify the edit**

```bash
grep -n "createIfMissing: false" admin/dashboard.html
```

Expected: one match, inside `saveUser`.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Provision member profile from Add User (pre-authorized only if no account yet)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push the code changes to staging**

```bash
git push staging main
```

- [ ] **Step 2: Deploy the edge function change to staging**

No Supabase CLI or working MCP connection is available in this session. Ask Scott to deploy `supabase/functions/admin-create-user/index.ts` to the **staging** project (`govvofbrhhpowtdnuzcw`) — either via `supabase functions deploy admin-create-user --project-ref govvofbrhhpowtdnuzcw` if he has the CLI, or by pasting the updated file content into that project's Edge Functions editor in the Supabase dashboard.

- [ ] **Step 3: Confirm the deployed code shipped**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "createIfMissing: false"
```

Expected: one match.

- [ ] **Step 4: Ask Scott to click through and confirm on staging**

Since no admin credentials are available in this session, ask Scott to:
1. Use "Add User" on staging for an email that **already has a login** but no member profile (create this test condition first if needed — e.g. use Add User for a second time on an account that signed up itself but was never given a role, or coordinate a specific test case with him).
   - Expected: that person now appears in the Members tab.
2. Use "Add User" on staging for a **brand-new email that has never logged in**.
   - Expected: that person is **not** created as an auth user and does **not** appear in Members yet — confirm nothing changed here from today's behavior.
3. Add a small group leader on staging using a brand-new leader email (the existing `saveGroup` path).
   - Expected: unchanged from today — the leader's account **is** eagerly created (this path still uses `createIfMissing: true` by default).

- [ ] **Step 5: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not deploy the edge function or push code to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming all three staging checks in Step 4.

---

## Self-Review Notes

- **Spec coverage:** Edge function `lookup` action (Task 1), `adminProvisionMember`'s `createIfMissing` option and narrowed skip condition (Task 2), Add User wiring (Task 3), and the design's full rollout checklist (Task 4, Step 4's three sub-checks map directly to the design's "Testing / rollout" list). All covered.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `createIfMissing` is spelled identically in the function definition (Task 2), its two callers that need to opt out (`saveUser`, Task 3), and its two callers that rely on the default (`saveGroup`, `bulkRegisterLeadersAttendees` — unchanged, not touched by this plan since they don't need to pass anything). The edge function's `action: 'lookup'` string is spelled identically in Task 1 (server) and Task 2 (client).
