# Count Leading a Group as Attending It Design Spec

## Purpose

A member's "Small Group History" (shown on both the admin Member Dashboard and a member's own profile page) currently only reflects rows in the `group_memberships` table. Group leaders aren't automatically added there — they're referenced only via `groups.leader_email` — so a leader with no separate membership record shows "No group history yet," even though they're actively running a group. This makes leading a group also show up in that person's history.

## Current State

- `MemberDashboard.renderGroupHistory(containerEl, memberships, groups)` (`js/member-dashboard.js`) renders a table from `memberships` (the result of `SupaDB.getGroupMembershipsForUser(userId)`) and looks up each row's group name from `groups`.
- Two callers already have everything this fix needs in scope:
  - `admin/member-dashboard.html`'s `loadCurrentMember()` has `p.email` (the viewed member's email) and `_groups` (all groups, admin-visible, including `leaderEmail`).
  - `admin/my-profile.html` has `_profile.email` (the logged-in member's own email) and `groups` (published groups, including `leaderEmail`).

## Design

### Signature change

`renderGroupHistory(containerEl, memberships, groups, email)` gains a fourth parameter: the member's own email address, used to find groups they lead.

### Behavior

Inside `renderGroupHistory`, before rendering:

1. Find every group in `groups` whose `leaderEmail` case-insensitively matches the passed `email`.
2. For each such group, check whether `memberships` already contains a row for that `groupId`. If yes, leave it alone — no duplicate row.
3. For each led group with no existing membership row, synthesize a pseudo-membership entry: `{ groupId, joinedAt: null, leftAt: null, isLeader: true }`.
4. Merge these synthesized entries into the list of rows to render, alongside the real memberships.

### Display

The table gains no new columns. For a synthesized leader row:
- **Group** column: same name lookup as any other row.
- **Joined** column: renders as `—` (no tracked join date for a leader-only row), instead of a formatted date.
- **Status** column: renders `<span class="badge badge-blue">Leader</span>` instead of the existing "Current"/"Left" badges, visually distinguishing "you lead this group" from "you're a member of this group."

If `memberships.length` is 0 AND no led groups are found, the existing "No group history yet." empty state is unchanged.

### Callers

Both call sites are updated to pass the member's email as the new fourth argument:
- `admin/member-dashboard.html`: `MemberDashboard.renderGroupHistory(document.getElementById('mdGroupHistory'), memberships, _groups, p.email)`
- `admin/my-profile.html`: `MemberDashboard.renderGroupHistory(document.getElementById('groupHistoryBox'), memberships, groups, _profile.email)`

No other callers of `renderGroupHistory` exist in this codebase.

## Error Handling

- If `email` is falsy/undefined (defensive — shouldn't happen given both callers always have it), the leader-matching step simply finds zero matches and behaves exactly as it does today — no error, no crash.
- Matching is case-insensitive on both sides (`leaderEmail` and the passed `email` are lowercased before comparing), since email casing isn't guaranteed to match exactly between how a group's leader email was typed by an admin and how a member's own email is stored.

## Out of Scope (YAGNI)

- No change to `group_memberships` itself, and no backfill of real membership rows for existing leaders — this is purely a display-time merge, not a data migration.
- No change to how a group's `leaderEmail` is set or edited — unchanged.
- No "leader since" date tracking — a synthesized leader row always shows `—` for Joined, since that information doesn't exist anywhere in the current schema.
- No dedup/merge logic beyond "does a membership row already exist for this groupId" — e.g. no attempt to intelligently combine a real membership's join date with the "Leader" status into one hybrid row.
