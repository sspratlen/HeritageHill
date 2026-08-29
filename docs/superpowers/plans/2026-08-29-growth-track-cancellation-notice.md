# Growth Track Cancellation Notice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an admin cancels a Growth Track occurrence that has registrants, immediately open a pre-filled, editable email compose modal so the admin can review and send (or skip) an apology notice that encourages registering for the next available occurrence — plus a separate, standalone Mailchimp-importable template for broader manual use.

**Architecture:** `toggleGtOccurrence` (already in `admin/dashboard.html`) gains a post-cancel step that looks up registrants for the cancelled date and opens a new compose modal (`gtCancelEmailModal`), styled and wired the same way the existing "Email Group" modal already works in this file, but with its own state/functions since the sender logic differs. Sending reuses the existing `send-group-email` Edge Function verbatim — no backend changes. A second, independent file (`email-templates/growth-track-cancellation.html`) is added to the existing Mailchimp template library, following that library's established conventions; it is not referenced by any app code.

**Tech Stack:** Static HTML/JS, Supabase Postgres + existing Resend-backed `send-group-email` Edge Function, Quill rich-text editor (already loaded via CDN in `admin/dashboard.html`), no build step — verification is via `node --check`-style syntax checks, HTML tag-balance checks, and manual browser verification.

---

### Task 1: Compose modal HTML

**Files:**
- Modify: `admin/dashboard.html` (insert a new modal after the existing `groupEmailModal`, before the `<!-- Delete confirm modal -->` comment)

- [ ] **Step 1: Insert the new modal**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```html
    <div class="modal-footer">
      <span id="groupEmailRecipientCount" style="font-size:.82rem;color:var(--text-muted);margin-right:auto;"></span>
      <button class="btn btn-ghost" onclick="closeGroupEmailModal()">Cancel</button>
      <button class="btn btn-primary" id="groupEmailSendBtn" onclick="sendGroupEmail()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Send Email
      </button>
    </div>
  </div>
</div>


<!-- Delete confirm modal -->
```

Replace with:

```html
    <div class="modal-footer">
      <span id="groupEmailRecipientCount" style="font-size:.82rem;color:var(--text-muted);margin-right:auto;"></span>
      <button class="btn btn-ghost" onclick="closeGroupEmailModal()">Cancel</button>
      <button class="btn btn-primary" id="groupEmailSendBtn" onclick="sendGroupEmail()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Send Email
      </button>
    </div>
  </div>
</div>


<!-- Growth Track cancellation notice modal -->
<div class="modal-overlay" id="gtCancelEmailModal" onclick="if(event.target===this)closeGtCancelEmailModal()">
  <div class="modal modal-lg" style="max-width:780px;">
    <div class="modal-header">
      <h3 id="gtCancelEmailTitle">Notify Registrants</h3>
      <button class="modal-close" onclick="closeGtCancelEmailModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="field" style="margin-bottom:16px;">
        <label>From</label>
        <div style="font-size:.88rem;color:var(--text);background:var(--bg-subtle,#f4f4f2);border:1px solid var(--border,#e4e4e4);border-radius:8px;padding:9px 12px;">
          <strong>Heritage Hill Church</strong> &lt;noreply@heritagehill.church&gt;
        </div>
      </div>
      <div class="field" style="margin-bottom:16px;">
        <label>To <span style="font-size:.78rem;color:var(--text-muted);font-weight:400;">— pre-filled from this occurrence's registrants. Edit as needed, one email per line or comma-separated. Each person receives their own copy.</span></label>
        <textarea class="group-email-recipients" id="gtCancelEmailTo" placeholder="member@example.com, another@example.com" oninput="updateGtCancelEmailCount()"></textarea>
      </div>
      <div class="field" style="margin-bottom:16px;">
        <label>Subject</label>
        <input type="text" id="gtCancelEmailSubject" placeholder="e.g. About Us — Sep 6 Session Cancelled" />
      </div>
      <div class="field" style="margin-bottom:4px;">
        <label style="margin-bottom:8px;display:block;">Message</label>
        <div id="gtCancelEmailEditor"></div>
      </div>
      <p id="gtCancelEmailError" style="color:var(--danger);font-size:.82rem;margin-top:10px;display:none;"></p>
    </div>
    <div class="modal-footer">
      <span id="gtCancelEmailRecipientCount" style="font-size:.82rem;color:var(--text-muted);margin-right:auto;"></span>
      <button class="btn btn-ghost" onclick="closeGtCancelEmailModal()">Cancel</button>
      <button class="btn btn-primary" id="gtCancelEmailSendBtn" onclick="sendGtCancelEmail()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        Send Email
      </button>
    </div>
  </div>
</div>


<!-- Delete confirm modal -->
```

- [ ] **Step 2: Verify div/tag balance**

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
Expected: `BALANCED`. Mandatory before committing any HTML change to this file.

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Growth Track cancellation notice compose modal HTML"
```

---

### Task 2: Trigger + content generation + send logic

**Files:**
- Modify: `admin/dashboard.html` (`toggleGtOccurrence`, plus new functions inserted immediately after it)

- [ ] **Step 1: Extend `toggleGtOccurrence` and add the new functions**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```js
async function toggleGtOccurrence(part, sessionDate, shouldCancel) {
  const result = shouldCancel
    ? await SupaDB.adminCancelGrowthTrackOccurrence(part, sessionDate)
    : await SupaDB.adminReinstateGrowthTrackOccurrence(part, sessionDate);
  if (result.error) { showToast(result.error, true); return; }
  showToast(shouldCancel ? 'Occurrence cancelled' : 'Occurrence reinstated');
  renderGrowthTrackTab();
}
```

Replace with:

```js
async function toggleGtOccurrence(part, sessionDate, shouldCancel) {
  const result = shouldCancel
    ? await SupaDB.adminCancelGrowthTrackOccurrence(part, sessionDate)
    : await SupaDB.adminReinstateGrowthTrackOccurrence(part, sessionDate);
  if (result.error) { showToast(result.error, true); return; }
  showToast(shouldCancel ? 'Occurrence cancelled' : 'Occurrence reinstated');
  renderGrowthTrackTab();
  if (shouldCancel) {
    // adminGetGrowthTrackRegistrations already fails open (returns [] on error,
    // logging internally) — so a lookup failure here simply means the modal
    // doesn't open, without blocking the cancellation that already succeeded above.
    const allRegs = await SupaDB.adminGetGrowthTrackRegistrations(part);
    const affected = allRegs.filter(r => r.sessionDate === sessionDate);
    if (affected.length) openGtCancelEmailModal(part, sessionDate, affected);
  }
}

/* ── GROWTH TRACK CANCELLATION EMAIL ─────────────────────── */
let _gtCancelEmailQuill = null;

// Finds the next occurrence of this part that isn't the one just cancelled and
// isn't itself already cancelled. Looks 12 occurrences ahead (double the 6 shown
// in the admin card) so a candidate is very unlikely to be missed even if several
// consecutive months are cancelled. Excludes `justCancelledDate` explicitly rather
// than relying solely on `_gtCancellationsAdmin`, since that array is refreshed by
// `renderGrowthTrackTab()` earlier in the same toggle flow and this function may
// run before or after that refresh completes.
function nextGtOccurrenceAfterCancel(p, justCancelledDate) {
  const occurrences = computeGrowthTrackOccurrences(p.sundayOfMonth, 12);
  return occurrences.find(date =>
    date !== justCancelledDate &&
    !_gtCancellationsAdmin.some(c => c.part === p.part && c.sessionDate === date)
  ) || null;
}

function buildGtCancelEmailContent(p, sessionDate) {
  const title = p.title || GT_LABELS[p.part];
  const shortDate = new Date(sessionDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
  const longDate = new Date(sessionDate+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  const nextDate = nextGtOccurrenceAfterCancel(p, sessionDate);
  const nextDateLong = nextDate ? new Date(nextDate+'T00:00:00').toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : null;
  const subject = `${title} — ${shortDate} Session Cancelled`;
  const nextParagraph = nextDateLong
    ? `<p>We'd love to have you join us for the next one — <strong>${escapeHtml(nextDateLong)}</strong>. You can register at <a href="https://heritagehill.church/growth-track.html">heritagehill.church/growth-track.html</a>.</p>`
    : `<p>Keep an eye on <a href="https://heritagehill.church/growth-track.html">heritagehill.church/growth-track.html</a> for the next upcoming date.</p>`;
  const html = `<p>Hi there,</p>
<p>We're sorry to let you know that the <strong>${escapeHtml(title)}</strong> session on <strong>${escapeHtml(longDate)}</strong> has been cancelled.</p>
${nextParagraph}
<p>Sorry for the inconvenience, and we hope to see you soon!</p>
<p>— Heritage Hill Church</p>`;
  return { subject, html };
}

async function openGtCancelEmailModal(part, sessionDate, registrants) {
  const p = _gtPartsAdmin.find(x => x.part === part);
  if (!p) return;
  const { subject, html } = buildGtCancelEmailContent(p, sessionDate);
  document.getElementById('gtCancelEmailTitle').textContent = 'Notify Registrants';
  document.getElementById('gtCancelEmailSubject').value = subject;
  document.getElementById('gtCancelEmailTo').value = [...new Set(registrants.map(r => r.email).filter(Boolean))].join('\n');
  document.getElementById('gtCancelEmailError').style.display = 'none';
  updateGtCancelEmailCount();

  // Init Quill once, reset content on reopen (matches the existing groupEmailModal pattern)
  if (!_gtCancelEmailQuill) {
    _gtCancelEmailQuill = new Quill('#gtCancelEmailEditor', {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link'],
          ['clean'],
        ],
      },
    });
  } else {
    _gtCancelEmailQuill.setContents([]);
  }
  _gtCancelEmailQuill.root.innerHTML = html;

  document.getElementById('gtCancelEmailModal').classList.add('open');
}
function closeGtCancelEmailModal() { document.getElementById('gtCancelEmailModal').classList.remove('open'); }

function updateGtCancelEmailCount() {
  const raw = document.getElementById('gtCancelEmailTo').value;
  const count = raw.split(/[\n,]+/).map(e => e.trim()).filter(e => e.includes('@')).length;
  document.getElementById('gtCancelEmailRecipientCount').textContent = count ? `${count} recipient${count !== 1 ? 's' : ''}` : '';
}

async function sendGtCancelEmail() {
  const toRaw = document.getElementById('gtCancelEmailTo').value;
  const recipients = toRaw.split(/[\n,]+/).map(e => e.trim()).filter(e => e.includes('@'));
  const subject = document.getElementById('gtCancelEmailSubject').value.trim();
  const htmlBody = _gtCancelEmailQuill ? _gtCancelEmailQuill.root.innerHTML : '';
  const errEl = document.getElementById('gtCancelEmailError');
  errEl.style.display = 'none';

  if (!recipients.length) { errEl.textContent = 'Add at least one recipient email.'; errEl.style.display = ''; return; }
  if (!subject)           { errEl.textContent = 'Subject is required.';              errEl.style.display = ''; return; }
  if (!htmlBody || htmlBody === '<p><br></p>') { errEl.textContent = 'Message cannot be empty.'; errEl.style.display = ''; return; }

  const btn = document.getElementById('gtCancelEmailSendBtn');
  btn.disabled = true; btn.innerHTML = 'Sending…';

  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/send-group-email', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        htmlBody,
        recipients,
        fromName: 'Heritage Hill Church',
        fromEmail: 'noreply@heritagehill.church',
        replyTo: '',
      }),
    });
    const json = await res.json();
    if (json.error) { errEl.textContent = 'Error: ' + json.error; errEl.style.display = ''; return; }
    closeGtCancelEmailModal();
    showToast(`Email sent to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''} ✓`);
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message; errEl.style.display = '';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Send Email';
  }
}
```

`escapeHtml` (defined earlier in this same file), `computeGrowthTrackOccurrences` (defined in `js/main.js`, loaded by this page), `_gtCancellationsAdmin` and `_gtPartsAdmin` (module-level state already populated by `renderGrowthTrackTab`), `showToast`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY` are all already defined/in scope elsewhere in this file — no new imports needed.

- [ ] **Step 2: Verify JS syntax**

Run:
```bash
node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK
```
Expected: `SYNTAX_OK`

- [ ] **Step 3: Verify div/tag balance is unchanged**

Run the same balance-check command from Task 1, Step 2 (this task only touches `<script>` content, so the div count should be identical to Task 1's result).
Expected: `BALANCED`

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Open cancellation notice modal when a Growth Track occurrence with registrants is cancelled"
```

---

### Task 3: Mailchimp-importable cancellation template

**Files:**
- Create: `email-templates/growth-track-cancellation.html`

- [ ] **Step 1: Write the template file**

This follows the exact structural conventions of the existing `email-templates/announcements.html` (table-based layout, `mc:edit` editable regions, required `*|UNSUB|*`/`*|UPDATE_PROFILE|*` merge tags, same header/footer/brand styling), scoped to a single cancellation-notice message instead of a multi-announcement digest.

```html
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Heritage Hill Church — Class Cancelled</title>
  <!--[if mso]>
  <noscript>
    <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  </noscript>
  <![endif]-->
  <style>
    /* ── Reset ── */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; display: block; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }

    /* ── Mobile ── */
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .hero-title { font-size: 26px !important; line-height: 1.25 !important; }
      .mp { padding: 24px 20px !important; }
    }
  </style>
</head>

<body style="margin:0; padding:0; background-color:#F0EDE8; word-break:break-word;">

<!-- ── Pre-header (hidden preview text) ── -->
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
  <mc:edit name="preheader">An update about an upcoming Growth Track session.</mc:edit>
  &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>

<!-- ── Outer wrapper ── -->
<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#F0EDE8;">
<tr><td align="center" style="padding:24px 12px;">

  <!-- ── Email container ── -->
  <table role="presentation" class="email-container" cellspacing="0" cellpadding="0" border="0" width="600" style="margin:0 auto; max-width:600px;">


    <!-- ══════════════════════════════════════
         HEADER
    ══════════════════════════════════════ -->
    <tr>
      <td style="background-color:#0D0F14; border-radius:16px 16px 0 0; padding:28px 40px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td style="vertical-align:middle;">
              <img src="https://heritagehill.church/assets/logos/logo-left-full-white.png"
                   alt="Heritage Hill Church"
                   width="200"
                   style="max-width:200px; height:auto; display:block;" />
            </td>
            <td align="right" style="vertical-align:middle;">
              <span style="font-family:Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.45);">GROWTH TRACK</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ══════════════════════════════════════
         HERO
    ══════════════════════════════════════ -->
    <tr>
      <td style="background-color:#BC7A1E; padding:40px 40px 36px;" class="mp">
        <p style="font-family:Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:rgba(255,255,255,0.7); margin:0 0 10px;">
          <mc:edit name="eyebrow">Session Cancelled</mc:edit>
        </p>
        <h1 class="hero-title" style="font-family:Georgia,'Times New Roman',serif; font-size:32px; font-weight:700; line-height:1.2; color:#ffffff; margin:0 0 16px;">
          <mc:edit name="hero_heading">We're Sorry — This Session Has Been Cancelled</mc:edit>
        </h1>
        <p style="font-family:Arial,sans-serif; font-size:16px; line-height:1.6; color:rgba(255,255,255,0.88); margin:0;">
          <mc:edit name="hero_intro">We know this is disappointing, and we're sorry for the short notice. Here are the details, and where to find the next date.</mc:edit>
        </p>
      </td>
    </tr>


    <!-- ══════════════════════════════════════
         CANCELLATION DETAILS
    ══════════════════════════════════════ -->
    <tr>
      <td style="background-color:#ffffff; padding:36px 40px 0;" class="mp">

        <p style="font-family:Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:#BC7A1E; margin:0 0 10px;">
          <mc:edit name="class_label">Growth Track</mc:edit>
        </p>

        <h2 style="font-family:Georgia,'Times New Roman',serif; font-size:24px; font-weight:700; line-height:1.25; color:#1C1C1E; margin:0 0 14px;">
          <mc:edit name="class_title">About Us</mc:edit>
        </h2>

        <p style="font-family:Arial,sans-serif; font-size:15px; line-height:1.7; color:#4A4A4A; margin:0 0 6px;">
          <strong style="color:#1C1C1E;">Originally scheduled for:</strong>
          <mc:edit name="cancelled_date">September 6, 2026</mc:edit>
        </p>

        <p style="font-family:Arial,sans-serif; font-size:15px; line-height:1.7; color:#4A4A4A; margin:18px 0 30px;">
          <mc:edit name="cancellation_body">We had to cancel this particular session. If you had signed up, no action is needed on your part — we just want to make sure you know before you head over. We'd love to see you at the next one.</mc:edit>
        </p>

      </td>
    </tr>


    <!-- ══════════════════════════════════════
         NEXT DATE HIGHLIGHT
    ══════════════════════════════════════ -->
    <tr>
      <td style="background-color:#ffffff; padding:0 40px 36px;" class="mp">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:#fdf6ec; border-radius:0 8px 8px 0;">
          <tr>
            <td style="border-left:4px solid #BC7A1E; padding:20px 24px;">
              <p style="font-family:Arial,sans-serif; font-size:14px; font-weight:700; color:#92400e; margin:0 0 8px;">
                <mc:edit name="next_date_heading">Join Us Next Time</mc:edit>
              </p>
              <p style="font-family:Arial,sans-serif; font-size:14px; line-height:1.7; color:#1C1C1E; margin:0 0 16px;">
                <mc:edit name="next_date_body">The next session is coming up soon — check the Growth Track page for the exact date and to save your spot.</mc:edit>
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="border-radius:10px; background-color:#BC7A1E;">
                    <a href="https://heritagehill.church/growth-track.html"
                       style="font-family:Arial,sans-serif; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; padding:12px 26px; display:inline-block; border-radius:10px;">
                      <mc:edit name="cta_button">Register for the Next Session →</mc:edit>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ══════════════════════════════════════
         SERVICE TIMES STRIP
    ══════════════════════════════════════ -->
    <tr>
      <td style="background-color:#0D0F14; padding:28px 40px;" class="mp">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
          <tr>
            <td width="50%" style="vertical-align:middle; padding-right:20px;">
              <p style="font-family:Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.45); margin:0 0 4px;">Join Us Every Sunday</p>
              <p style="font-family:Georgia,'Times New Roman',serif; font-size:20px; font-weight:700; color:#ffffff; margin:0;">10:30 AM</p>
            </td>
            <td width="50%" style="vertical-align:middle; border-left:1px solid rgba(255,255,255,0.1); padding-left:20px;">
              <p style="font-family:Arial,sans-serif; font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.45); margin:0 0 4px;">We're Located At</p>
              <p style="font-family:Arial,sans-serif; font-size:13px; color:rgba(255,255,255,0.75); margin:0; line-height:1.5;">6909 Cornhusker Rd<br>Papillion, NE 68133</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>


    <!-- ══════════════════════════════════════
         FOOTER
    ══════════════════════════════════════ -->
    <tr>
      <td style="background-color:#0D0F14; border-top:1px solid rgba(255,255,255,0.08); border-radius:0 0 16px 16px; padding:24px 40px 32px; text-align:center;" class="mp">

        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto 20px;">
          <tr>
            <td style="padding:0 8px;">
              <a href="https://www.facebook.com"
                 style="font-family:Arial,sans-serif; font-size:12px; font-weight:700; color:rgba(255,255,255,0.5); text-decoration:none; letter-spacing:0.05em;">FACEBOOK</a>
            </td>
            <td style="padding:0 8px; color:rgba(255,255,255,0.2); font-family:Arial,sans-serif; font-size:12px;">|</td>
            <td style="padding:0 8px;">
              <a href="https://www.instagram.com"
                 style="font-family:Arial,sans-serif; font-size:12px; font-weight:700; color:rgba(255,255,255,0.5); text-decoration:none; letter-spacing:0.05em;">INSTAGRAM</a>
            </td>
            <td style="padding:0 8px; color:rgba(255,255,255,0.2); font-family:Arial,sans-serif; font-size:12px;">|</td>
            <td style="padding:0 8px;">
              <a href="https://heritagehill.church"
                 style="font-family:Arial,sans-serif; font-size:12px; font-weight:700; color:rgba(255,255,255,0.5); text-decoration:none; letter-spacing:0.05em;">WEBSITE</a>
            </td>
          </tr>
        </table>

        <!-- Required Mailchimp merge tags — do not remove -->
        <p style="font-family:Arial,sans-serif; font-size:11px; line-height:1.6; color:rgba(255,255,255,0.3); margin:0;">
          Heritage Hill Church · 6909 Cornhusker Rd, Papillion, NE 68133<br>
          You're receiving this because you subscribed at heritagehill.church.<br>
          <a href="*|UNSUB|*" style="color:rgba(255,255,255,0.45); text-decoration:underline;">Unsubscribe</a>
          &nbsp;·&nbsp;
          <a href="*|UPDATE_PROFILE|*" style="color:rgba(255,255,255,0.45); text-decoration:underline;">Update preferences</a>
        </p>

      </td>
    </tr>


  </table>
  <!-- / Email container -->

</td></tr>
</table>
<!-- / Outer wrapper -->

</body>
</html>
```

- [ ] **Step 2: Verify it's well-formed HTML**

Run:
```bash
node -e "
const fs = require('fs');
const content = fs.readFileSync('email-templates/growth-track-cancellation.html', 'utf8');
const opens = (content.match(/<table/g) || []).length;
const closes = (content.match(/<\/table>/g) || []).length;
console.log('table opens:', opens, 'closes:', closes, opens === closes ? 'BALANCED' : 'MISMATCH');
const divOpens = (content.match(/<div/g) || []).length;
const divCloses = (content.match(/<\/div>/g) || []).length;
console.log('div opens:', divOpens, 'closes:', divCloses, divOpens === divCloses ? 'BALANCED' : 'MISMATCH');
"
```
Expected: both lines print `BALANCED`.

- [ ] **Step 3: Commit**

```bash
git add email-templates/growth-track-cancellation.html
git commit -m "Add Mailchimp-importable Growth Track cancellation template"
```

---

### Task 4: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (the project's existing `static-site` preview launch config). Confirm:

- `admin/dashboard.html` loads with no console errors (redirects to login when unauthenticated, as expected — this is normal and matches every prior task in this codebase's session history).
- The new `<div id="gtCancelEmailModal">` and its child elements exist in the page source (visible via view-source or a DOM query), even though exercising the full compose flow requires an authenticated admin session and cannot be smoke-tested unauthenticated.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

1. Log into `admin/dashboard.html`, open the Growth Track tab.
2. Pick a part with at least one occurrence that has a registrant showing a non-zero count in the "Registrants" column (from the earlier recurring-schedule feature's per-occurrence counts).
3. Click "Cancel" on that specific occurrence.
4. Confirm: the occurrence immediately shows as cancelled (strikethrough, "Reinstate" button) — this part of the flow is unchanged from before.
5. Confirm: the "Notify Registrants" modal opens automatically, with:
   - Subject pre-filled as `<Part Title> — <short date> Session Cancelled`.
   - To field pre-filled with that occurrence's registrant email(s).
   - Message pre-filled with an apology mentioning the cancelled date and, if a future non-cancelled occurrence exists, a specific next date with a link to the Growth Track page.
6. Edit the subject/body/recipients to confirm the fields are freely editable.
7. Click "Send Email" — confirm a success toast appears and the modal closes.
8. Check the inbox for one of the test recipient addresses (or a Resend delivery log, if available) to confirm the email arrived and reads correctly.
9. Cancel a different occurrence that has **zero** registrants — confirm the occurrence cancels normally and the modal does **not** open (no registrants to notify).
10. Click "Reinstate" on a previously-cancelled occurrence — confirm the modal does **not** open (this feature only triggers on cancel, not reinstate).

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
