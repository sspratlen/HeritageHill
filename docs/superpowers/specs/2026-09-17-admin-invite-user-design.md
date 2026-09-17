# Admin "Create User" (Branded Invite Link) Design Spec

## Purpose

Give admins a way to create a brand-new login for someone (not tied to staff roles, not tied to small-group signup) that sends the new person a Heritage-Hill-branded email with a secure one-time sign-in link — never a plaintext default password, and never anything that looks like it came from Supabase. The person sets their own password the first time they click the link, which inherently satisfies "force a password change on first login" — there is no default password to ever reset away from.

## Scope

- A new "+ Create User" action in the admin dashboard's User Permissions tab.
- A new edge function that generates a Supabase invite link server-side and emails it via Resend using the site's existing branded-email conventions.
- Reuses `admin/login.html`'s existing invite-link landing flow (`hash.type === 'invite'` → set-password form → `dashboard.html`), which is already fully built and unused by any current caller.

**Out of scope:**
- Role assignment at creation time. A newly created user has no `user_roles` row and no group/person context beyond their name and email — if they need staff access, an admin adds that afterward via the existing role editor in the same tab.
- Bulk/CSV invites.
- Changing the existing `admin-create-user` function or its `HHTemp!` default-password flow — that stays exactly as-is for its existing callers (staff "Set Up Account" and small-group "Add to Group" provisioning).

## Backend

### New Edge Function: `admin-invite-user`

Deployed like the other `notify-*`/`admin-*` functions. Requires `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

**Auth:** admin-only. Verifies the caller's JWT via `admin.auth.getUser(jwt)`, then checks their `user_roles.role === 'admin'` — matching the existing `admin-create-user` function's pattern for its sensitive `delete` action. (Unlike `admin-create-user`'s create/reset action, which any staff role may call, this one creates a brand-new account from scratch for an arbitrary email, which is more sensitive and admin-only.)

**Input:** `{ name, email, redirectTo }`
- `redirectTo` is computed client-side as `window.location.origin + '/admin/login.html'` — exactly how `sendPasswordReset` in `admin/dashboard.html` already computes it — so this works correctly on staging and production without the function hardcoding a domain.

**Logic:**
1. Validate `email` and `name` are present; normalize email to lowercase.
2. Call `admin.auth.admin.generateLink({ type: 'invite', email, options: { data: { name }, redirectTo } })`.
   - This both creates the auth user (in an unconfirmed/invited state) and returns a one-time `action_link` in the response. It does **not** send any email itself — sending is entirely our responsibility, which is exactly why nothing Supabase-branded reaches the user.
   - `options.data` becomes the new user's `user_metadata`, so `name` is available there — `SupaDB.createMyProfile()` (already existing) reads `user_metadata.name` as its fallback display name when the person first visits `my-profile.html`, so their profile is named correctly with zero extra plumbing.
3. If `generateLink` fails because the email is already registered (error message contains "already" or "registered", or a 422/400 status — matching the duplicate-detection convention already used in `admin-create-user`), return a clear error: `"An account already exists for this email. Use 'Set Up Account' or 'Send Password Reset' instead."` This keeps the new flow scoped to brand-new people only, with no ambiguous overwrite behavior.
4. On success, extract the link from the response (`data.properties.action_link`) and send the branded email via Resend (see Email Content below).
5. If the Resend send fails, return an error — the auth user was already created via `generateLink`, so the admin's retry (if any) should go through `admin-create-user`'s reset flow or a manual Supabase Dashboard resend, not this function again (which would fail with "already registered" on the second attempt). Note this tradeoff in the function's header comment, matching how `admin-create-user` documents its own semantics inline.
6. Return `{ ok: true }` on full success.

### Email Content

Follows the exact HTML-email structure and inline-CSS conventions already used in `notify-leader-approved`/`notify-group-signup` (header bar in `#BC7A1E`, "Heritage Hill Church · Papillion, Nebraska" eyebrow, card body, highlight box, footer with address + site link) so it looks like every other Heritage Hill email, not a generic template.

- **From:** `Heritage Hill Church <noreply@heritagehill.church>` (identical to every other `notify-*` function).
- **Subject:** `You're invited to Heritage Hill Church`
- **Body:** Greets the person by first name, briefly explains an account was created for them, and presents the `action_link` as a prominent button-styled `<a>` labeled "Set Up Your Account." No mention of Supabase, temp passwords, or any technical detail — just "click below to set up your password and sign in."
- **Plaintext fallback:** mirrors the HTML content, with the raw link on its own line (matching every other function's `text` + `html` dual-body convention).

## Admin UI (`admin/dashboard.html`, User Permissions tab)

- New **"+ Create User"** button placed near the tab's existing user-list controls (visually secondary to — but clearly distinct from — the existing "Add User" role-assignment button, since this one does not touch `user_roles` at all).
- Opens a small modal: **Name** and **Email** fields, a **Send Invite** button.
- On submit: calls a new `SupaDB.adminInviteUser({ name, email })`, which computes `redirectTo` client-side and POSTs to the `admin-invite-user` function (mirroring `adminDeleteMember`'s existing fetch-to-edge-function pattern in `js/db.js`, including reading the session's `access_token` for the `Authorization` header).
- Success: toast `"Invite sent to {email}."`, modal closes, no list to refresh (invited users don't appear in the User Permissions role list until/unless an admin later assigns them a role there).
- Error (including the "already exists" case): shown inline in the modal so the admin can correct the email and retry, matching the existing modal error-display convention in this file.

## How "force reset on first login" is satisfied

There is no default password at all in this flow — `generateLink({ type: 'invite' })` creates the account with no password set. The person cannot sign in at all until they click the link and set one via `admin/login.html`'s already-built `handleSetPassword()` (`auth.updateUser({ password })`). This is strictly stronger than a force-reset flag on a shared default password, and requires no new enforcement code — `admin/login.html` already detects `hash.type === 'invite'` and routes into that form today; it's just never had a caller that generates real invite links until now.

## Error Handling

- Duplicate email: surfaced as described above, admin redirected toward the existing tools.
- Missing `RESEND_API_KEY` / Resend API failure: function returns an error; the admin sees it in the modal and can retry sending only through the Supabase Dashboard's own resend-invite action (documented in code comments, not built as a UI feature here — out of scope per YAGNI, this is expected to be rare).
- Invalid/empty name or email: rejected client-side before the request is sent, matching the existing modal validation pattern (`if (!email) { alert(...); return; }` in `saveUser()`).

## Testing Plan

- Manual: create a user with a brand-new email, confirm the branded email arrives from `noreply@heritagehill.church` with no Supabase branding or plaintext password anywhere in it.
- Manual: click the link, confirm `admin/login.html` shows the set-password form (not the normal login form), set a password, confirm it lands on `dashboard.html` then correctly bounces to `my-profile.html` (since the new account has no `user_roles` row).
- Manual: confirm the resulting `my-profile.html` self-provisioned profile shows the `name` originally entered by the admin, not a fallback derived from the email address.
- Manual: attempt to invite an email that already has an account, confirm the clear "already exists" error and that no duplicate auth user or duplicate email is created.
- Manual: confirm a non-admin staff role (e.g. `event_manager`) never sees the "+ Create User" button, and that calling `admin-invite-user` directly with a non-admin session is rejected server-side.

## Out of Scope (YAGNI)

- No bulk import.
- No role assignment at creation time.
- No UI-driven resend of a lapsed invite link (admin can resend manually via the Supabase Dashboard if a link expires before the person uses it).
- No change to the existing `admin-create-user` function, `HHTemp!` flow, or its callers.
