# Global Member Provisioning: Fix Add User (and unify the rule everywhere) — Design

## Motivation

Scott noticed Lori Holland (an existing staff user, visible in "User Permissions") does not show up in the "Members" tab or any other place that reads `member_profiles`. Investigation traced this to two related facts:

1. "Add User" (`saveUser()` → `SupaDB.adminUpsertUserRole`) only writes a `user_roles` row — it never creates a `member_profiles` row for that person.
2. The one function that *would* create that row, `SupaDB.adminProvisionMember`, has a skip condition that explicitly treats "this email already has a `user_roles` row" as a reason to do nothing (`js/db.js:888`: `if (profileCheck.data || roleCheck.data) return { skipped: true };`).

Scott's stated rule: **every user should also be a member** — staff status and member-profile status aren't mutually exclusive, and today's code treats them as if they were.

## Scope

- Change the shared skip condition in `SupaDB.adminProvisionMember` (`js/db.js`) so it only skips when a `member_profiles` row already exists — no longer skipping just because a `user_roles` row exists. This is a global change: it affects every existing caller (`saveGroup`'s leader auto-registration, the bulk-register flow, and the recently-added Create User call), not just the new Add User call site.
- Add a fire-and-forget call to `adminProvisionMember` from `saveUser()` (the Add User flow), so assigning a role now also ensures a member profile exists for that email.
- Add a `createIfMissing` option to `adminProvisionMember`, defaulting to `true` (preserving the current, unchanged behavior of the two pre-existing callers). Add User passes `createIfMissing: false`.
- Add a new `action: 'lookup'` to the `admin-create-user` edge function: a side-effect-free "does an auth account exist for this email?" check, needed to support `createIfMissing: false` without accidentally creating an account as a side effect of checking.

Explicitly out of scope:
- No change to the two existing callers' actual behavior (`saveGroup`'s leader field, `bulkRegisterLeadersAttendees`) — both keep eager account-creation for brand-new emails, since that's their documented, intended purpose (the bulk-register button's own confirm dialog says as much).
- No change to `submitCreateUser` (Create User) — by the time it calls `adminProvisionMember`, the auth account already exists (created moments earlier by `admin-invite-user`), so `createIfMissing`'s value doesn't matter there; it's left at its default.
- No fix to the pre-existing `listUsers({perPage:1000})` scale limitation noted in earlier review (a lookup could miss on an org with over 1000 auth users) — unrelated latent issue, not touched here.
- No UI change to the "Add User" modal itself — this is entirely a background data-consistency fix; the modal, its fields, and its visible behavior are unchanged.

## Design

### 1. `admin-create-user` edge function: new `lookup` action

Add a new branch, alongside the existing `delete` and default create/reset branches: when `action === 'lookup'`, do the same `listUsers({perPage:1000})` + email match already used internally for the duplicate-email case, but return the result directly without ever calling `createUser` or `updateUserById`:

```ts
if (action === 'lookup') {
  if (!email) {
    return new Response(JSON.stringify({ error: 'Email is required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) throw listErr
  const existing = list.users.find((u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase())
  return new Response(JSON.stringify({ ok: true, exists: !!existing, userId: existing ? existing.id : null }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
```

This sits after the existing staff-role check (so it's gated the same way `createIfNew` already is — any staff role, not admin-only) and before the `createUser` attempt.

### 2. `adminProvisionMember`: `createIfMissing` option + narrower skip condition

Current skip condition (`js/db.js:888`):
```js
if (profileCheck.data || roleCheck.data) return { skipped: true };
```
becomes:
```js
if (profileCheck.data) return { skipped: true };
```
(The `roleCheck` query itself can be dropped entirely, since nothing else in the function needs it once it's no longer part of the skip decision.)

The function gains a `createIfMissing = true` parameter (default preserves current behavior for existing callers, who don't pass it). When `createIfMissing` is `false`, instead of calling `admin-create-user` with `action: 'createIfNew'`, it first calls `action: 'lookup'`:
- If `exists: false` → return `{ skipped: true }` (pre-authorized only, no account created — matches today's Add-User-for-a-brand-new-email behavior).
- If `exists: true` → proceed straight to `upsertPerson` + the `member_profiles` insert using the returned `userId`, exactly as the existing success path already does (no password ever touched, since `lookup` never creates or resets anything).

When `createIfMissing` is `true` (the default, used by the two existing callers and by Create User), the function's behavior is completely unchanged from today — same `action: 'createIfNew'` call, same eager-creation-if-missing semantics.

### 3. Add User (`saveUser()` in `admin/dashboard.html`)

After `SupaDB.adminUpsertUserRole({...})` succeeds, add a fire-and-forget call, matching the exact pattern already used in `submitCreateUser`:

```js
SupaDB.adminProvisionMember({ name: displayName, email, phone: '', groupId: null, createIfMissing: false }).catch(() => {});
```

Placed after `closeUserModal(); showToast('User saved.'); renderUsersTable();` succeeds (i.e. added right before or after those lines — exact placement decided in the implementation plan) so a failure here never blocks the visible "User saved" confirmation, same reasoning as Create User's fire-and-forget call.

## Data flow

```
saveUser() [Add User]
  → SupaDB.adminUpsertUserRole({email, displayName, role, forcePasswordChange})   [unchanged: user_roles upsert]
  → on success:
      SupaDB.adminProvisionMember({name: displayName, email, phone:'', groupId:null, createIfMissing:false}).catch(()=>{})
        → member_profiles check (skip if row already exists)
        → createIfMissing:false → admin-create-user, action:'lookup' (no side effects)
            → exists:false → skip (pre-authorized only, unchanged from today)
            → exists:true  → upsertPerson + insert member_profiles (status:'approved'), using the found userId
  → closeUserModal(); showToast('User saved.'); renderUsersTable()   [unchanged]
```

## Testing / rollout

Same constraints as prior work in this repo: no automated test suite, verification via reading deployed source and asking Scott to click through (no admin credentials available to Claude). Plan:
1. Apply the edge function change (`admin-create-user`'s new `lookup` action) and redeploy it to staging first.
2. Backfill already-affected staging accounts (Lori-equivalent test data, if any exists there) using the same manual SQL backfill approach used for production, or simply re-test via the UI.
3. On staging: use Add User for an existing test account with no profile yet — confirm it now appears in Members. Use Add User for a brand-new, never-seen email — confirm it does *not* create an account (still pre-authorized only) and does not appear in Members until "Set Up Account" is used.
4. Confirm the two existing callers' behavior is unchanged (spot check: adding a small group leader by a brand-new email should still eagerly create their account, as it does today).
5. Only after staging verification and Scott's explicit approval, apply the edge function change to production and push the code.
