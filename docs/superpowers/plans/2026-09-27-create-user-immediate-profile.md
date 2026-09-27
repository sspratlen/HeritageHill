# Create User: Immediate Member Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Create User" also create the invited person's `member_profiles` row immediately, so they appear in admin pickers (e.g. Record Assessment) right away instead of only after their first login — without changing the invite email itself.

**Architecture:** One additive, fire-and-forget call to the already-existing `SupaDB.adminProvisionMember()` function, added to `submitCreateUser()` right after the existing invite call succeeds. No edge function changes, no new functions — this reuses code that already does exactly what's needed (confirmed by reading `js/db.js` and `supabase/functions/admin-create-user/index.ts`).

**Tech Stack:** Static HTML/JS (no build step), Supabase Postgres + Auth + Edge Functions, inline `<script>` blocks.

**Full design context:** `docs/superpowers/specs/2026-09-27-create-user-immediate-profile-design.md`

**Testing note:** This repo has no automated test suite. Verification uses this repo's established pattern: reading deployed source via `curl`, and — since this touches an authenticated admin flow — asking Scott to click through and confirm, per the "Admin login / testing limitation" section of `CLAUDE.md`.

---

### Task 1: Auto-provision the member profile after a successful invite

**Files:**
- Modify: `admin/dashboard.html:7501-7516` (`submitCreateUser`)

- [ ] **Step 1: Add the fire-and-forget provisioning call**

Find:

```js
async function submitCreateUser() {
  const name = document.getElementById('createUserName').value.trim();
  const email = document.getElementById('createUserEmail').value.trim().toLowerCase();
  if (!name)  { alert('Name is required.'); return; }
  if (!email) { alert('Email is required.'); return; }
  const btn = document.getElementById('createUserSaveBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await SupaDB.adminInviteUser({ name, email });
    if (res.error) { alert('Error: ' + res.error); return; }
    closeCreateUserModal();
    showToast(`Invite sent to ${email}.`);
  } finally {
    btn.disabled = false; btn.textContent = 'Send Invite';
  }
}
```

Replace with:

```js
async function submitCreateUser() {
  const name = document.getElementById('createUserName').value.trim();
  const email = document.getElementById('createUserEmail').value.trim().toLowerCase();
  if (!name)  { alert('Name is required.'); return; }
  if (!email) { alert('Email is required.'); return; }
  const btn = document.getElementById('createUserSaveBtn');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await SupaDB.adminInviteUser({ name, email });
    if (res.error) { alert('Error: ' + res.error); return; }
    // Fire-and-forget: makes the person immediately available in admin
    // pickers (e.g. Record Assessment) instead of only after their first
    // login. Same pattern as the small-group leader auto-registration call
    // below (bulkRegisterLeadersAttendees). Safe no-op if a profile already
    // exists, and never touches a password the person may have already set.
    SupaDB.adminProvisionMember({ name, email, phone: '', groupId: null }).catch(() => {});
    closeCreateUserModal();
    showToast(`Invite sent to ${email}.`);
  } finally {
    btn.disabled = false; btn.textContent = 'Send Invite';
  }
}
```

- [ ] **Step 2: Verify the edit landed correctly**

```bash
grep -n "adminProvisionMember" admin/dashboard.html
```

Expected: two matches — the pre-existing call inside `bulkRegisterLeadersAttendees` (around line 3239) and the new one inside `submitCreateUser` (around line 7511).

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Auto-provision member profile when Create User invites someone

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed admin dashboard has the change**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/admin/dashboard.html | grep -o "SupaDB.adminProvisionMember({ name, email, phone: '', groupId: null })"
```

Expected: the string appears in the output. (GitHub Pages deploys aren't always instant — see the "GitHub Pages deploys" gotcha in `CLAUDE.md` if this doesn't show up within a few minutes.)

- [ ] **Step 3: Ask Scott to click through and confirm on staging**

No admin credentials are available in this session, so ask Scott to:
1. Log into the staging admin dashboard.
2. Click "Create User", invite a real test email he controls.
3. Without logging in as that test account, immediately open the Record Assessment (or any other admin member picker) and confirm the new person now appears.
4. Confirm the invite email itself still arrived normally and its "set up your password" link still works (i.e. nothing about the invite/password flow changed).

- [ ] **Step 4: Stop here — do not touch production**

Per `CLAUDE.md`'s standing deployment rule, do not push to `origin` (production) until Scott explicitly approves promoting this specific change, after confirming it works on staging.

---

## Self-Review Notes

- **Spec coverage:** The design doc's single required change (add the fire-and-forget `adminProvisionMember` call after a successful invite, no edge function changes, no toast wording change, "Set Up Account" untouched) is fully covered by Task 1. Task 2 covers the design doc's "Testing / rollout" section.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `adminProvisionMember({ name, email, phone: '', groupId: null })` matches its existing definition in `js/db.js` (`async adminProvisionMember({ name, email, phone, groupId })`) exactly — same parameter names, no new signature needed.
