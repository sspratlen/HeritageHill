# Profile Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a member's photo (or initials) in place of login/profile controls on all 8 public pages and the admin dashboard topbar, with upload/remove on `my-profile.html`, consolidating the admin dashboard's two confusing half-working profile entry points into one.

**Architecture:** One new nullable `member_profiles.avatar_url` column, no Storage bucket (same client-side resize-to-data-URL technique already used for group/event photos, just smaller). A shared avatar-building utility and a public-page boot function both live in `js/main.js` (already loaded on all 8 public pages and `admin/dashboard.html`). `admin/my-profile.html` gets its own small self-contained upload/crop/preview logic (it doesn't load `js/main.js`, and doesn't need the shared nav-avatar-swap logic — see Task 6 context).

**Tech Stack:** Vanilla JS, Supabase JS v2, HTML5 Canvas (client-side image resize, same technique as existing group-image upload).

**Spec:** `docs/superpowers/specs/2026-07-24-profile-avatar-design.md`

**Testing note:** Static site, no test framework — each task ends with manual/SQL verification.

**Key facts an implementer needs:**
- All 8 public pages (`index.html`, `about.html`, `events.html`, `small-groups.html`, `prayer.html`, `sermons.html`, `give.html`, `lead-a-group.html`) have the exact same two Login lines: `<a href="admin/login.html" class="btn btn-ghost btn-sm">Login</a>` (desktop) and `<a href="admin/login.html" class="btn btn-ghost">Login</a>` (mobile) — no ids on them yet. All 8 also have the exact same line `document.getElementById('footerYear').textContent = new Date().getFullYear();` in their inline script, confirmed as a reliable, uniform anchor.
- 7 of the 8 pages already load `js/supabase-client.js` and `js/db.js` before `js/main.js`; `give.html` currently only loads `js/main.js` and needs the other two added.
- `admin/dashboard.html` already loads `../js/main.js`. `admin/my-profile.html` does NOT load `js/main.js` — don't add it there; that page's photo-upload UI is self-contained (Task 6) and doesn't need the shared nav-swap function, only its own small preview logic.
- `admin/dashboard.html`'s `saveProfilePassword` (the modal being removed) calls `SupaDB.adminSetForcePasswordChange(...)` — this is **redundant, not load-bearing**: the actual mandatory first-login password gate is a completely separate modal (`forcePasswordModal`/`submitForcePasswordChange`, untouched by this plan) that already clears that flag on its own. Removing `saveProfilePassword` loses no real behavior — confirmed by reading `submitForcePasswordChange` (search for it in `admin/dashboard.html`), which independently calls the same `adminSetForcePasswordChange` before the modal being deleted could ever run.
- Site pushes: commit → `git push staging HEAD:main` → verify → `git push origin HEAD:main`, only when Scott explicitly asks, staging first always.

---

### Task 1: Schema — `avatar_url` column

**Files:**
- Create: `supabase/profile-avatar-schema.sql`

- [ ] **Step 1: Write the schema file**

```sql
-- ============================================================
-- Profile avatar: adds avatar_url to member_profiles.
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- No RLS changes needed — existing "own profile update" and
-- "admin all profiles" policies already cover this column.
-- ============================================================

alter table public.member_profiles
  add column if not exists avatar_url text;
```

- [ ] **Step 2: Have Scott run it in the Supabase SQL editor.**

- [ ] **Step 3: Verify**

```sql
select column_name, data_type from information_schema.columns
 where table_name = 'member_profiles' and column_name = 'avatar_url';
```
Expected: one row, `avatar_url`, `text`.

- [ ] **Step 4: Commit**

```bash
git add supabase/profile-avatar-schema.sql
git commit -m "Add avatar_url column to member_profiles"
```

---

### Task 2: SupaDB methods

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Update `memberProfileFromDb`.** Find:

```js
function memberProfileFromDb(r) {
  return {
    userId: r.user_id, name: r.name, email: r.email, phone: r.phone || '',
    groupId: r.group_id, yearsAttending: r.years_attending || '',
    status: r.status, shareWithLeader: !!r.share_with_leader, createdAt: r.created_at,
  };
}
```
Replace with:
```js
function memberProfileFromDb(r) {
  return {
    userId: r.user_id, name: r.name, email: r.email, phone: r.phone || '',
    groupId: r.group_id, yearsAttending: r.years_attending || '',
    status: r.status, shareWithLeader: !!r.share_with_leader, createdAt: r.created_at,
    avatarUrl: r.avatar_url || null,
  };
}
```

- [ ] **Step 2: Add `updateMyAvatar`.** Find `updateMyProfile` (search for `async updateMyProfile({`) and add this new method immediately after its closing `},`:

```js
  async updateMyAvatar(avatarUrl) {
    if (!db()) return { error: 'Not configured' };
    const { data: { user } } = await db().auth.getUser();
    if (!user) return { error: 'Not signed in' };
    const { error } = await db().from('member_profiles')
      .update({ avatar_url: avatarUrl || null }).eq('user_id', user.id);
    if (error) return { error: error.message };
    return { success: true };
  },
```

- [ ] **Step 3: Verify**

```bash
node -e "new Function(require('fs').readFileSync('js/db.js','utf8'))" && echo SYNTAX_OK
```
Confirm `avatarUrl: r.avatar_url || null,` appears in `memberProfileFromDb` and `updateMyAvatar` is defined exactly once.

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Add avatarUrl to member profile mapping and updateMyAvatar method"
```

---

### Task 3: Shared avatar utilities in `js/main.js`

**Files:**
- Modify: `js/main.js`

- [ ] **Step 1: Add the utilities.** Find `async function isAdminLoggedIn() {` (near the top of the file) and add this new code immediately after that function's closing `}`:

```js
function initialsFor(name, email) {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || '';
  if (!source) return null;
  const parts = source.trim().split(/\s+/);
  const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]) : source.slice(0, 2);
  return initials.toUpperCase();
}

function buildAvatarHtml({ name, email, avatarUrl }, sizePx) {
  sizePx = sizePx || 34;
  if (avatarUrl) {
    return `<img src="${avatarUrl}" alt="Profile" style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;object-fit:cover;display:block;" />`;
  }
  const initials = initialsFor(name, email);
  if (!initials) {
    const iconSize = Math.round(sizePx * 0.55);
    return `<span style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:#F4F4F2;display:flex;align-items:center;justify-content:center;color:#6B6B6B;"><svg width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></span>`;
  }
  const fontSize = Math.round(sizePx * 0.4);
  return `<span style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:#BC7A1E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${fontSize}px;font-family:'DM Sans',sans-serif;">${initials}</span>`;
}

async function renderNavAvatar() {
  if (!window.SupaDB) return;
  try {
    const user = await SupaDB.getUser();
    if (!user) return;
    const [roleData, profile] = await Promise.all([
      SupaDB.getUserRoleByEmail(user.email), SupaDB.getMyProfile(),
    ]);
    const dest = roleData ? 'admin/dashboard.html' : 'admin/my-profile.html';
    const name = profile ? profile.name : '';
    const avatarUrl = profile ? profile.avatarUrl : null;
    const html = buildAvatarHtml({ name, email: user.email, avatarUrl }, 34);
    ['navLoginBtn', 'navLoginBtnMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.outerHTML = `<a href="${dest}" id="${id}" style="display:inline-flex;align-items:center;">${html}</a>`;
    });
  } catch (e) { console.error('[renderNavAvatar]', e.message); }
}
```

`SupaDB.getUserRoleByEmail` and `SupaDB.getMyProfile` both already exist (pre-dating this feature). This function is intentionally defensive (`if (!window.SupaDB) return;` and a try/catch) since it runs on every public page and must never break page load if something's briefly unavailable.

- [ ] **Step 2: Verify**

```bash
node -e "new Function(require('fs').readFileSync('js/main.js','utf8'))" && echo SYNTAX_OK
```
Confirm `initialsFor`, `buildAvatarHtml`, `renderNavAvatar` each appear exactly once as definitions, placed after `isAdminLoggedIn`.

- [ ] **Step 3: Commit**

```bash
git add js/main.js
git commit -m "Add shared avatar rendering utilities to main.js"
```

---

### Task 4: Wire avatar into all 8 public pages

**Files:**
- Modify: `index.html`, `about.html`, `events.html`, `small-groups.html`, `prayer.html`, `sermons.html`, `give.html`, `lead-a-group.html`

- [ ] **Step 1: Add missing scripts to `give.html`.** Find:
```html
<script src="js/main.js"></script>
```
(this is currently the ONLY relevant script tag in `give.html` — confirm by grepping the file first) and replace with:
```html
<script src="js/supabase-client.js"></script>
<script src="js/db.js"></script>
<script src="js/main.js"></script>
```

- [ ] **Step 2: For each of the 8 files**, add an id to both Login links. Find:
```html
<a href="admin/login.html" class="btn btn-ghost btn-sm">Login</a>
```
Replace with:
```html
<a href="admin/login.html" class="btn btn-ghost btn-sm" id="navLoginBtn">Login</a>
```
And find:
```html
<a href="admin/login.html" class="btn btn-ghost">Login</a>
```
Replace with:
```html
<a href="admin/login.html" class="btn btn-ghost" id="navLoginBtnMobile">Login</a>
```
Do this for all 8 files. Each file has exactly one of each line (verify with `grep -c` before and after — before: 1 each; after: 0 remaining without the id, `navLoginBtn`/`navLoginBtnMobile` each present once).

- [ ] **Step 3: Call `renderNavAvatar()` on each page.** For each of the 8 files, find the line:
```js
document.getElementById('footerYear').textContent = new Date().getFullYear();
```
Add immediately after it (same line or next line, either is fine — for `give.html` this line is inside its own separate `<script>` tag, add the call inside that same tag right after it):
```js
renderNavAvatar();
```

- [ ] **Step 4: Verify.** For each file:
```bash
grep -c 'id="navLoginBtn"' index.html about.html events.html small-groups.html prayer.html sermons.html give.html lead-a-group.html
grep -c 'id="navLoginBtnMobile"' index.html about.html events.html small-groups.html prayer.html sermons.html give.html lead-a-group.html
grep -c 'renderNavAvatar();' index.html about.html events.html small-groups.html prayer.html sermons.html give.html lead-a-group.html
```
Expected: `1` for every file, every check.

Then, for `give.html` specifically, confirm the three script tags are present and in the right order:
```bash
grep -n 'js/supabase-client.js\|js/db.js\|js/main.js' give.html
```
Expected: supabase-client.js, then db.js, then main.js, in that order.

Manual browser check: open any of the 8 pages while logged out — Login button unchanged. Log in as a member (via `admin/login.html`), then visit a public page — the Login button should be replaced by an avatar (initials, since no photo is uploaded yet) linking to `admin/my-profile.html`. Log in as staff instead — same avatar swap, but linking to `admin/dashboard.html`.

- [ ] **Step 5: Commit**

```bash
git add index.html about.html events.html small-groups.html prayer.html sermons.html give.html lead-a-group.html
git commit -m "Show profile avatar in place of Login link when signed in"
```

---

### Task 5: Admin dashboard topbar consolidation

**Files:**
- Modify: `admin/dashboard.html`

## Context
This removes the existing circular icon button (opens a password-only modal) and the separate "My Profile" text link, replacing both with one avatar. Read the full `saveProfilePassword` function and the "Key facts" note at the top of this plan about why removing it loses no real behavior (the mandatory first-login password gate is a separate, untouched modal/function).

- [ ] **Step 1: Replace the topbar HTML.** Find:
```html
<div class="main">
  <div class="topbar">
    <h1 id="topbarTitle">Events</h1>
    <div style="display:flex;align-items:center;gap:12px;">
      <a href="my-profile.html" title="My Profile & Assessments"
         style="color:var(--text-muted); font-size:.85rem; text-decoration:none; margin-right:10px;">My Profile</a>
      <span class="admin-badge" id="roleBadge">Admin</span>
      <button onclick="openProfileModal()" title="My Profile" style="background:none;border:1.5px solid var(--border);border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--text-muted);transition:border-color .15s,color .15s;" onmouseenter="this.style.borderColor='var(--primary)';this.style.color='var(--primary)'" onmouseleave="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">
        <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      </button>
    </div>
  </div>
```
Replace with:
```html
<div class="main">
  <div class="topbar">
    <h1 id="topbarTitle">Events</h1>
    <div style="display:flex;align-items:center;gap:12px;">
      <span class="admin-badge" id="roleBadge">Admin</span>
      <a href="my-profile.html" id="topbarAvatarLink" title="My Profile & Assessments" style="display:flex;align-items:center;text-decoration:none;"></a>
    </div>
  </div>
```

- [ ] **Step 2: Remove the `profileModal` HTML block.** Find (right after the closing `</div>` of the topbar's `.main`/`.content` opening, elsewhere in the file — search for `<!-- Profile / change password modal -->`):
```html
<!-- Profile / change password modal -->
<div class="modal-overlay" id="profileModal" onclick="if(event.target===this)closeProfileModal()">
  <div class="modal" style="max-width:420px;">
    <div class="modal-header">
      <h3>My Profile</h3>
      <button class="modal-close" onclick="closeProfileModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="field" style="margin-bottom:18px;">
        <label>Email</label>
        <input type="email" id="profileEmail" readonly style="background:var(--bg);color:var(--text-muted);cursor:default;" />
      </div>
      <p style="font-size:.82rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);margin:0 0 12px;">Change Password</p>
      <div class="field">
        <label>New Password</label>
        <input type="password" id="profileNewPw" placeholder="At least 8 characters" />
      </div>
      <div class="field">
        <label>Confirm New Password</label>
        <input type="password" id="profileConfirmPw" placeholder="Repeat your new password" />
      </div>
      <p id="profileError" style="display:none;color:var(--danger);font-size:.82rem;margin-top:8px;"></p>
      <p id="profileSuccess" style="display:none;color:var(--success,#16a34a);font-size:.82rem;margin-top:8px;">Password updated successfully.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeProfileModal()">Cancel</button>
      <button class="btn btn-primary" id="profileSaveBtn" onclick="saveProfilePassword()">Update Password</button>
    </div>
  </div>
</div>
```
Delete this whole block entirely.

- [ ] **Step 3: Remove `openProfileModal`, `closeProfileModal`, `saveProfilePassword`.** Search for `function openProfileModal(){` and delete it, `function closeProfileModal(){` and delete it (both are short), and `async function saveProfilePassword(){` — delete this whole function in full (read it first to find its exact closing `}`, it's about 20 lines).

- [ ] **Step 4: Populate the new avatar in the auth-guard IIFE.** Find (in the auth-guard IIFE, after role/visibility setup — search for `applyRoleVisibility();`):
```js
  applyRoleVisibility();
```
Add immediately after it:
```js
  applyRoleVisibility();
  SupaDB.getMyProfile().then(profile => {
    const link = document.getElementById('topbarAvatarLink');
    if (!link) return;
    link.innerHTML = buildAvatarHtml({
      name: profile ? profile.name : (window._currentUserName || ''),
      email: window._currentUser ? window._currentUser.email : '',
      avatarUrl: profile ? profile.avatarUrl : null,
    }, 34);
  }).catch(() => {});
```
(`buildAvatarHtml` was added to `js/main.js` in a prior completed task, and this file already loads `../js/main.js` — confirm that script tag exists before finalizing.) Note this is deliberately NOT awaited before continuing the rest of the IIFE — it's a small visual enhancement, not something that should block dashboard load if it's slow.

IMPORTANT: only add ONE new line calling `applyRoleVisibility();` worth of context — do not duplicate the pre-existing `applyRoleVisibility();` call itself, only insert the new block after the existing one.

- [ ] **Step 5: Verify**

```bash
grep -c "openProfileModal\|closeProfileModal\|saveProfilePassword\|profileModal" admin/dashboard.html
```
Expected: `0`.

```bash
node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK
python3 -c "
content = open('admin/dashboard.html').read()
print('opens:', content.count('<div'), 'closes:', content.count('</div>'))
"
```
The div-balance check must show equal counts — this file has had a real dangling-tag bug before in this project, treat any imbalance as a stop-and-investigate signal.

Manual check: log in as admin, confirm the topbar shows an avatar (initials) instead of the old icon+text link combo, and clicking it goes to `my-profile.html`. Confirm password change still works via `my-profile.html`'s own "Change Password" card.

- [ ] **Step 6: Commit**

```bash
git add admin/dashboard.html
git commit -m "Consolidate admin topbar profile controls into one avatar"
```

---

### Task 6: Profile photo upload on `my-profile.html`

**Files:**
- Modify: `admin/my-profile.html`

## Context
`admin/my-profile.html` does NOT load `js/main.js` (confirm this — don't add it either; this page's photo card is self-contained and only needs `document.getElementById`-level DOM work plus `SupaDB.updateMyAvatar`, no shared nav-swap logic). It already loads `js/db.js`.

- [ ] **Step 1: Add the Profile Photo card.** Find (the `profileCard`, near the top of the body — search for `<div class="portal-card" id="profileCard">`) and add a new card immediately after `profileCard`'s closing `</div>` (before the `discCard`):

```html
  <div class="portal-card">
    <h2>Profile Photo</h2>
    <p class="sub">Shown next to your name across the site.</p>
    <div style="display:flex; align-items:center; gap:16px; margin-bottom:14px;">
      <div id="avatarPreview" style="width:80px; height:80px; border-radius:50%; background:#F4F4F2; display:flex; align-items:center; justify-content:center; overflow:hidden; flex-shrink:0;"></div>
      <div>
        <input type="file" id="avatarFile" accept="image/*" onchange="handleAvatarFile(this)" style="display:none;" />
        <button type="button" class="btn-primary" onclick="document.getElementById('avatarFile').click()">Choose Photo</button>
        <button type="button" class="btn-ghost" onclick="saveAvatar()" id="avatarSaveBtn" style="display:none; margin-left:8px;">Save Photo</button>
        <br />
        <button type="button" class="btn-ghost" onclick="removeAvatar()" id="avatarRemoveBtn" style="margin-top:8px; display:none;">Remove Photo</button>
      </div>
    </div>
    <div class="msg-success" id="avatarSaved">Saved.</div>
    <div class="msg-error" id="avatarError"></div>
  </div>
```

- [ ] **Step 2: Render the current photo/initials on load.** Find (in the boot IIFE, right after the profile form is filled in — search for `document.getElementById('pfShare').checked`):
```js
  document.getElementById('pfShare').checked = _profile.shareWithLeader;
```
Add immediately after it:
```js
  document.getElementById('pfShare').checked = _profile.shareWithLeader;
  renderAvatarPreview(_profile.avatarUrl);
  if (_profile.avatarUrl) document.getElementById('avatarRemoveBtn').style.display = '';
```

- [ ] **Step 3: Add the avatar functions.** Add near the bottom of the script, right before `async function signOut() {`:

```js
let _pendingAvatarUrl = null;

function renderAvatarPreview(avatarUrl) {
  const box = document.getElementById('avatarPreview');
  if (avatarUrl) {
    box.innerHTML = `<img src="${avatarUrl}" alt="Profile" style="width:100%;height:100%;object-fit:cover;" />`;
  } else {
    box.innerHTML = `<svg width="36" height="36" fill="none" stroke="#6B6B6B" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
  }
}

function handleAvatarFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const SIZE = 160;
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      const canvas = document.createElement('canvas');
      canvas.width = SIZE; canvas.height = SIZE;
      canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
      _pendingAvatarUrl = canvas.toDataURL('image/jpeg', 0.8);
      renderAvatarPreview(_pendingAvatarUrl);
      document.getElementById('avatarSaveBtn').style.display = '';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveAvatar() {
  if (!_pendingAvatarUrl) return;
  const err = document.getElementById('avatarError'), ok = document.getElementById('avatarSaved');
  err.classList.remove('show'); ok.classList.remove('show');
  const r = await SupaDB.updateMyAvatar(_pendingAvatarUrl);
  if (r.error) { err.textContent = r.error; err.classList.add('show'); return; }
  ok.classList.add('show');
  document.getElementById('avatarSaveBtn').style.display = 'none';
  document.getElementById('avatarRemoveBtn').style.display = '';
  _pendingAvatarUrl = null;
  setTimeout(() => ok.classList.remove('show'), 2500);
}

async function removeAvatar() {
  const err = document.getElementById('avatarError'), ok = document.getElementById('avatarSaved');
  err.classList.remove('show'); ok.classList.remove('show');
  const r = await SupaDB.updateMyAvatar(null);
  if (r.error) { err.textContent = r.error; err.classList.add('show'); return; }
  renderAvatarPreview(null);
  document.getElementById('avatarRemoveBtn').style.display = 'none';
  document.getElementById('avatarSaveBtn').style.display = 'none';
  _pendingAvatarUrl = null;
  ok.classList.add('show');
  setTimeout(() => ok.classList.remove('show'), 2500);
}

```

`SupaDB.updateMyAvatar` was added to `js/db.js` in a prior completed task in this same feature.

- [ ] **Step 4: Verify**

```bash
node -e "new Function(require('fs').readFileSync('admin/my-profile.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK
```
Confirm `js/main.js` was NOT added to this file's script tags (grep for it — should be zero matches, consistent with the Context note above).

Manual check: log in, go to `my-profile.html`, choose a photo — preview updates immediately (cropped to a square), "Save Photo" button appears. Click it — success message shows, "Remove Photo" button appears. Reload the page — the photo persists (fetched from `_profile.avatarUrl`). Click "Remove Photo" — reverts to the generic icon, success message shows. Reload — stays removed.

- [ ] **Step 5: Commit**

```bash
git add admin/my-profile.html
git commit -m "Add profile photo upload to my-profile.html"
```

---

### Task 7: End-to-end verification + staging deploy

- [ ] **Step 1: Full flow as a member** — upload a photo on `my-profile.html`, confirm it shows on a public page's nav after a reload.
- [ ] **Step 2: Full flow as staff** — same upload, confirm it shows in the admin dashboard topbar AND on public pages, and that clicking the public-page avatar goes to `admin/dashboard.html` (not `my-profile.html`).
- [ ] **Step 3: Logged-out check** — all 8 public pages show the plain "Login" link, unchanged.
- [ ] **Step 4: `give.html` regression check** — since it gained two new script tags, click around the page (e.g. any existing forms/interactions it has) to confirm nothing else broke.
- [ ] **Step 5: Admin topbar regression check** — confirm the old password-change modal is completely gone, and password change still works end-to-end via `my-profile.html`.
- [ ] **Step 6: Deploy to staging**

```bash
git push staging HEAD:main
```
Verify on staging, then wait for Scott's explicit go-ahead before:

```bash
git push origin HEAD:main
```

---

## Post-plan self-review (done at write time)

- **Spec coverage:** schema (T1), shared avatar component + initials fallback + generic-icon fallback (T3), public-site nav swap on all 8 pages incl. `give.html` script fix (T4), admin dashboard consolidation incl. old-modal removal (T5), upload/crop/resize/save/remove on my-profile.html (T6), rollout (T7). All spec sections covered.
- **Type consistency:** `avatarUrl` (camelCase, matching the rest of `memberProfileFromDb`'s output) used identically in `js/main.js` (T3), `admin/dashboard.html` (T5), and `admin/my-profile.html` (T6, via `_profile.avatarUrl`).
- **Verified non-regression:** the "Key facts" section explicitly traces why removing `saveProfilePassword` (T5) doesn't lose the mandatory first-login password-change behavior — that's a separate, untouched code path.
