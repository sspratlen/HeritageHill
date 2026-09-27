# Create User: Immediate Member Profile — Design

## Motivation

Today, clicking "Create User" in the admin dashboard sends someone a branded invite email and creates their `auth.users` login, but does **not** create their `member_profiles` row. That row only gets created the first time the person actually logs in and their browser loads `admin/my-profile.html` (`createMyProfile()`). Until then, they're invisible to every admin picker that reads the member list — including the Record Assessment person picker — so staff can't manually enter Spiritual Gifts/DISC results for someone right after inviting them; they have to wait for the person to log in first.

Scott wants "Create User" to still send the invite email (so the person sets up their own password, unchanged), but to also make the person immediately available in admin pickers — without waiting for their first login.

## Scope

Change `submitCreateUser()` in `admin/dashboard.html` only. No edge function changes, no changes to the invite email itself, no changes to "Set Up Account" (the separate reset-password flow).

Explicitly out of scope:
- Any change to `admin-invite-user`'s email-sending behavior.
- Collecting phone number or group assignment in the Create User modal (it only asks for name + email today; this stays as-is).
- Changing the success toast wording (confirmed: stays exactly "Invite sent to X.").

## Design

After `SupaDB.adminInviteUser({ name, email })` succeeds inside `submitCreateUser()`, also call the already-existing `SupaDB.adminProvisionMember({ name, email, phone: '', groupId: null })` — fire-and-forget, matching the exact pattern already used elsewhere in this same file for the same function (`admin/dashboard.html:3239`, the small-group leader auto-registration path): `.catch(() => {})`, no await on its result blocking the UI, no alert on failure.

This works because `adminProvisionMember` (`js/db.js:880-915`) already does exactly what's needed here, with no modification required:
1. Checks whether a `member_profiles` or `user_roles` row already exists for the email — skips (no-op) if so.
2. Calls the `admin-create-user` edge function with `action: 'createIfNew'`. That action (confirmed by reading `supabase/functions/admin-create-user/index.ts:100-107`) detects that an auth account already exists for this email (it does — `admin-invite-user`'s `generateLink` call just created it) and returns the existing user id **without** touching the password. The person's invite-email password-setup flow is completely unaffected.
3. Inserts the `member_profiles` row with `status: 'approved'`, matching the existing convention for admin-initiated provisioning (the same status this function already uses for the bulk leader/attendee registration flow).

If step 2 or 3 fails for any reason, the error is swallowed by the `.catch(() => {})` (matching the existing fire-and-forget pattern) — the invite email still went out successfully, and the person will still get a `member_profiles` row automatically the normal way the first time they log in. This call is purely an early-availability convenience, not a dependency the invite flow relies on.

## Data flow

```
submitCreateUser()
  → SupaDB.adminInviteUser({name, email})   [unchanged: creates auth user, sends branded email]
  → on success:
      SupaDB.adminProvisionMember({name, email, phone: '', groupId: null}).catch(() => {})
        → checks member_profiles/user_roles for existing row (skip if found)
        → admin-create-user edge fn, action: 'createIfNew' (finds existing auth user, no password touch)
        → insert member_profiles row, status: 'approved'
  → closeCreateUserModal(); showToast('Invite sent to ' + email + '.')   [unchanged]
```

## Testing / rollout

Same static-site, no-automated-tests constraints as prior work in this repo. Verification: read the deployed source after push, and ask Scott to click through — invite a real test user via "Create User" on staging, then immediately check whether that person appears in the Record Assessment person picker (without logging in as them first). Staging first, then production once confirmed, per the standing deployment rule in `CLAUDE.md`.
