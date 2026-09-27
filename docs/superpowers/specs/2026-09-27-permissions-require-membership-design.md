# Permissions Require Membership — Design

## Motivation

Investigating a delete-button request surfaced a real data-integrity gap: `user_roles` (dashboard permissions) has no foreign key to `auth.users` or `member_profiles` — it's linked only by a plain `email` column, with an FK solely to `people` (which every row gets automatically via `upsertPerson`, regardless of actual membership). Confirmed live on staging via `pg_constraint`: the only FK on `user_roles` is `user_roles_person_id_fkey → people`.

Practical consequences of this gap:
- Deleting someone's account (`adminDeleteMember`) leaves their `user_roles` row orphaned — they keep dashboard permissions with no working login.
- "Add User" can grant a role to an email that was never a real member and may never become one, with no DB-level guarantee it ever will be.

Scott's decision, after weighing the alternative (a softer FK that only cascades on delete but still allows pre-authorizing a role before an account exists): **permissions should only be grantable to existing members, enforced with a real foreign key, not just app-level convention.** This supersedes the "pre-authorized only" behavior added for Add User in the immediately prior feature — that capability is being removed here, deliberately, in favor of requiring membership first.

## Scope

1. Add a real foreign key from `user_roles` to `member_profiles`, enforced at the database level, added in a safe phased sequence (nullable → backfilled → verified clean → `NOT NULL`).
2. Update `adminUpsertUserRole` to require an existing member (`userId`) rather than accepting any email.
3. Reorganize two pieces of admin UI: move "Create User" to the Members tab (it creates a member, not a permission), and rebuild "Add User" as "Add Permissions" on the User Permissions tab, which can only assign a role to an existing member (via a search-and-select picker, not a free-text email field).
4. `adminDeleteMember` (full account deletion) automatically removes the matching `user_roles` row too, via the new cascade — no code change needed there beyond the schema.

Explicitly out of scope:
- No change to `saveGroup`, `bulkRegisterLeadersAttendees`, or `adminAddGroupMember` — none of them touch `user_roles`.
- No change to `submitCreateUser` (Create User's actual save logic) beyond relocating its trigger button in the UI.
- No removal of the existing `person_id` column on `user_roles` — it stays; `user_id` is additive.
- The approved-members table's Delete button (from the immediately prior, still-uncommitted design) is unaffected in its own mechanics — it gets its promised behavior (role cleanup) for free once this ships, with no separate code change needed for that part.

## Schema design

Phased specifically so this never rejects a legitimate insert mid-rollout or silently breaks existing staff access:

**Phase A (nullable, safe to ship anytime):**
```sql
alter table public.user_roles
  add column if not exists user_id uuid references public.member_profiles(user_id) on delete cascade;
```

**Phase B (backfill existing rows):**
```sql
update public.user_roles ur
set user_id = mp.user_id
from public.member_profiles mp
where lower(mp.email) = lower(ur.email)
  and ur.user_id is null;
```

**Phase C (safety check — must be run and confirmed clean before Phase D):**
```sql
select email, display_name, role, created_at
from public.user_roles
where user_id is null;
```
If this returns any rows, those are staff with a role but no resolvable member profile (e.g. an admin who was never run through the earlier global-provisioning backfill, or an email mismatch). They must be resolved manually — either provision their member profile first, or make a deliberate call to remove their role — before Phase D. Do not proceed to Phase D with any rows still `null`.

**Phase D (tighten, only after Phase C is clean in that specific environment):**
```sql
alter table public.user_roles alter column user_id set not null;
```

Phase D must be re-verified independently for staging and for production — a clean check on staging does not imply production is clean too; they're separate databases with separate histories.

## Backend changes

`SupaDB.adminUpsertUserRole` (`js/db.js`) changes from taking `{ email, displayName, role, forcePasswordChange }` to taking `{ userId, email, displayName, role, forcePasswordChange }`, storing `user_id: userId` in the upsert payload. `userId` comes from the new member-picker UI (see below) — the picker only ever offers real members, so by construction the admin cannot submit a role assignment without a valid `userId`. The function still calls `upsertPerson`/stores `person_id` exactly as today (unchanged, additive).

`adminGetAllUserRoles` and `getUserRoleByEmail` gain `userId: r.user_id` in their mapped return shape, needed so the edit flow can pre-populate the picker's locked selection.

No code changes are needed to `adminDeleteMember` — once the FK exists with `on delete cascade`, deleting the `auth.users` row (which `member_profiles.user_id` already cascades from) transitively cascades through to `user_roles` too, since Postgres cascades follow the full FK chain.

## UI changes

**Create User relocates** from the User Permissions toolbar (`admin/dashboard.html:1230-1241`) to the Members/People tab's toolbar. The modal (`createUserModal`) and `submitCreateUser()` are otherwise completely unchanged — this is purely a matter of which tab's toolbar the trigger button lives in.

**"Add User" becomes "Add Permissions"** on the User Permissions tab. The current free-text "Email Address" field in `userModal` is replaced with a search-and-select member picker, modeled directly on the Record Assessment feature's existing pattern (`raaSearchInput`/`raaSearchResults`/`raaSelectPerson`/`raaPersonChip`, using the same `SupaDB.adminGetAllMemberProfiles()` data source): the admin types a name or email, picks a real member from the filtered results, and the modal then shows that member's name/email as a locked chip (not editable — you're assigning a role to a specific existing person, not naming someone new). Below that, Role and "Require password change" stay exactly as they are today. Saving calls `adminUpsertUserRole` with the picked member's `userId`.

**Editing an existing role** (`editUser(email)`) pre-populates the picker directly into its "selected" chip state (using the stored `userId` from `adminGetAllUserRoles`), with the search box hidden/skipped — you're changing what role an already-known person has, not who they are.

## Data flow

```
Add Permissions (User Permissions tab)
  → search/select an existing member (new picker, modeled on raa*)
  → saveUser() → SupaDB.adminUpsertUserRole({userId, email, displayName, role, forcePasswordChange})
      → user_roles upsert, now storing user_id (FK → member_profiles.user_id)
  → closeUserModal(); showToast('User saved.'); renderUsersTable()

Create User (now on Members tab)
  → unchanged: submitCreateUser() → adminInviteUser → fire-and-forget adminProvisionMember

Delete a member (Members tab, from the separate in-flight Delete-button design)
  → deleteMember(userId) → SupaDB.adminDeleteMember(userId)
      → admin-create-user edge fn, action:'delete' → auth.users row deleted
      → cascades: member_profiles row deleted (existing FK)
      → cascades: user_roles row deleted (NEW FK, this design) — no orphaned permissions left behind
```

## Testing / rollout

Same constraints as prior work: no automated tests, verify via reading deployed source, direct SQL checks, and asking Scott to click through (no admin credentials available to Claude). Sequence:
1. Apply Phase A + B + C (check) on **staging** first. If Phase C finds orphans, resolve them (with Scott) before continuing.
2. Ship the code changes (backend + both UI reorganizations) to staging once Phase A/B are in place (the code can start populating `user_id` correctly against the nullable column immediately — Phase D's `NOT NULL` isn't a prerequisite for the code to work correctly).
3. Click-through on staging: Add Permissions can only pick real members; Create User works from its new location on the Members tab; editing an existing permission pre-selects the right member; deleting a member (once that separate Delete-button feature ships) also removes their role.
4. Once staging is verified clean, independently re-run Phase A/B/C against **production**, resolve any orphans there too, then apply Phase D (`NOT NULL`) to staging and separately to production once each is individually confirmed clean.
5. Do not push code or apply Phase D to production until Scott explicitly approves, per the standing deployment rule.
