# Bulk Member Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-register existing small group leaders and attendees as approved site members (auth account + `member_profiles` row), both as a one-time bulk action and going forward whenever a group's leader is set or someone is added to a roster.

**Architecture:** A single new `SupaDB.adminProvisionMember()` method does the whole "create if genuinely new" flow (dedup check → reuse the existing `admin-create-user` edge function for the auth account → insert the `member_profiles` row via the already-existing "admin all profiles" RLS policy). No edge function changes, no RLS changes. This one method is called from three places: a new bulk-action button, `adminAddGroupMember` (attendee flow), and `saveGroup` (leader flow).

**Tech Stack:** Vanilla JS, Supabase JS v2, existing `SupaDB`/edge-function patterns.

**Spec:** `docs/superpowers/specs/2026-07-23-bulk-member-registration-design.md`

**Testing note:** Static site, no test framework — each task ends with manual/SQL verification.

**Key facts an implementer needs:**
- `member_profiles` already has an "admin all profiles" RLS policy (`supabase/assessments-schema.sql`): `for all to authenticated using (public.is_admin()) with check (public.is_admin())`. An admin session can insert a profile row for any `user_id` directly — no schema/RLS changes needed for this plan.
- The `protect_member_profile_fields` trigger on `member_profiles` only overrides `status`/`email` for non-admin sessions; an admin session's insert (including `status: 'approved'`) passes through untouched.
- `admin-create-user` (existing edge function, unmodified by this plan): POST `{email}` with no `action` field creates-or-resets that email's auth account (temp password `HHTemp!`) and returns `{ok:true, action:'created'|'reset', userId}`. This is the exact same call shape already used by `setupUserAccount` in `admin/dashboard.html` — reuse it verbatim.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` are already-defined globals (from `js/supabase-client.js`, loaded before `js/db.js` on every page) — reference them directly in `js/db.js`, don't redeclare.
- **Dedup is by lowercased email against `member_profiles` and `user_roles` only** — not against raw `auth.users`. An orphaned auth-only account with no profile (rare: e.g. leftover from a previous partial run) would not be caught by this dedup and could get its password reset by a subsequent provision call. This is an accepted, documented edge case (see spec) — do not add extra guards for it.
- Site pushes: commit → `git push staging HEAD:main` → verify → `git push origin HEAD:main`, only when Scott explicitly asks, staging first always.

---

### Task 1: `SupaDB.adminProvisionMember` + `adminGetAllCurrentGroupMembers`

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Add `adminGetAllCurrentGroupMembers`.** Find `adminGetGroupMembers` (search for `async adminGetGroupMembers(groupId)`) and add this new method immediately after its closing `},`:

```js
  async adminGetAllCurrentGroupMembers() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('group_memberships')
        .select('*').is('left_at', null);
      if (error) throw error;
      return (data || []).map(groupMembershipFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllCurrentGroupMembers:', e.message); return []; }
  },
```

- [ ] **Step 2: Add `adminProvisionMember`.** Add it directly after `adminGetAllCurrentGroupMembers`'s closing `},`:

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
        body: JSON.stringify({ email: lower }),
      });
      const json = await res.json();
      if (!res.ok || json.error) return { error: json.error || ('HTTP ' + res.status) };

      const { error: insertErr } = await db().from('member_profiles').insert({
        user_id: json.userId, name: name || lower, email: lower, phone: phone || '',
        group_id: groupId || null, status: 'approved',
      });
      if (insertErr) return { error: insertErr.message };
      return { created: true, userId: json.userId };
    } catch(e) { console.error('[SupaDB] adminProvisionMember:', e.message); return { error: e.message }; }
  },
```

- [ ] **Step 3: Verify**

```bash
node -e "new Function(require('fs').readFileSync('js/db.js','utf8'))" && echo SYNTAX_OK
```
Confirm `adminGetAllCurrentGroupMembers` and `adminProvisionMember` each appear exactly once as a definition (read the file, don't just grep-count — `adminProvisionMember` will also appear as call sites once Tasks 2/3 add them, but this task's own commit should show it defined exactly once).

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Add adminProvisionMember for auto-registering leaders and attendees as members"
```

---

### Task 2: Wire provisioning into `adminAddGroupMember` (attendee flow)

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Update `adminAddGroupMember`.** Find (this method already exists from a prior feature):

```js
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
```
Replace with:
```js
  async adminAddGroupMember(m) {
    if (!db()) return { error: 'Not configured' };
    try {
      let match = await this.adminFindMemberByEmail(m.email);
      if (!match) {
        const provisioned = await this.adminProvisionMember({
          name: m.name, email: m.email, phone: m.phone, groupId: m.groupId,
        });
        if (provisioned.userId) match = { userId: provisioned.userId };
      }
      const { error } = await db().from('group_memberships').insert({
        group_id: m.groupId, name: m.name, email: m.email, phone: m.phone || '',
        notes: m.notes || '', user_id: match ? match.userId : null,
      });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminAddGroupMember:', e.message); return { error: e.message }; }
  },
```
This calls `this.adminProvisionMember(...)` — a method-call on `SupaDB` itself, same `this`-binding pattern already used by `adminAddGroupMember`'s existing `this.adminFindMemberByEmail(...)` call, and by `adminAddGrowthTrackRegistration` elsewhere in this file. Safe for the same reason: every call site in this codebase invokes `SupaDB.methodName(...)`, never destructures.

- [ ] **Step 2: Verify**

```bash
node -e "new Function(require('fs').readFileSync('js/db.js','utf8'))" && echo SYNTAX_OK
```
As admin, open a group's roster (Groups tab → Members), add a person with an email that has NO existing account — confirm in the SQL editor: `select * from member_profiles where email = '<that email>';` shows a new row with `status = 'approved'`. Add a second person whose email you've already registered as a member elsewhere — confirm no duplicate profile is created (`adminFindMemberByEmail` finds them first, `adminProvisionMember` is never called).

- [ ] **Step 3: Commit**

```bash
git add js/db.js
git commit -m "Auto-provision member accounts when adding someone to a group roster"
```

---

### Task 3: Wire provisioning into `saveGroup` (leader flow) + bulk button

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Update `saveGroup`.** Find (search for `async function saveGroup(){`):

```js
async function saveGroup(){
  const id=document.getElementById('grId').value;
  const name=document.getElementById('grName').value.trim();
  const lead=document.getElementById('grLeader').value.trim();
  const time=document.getElementById('grTime').value.trim();
  const loc=document.getElementById('grLocation').value.trim();
  const desc=document.getElementById('grDescription').value.trim();
  if(!name||!lead||!time||!loc||!desc){showToast('Please fill in all required fields.',true);return;}
  let image=document.getElementById('grImageFinal').value.trim()||document.getElementById('grImageUrl').value.trim()||'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80';
  const newGr={id:id?parseInt(id):undefined,published:document.getElementById('grPublished').checked,name,leader:lead,leaderEmail:document.getElementById('grLeaderEmail').value.trim(),day:document.getElementById('grDay').value,time,location:loc,type:document.getElementById('grType').value,audience:document.getElementById('grAudience').value,description:desc,image,open:document.getElementById('grOpen').checked};
  const result = await SupaDB.saveGroup(newGr);
  if(result.error){showToast('Error saving group: '+result.error,true);return;}
  closeGroupModal();renderGroupsTable();updateStats();
  showToast(id?'Group updated!':'Group added!');
}
```
Replace with (adds a fire-and-forget provisioning call after a successful save, only when a leader email is present):
```js
async function saveGroup(){
  const id=document.getElementById('grId').value;
  const name=document.getElementById('grName').value.trim();
  const lead=document.getElementById('grLeader').value.trim();
  const time=document.getElementById('grTime').value.trim();
  const loc=document.getElementById('grLocation').value.trim();
  const desc=document.getElementById('grDescription').value.trim();
  if(!name||!lead||!time||!loc||!desc){showToast('Please fill in all required fields.',true);return;}
  let image=document.getElementById('grImageFinal').value.trim()||document.getElementById('grImageUrl').value.trim()||'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80';
  const leaderEmail=document.getElementById('grLeaderEmail').value.trim();
  const newGr={id:id?parseInt(id):undefined,published:document.getElementById('grPublished').checked,name,leader:lead,leaderEmail,day:document.getElementById('grDay').value,time,location:loc,type:document.getElementById('grType').value,audience:document.getElementById('grAudience').value,description:desc,image,open:document.getElementById('grOpen').checked};
  const result = await SupaDB.saveGroup(newGr);
  if(result.error){showToast('Error saving group: '+result.error,true);return;}
  closeGroupModal();renderGroupsTable();updateStats();
  showToast(id?'Group updated!':'Group added!');
  if (leaderEmail) {
    const savedId = result.data ? result.data.id : (id ? parseInt(id) : null);
    SupaDB.adminProvisionMember({ name: lead, email: leaderEmail, phone: '', groupId: savedId }).catch(() => {});
  }
}
```
This is intentionally not awaited before returning — the group save and UI feedback (`showToast`, `closeGroupModal`) already happened; provisioning is a background side effect the admin doesn't need to wait on. `.catch(() => {})` prevents an unhandled-rejection warning; `adminProvisionMember` itself never throws (internal try/catch returns `{error}`), so this is just defensive.

- [ ] **Step 2: Add the bulk-action button.** Find the People tab's action bar (added in a prior completed task — search for `<div class="tab-panel" id="panelPeople">`):
```html
    <div class="tab-panel" id="panelPeople">
      <div class="action-bar">
        <h2>Members &amp; Assessments</h2>
        <a href="gifts-dashboard.html" class="btn btn-secondary">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Analytics
        </a>
      </div>
```
Replace the action-bar's contents with (adds the bulk button before the Analytics link):
```html
    <div class="tab-panel" id="panelPeople">
      <div class="action-bar">
        <h2>Members &amp; Assessments</h2>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary" id="bulkRegisterBtn" onclick="bulkRegisterLeadersAttendees()">Register Leaders &amp; Attendees</button>
          <a href="gifts-dashboard.html" class="btn btn-secondary">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>Analytics
          </a>
        </div>
      </div>
```

- [ ] **Step 3: Add the bulk-action handler.** Find `renderPeoplePanel` (search for `async function renderPeoplePanel`) and add this new function immediately before it:

```js
async function bulkRegisterLeadersAttendees() {
  if (!confirm('Register all current small group leaders and attendees as site members? This creates login accounts (password HHTemp!) for anyone who doesn\'t already have one.')) return;
  const btn = document.getElementById('bulkRegisterBtn');
  btn.disabled = true; btn.textContent = 'Working…';
  try {
    const [groups, allMembers] = await Promise.all([
      SupaDB.adminGetAllGroups(), SupaDB.adminGetAllCurrentGroupMembers(),
    ]);
    const candidates = new Map();
    groups.forEach(g => {
      const email = (g.leaderEmail || '').trim().toLowerCase();
      if (!email) return;
      candidates.set(email, { name: g.leader || email, email, phone: '', groupId: g.id, isLeader: true });
    });
    allMembers.forEach(m => {
      const email = (m.email || '').trim().toLowerCase();
      if (!email) return;
      const existing = candidates.get(email);
      if (existing && existing.isLeader) return;
      if (!existing) candidates.set(email, { name: m.name, email, phone: m.phone, groupId: m.groupId, isLeader: false });
    });

    let created = 0, skipped = 0, failed = 0;
    for (const c of candidates.values()) {
      const result = await SupaDB.adminProvisionMember(c);
      if (result.created) created++;
      else if (result.skipped) skipped++;
      else failed++;
    }
    showToast(`Done: ${created} created, ${skipped} already had accounts, ${failed} failed.`);
    renderPeoplePanel();
  } catch(e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Register Leaders & Attendees';
  }
}

```
(Note the trailing blank line before `async function renderPeoplePanel` — keep that function's existing definition immediately after, unchanged.)

The dedup loop is a sequential `for...of` with `await` inside (not `Promise.all`) — intentional, to avoid firing many concurrent requests at the shared `admin-create-user` edge function at once; a modest per-person delay is an acceptable trade-off for a bulk action an admin runs occasionally, not a hot path.

- [ ] **Step 4: Verify**

```bash
node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK
```
Also run the whole-file `<div>`/`</div>` balance check (this file has had HTML-structure bugs before in this project):
```bash
python3 -c "
content = open('admin/dashboard.html').read()
print('opens:', content.count('<div'), 'closes:', content.count('</div>'))
"
```
Expected: equal counts.

As admin: click "Register Leaders & Attendees" on the Members tab, confirm the dialog, wait for the toast summary. Check `select count(*) from member_profiles where status='approved';` increased by roughly the number of distinct leader/attendee emails that didn't already have accounts. Click the button again immediately — toast should report 0 created, everyone already had accounts. Edit an existing group's leader email to a brand-new address, save — confirm a new `member_profiles` row appears for that email shortly after (check the SQL editor).

- [ ] **Step 5: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add bulk leader/attendee registration button and auto-provision on group leader save"
```

---

### Task 4: End-to-end verification + staging deploy

- [ ] **Step 1: Full bulk-run check** — as admin on staging, run the bulk button once for real. Spot-check 2-3 resulting `member_profiles` rows in the SQL editor: correct name/email/phone/group_id, `status='approved'`. Log in as one of the newly-created accounts (email + `HHTemp!`) via `admin/login.html` — should land on `my-profile.html` (no staff role), profile pre-filled, group already set.
- [ ] **Step 2: Idempotency check** — run the bulk button a second time; toast reports 0 created.
- [ ] **Step 3: Pre-existing-account safety check** — before this task, note one member who already self-registered (has a `member_profiles` row and has set their own password). Run the bulk button; confirm via `select * from member_profiles where email = '<their email>';` that their row is untouched, and confirm you can still log in as them with their own (non-`HHTemp!`) password — i.e., confirm their auth account was NOT reset.
- [ ] **Step 4: Ongoing-hook checks** — add a brand-new person to a group's roster (Groups tab → Members → Add Member) with an email that has no account; confirm a `member_profiles` row appears for them. Add or edit a group's leader email to a new address; confirm the same.
- [ ] **Step 5: Deploy to staging**

```bash
git push staging HEAD:main
```
Verify on staging, then wait for Scott's explicit go-ahead before:

```bash
git push origin HEAD:main
```

---

## Post-plan self-review (done at write time)

- **Spec coverage:** dedup-before-account-action safety rule (T1), candidate sourcing from groups+group_memberships with leader-priority tie-break (T3's `bulkRegisterLeadersAttendees`), approved-immediately status (T1's insert), no-email-notification (nothing sends email anywhere in this plan), ongoing hooks in both `adminAddGroupMember` (T2) and `saveGroup` (T3), bulk UI + summary (T3), idempotency (T4). All spec sections covered.
- **Type consistency:** `adminProvisionMember`'s return shape (`{created, userId}` / `{skipped}` / `{error}`) is used identically by `adminAddGroupMember` (T2), `saveGroup` (T3), and `bulkRegisterLeadersAttendees` (T3) — no shape drift between call sites.
- **No edge function or RLS changes** — confirmed consistent with the spec's explicit "No RLS changes needed" section; this plan only adds client-side `js/db.js` methods and two call sites.
