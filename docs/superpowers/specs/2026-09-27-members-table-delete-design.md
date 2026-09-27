# Delete Button on the Approved Members Table — Design

## Motivation

Now that "Add User" and the other provisioning paths reliably create member profiles (per the global member-provisioning fix), Scott needs the reverse capability too: admins currently have no way to delete a member from the main "Members" (approved) table in the admin dashboard — the only action there is "View." A `deleteMember(userId)` function already exists and is used in the *pending*-members box, doing a full account deletion (admin-only, server-enforced).

## Scope

Add a "Delete" button to the approved-members table (`membershipTable()` in `admin/dashboard.html`), visible only to admins, reusing the existing `deleteMember(userId)` function and `SupaDB.adminDeleteMember` edge-function call exactly as-is. No new functions, no new edge function logic, no schema changes.

Explicitly out of scope:
- No "soft delete" (member-profile-only removal that preserves the login) — confirmed with Scott: full account deletion, same as pending members.
- No change to the pending-members box's existing delete button.
- No change to `deleteMember`/`adminDeleteMember` themselves.

## Design

In `membershipTable()` (`admin/dashboard.html:6631-6646`), the row template's last `<td>` currently renders only a "View" link, gated on `isAdmin` (`window._userRole === 'admin'`, the same variable already read in this function). Add a "Delete" button inside that same conditional, next to "View", matching the pending-members box's exact button markup and behavior:

```html
<button class="btn btn-danger btn-sm" onclick="deleteMember('${p.userId}')">Delete</button>
```

`deleteMember` already: confirms with the person's name ("Delete X's account entirely? This cannot be undone."), calls `SupaDB.adminDeleteMember(userId)` (which hits the `admin-create-user` edge function's `action: 'delete'`, itself already admin-only server-side), shows a toast, and re-renders the People panel. No changes needed to that function — this task only adds the button that calls it from the new location.

## Testing / rollout

Same constraints as prior work: no automated tests, verify by reading deployed source and asking Scott to click through (delete a test member on staging, confirm they disappear from Members and their login stops working). Staging first, then production once confirmed, per the standing deployment rule.
