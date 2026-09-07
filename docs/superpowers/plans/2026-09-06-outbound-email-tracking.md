# Outbound Email Delivery Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track delivery/open/bounce status per recipient for "Email Group" and "Email All Leaders" sends (via Resend's webhooks), persist a send history, and let admins (all sends) and leaders (their own groups' sends) browse it in the admin dashboard.

**Architecture:** Two new tables (`outbound_email_sends`, `outbound_email_recipients`) record every send and its recipients. `send-group-email` is extended to return each recipient's Resend message id; the client persists a history row right after a successful send. A new, account-wide `resend-webhook` Edge Function (using the service-role key, since Resend has no user session) receives Resend's delivery-status callbacks and updates recipient status, ignoring events for any email this feature doesn't track. A new "Email History" modal in `admin/dashboard.html`, RLS-scoped identically to the underlying data, displays it.

**Tech Stack:** Static HTML/JS, Supabase Postgres + Edge Functions (Deno), Resend batch API + webhooks (signature verified via the `svix` package, imported from esm.sh — matching this codebase's existing pattern of importing npm-compatible packages into Deno functions via esm.sh). Verification is via `node --check`/syntax checks, HTML tag-balance checks, and manual browser + Resend-dashboard verification (webhook delivery can't be exercised from a local static-file preview, since Resend can't reach `localhost`).

---

### Task 1: Database migration

**Files:**
- Create: `supabase/outbound-email-tracking-schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Outbound email delivery/open tracking for Email Group / Email
-- All Leaders sends. Reuses public.is_admin()/public.jwt_email()
-- from supabase/assessments-schema.sql — that migration must
-- already be applied. Run in the Supabase SQL editor.
-- Safe to re-run (idempotent).
-- ============================================================

create table if not exists public.outbound_email_sends (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  sent_by    text not null,
  context    text not null default 'small_group',
  group_id   bigint,
  subject    text not null
);

create table if not exists public.outbound_email_recipients (
  id                bigint generated always as identity primary key,
  send_id           bigint not null references public.outbound_email_sends(id) on delete cascade,
  email             text not null,
  resend_email_id   text,
  status            text not null default 'pending',
  status_updated_at timestamptz
);

alter table public.outbound_email_sends enable row level security;
alter table public.outbound_email_recipients enable row level security;

drop policy if exists "view own or led group sends" on public.outbound_email_sends;
drop policy if exists "insert email sends" on public.outbound_email_sends;
create policy "view own or led group sends" on public.outbound_email_sends
  for select to authenticated using (
    public.is_admin()
    or group_id in (
      select id from public.groups where lower(leader_email) = public.jwt_email()
    )
  );
create policy "insert email sends" on public.outbound_email_sends
  for insert to authenticated with check (auth.role() = 'authenticated');

drop policy if exists "view recipients of visible sends" on public.outbound_email_recipients;
drop policy if exists "insert email recipients" on public.outbound_email_recipients;
create policy "view recipients of visible sends" on public.outbound_email_recipients
  for select to authenticated using (
    exists (
      select 1 from public.outbound_email_sends s
      where s.id = outbound_email_recipients.send_id
        and (
          public.is_admin()
          or s.group_id in (
            select id from public.groups where lower(leader_email) = public.jwt_email()
          )
        )
    )
  );
create policy "insert email recipients" on public.outbound_email_recipients
  for insert to authenticated with check (auth.role() = 'authenticated');
```

- [ ] **Step 2: Verify by inspection**

Confirm the RLS pattern (`public.is_admin()` / `public.jwt_email()`, no update/delete policy for authenticated users) matches `supabase/assessments-schema.sql`'s "leader shared attempts" policy on `assessment_attempts` — same helper functions, same admin-or-scoped-to-my-groups shape.

- [ ] **Step 3: Commit**

```bash
git add supabase/outbound-email-tracking-schema.sql
git commit -m "Add migration for outbound email delivery tracking tables"
```

---

### Task 2: SupaDB mappers + methods

**Files:**
- Modify: `js/db.js` (add two mapper functions and two CRUD methods)

- [ ] **Step 1: Add the mapper functions**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```js
function analyticsReportFromDb(r) {
  return {
    id: r.id, createdAt: r.created_at, createdBy: r.created_by || '',
    summaryStats: r.summary_stats || {}, analysisText: r.analysis_text,
  };
}

function groupMembershipFromDb(r) {
```

Replace with:

```js
function analyticsReportFromDb(r) {
  return {
    id: r.id, createdAt: r.created_at, createdBy: r.created_by || '',
    summaryStats: r.summary_stats || {}, analysisText: r.analysis_text,
  };
}
function outboundEmailRecipientFromDb(r) {
  return {
    id: r.id, sendId: r.send_id, email: r.email, resendEmailId: r.resend_email_id,
    status: r.status, statusUpdatedAt: r.status_updated_at,
  };
}
function outboundEmailSendFromDb(r) {
  return {
    id: r.id, createdAt: r.created_at, sentBy: r.sent_by, context: r.context,
    groupId: r.group_id, subject: r.subject,
    recipients: (r.outbound_email_recipients || []).map(outboundEmailRecipientFromDb),
  };
}

function groupMembershipFromDb(r) {
```

- [ ] **Step 2: Add the CRUD methods**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```js
  async adminGetGroupMembers(groupId) {
```

Insert immediately **before** this line:

```js
  async adminSaveOutboundEmailSend({ subject, context, groupId, sentBy, results }) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { data: sendRow, error: sendErr } = await db().from('outbound_email_sends')
        .insert({ sent_by: sentBy, context, group_id: groupId, subject }).select().single();
      if (sendErr) throw sendErr;
      const recipientRows = (results || []).map(r => ({
        send_id: sendRow.id, email: r.email, resend_email_id: r.resendId || null, status: 'pending',
      }));
      if (recipientRows.length) {
        const { error: recErr } = await db().from('outbound_email_recipients').insert(recipientRows);
        if (recErr) throw recErr;
      }
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminSaveOutboundEmailSend:', e.message); return { error: e.message }; }
  },
  async getVisibleOutboundEmailSends() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('outbound_email_sends')
        .select('*, outbound_email_recipients(*)').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(outboundEmailSendFromDb);
    } catch(e) { console.error('[SupaDB] getVisibleOutboundEmailSends:', e.message); return []; }
  },
  async adminGetGroupMembers(groupId) {
```

If either anchor's exact text cannot be located verbatim, STOP and report BLOCKED with what you found instead — do not guess or improvise a different insertion point.

- [ ] **Step 3: Verify JS syntax**

Run: `node --check js/db.js`
Expected: no output (exits 0)

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Add SupaDB methods for outbound email send history"
```

---

### Task 3: Return per-recipient Resend message ids from `send-group-email`

**Files:**
- Modify: `supabase/functions/send-group-email/index.ts`

- [ ] **Step 1: Capture and return each recipient's Resend message id**

Find this exact block:

```ts
    const apiKey = Deno.env.get('RESEND_API_KEY')
    let sent = 0

    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100)
      const resendRes = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })

      if (!resendRes.ok) {
        const err = await resendRes.text()
        throw new Error(`Resend error (sent ${sent} of ${messages.length} so far): ${err}`)
      }
      sent += chunk.length
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
```

Replace with:

```ts
    const apiKey = Deno.env.get('RESEND_API_KEY')
    let sent = 0
    // Resend's batch response returns one { id } per message, in the same
    // order as the request array (confirmed in Resend's API docs) — so each
    // chunk's recipients zip directly against that chunk's response array.
    const results: { email: string; resendId: string | null }[] = []

    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100)
      const chunkRecipients = valid.slice(i, i + 100)
      const resendRes = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
      })

      if (!resendRes.ok) {
        const err = await resendRes.text()
        throw new Error(`Resend error (sent ${sent} of ${messages.length} so far): ${err}`)
      }
      const resendJson = await resendRes.json()
      const chunkResults = (resendJson.data || []) as { id: string }[]
      chunkRecipients.forEach((email: string, idx: number) => {
        results.push({ email, resendId: (chunkResults[idx] && chunkResults[idx].id) || null })
      })
      sent += chunk.length
    }

    return new Response(JSON.stringify({ ok: true, sent, results }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
```

If this exact "find" text cannot be located verbatim, STOP and report BLOCKED with what you found instead.

- [ ] **Step 2: Verify by inspection**

Confirm `valid` (the filtered recipients array, defined earlier in this same function as `const valid = recipients.filter(...)`) is still in scope at this point in the file — it is, since this edit only touches code after its definition and doesn't move or remove it.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-group-email/index.ts
git commit -m "Return per-recipient Resend message ids from send-group-email"
```

---

### Task 4: Resend webhook receiver

**Files:**
- Create: `supabase/functions/resend-webhook/index.ts`

- [ ] **Step 1: Write the Edge Function**

```ts
// Supabase Edge Function: resend-webhook
// Receives Resend delivery-status webhooks (account-wide — every email this
// Resend account sends triggers this, not just tracked ones) and updates
// outbound_email_recipients.status for any email this app is tracking.
// Events for untracked emails (any Resend send not created through
// send-group-email) are silently ignored.
//
// No CORS handling: this is a server-to-server callback from Resend, not a
// browser fetch, so there is no preflight to answer.
//
// Required secret (set via Supabase Dashboard → Settings → Secrets):
//   RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are already available to every
//   Edge Function automatically — no need to set them.)
//
// Deploy:
//   supabase functions deploy resend-webhook
//
// Manual setup required (cannot be done from code — see plan Task 6):
//   In the Resend dashboard, create a Webhook pointing at this function's
//   URL, subscribed to at least: email.delivered, email.opened,
//   email.bounced, email.complained. Copy the signing secret it generates
//   into RESEND_WEBHOOK_SECRET above.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Webhook } from 'https://esm.sh/svix@1.15.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STATUS_RANK: Record<string, number> = { pending: 0, delivered: 1, opened: 2, bounced: 3, complained: 3 }
const EVENT_TO_STATUS: Record<string, string> = {
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
}

serve(async (req: Request) => {
  try {
    const payload = await req.text()
    const svixHeaders = {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    }

    const wh = new Webhook(Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '')
    let event: { type: string; data: { email_id: string } }
    try {
      event = wh.verify(payload, svixHeaders) as typeof event
    } catch {
      return new Response('Invalid signature', { status: 400 })
    }

    const newStatus = EVENT_TO_STATUS[event.type]
    if (!newStatus) {
      // Not a status event we track (e.g. email.sent, email.clicked) — no-op.
      return new Response(JSON.stringify({ ok: true, ignored: true }), { headers: { 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: recipient, error: findErr } = await supabase
      .from('outbound_email_recipients')
      .select('id, status')
      .eq('resend_email_id', event.data.email_id)
      .maybeSingle()

    if (findErr || !recipient) {
      // Not a tracked email — this webhook endpoint is account-wide.
      return new Response(JSON.stringify({ ok: true, tracked: false }), { headers: { 'Content-Type': 'application/json' } })
    }

    const currentRank = STATUS_RANK[recipient.status] ?? 0
    const newRank = STATUS_RANK[newStatus] ?? 0
    if (newRank >= currentRank) {
      await supabase.from('outbound_email_recipients')
        .update({ status: newStatus, status_updated_at: new Date().toISOString() })
        .eq('id', recipient.id)
    }

    return new Response(JSON.stringify({ ok: true, tracked: true }), { headers: { 'Content-Type': 'application/json' } })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[resend-webhook]', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
```

- [ ] **Step 2: Verify by inspection**

Confirm the overall try/catch/error-response shape matches the other functions in this repo (e.g. `supabase/functions/notify-retreat-registrant/index.ts`), and that this is the only function in the repo using `SUPABASE_SERVICE_ROLE_KEY` rather than the anon key — intentional, per the design spec (no user session exists on a server-to-server webhook call).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/resend-webhook/index.ts
git commit -m "Add Resend webhook receiver for outbound email delivery tracking"
```

---

### Task 5: Persist send history after a successful "Email Group" / "Email All Leaders" send

**Files:**
- Modify: `admin/dashboard.html` (`sendGroupEmail`)

- [ ] **Step 1: Capture `results` from the response and save history**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```js
    const json = await res.json();
    if (json.error) { errEl.textContent = 'Error: ' + json.error; errEl.style.display = ''; return; }
    closeGroupEmailModal();
    showToast(`Email sent to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''} ✓`);
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message; errEl.style.display = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Email';
  }
}
```

Replace with:

```js
    const json = await res.json();
    if (json.error) { errEl.textContent = 'Error: ' + json.error; errEl.style.display = ''; return; }
    closeGroupEmailModal();
    showToast(`Email sent to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''} ✓`);

    // Record send history for the Email History view. A failure here doesn't
    // mean the email wasn't sent (it already was) — it's a separate,
    // non-blocking warning rather than treated as a send error.
    const sentBy = (window._currentUser && window._currentUser.email) || _groupEmailFromEmail;
    const saveResult = await SupaDB.adminSaveOutboundEmailSend({
      subject, context: 'small_group', groupId: _groupEmailGroupId,
      sentBy, results: json.results || [],
    });
    if (saveResult.error) showToast('Email sent, but couldn\'t save to history: ' + saveResult.error, true);
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message; errEl.style.display = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Email';
  }
}
```

`_groupEmailGroupId` (already `null` for "Email All Leaders", the specific group's id for "Email Group" — set by `openAllLeadersEmailModal`/`openGroupEmailModal` respectively, unchanged by this plan) and `_groupEmailFromEmail` are both already module-level variables in scope here. `window._currentUser` is already set elsewhere in this file (used today by `openAllLeadersEmailModal`).

- [ ] **Step 2: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Save outbound email send history after Email Group / Email All Leaders sends"
```

---

### Task 6: Email History UI

**Files:**
- Modify: `admin/dashboard.html` (action-bar button, new modal HTML, new JS)

- [ ] **Step 1: Add the "Email History" button**

Find this exact block:

```html
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="emailAllLeadersBtn" onclick="openAllLeadersEmailModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Email All Leaders
          </button>
          <button class="btn btn-primary" id="addGroupBtn" onclick="openGroupModal()">
```

Replace with:

```html
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary" id="emailAllLeadersBtn" onclick="openAllLeadersEmailModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Email All Leaders
          </button>
          <button class="btn btn-secondary" id="emailHistoryBtn" onclick="openEmailHistoryModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Email History
          </button>
          <button class="btn btn-primary" id="addGroupBtn" onclick="openGroupModal()">
```

Note: unlike `emailAllLeadersBtn` (hidden for leaders via `renderGroupsTable`'s existing `isLeader` check), `emailHistoryBtn` is **not** hidden for leaders — leaders can see this button and their own groups' history, per the design's visibility decision. No change needed to `renderGroupsTable`'s role-visibility logic for this button.

- [ ] **Step 2: Verify div/tag balance was not disturbed**

Run:
```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('admin/dashboard.html', 'utf8');
const opens = (content.match(/<div/g) || []).length;
const closes = (content.match(/<\/div>/g) || []).length;
console.log('opens:', opens, 'closes:', closes, opens === closes ? 'BALANCED' : 'MISMATCH');
"
```
Expected: `BALANCED` (this step adds no `<div>`/`</div>`).

- [ ] **Step 3: Add the Email History modal**

Find this exact block:

```html
<!-- Delete confirm modal -->
```

Replace with:

```html
<!-- Email History modal -->
<div class="modal-overlay" id="emailHistoryModal" onclick="if(event.target===this)closeEmailHistoryModal()">
  <div class="modal modal-lg" style="max-width:780px;">
    <div class="modal-header">
      <h3>Email History</h3>
      <button class="modal-close" onclick="closeEmailHistoryModal()">✕</button>
    </div>
    <div class="modal-body">
      <p style="font-size:.82rem;color:var(--text-muted);margin:0 0 16px;">
        Opens are tracked but not guaranteed — some email apps block the tracking image.
      </p>
      <div id="emailHistoryList"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeEmailHistoryModal()">Close</button>
    </div>
  </div>
</div>


<!-- Delete confirm modal -->
```

This anchor text (`<!-- Delete confirm modal -->`) appears exactly once in the file — verify that before replacing; if it appears more than once, STOP and report BLOCKED.

- [ ] **Step 4: Verify div/tag balance again**

Run the same command as Step 2. Expected: `BALANCED` (this step adds one new balanced `<div>`/`</div>` modal — the count should increase, but opens must still equal closes).

- [ ] **Step 5: Add the JS**

Find this exact block (the end of `sendGroupEmail`, immediately followed by the start of the User Permissions section — locate by text match):

```js
/* ── USER PERMISSIONS ─────────────────────────────────────── */
let _cachedUsers = [];
```

Insert immediately **before** it:

```js
/* ── EMAIL HISTORY ─────────────────────────────────────────── */
const EMAIL_STATUS_LABELS = { pending: 'Pending', delivered: 'Delivered', opened: 'Opened', bounced: 'Bounced', complained: 'Complained' };
const EMAIL_STATUS_COLORS = {
  pending: 'background:#F0F0EE;color:#6B6B6B;',
  delivered: 'background:#E8EEF7;color:#155CA2;',
  opened: 'background:#E4F3EA;color:#1E7A45;',
  bounced: 'background:#FBE4E4;color:#B3261E;',
  complained: 'background:#FBE4E4;color:#B3261E;',
};

function emailStatusPill(status) {
  const style = EMAIL_STATUS_COLORS[status] || EMAIL_STATUS_COLORS.pending;
  const label = EMAIL_STATUS_LABELS[status] || status;
  return `<span style="${style}font-weight:700;font-size:.76rem;padding:2px 9px;border-radius:20px;">${escapeHtml(label)}</span>`;
}

async function openEmailHistoryModal() {
  document.getElementById('emailHistoryModal').classList.add('open');
  await renderEmailHistory();
}
function closeEmailHistoryModal() {
  document.getElementById('emailHistoryModal').classList.remove('open');
}

async function renderEmailHistory() {
  const box = document.getElementById('emailHistoryList');
  box.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:.9rem;">Loading…</div>';
  const sends = await SupaDB.getVisibleOutboundEmailSends();
  if (!sends.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;">No emails sent yet.</p>';
    return;
  }
  box.innerHTML = sends.map((s, i) => {
    const dateStr = new Date(s.createdAt).toLocaleString();
    const group = s.groupId ? _cachedGroups.find(g => g.id === s.groupId) : null;
    const groupLabel = s.groupId ? (group ? group.name : 'Group') : 'All Leaders';
    const rows = s.recipients.map(r => `
      <tr><td style="padding:6px 0;font-size:.85rem;">${escapeHtml(r.email)}</td><td style="padding:6px 0;">${emailStatusPill(r.status)}</td></tr>
    `).join('');
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:10px;overflow:hidden;">
        <div onclick="const d=this.nextElementSibling; const open=d.style.display==='none'; d.style.display=open?'':'none'; this.querySelector('.acc-chevron').textContent=open?'▲':'▼';"
             style="cursor:pointer;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;background:#fafafa;">
          <span style="font-size:.88rem;">
            <strong>${escapeHtml(s.subject)}</strong>
            <span style="color:var(--text-muted);"> · ${escapeHtml(groupLabel)} · ${dateStr} · ${s.recipients.length} recipient${s.recipients.length !== 1 ? 's' : ''}</span>
          </span>
          <span class="acc-chevron" style="color:var(--text-muted);">${i === 0 ? '▲' : '▼'}</span>
        </div>
        <div style="${i === 0 ? '' : 'display:none;'}padding:0 16px 12px;">
          <table style="width:100%;">
            <thead><tr><th style="text-align:left;font-size:.76rem;color:var(--text-muted);padding:8px 0;">Recipient</th><th style="text-align:left;font-size:.76rem;color:var(--text-muted);padding:8px 0;">Status</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }).join('');
}

/* ── USER PERMISSIONS ─────────────────────────────────────── */
let _cachedUsers = [];
```

`escapeHtml` and `_cachedGroups` (populated by `renderGroupsTable()`, which always runs before this button is reachable, since the button lives inside `panelGroups`) are already defined/in scope elsewhere in this file.

- [ ] **Step 6: Verify div/tag balance one more time**

Same command as Step 2 — expected `BALANCED`, count unchanged from Step 4 (this step only touches `<script>` content).

- [ ] **Step 7: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 8: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Email History view to the Small Groups admin tab"
```

---

### Task 7: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (the project's existing `static-site` preview launch config). Confirm:

- `admin/dashboard.html` loads with no console errors (redirects to login when unauthenticated, as expected).
- All syntax/balance checks from Tasks 2, 5, and 6 still pass.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual steps required before this feature works end-to-end (report to user, do not attempt yourself)**

1. Run `supabase/outbound-email-tracking-schema.sql` in the Supabase SQL editor (requires `supabase/assessments-schema.sql` already applied, which it is).
2. Deploy both functions: `supabase functions deploy send-group-email` (redeploy — its response shape changed) and `supabase functions deploy resend-webhook` (new).
3. In the Resend dashboard, create a Webhook pointing at the deployed `resend-webhook` function's URL (visible in the Supabase dashboard's Edge Functions list after deploying), subscribed to at least `email.delivered`, `email.opened`, `email.bounced`, `email.complained`.
4. Copy the signing secret Resend generates for that webhook and add it as `RESEND_WEBHOOK_SECRET` in Supabase → Project Settings → Edge Functions → Secrets.

- [ ] **Step 4: Manual verification on staging (after the user completes Step 3's prerequisites)**

1. Log in as admin, go to Small Groups, click "Email All Leaders" (or "Email Group" on a specific group), send a test email to an address you control.
2. Click the new "Email History" button — confirm the send appears at the top, expanded, with every recipient showing "Pending".
3. Wait a minute or two (webhook events arrive asynchronously), then reopen Email History (or just re-click the button to refresh) — confirm the test recipient's status updated to "Delivered", and to "Opened" once you actually open the email.
4. Confirm a small_group_leader-role test account (if available) sees Email History scoped to only their own group's sends, and does **not** see the "Email All Leaders" button (unchanged, pre-existing behavior) but **does** see "Email History".
5. Confirm sending still works normally end-to-end even before the webhook is configured (i.e. Task 7 Step 3's prerequisites are optional for sending to keep working, just for status to update) — this validates the "failure here doesn't block the send" error-handling decision.

- [ ] **Step 5: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
