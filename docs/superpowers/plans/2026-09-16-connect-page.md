# Connect Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public page at `heritagehill.church/connect` that captures a visitor's name/email/phone into the existing people backbone (same as every other form on the site), offers optional on-the-spot account creation, shows a "you're already here" version of the What to Expect content, and gives staff a simple contacted-tracking follow-up list.

**Architecture:** Zero new auth/identity logic — the page calls the existing `upsertPerson`/`recordMilestone`/`signUpMember` RPCs and flows already used by every other form and by `admin/register.html`. One new table (`connect_submissions`) holds the staff-facing follow-up record with a `contacted` flag, following the same shape as the existing `signups` table. A new admin tab under the Found stage in `admin/dashboard.html` lists and updates it.

**Tech Stack:** Static HTML/JS, Supabase Postgres (direct RLS-protected table access, no Edge Function needed), following this codebase's existing `SupaDB` client-layer pattern. No build step — verification is via `node --check`-style syntax checks and manual browser testing.

**Spec:** `docs/superpowers/specs/2026-09-16-connect-page-design.md`

---

### Task 1: Database migration

**Files:**
- Create: `supabase/connect-submissions-schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Connect page submissions: staff follow-up tracking for the
-- digital "Scan to Connect" card at heritagehill.church/connect.
-- Staging-only for now (project govvofbrhhpowtdnuzcw) — see
-- docs/superpowers/specs/2026-09-16-connect-page-design.md
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Depends on: public.is_admin() (created in
-- supabase/assessments-schema.sql), public.people (created in
-- supabase/people-backbone-schema.sql)
-- ============================================================

create table if not exists public.connect_submissions (
  id           bigint generated always as identity primary key,
  person_id    uuid references public.people(id) on delete set null,
  name         text not null,
  email        text not null,
  phone        text not null default '',
  contacted    boolean not null default false,
  contacted_at timestamptz,
  contacted_by text,
  created_at   timestamptz not null default now()
);

alter table public.connect_submissions enable row level security;

-- Public (unauthenticated) visitors submit the card.
drop policy if exists "Public can submit connect cards" on public.connect_submissions;
create policy "Public can submit connect cards"
  on public.connect_submissions for insert
  with check (true);

-- Only admins can read or update submissions (contact info, tighter than
-- this app's older tables which use a blanket authenticated-role check).
drop policy if exists "Admins view connect submissions" on public.connect_submissions;
create policy "Admins view connect submissions"
  on public.connect_submissions for select
  using (public.is_admin());

drop policy if exists "Admins update connect submissions" on public.connect_submissions;
create policy "Admins update connect submissions"
  on public.connect_submissions for update
  using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: Run the migration on staging**

This must be run by the user (or via an authenticated Supabase MCP session) against the **staging** project (`govvofbrhhpowtdnuzcw`) — never production. Paste the full contents of `supabase/connect-submissions-schema.sql` into the Supabase SQL editor (or apply via the Supabase MCP `apply_migration` tool) and run it.

Expected: no errors; `select * from public.connect_submissions;` returns an empty table with the columns above.

- [ ] **Step 3: Commit**

```bash
git add supabase/connect-submissions-schema.sql
git commit -m "Add connect_submissions database schema (staging only)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: SupaDB client methods

**Files:**
- Modify: `js/db.js` (add a mapper near the top alongside `signupFromDb`, and a new methods section near the end alongside the Tap Redirect block)

- [ ] **Step 1: Add the `connectSubmissionFromDb` mapper**

Insert this immediately after the existing `signupToDb` function (which ends with a `}` on its own line, right before `function applicationFromDb(r) {`):

```javascript
function connectSubmissionFromDb(r) {
  return {
    id: r.id, personId: r.person_id, name: r.name, email: r.email, phone: r.phone || '',
    contacted: !!r.contacted, contactedAt: r.contacted_at || null, contactedBy: r.contacted_by || '',
    createdAt: r.created_at,
  };
}
```

- [ ] **Step 2: Add the Connect methods**

Insert this new section into `js/db.js`, immediately before the final `};` that closes the `SupaDB` object (i.e. right after the `/* ── Tap Redirect (Chair Tags) ── */` section's last method, `getTapEventStats`, and its closing `},`):

```javascript

/* ── PUBLIC: Connect Page ───────────────────────────────── */
  async submitConnectCard({ name, email, phone }) {
    if (!db()) return { error: 'Not configured' };
    try {
      const personId = await this.upsertPerson({ name, email, phone });
      const { error } = await db().from('connect_submissions').insert({
        person_id: personId, name, email, phone: phone || '',
      });
      if (error) throw error;
      if (personId) this.recordMilestone(personId, 'connect_card_submitted');
      return { success: true };
    } catch(e) { console.error('[SupaDB] submitConnectCard:', e.message); return { error: e.message }; }
  },

/* ── ADMIN: Connect Submissions ─────────────────────────── */
  async adminGetConnectSubmissions() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('connect_submissions').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(connectSubmissionFromDb);
    } catch(e) { console.error('[SupaDB] adminGetConnectSubmissions:', e.message); return []; }
  },
  async adminMarkConnectContacted(id, contacted, contactedBy) {
    if (!db()) return { error: 'Not configured' };
    try {
      const updates = contacted
        ? { contacted: true, contacted_at: new Date().toISOString(), contacted_by: contactedBy || '' }
        : { contacted: false, contacted_at: null, contacted_by: null };
      const { error } = await db().from('connect_submissions').update(updates).eq('id', id);
      if (error) throw error;
      return { success: true };
    } catch(e) { console.error('[SupaDB] adminMarkConnectContacted:', e.message); return { error: e.message }; }
  },
```

- [ ] **Step 3: Verify syntax**

```bash
node --check js/db.js && echo OK
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add js/db.js
git commit -m "Add SupaDB methods for the connect page" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: The `/connect` page

**Files:**
- Create: `connect/index.html`

This gives a clean URL (`heritagehill.church/connect`), matching the existing `mensretreat/index.html` directory-page precedent. All relative paths use `../` since this file is one directory deep.

- [ ] **Step 1: Write the full page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connect | Heritage Hill Church</title>
  <meta name="description" content="Let us know you stopped by, and see what to expect during your visit to Heritage Hill Church in Papillion, Nebraska." />
  <link rel="icon" href="../assets/logos/logo-icon-color-white.png" />
  <link rel="manifest" href="../manifest.json" />
  <link rel="apple-touch-icon" href="../assets/pwa/apple-touch-icon.png" />
  <meta name="theme-color" content="#BC7A1E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/style.css" />
</head>
<body>

<!-- ── Announcement Bar (content loaded dynamically from admin) ── -->
<div id="announcementBar" class="announcement-bar" style="display:none"></div>

<nav id="navbar" class="scrolled">
  <div class="container nav-inner">
    <a href="../index.html" class="nav-logo">
      <img src="../assets/logos/logo-left-full-white.png"
           alt="Heritage Hill Church"
           onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'" />
      <span style="display:none; font-size:1.15rem; font-weight:700; color:var(--primary);">Heritage Hill</span>
    </a>
    <div class="nav-links">
      <a href="../about.html">About Us</a>
      <a href="../events.html">Events</a>
      <a href="../small-groups.html">Small Groups</a>
      <a href="../growth-track.html">Growth Track</a>
      <a href="../sermons.html">Watch</a>
      <a href="../give.html">Give</a>
    </div>
    <a href="../admin/login.html" class="btn btn-ghost btn-sm" id="navLoginBtn">Login</a>
    <a href="#connect-card" class="btn btn-primary btn-sm nav-cta">Connect</a>
    <button class="nav-hamburger" id="hamburger" aria-label="Toggle menu" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>
<div class="nav-mobile" id="mobileNav">
  <a href="../about.html">About Us</a>
  <a href="../events.html">Events</a>
  <a href="../small-groups.html">Small Groups</a>
  <a href="../growth-track.html">Growth Track</a>
  <a href="../sermons.html">Watch</a>
  <a href="../give.html">Give</a>
  <a href="../admin/login.html" class="btn btn-ghost" id="navLoginBtnMobile">Login</a>
  <a href="#connect-card" class="btn btn-primary">Connect</a>
</div>

<!-- Hero -->
<div class="page-hero" style="padding-top:calc(var(--nav-h) + var(--bar-h));">
  <div class="page-hero-bg" style="background-image:url('../assets/church/awelcome-web.jpg');"></div>
  <div class="page-hero-overlay"></div>
  <div class="container page-hero-content">
    <h1>You're Here — Let's Connect</h1>
    <p>Take 20 seconds to let us know you stopped by.</p>
  </div>
</div>

<!-- Connect Card -->
<section class="section" id="connect-card">
  <div class="container" style="max-width:560px;">
    <div style="background:#fff; border-radius:var(--radius-lg); padding:40px; border:1px solid var(--border); box-shadow:0 8px 32px rgba(0,0,0,.08);">
      <form id="connectForm" onsubmit="handleConnectSubmit(event)">
        <!-- Honeypot: hidden from real users, bots fill it -->
        <div style="position:absolute;left:-9999px;height:0;overflow:hidden;" aria-hidden="true">
          <input type="text" id="ccHoneypot" name="website" tabindex="-1" autocomplete="off" />
        </div>
        <input type="hidden" id="ccLoadedAt" />
        <h2 style="margin-bottom:.5rem;">Let's Connect</h2>
        <p style="margin-bottom:1.5rem;color:var(--text-muted);">Just the basics — we'll take it from here.</p>
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label for="ccName" style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.35rem;">Name</label>
            <input type="text" id="ccName" required
              style="width:100%;box-sizing:border-box;padding:.65rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;" />
          </div>
          <div>
            <label for="ccEmail" style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.35rem;">Email</label>
            <input type="email" id="ccEmail" required
              style="width:100%;box-sizing:border-box;padding:.65rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;" />
          </div>
          <div>
            <label for="ccPhone" style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.35rem;">Phone (optional)</label>
            <input type="tel" id="ccPhone"
              style="width:100%;box-sizing:border-box;padding:.65rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;" />
          </div>
          <button type="submit" id="ccBtn" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:.5rem;">Connect</button>
          <p id="ccError" style="color:#dc2626;font-size:.82rem;margin:0;display:none;"></p>
        </div>
      </form>
      <div id="connectSuccess" style="display:none;text-align:center;">
        <p style="font-size:2rem;margin-bottom:8px;">✅</p>
        <h2 style="margin-bottom:.5rem;">Thanks for Connecting!</h2>
        <p style="color:var(--text-muted);margin-bottom:1.75rem;">We're so glad you're here. Someone from our team may reach out soon.</p>
        <div id="accountOfferCard" style="border-top:1px solid var(--border);padding-top:1.75rem;">
          <h3 style="margin-bottom:.5rem;">Want Full Access?</h3>
          <p style="font-size:.9rem;color:var(--text-muted);margin-bottom:1rem;">Create an account to track your journey, join groups, and give online.</p>
          <form id="createAccountForm" onsubmit="handleCreateAccount(event)">
            <input type="password" id="caPassword" placeholder="Choose a password (8+ characters)" autocomplete="new-password" required
              style="width:100%;box-sizing:border-box;padding:.65rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;margin-bottom:12px;" />
            <button type="submit" id="caBtn" class="btn btn-primary" style="width:100%;justify-content:center;">Create My Account</button>
            <p id="caError" style="color:#dc2626;font-size:.82rem;margin:8px 0 0;display:none;"></p>
          </form>
          <button type="button" onclick="document.getElementById('accountOfferCard').style.display='none';" class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-top:10px;">Maybe Later</button>
        </div>
        <div id="accountConfirmCard" style="display:none;border-top:1px solid var(--border);padding-top:1.75rem;">
          <h3 style="margin-bottom:.5rem;">Check Your Email</h3>
          <p style="font-size:.9rem;color:var(--text-muted);">We sent a confirmation link to <strong id="caConfirmEmail"></strong>. Click it, then sign in any time.</p>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- What to Expect -->
<section class="section">
  <div class="container">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:64px; align-items:start;" data-reveal>
      <div>
        <span class="section-label">While You're Here</span>
        <h2>What to Expect Today</h2>
        <p style="margin:1rem 0 1.5rem;">A few things worth knowing during your visit.</p>
        <div style="display:flex; flex-direction:column; gap:20px;">
          <div style="display:flex; gap:16px; align-items:flex-start;">
            <div style="width:36px; height:36px; border-radius:50%; background:rgba(188,122,30,.12); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--primary); font-weight:700;">1</div>
            <div>
              <h4 style="margin-bottom:.35rem;">You've Already Been Welcomed</h4>
              <p style="font-size:.9rem;">Our greeters are real people who are genuinely glad you're here — not scripted salespeople. Need directions anywhere in the building? Just ask.</p>
            </div>
          </div>
          <div style="display:flex; gap:16px; align-items:flex-start;">
            <div style="width:36px; height:36px; border-radius:50%; background:rgba(188,122,30,.12); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--primary); font-weight:700;">2</div>
            <div>
              <h4 style="margin-bottom:.35rem;">Your Kids Are Taken Care Of</h4>
              <p style="font-size:.9rem;">Safe, fun, age-appropriate kids ministry is running right now for birth through 5th grade.</p>
            </div>
          </div>
          <div style="display:flex; gap:16px; align-items:flex-start;">
            <div style="width:36px; height:36px; border-radius:50%; background:rgba(188,122,30,.12); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--primary); font-weight:700;">3</div>
            <div>
              <h4 style="margin-bottom:.35rem;">Come As You Are</h4>
              <p style="font-size:.9rem;">No dress code, no performance required. Whatever you're wearing right now is exactly right.</p>
            </div>
          </div>
          <div style="display:flex; gap:16px; align-items:flex-start;">
            <div style="width:36px; height:36px; border-radius:50%; background:rgba(188,122,30,.12); display:flex; align-items:center; justify-content:center; flex-shrink:0; color:var(--primary); font-weight:700;">4</div>
            <div>
              <h4 style="margin-bottom:.35rem;">No Pressure, Ever</h4>
              <p style="font-size:.9rem;">We won't ask you to stand up, introduce yourself, or put your hand in the air. Just relax, experience, and see if Heritage Hill feels like home.</p>
            </div>
          </div>
        </div>
      </div>
      <div>
        <div style="border-radius:var(--radius-lg); overflow:hidden; margin-bottom:24px; box-shadow:0 4px 20px rgba(0,0,0,.1);">
          <img src="../assets/church/checkin-web.jpg" alt="Welcome desk at Heritage Hill" style="width:100%; display:block; object-fit:cover; max-height:260px;" loading="lazy" />
        </div>
        <div style="background:var(--bg-soft); border-radius:var(--radius-lg); padding:36px; border:1px solid var(--border);">
          <h3 style="margin-bottom:1.5rem;">Service Times &amp; Location</h3>
          <div style="display:flex; flex-direction:column; gap:16px;">
            <div style="padding:18px; background:#fff; border-radius:var(--radius); border:1px solid var(--border);">
              <h4 style="color:var(--primary); margin-bottom:.35rem;">Sunday 10:30 AM</h4>
              <p style="font-size:.875rem;">All ages welcome · Children's service provided after worship</p>
            </div>
          </div>
          <div style="margin-top:24px; padding-top:24px; border-top:1px solid var(--border);">
            <h4 style="margin-bottom:12px;">We're located at:</h4>
            <p style="font-size:.9rem; margin-bottom:.5rem;">6909 Cornhusker Rd<br>Papillion, NE 68133</p>
            <p style="font-size:.9rem; margin-bottom:1rem;"><a href="tel:4023318900" style="color:var(--primary); font-weight:600;">(402) 331-8900</a></p>
            <a href="https://maps.google.com/?q=6909+Cornhusker+Rd+Papillion+NE+68133" target="_blank" rel="noopener" class="btn btn-primary" style="width:100%; justify-content:center;">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              Get Directions
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</section>

<footer id="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="footer-logo">
          <img src="../assets/logos/logo-left-full-dark.png" alt="Heritage Hill Church" onerror="this.style.display='none'" />
        </div>
        <p>A Church of the Nazarene in Papillion, Nebraska. We're a community of Jesus followers — come as you are; you belong here.</p>
      </div>
      <div class="footer-col">
        <h5>Navigate</h5>
        <ul>
          <li><a href="../index.html">Home</a></li>
          <li><a href="../about.html">About Us</a></li>
          <li><a href="../events.html">Events</a></li>
          <li><a href="../small-groups.html">Small Groups</a></li>
          <li><a href="../prayer.html">Prayer</a></li>
          <li><a href="../sermons.html">Watch</a></li>
          <li><a href="../give.html">Give</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h5>Ministries</h5>
        <ul>
          <li><a href="../small-groups.html">Small Groups</a></li>
          <li><a href="#">Children's Ministry</a></li>
          <li><a href="#">Youth Ministry</a></li>
          <li><a href="#">Women's Ministry</a></li>
          <li><a href="#">Men's Ministry</a></li>
        </ul>
      </div>
      <div class="footer-col footer-contact">
        <h5>Contact Us</h5>
        <p><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>6909 Cornhusker Rd, Papillion, NE 68133</p>
        <p><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.73 8.7 19.79 19.79 0 01.67 4.1 2 2 0 012.63 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L7.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg><a href="tel:4023318900">(402) 331-8900</a></p>
        <p><svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>Sun 10:30 AM</p>
      </div>
    </div>
    <hr class="footer-divider" />
    <div class="footer-bottom">
      <p>&copy; <span id="footerYear"></span> Heritage Hill Church · Papillion, Nebraska</p>
      <p><a href="../admin/login.html" style="color:rgba(255,255,255,.2); font-size:.75rem;">Admin</a></p>
    </div>
  </div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="../js/supabase-client.js"></script>
<script src="../js/db.js"></script>
<script src="../js/main.js"></script>
<script>
  document.getElementById('footerYear').textContent = new Date().getFullYear();
  renderNavAvatar();
  // Stamp load time so we can reject instant (bot) submissions
  document.getElementById('ccLoadedAt').value = Date.now();

  let _connectName = '', _connectEmail = '', _connectPhone = '';

  async function handleConnectSubmit(e) {
    e.preventDefault();
    // Honeypot: bots fill this hidden field, humans never see it
    if (document.getElementById('ccHoneypot').value) return;
    // Time check: real humans take more than 2 seconds to fill a form
    if (Date.now() - parseInt(document.getElementById('ccLoadedAt').value || '0') < 2000) return;

    const name  = document.getElementById('ccName').value.trim();
    const email = document.getElementById('ccEmail').value.trim();
    const phone = document.getElementById('ccPhone').value.trim();
    const errEl = document.getElementById('ccError');
    const btn   = document.getElementById('ccBtn');
    errEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Connecting…';

    const result = await SupaDB.submitConnectCard({ name, email, phone });

    btn.disabled = false; btn.textContent = 'Connect';
    if (result.error) {
      errEl.textContent = "Something went wrong. Please try again, or just find a greeter — we'd love to meet you.";
      errEl.style.display = '';
      return;
    }
    _connectName = name; _connectEmail = email; _connectPhone = phone;
    document.getElementById('connectForm').style.display = 'none';
    document.getElementById('connectSuccess').style.display = '';
  }

  async function handleCreateAccount(e) {
    e.preventDefault();
    const pw = document.getElementById('caPassword').value;
    const errEl = document.getElementById('caError');
    const btn = document.getElementById('caBtn');
    errEl.style.display = 'none';
    if (pw.length < 8) {
      errEl.textContent = 'Password must be at least 8 characters.';
      errEl.style.display = '';
      return;
    }
    btn.disabled = true; btn.textContent = 'Creating…';
    const { session, error } = await SupaDB.signUpMember(_connectEmail, pw, {
      name: _connectName, phone: _connectPhone,
    });
    if (error) {
      errEl.textContent = /already|registered/i.test(error)
        ? 'An account with this email already exists — sign in instead.' : error;
      errEl.style.display = '';
      btn.disabled = false; btn.textContent = 'Create My Account';
      return;
    }
    if (session) {
      window.location.href = '../admin/my-profile.html';
    } else {
      document.getElementById('caConfirmEmail').textContent = _connectEmail;
      document.getElementById('accountOfferCard').style.display = 'none';
      document.getElementById('accountConfirmCard').style.display = '';
    }
  }
</script>
<script src="../js/banner.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('connect/index.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_connect_check.js', scripts.join('\n;\n'));
"
node --check /tmp/_connect_check.js && echo OK
rm -f /tmp/_connect_check.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add connect/index.html
git commit -m "Add the /connect page (staging only)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Admin Connect tab

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Add the sidebar link**

Find this block (the Events link under the Found stage, right before the Filled stage section begins):

```html
    <a onclick="switchTab('events')" id="sideEvents" data-tab="events" class="nav-sub">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Events
    </a>

    <div class="nav-section nav-stage" id="navSectionFilled">
```

Replace with (adds a "Connect" link right after Events, still inside the Found stage):

```html
    <a onclick="switchTab('events')" id="sideEvents" data-tab="events" class="nav-sub">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Events
    </a>
    <a onclick="switchTab('connect')" id="sideConnect" data-tab="connect" class="nav-sub">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
      Connect
    </a>

    <div class="nav-section nav-stage" id="navSectionFilled">
```

- [ ] **Step 2: Add the panel HTML**

Find the end of the Baptism panel (its closing `</div>` right before the Growth Track comment):

```html
      <div class="table-wrap" style="padding:20px;">
        <h3 style="font-size:.95rem;margin-bottom:4px;">Not Yet Baptized</h3>
        <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:4px;">Approved members with no baptism on record.</p>
        <div id="baptismNotYetBox"></div>
      </div>
    </div>

    <!-- GROWTH TRACK -->
```

Replace with (adds the new Connect panel right after Baptism's):

```html
      <div class="table-wrap" style="padding:20px;">
        <h3 style="font-size:.95rem;margin-bottom:4px;">Not Yet Baptized</h3>
        <p style="color:var(--text-muted);font-size:.85rem;margin-bottom:4px;">Approved members with no baptism on record.</p>
        <div id="baptismNotYetBox"></div>
      </div>
    </div>

    <!-- CONNECT -->
    <div class="tab-panel" id="panelConnect">
      <div class="action-bar">
        <h2>Connect Submissions</h2>
        <span id="connectCountLabel" style="margin-left:auto; font-size:.82rem; color:var(--text-muted);"></span>
      </div>
      <div class="table-wrap">
        <table><thead><tr><th>Name &amp; Contact</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody id="connectGrid"></tbody></table>
      </div>
      <div class="empty" id="connectEmpty" style="display:none;">
        <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
        <h3>No connect submissions yet</h3><p>When visitors submit the Connect card, they'll appear here.</p>
      </div>
    </div>

    <!-- GROWTH TRACK -->
```

- [ ] **Step 3: Add `connect` to `ROLE_TABS`, `ALL_TABS`, and `titles`**

Find:

```javascript
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users'],
  event_manager:       ['events','sermons','email'],
};
```

Replace with:

```javascript
const ROLE_TABS = {
  admin:               ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users'],
  event_manager:       ['events','sermons','email'],
};
```

Find:

```javascript
const ALL_TABS = ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users'];
```

Replace with:

```javascript
const ALL_TABS = ['people','baptism','groups','attendance','growthtrack','analytics','impactteams','events','connect','signups','applications','subscribers','prayer','retreat','sermons','email','settings','users'];
```

Find:

```javascript
  const titles = {events:'Events',groups:'Small Groups',signups:'Sign-Up Requests',applications:'Leader Applications',subscribers:'Newsletter Subscribers',prayer:'Prayer Requests',retreat:'Retreat 2026',attendance:'Attendance',sermons:'Sermons',email:'Email',settings:'Settings',users:'User Permissions',people:'Membership',baptism:'Baptism',analytics:'Analytics',growthtrack:'Growth Track',impactteams:'Impact Teams'};
```

Replace with:

```javascript
  const titles = {events:'Events',connect:'Connect Submissions',groups:'Small Groups',signups:'Sign-Up Requests',applications:'Leader Applications',subscribers:'Newsletter Subscribers',prayer:'Prayer Requests',retreat:'Retreat 2026',attendance:'Attendance',sermons:'Sermons',email:'Email',settings:'Settings',users:'User Permissions',people:'Membership',baptism:'Baptism',analytics:'Analytics',growthtrack:'Growth Track',impactteams:'Impact Teams'};
```

- [ ] **Step 4: Add the `switchTab` dispatcher entry**

Find:

```javascript
  if(tab==='events') renderEventsTable();
  else if(tab==='groups') renderGroupsTable();
```

Replace with:

```javascript
  if(tab==='events') renderEventsTable();
  else if(tab==='connect') renderConnectPanel();
  else if(tab==='groups') renderGroupsTable();
```

- [ ] **Step 5: Add the render/toggle functions**

Insert this new block immediately after the existing `toggleSignupContacted` function (which ends with `renderSignupsPanel();showToast(newVal?'Marked as contacted ✓':'Marked as uncontacted');}` followed by a closing `}`):

```javascript
let _cachedConnectSubmissions = [];
async function renderConnectPanel(){
  _cachedConnectSubmissions = await SupaDB.adminGetConnectSubmissions();
  const grid=document.getElementById('connectGrid'),empty=document.getElementById('connectEmpty');
  const countLabel=document.getElementById('connectCountLabel');
  countLabel.textContent=`${_cachedConnectSubmissions.length} submission${_cachedConnectSubmissions.length!==1?'s':''}`;
  if(!_cachedConnectSubmissions.length){grid.innerHTML='';empty.style.display='';}
  else{
    empty.style.display='none';
    grid.innerHTML=_cachedConnectSubmissions.map(c=>{
      const ds=c.createdAt?new Date(c.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
      return`<tr>
        <td><strong>${escapeHtml(c.name)}</strong><br><a href="mailto:${escapeHtml(c.email)}" style="font-size:.8rem;color:var(--primary);">${escapeHtml(c.email)}</a>${c.phone?`<br><span style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(c.phone)}</span>`:''}</td>
        <td style="font-size:.82rem;color:var(--text-muted);">${ds}</td>
        <td>${c.contacted?'<span class="badge badge-green">Contacted</span>':'<span class="badge badge-amber">New</span>'}</td>
        <td><button class="btn btn-sm ${c.contacted?'btn-ghost':'btn-success'}" onclick="toggleConnectContacted(${c.id})">${c.contacted?'↩ Mark Uncontacted':'✓ Mark Contacted'}</button></td>
      </tr>`;
    }).join('');
  }
}
async function toggleConnectContacted(id){
  const c=_cachedConnectSubmissions.find(c=>c.id===id);
  if(!c)return;
  const newVal=!c.contacted;
  await SupaDB.adminMarkConnectContacted(id, newVal, window._currentUser ? window._currentUser.email : '');
  renderConnectPanel();showToast(newVal?'Marked as contacted ✓':'Marked as uncontacted');
}
```

- [ ] **Step 6: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/dashboard.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_dashboard_check.js', scripts.join('\n;\n'));
"
node --check /tmp/_dashboard_check.js && echo OK
rm -f /tmp/_dashboard_check.js
```

Expected: `OK`

- [ ] **Step 7: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Connect Submissions tab to admin dashboard" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification

Manual verification, no further code changes.

- [ ] **Step 1: Push the branch to staging**

```bash
git push staging claude/loving-darwin-e8d5ea:main
```

- [ ] **Step 2: Apply the migration and confirm**

Apply `supabase/connect-submissions-schema.sql` to the staging project (`govvofbrhhpowtdnuzcw`) if not already done in Task 1. Confirm `public.connect_submissions` exists with RLS enabled and the three policies from Task 1.

- [ ] **Step 3: Submit the connect form**

Visit `https://sspratlen.github.io/HeritageHill-staging/connect/` (confirmed via `gh api repos/sspratlen/HeritageHill-staging/pages` — staging has no custom domain configured, unlike production's `heritagehill.church`). Submit the form with a test name/email/phone. Confirm:
- A `people` row exists for that email (or was updated if it already existed).
- A `connect_submissions` row was created with matching name/email/phone and `contacted = false`.
- A `person_milestones` row exists with `milestone = 'connect_card_submitted'` for that person.

- [ ] **Step 4: Test the account-creation offer**

On the success screen, submit a password via "Create My Account." Confirm either a redirect to `my-profile.html` with a working profile, or a "check your email" confirmation message — matching whichever behavior the staging Supabase project's email-confirmation setting produces (same as `register.html` already does).

- [ ] **Step 5: Test "Maybe Later"**

Repeat the connect form submission with a different test email, and this time click "Maybe Later" instead of creating an account. Confirm the account-offer section hides cleanly with no errors.

- [ ] **Step 6: Verify the admin tab**

Log into `admin/dashboard.html` on staging as admin. Confirm "Connect" appears under the Found stage sidebar section, and the tab lists the test submissions from Steps 3 and 5, newest first. Click "Mark Contacted" on one row, confirm the badge and button update, and that reloading the tab preserves the contacted state.

- [ ] **Step 7: Verify non-admin gating**

Confirm the Connect tab does not appear for the `event_manager` role (client-side), and that `adminGetConnectSubmissions`/`adminMarkConnectContacted` are blocked server-side by RLS for a non-admin session (e.g. by checking the Supabase logs or attempting the call as a non-admin user).

- [ ] **Step 8: Report back**

Confirm to the user: staging deployment is live at `https://sspratlen.github.io/HeritageHill-staging/connect/`, the connect flow works end-to-end, and that the final production URL (once approved and pushed to `origin`) will be the clean `https://heritagehill.church/connect` — worth noting explicitly since it's the production URL, not the staging one, that should go on any printed QR code or NFC tag.
