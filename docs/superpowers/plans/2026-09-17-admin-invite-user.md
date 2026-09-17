# Admin "Create User" (Branded Invite Link) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin create a brand-new login for someone by sending a Heritage-Hill-branded email containing a secure Supabase invite link — no plaintext default password, no Supabase branding anywhere the user sees, and password-setting is mandatory before the account can be used at all.

**Architecture:** A new admin-only edge function (`admin-invite-user`) calls Supabase's service-role `generateLink({ type: 'invite' })` to create the auth user and mint a one-time link, then emails that link via Resend using the site's existing branded-email HTML template conventions. The frontend adds a new "Create User" button + modal to the User Permissions tab. The link-landing flow (`admin/login.html`'s `hash.type === 'invite'` handler) already exists and needs no changes.

**Tech Stack:** Static HTML/JS, Supabase (Postgres + Auth Admin API + Edge Functions), Resend for outbound email. No build step — verification is via `node --check`-style syntax checks and manual browser/email testing.

**Spec:** `docs/superpowers/specs/2026-09-17-admin-invite-user-design.md`

---

### Task 1: `admin-invite-user` edge function

**Files:**
- Create: `supabase/functions/admin-invite-user/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
// Supabase Edge Function: admin-invite-user
// Creates a brand-new auth account via a Supabase invite link and emails the
// person a Heritage Hill-branded sign-in link via Resend -- never a plaintext
// password, never anything that looks like it came from Supabase.
//
// Deploy: supabase functions deploy admin-invite-user
// Env vars required: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Note: generateLink both creates the user AND returns the one-time link in
// a single call. If the Resend send below fails after that, the auth user
// already exists with no password set -- a retry of this same function will
// fail with "already registered." Recovery in that case is a manual resend
// via the Supabase Dashboard's Authentication -> Users -> invite flow, not
// this function again.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json()
    const { name, email, redirectTo } = body

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Creating an arbitrary new account is more sensitive than the existing
    // admin-create-user reset flow, so this is admin-only rather than any
    // staff role.
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    const { data: caller, error: callerErr } = await admin.auth.getUser(jwt)
    if (callerErr || !caller?.user?.email) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const { data: roleRow } = await admin.from('user_roles')
      .select('role').eq('email', caller.user.email.toLowerCase()).maybeSingle()
    if (!roleRow || roleRow.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admins only' }), {
        status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'Name and email are required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }
    const lowerEmail = email.toLowerCase()

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: lowerEmail,
      options: { data: { name }, redirectTo },
    })

    if (linkErr) {
      const msg = linkErr.message || String(linkErr)
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('registered') || linkErr.status === 422) {
        return new Response(JSON.stringify({ error: 'An account already exists for this email. Use "Set Up Account" or "Send Password Reset" instead.' }), {
          status: 409, headers: { ...CORS, 'Content-Type': 'application/json' },
        })
      }
      throw linkErr
    }

    const actionLink = linkData?.properties?.action_link
    if (!actionLink) throw new Error('No invite link returned')

    const firstName = (name || '').trim().split(/\s+/)[0] || 'Friend'

    const htmlBody = `
      <div style="font-family:Arial,sans-serif;max-width:580px;margin:0 auto;color:#1C1C1E;">

        <!-- Header -->
        <div style="background:#BC7A1E;padding:28px 32px;border-radius:12px 12px 0 0;">
          <p style="margin:0;color:rgba(255,255,255,.75);font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">Heritage Hill Church &middot; Papillion, Nebraska</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:24px;font-weight:700;line-height:1.25;">You're Invited!</h1>
        </div>

        <!-- Body -->
        <div style="background:#ffffff;border:1px solid #e4e4e4;border-top:none;padding:32px;border-radius:0 0 12px 12px;">

          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            Hi ${firstName},
          </p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            An account has been created for you on the Heritage Hill Church website. Click below to set up your password and sign in.
          </p>

          <div style="text-align:center;margin:28px 0;">
            <a href="${actionLink}" style="display:inline-block;background:#BC7A1E;color:#fff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:8px;">Set Up Your Account</a>
          </div>

          <p style="margin:0 0 18px;font-size:13px;line-height:1.7;color:#6B6B6B;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${actionLink}" style="color:#BC7A1E;word-break:break-all;">${actionLink}</a>
          </p>

          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            If you have any questions, feel free to reply to this email or reach out to us at
            <a href="mailto:heritagehillchurch@gmail.com" style="color:#BC7A1E;font-weight:600;">heritagehillchurch@gmail.com</a>.
          </p>

          <p style="margin:0 0 4px;font-size:15px;line-height:1.7;color:#1C1C1E;">
            We're glad you're here,
          </p>
          <p style="margin:0;font-size:15px;font-weight:700;color:#1C1C1E;">
            The Heritage Hill Church Team
          </p>

          <!-- Divider + footer -->
          <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e4e4e4;font-size:11.5px;color:#9ca3af;line-height:1.6;">
            Heritage Hill Church &nbsp;&middot;&nbsp; 6909 Cornhusker Rd, Papillion, NE 68133<br>
            <a href="https://heritagehill.church" style="color:#BC7A1E;text-decoration:none;">heritagehill.church</a>
          </div>

        </div>
      </div>
    `

    const textBody = [
      `Hi ${firstName},`,
      ``,
      `An account has been created for you on the Heritage Hill Church website.`,
      `Set up your password and sign in using the link below:`,
      ``,
      actionLink,
      ``,
      `If you have any questions, reply to this email or reach out at heritagehillchurch@gmail.com.`,
      ``,
      `We're glad you're here,`,
      `The Heritage Hill Church Team`,
      ``,
      `Heritage Hill Church · 6909 Cornhusker Rd, Papillion, NE 68133`,
      `https://heritagehill.church`,
    ].join('\n')

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'Heritage Hill Church <noreply@heritagehill.church>',
        to:      [lowerEmail],
        subject: `You're Invited to Heritage Hill Church`,
        text:    textBody,
        html:    htmlBody,
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.text()
      throw new Error(`Resend error: ${err}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[admin-invite-user]', msg)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Verify syntax (TypeScript, checked loosely via Deno-style structure — no local Deno assumed, so just confirm valid JS/TS braces/quotes with Node's parser on a stripped copy)**

```bash
node -e "
const fs = require('fs');
let src = fs.readFileSync('supabase/functions/admin-invite-user/index.ts', 'utf8');
// Strip TS-only syntax Node can't parse: type imports stay (they're just strings/comments here), but strip ': Request', '!', 'unknown' annotations for a rough syntax sanity pass.
src = src.replace(/: Request/g, '').replace(/!;/g, ';').replace(/: unknown/g, '');
fs.writeFileSync('/tmp/_aiu_check.js', src);
"
node --check /tmp/_aiu_check.js && echo OK
rm -f /tmp/_aiu_check.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/admin-invite-user/index.ts
git commit -m "Add admin-invite-user edge function for branded invite links" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: SupaDB client method

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Add `adminInviteUser`**

Find:

```javascript
    } catch (e) { return { error: e.message }; }
  },
  async getAssessmentContent() {
```

Replace with:

```javascript
    } catch (e) { return { error: e.message }; }
  },
  async adminInviteUser({ name, email }) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { data: { session } } = await db().auth.getSession();
      const redirectTo = window.location.origin + '/admin/login.html';
      const res = await fetch(SUPABASE_URL + '/functions/v1/admin-invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (session ? session.access_token : ''),
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ name, email, redirectTo }),
      });
      const json = await res.json();
      if (!res.ok || json.error) return { error: json.error || ('HTTP ' + res.status) };
      return { success: true };
    } catch (e) { return { error: e.message }; }
  },
  async getAssessmentContent() {
```

**Note:** the Find text `} catch (e) { return { error: e.message }; }\n  },\n  async getAssessmentContent() {` must match exactly once — this is the end of `adminDeleteMember` immediately followed by `getAssessmentContent`. If `} catch (e) { return { error: e.message }; }` appears elsewhere in the file (it may, as a common pattern), widen the Find to include a few more preceding lines from `adminDeleteMember` to guarantee a unique match before editing.

- [ ] **Step 2: Verify syntax**

```bash
node --check js/db.js && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add js/db.js
git commit -m "Add SupaDB.adminInviteUser client method" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: User Permissions tab markup — button, help text, modal

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Add the "Create User" button and update the help text**

Find:

```html
      <div class="action-bar">
        <h2>User Permissions</h2>
        <button class="btn btn-primary" onclick="openUserModal()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add User
        </button>
      </div>
      <div style="background:rgba(188,122,30,.07);border:1px solid rgba(188,122,30,.25);border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:.875rem;color:var(--text-muted);line-height:1.6;">
        <strong style="color:var(--text);">How it works:</strong> Add a user's email and assign a role. When they log in, they'll only see the sections their role allows. The user account itself must be created in your Supabase dashboard (Authentication → Users → Invite user).
        <br><br>
        <strong style="color:var(--text);">Admin</strong> — Full access to all sections.<br>
        <strong style="color:var(--text);">Event Manager</strong> — Events (including sign-ups), Sermons, Email.<br>
        Small group leaders no longer use this dashboard — they manage their group from their own <a href="my-profile.html" style="color:var(--primary);">My Profile</a> page instead.
      </div>
```

Replace with:

```html
      <div class="action-bar">
        <h2>User Permissions</h2>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" onclick="openCreateUserModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Create User
          </button>
          <button class="btn btn-primary" onclick="openUserModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add User
          </button>
        </div>
      </div>
      <div style="background:rgba(188,122,30,.07);border:1px solid rgba(188,122,30,.25);border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:.875rem;color:var(--text-muted);line-height:1.6;">
        <strong style="color:var(--text);">How it works:</strong> Use <strong>Create User</strong> to send a brand-new person a branded email with a secure sign-in link — they set their own password on first click, nothing to email or reset manually. Use <strong>Add User</strong> to assign a dashboard role to an email address that already has (or will separately get) an account; the account itself can also be created via Set Up Account below, or in your Supabase dashboard (Authentication → Users → Invite user).
        <br><br>
        <strong style="color:var(--text);">Admin</strong> — Full access to all sections.<br>
        <strong style="color:var(--text);">Event Manager</strong> — Events (including sign-ups), Sermons, Email.<br>
        Small group leaders no longer use this dashboard — they manage their group from their own <a href="my-profile.html" style="color:var(--primary);">My Profile</a> page instead.
      </div>
```

- [ ] **Step 2: Add the Create User modal**

Find:

```html
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeUserModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveUser()">Save</button>
    </div>
  </div>
</div>

<!-- FORCE PASSWORD CHANGE MODAL (non-dismissible) -->
```

Replace with:

```html
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeUserModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveUser()">Save</button>
    </div>
  </div>
</div>

<!-- CREATE USER MODAL (branded invite link) -->
<div class="modal-overlay" id="createUserModal" onclick="if(event.target===this)closeCreateUserModal()">
  <div class="modal" style="max-width:480px;">
    <div class="modal-header">
      <h3>Create User</h3>
      <button class="modal-close" onclick="closeCreateUserModal()">✕</button>
    </div>
    <div class="modal-body">
      <p style="margin:0 0 16px;font-size:.85rem;color:var(--text-muted);line-height:1.6;">Sends a Heritage Hill-branded email with a secure sign-in link. They'll set their own password on first click — nothing to email or reset manually.</p>
      <div class="form-row full" style="margin-bottom:16px;">
        <div class="field">
          <label>Name <span style="color:var(--danger);">*</span></label>
          <input type="text" id="createUserName" placeholder="Jane Smith" />
        </div>
      </div>
      <div class="form-row full">
        <div class="field">
          <label>Email Address <span style="color:var(--danger);">*</span></label>
          <input type="email" id="createUserEmail" placeholder="jane@example.com" />
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeCreateUserModal()">Cancel</button>
      <button class="btn btn-primary" id="createUserSaveBtn" onclick="submitCreateUser()">Send Invite</button>
    </div>
  </div>
</div>

<!-- FORCE PASSWORD CHANGE MODAL (non-dismissible) -->
```

- [ ] **Step 3: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/dashboard.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_dash_check_t3.js', scripts.join('\n;\n'));
"
node --check /tmp/_dash_check_t3.js && echo OK
rm -f /tmp/_dash_check_t3.js
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Create User button, help text, and modal markup" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Create User JavaScript logic

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Add the modal open/close/submit functions**

Find:

```javascript
async function deleteUser(email) {
  if (!confirm(`Remove access for ${email}? They will lose dashboard access immediately.`)) return;
  const res = await SupaDB.adminDeleteUserRole(email);
  if (res.error) { alert('Error: ' + res.error); return; }
  showToast('User removed.');
  renderUsersTable();
}

async function setupUserAccount(email) {
```

Replace with:

```javascript
async function deleteUser(email) {
  if (!confirm(`Remove access for ${email}? They will lose dashboard access immediately.`)) return;
  const res = await SupaDB.adminDeleteUserRole(email);
  if (res.error) { alert('Error: ' + res.error); return; }
  showToast('User removed.');
  renderUsersTable();
}

function openCreateUserModal() {
  document.getElementById('createUserName').value = '';
  document.getElementById('createUserEmail').value = '';
  document.getElementById('createUserModal').classList.add('open');
}
function closeCreateUserModal() { document.getElementById('createUserModal').classList.remove('open'); }

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

async function setupUserAccount(email) {
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/dashboard.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_dash_check_t4.js', scripts.join('\n;\n'));
"
node --check /tmp/_dash_check_t4.js && echo OK
rm -f /tmp/_dash_check_t4.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Create User modal JavaScript logic" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Deploy the edge function and verify end-to-end

Manual verification — no further code changes, but this task includes the one deployment step this feature needs beyond a normal `git push` (edge functions are deployed separately via the Supabase CLI/MCP, not served by GitHub Pages).

- [ ] **Step 1: Deploy the edge function to the staging Supabase project**

Use the Supabase MCP's `deploy_edge_function` tool (or `supabase functions deploy admin-invite-user` via CLI if MCP is unavailable) against the staging project (`govvofbrhhpowtdnuzcw`). Confirm `RESEND_API_KEY` is already set as a secret on that project (it must already exist, since `notify-pastors`/`notify-leader-approved`/etc. already depend on it and are live).

- [ ] **Step 2: Push the branch to staging**

```bash
git push staging claude/loving-darwin-e8d5ea:main
```

- [ ] **Step 3: Verify the GitHub Pages build**

```bash
gh api repos/sspratlen/HeritageHill-staging/pages/builds/latest --jq '.status'
```

Poll until `built`.

- [ ] **Step 4: Manual end-to-end test**

Log into `admin/dashboard.html` on staging as admin. Go to User Permissions. Click "Create User," enter a real test name/email you control, submit. Confirm:
- The email arrives from `Heritage Hill Church <noreply@heritagehill.church>` with no Supabase branding and no plaintext password anywhere in it.
- Clicking "Set Up Your Account" lands on `admin/login.html` showing the set-password form (not the normal login form).
- Setting a password succeeds and lands on `dashboard.html`, which (since the test account has no `user_roles` row) bounces to `my-profile.html`.
- The self-provisioned profile on `my-profile.html` shows the name entered when creating the user, not a fallback derived from the email address.

- [ ] **Step 5: Duplicate-email test**

Click "Create User" again with the same email used in Step 4. Confirm the clear "account already exists" error appears in the modal (via `alert()`) rather than a silent failure or a duplicate account.

- [ ] **Step 6: Non-admin rejection check**

If a non-admin staff test account is available, confirm the "Create User" button is visible to them too (it's not currently role-gated beyond the tab itself being admin/event_manager visible — note this in the report if `event_manager` can see the User Permissions tab, since the button would then be visible to a role that the edge function itself still correctly rejects server-side with "Admins only"). If no non-admin test account is available, this can be verified by inspection of the edge function code from Task 1 alone (already admin-gated) and flagged as an item the user can spot-check later.

- [ ] **Step 7: Report back**

Confirm to the user: staging deployment is live, the branded invite email works end-to-end, duplicate-email handling works, and the resulting account correctly self-provisions a profile with the right name.
