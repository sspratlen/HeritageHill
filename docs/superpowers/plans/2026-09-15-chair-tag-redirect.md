# Chair Tag Dynamic Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff tap a chair's NFC tag and land wherever the admin panel currently points — Welcome, Give, Message Notes, Prayer, or any custom URL — switched live during a service, with a per-section design (one section, "Main Auditorium", live now; more addable later without code changes).

**Architecture:** A public Supabase Edge Function (`tap-redirect`) resolves a section's current destination from Postgres and issues a true HTTP 302 — no intermediate page. Four new tables (`tap_sections`, `tap_links`, `tap_current`, `tap_events`) hold the section list, the saved-preset link library, the live per-section pointer, and a tap analytics log. A new standalone admin page (`admin/tap-control.html`) lets an admin switch the destination with one tap and manage the saved links, gated by the same Supabase Auth + admin-role pattern used by `admin/dashboard.html`.

**Tech Stack:** Static HTML/JS, Supabase Postgres + Edge Functions (Deno), following this codebase's existing `SupaDB` client-layer pattern in `js/db.js`. No build step — verification is via `node --check`-style syntax checks and manual browser/tag testing (this repo has no automated test suite).

**Spec:** `docs/superpowers/specs/2026-09-15-chair-tag-redirect-design.md`

---

### Task 1: Database migration

**Files:**
- Create: `supabase/tap-redirect-schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Chair Tag Dynamic Redirect: sections, saved links, current
-- destination per section, and a tap analytics log.
-- Staging-only for now (project govvofbrhhpowtdnuzcw) — see
-- docs/superpowers/specs/2026-09-15-chair-tag-redirect-design.md
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- Depends on: public.is_admin() (created in
-- supabase/assessments-schema.sql)
-- ============================================================

create table if not exists public.tap_sections (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tap_links (
  id         uuid primary key default gen_random_uuid(),
  label      text not null unique,
  url        text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tap_current (
  section_id uuid primary key references public.tap_sections(id) on delete cascade,
  link_id    uuid references public.tap_links(id) on delete set null,
  custom_url text,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.tap_events (
  id             uuid primary key default gen_random_uuid(),
  section_id     uuid not null references public.tap_sections(id) on delete cascade,
  resolved_url   text not null,
  resolved_label text,
  tapped_at      timestamptz not null default now()
);

create index if not exists tap_events_section_tapped_at_idx
  on public.tap_events (section_id, tapped_at desc);

alter table public.tap_sections enable row level security;
alter table public.tap_links    enable row level security;
alter table public.tap_current  enable row level security;
alter table public.tap_events   enable row level security;

-- Sections, links, and the live pointer are admin-managed only, per the
-- design spec's access-control decision (no "Service Operator" role yet).
drop policy if exists "Admins manage tap sections" on public.tap_sections;
create policy "Admins manage tap sections" on public.tap_sections
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage tap links" on public.tap_links;
create policy "Admins manage tap links" on public.tap_links
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage tap current" on public.tap_current;
create policy "Admins manage tap current" on public.tap_current
  for all using (public.is_admin()) with check (public.is_admin());

-- tap_events is written only by the tap-redirect Edge Function using the
-- service-role key (which bypasses RLS entirely) — this policy only
-- covers the admin panel's read of the tap-count stat.
drop policy if exists "Admins view tap events" on public.tap_events;
create policy "Admins view tap events" on public.tap_events
  for select using (public.is_admin());

-- Seed data: one section, four starter saved links, and a default
-- current destination so the very first tap after setup doesn't hit
-- the homepage fallback.
insert into public.tap_sections (slug, name)
values ('main-auditorium', 'Main Auditorium')
on conflict (slug) do nothing;

insert into public.tap_links (label, url, sort_order)
values
  ('Welcome / Connect', 'https://heritagehill.church/', 1),
  ('Give', 'https://heritagehill.church/give.html', 2),
  ('Message Notes', 'https://heritagehill.church/', 3),
  ('Prayer', 'https://heritagehill.church/prayer.html', 4)
on conflict (label) do nothing;

insert into public.tap_current (section_id, link_id, updated_by)
select s.id, l.id, 'system'
from public.tap_sections s, public.tap_links l
where s.slug = 'main-auditorium' and l.label = 'Welcome / Connect'
on conflict (section_id) do nothing;
```

- [ ] **Step 2: Run the migration on staging**

This must be run by the user in the Supabase SQL editor for the **staging** project (`govvofbrhhpowtdnuzcw`) — this session has no authenticated Supabase MCP access. Paste the full contents of `supabase/tap-redirect-schema.sql` into the SQL editor and run it.

Expected: no errors; a `select * from public.tap_sections;` afterward returns one row (`main-auditorium` / "Main Auditorium"), `select * from public.tap_links;` returns 4 rows, and `select * from public.tap_current;` returns 1 row with `link_id` pointing at the "Welcome / Connect" link.

- [ ] **Step 3: Commit**

```bash
git add supabase/tap-redirect-schema.sql
git commit -m "Add chair-tag redirect database schema (staging only)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Edge Function

**Files:**
- Create: `supabase/functions/tap-redirect/index.ts`

- [ ] **Step 1: Write the function**

```typescript
// Supabase Edge Function: tap-redirect
// Public, unauthenticated endpoint hit directly by a phone's browser when
// someone taps an NFC chair tag. Resolves the tapped section's CURRENT
// destination (set live from admin/tap-control.html) and issues a true
// HTTP 302 -- no intermediate page. Every failure path falls back to the
// site homepage so a guest never sees a raw error.
// Deploy with --no-verify-jwt (see deployment note below) -- this
// codebase's other public GET endpoint, the `youtube` function, is
// called from js/db.js with no Authorization header at all, which only
// works because it was deployed the same way.
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both
// auto-injected by Supabase for every Edge Function).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FALLBACK_URL = 'https://heritagehill.church/'

serve(async (req: Request) => {
  const fallback = () => Response.redirect(FALLBACK_URL, 302)

  try {
    const url = new URL(req.url)
    const section = url.searchParams.get('section')
    if (!section) return fallback()

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: sectionRow } = await admin.from('tap_sections')
      .select('id').eq('slug', section).maybeSingle()
    if (!sectionRow) return fallback()

    const { data: current } = await admin.from('tap_current')
      .select('link_id, custom_url').eq('section_id', sectionRow.id).maybeSingle()
    if (!current) return fallback()

    let destUrl: string | null = null
    let destLabel: string | null = null

    if (current.custom_url) {
      destUrl = current.custom_url
    } else if (current.link_id) {
      const { data: link } = await admin.from('tap_links')
        .select('label, url').eq('id', current.link_id).maybeSingle()
      if (link) { destUrl = link.url; destLabel = link.label }
    }

    if (!destUrl) return fallback()

    // Best-effort analytics log -- a logging failure must never block or
    // fail the redirect itself.
    try {
      await admin.from('tap_events').insert({
        section_id: sectionRow.id, resolved_url: destUrl, resolved_label: destLabel,
      })
    } catch (logErr) {
      console.error('[tap-redirect] tap_events insert failed:', logErr)
    }

    return Response.redirect(destUrl, 302)

  } catch (e: unknown) {
    console.error('[tap-redirect]', e instanceof Error ? e.message : String(e))
    return fallback()
  }
})
```

- [ ] **Step 2: Deploy to staging**

This requires the user's own Supabase CLI session (this session has no authenticated Supabase MCP access):

```bash
supabase functions deploy tap-redirect --no-verify-jwt --project-ref govvofbrhhpowtdnuzcw
```

The `--no-verify-jwt` flag is required — without it, Supabase's platform rejects every unauthenticated request (including every real NFC tap, which carries no Authorization header) with a 401 before the function code ever runs.

- [ ] **Step 3: Manual smoke test**

In a browser, visit:
`https://govvofbrhhpowtdnuzcw.supabase.co/functions/v1/tap-redirect?section=main-auditorium`

Expected: redirects to `https://heritagehill.church/` (the seeded "Welcome / Connect" link's URL from Task 1's seed data).

Then visit the same URL with a bad section:
`https://govvofbrhhpowtdnuzcw.supabase.co/functions/v1/tap-redirect?section=nope`

Expected: also redirects to `https://heritagehill.church/` (fallback path).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/tap-redirect/index.ts
git commit -m "Add tap-redirect Edge Function for chair tag NFC redirects (staging only)" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: SupaDB client methods

**Files:**
- Modify: `js/db.js` (add a new section before the file's closing `};`, after the existing `/* ── YouTube ── */` block)

- [ ] **Step 1: Add the tap-redirect methods**

Insert this block into `js/db.js`, immediately before the final `};` that closes the `SupaDB` object (the line directly after the existing `getLatestYouTubeVideos` method's closing `},`):

```javascript

/* ── Tap Redirect (Chair Tags) ──────────────────────────── */
  async getTapSections() {
    if (!db()) return [];
    const { data, error } = await db().from('tap_sections').select('*').order('name');
    if (error) { console.error('[SupaDB] getTapSections:', error.message); return []; }
    return (data || []).map(r => ({ id: r.id, slug: r.slug, name: r.name }));
  },
  async getTapLinks() {
    if (!db()) return [];
    const { data, error } = await db().from('tap_links').select('*').order('sort_order');
    if (error) { console.error('[SupaDB] getTapLinks:', error.message); return []; }
    return (data || []).map(r => ({ id: r.id, label: r.label, url: r.url, sortOrder: r.sort_order }));
  },
  async adminSaveTapLink(link) {
    if (!db()) return { error: 'Not configured' };
    const row = { label: link.label, url: link.url, sort_order: link.sortOrder || 0 };
    if (link.id) row.id = link.id;
    const { data, error } = await db().from('tap_links').upsert(row).select().single();
    if (error) return { error: error.message };
    return { id: data.id, label: data.label, url: data.url, sortOrder: data.sort_order };
  },
  async adminDeleteTapLink(id) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('tap_links').delete().eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  },
  async getTapCurrent(sectionId) {
    if (!db()) return null;
    const { data, error } = await db().from('tap_current').select('*').eq('section_id', sectionId).maybeSingle();
    if (error) { console.error('[SupaDB] getTapCurrent:', error.message); return null; }
    if (!data) return null;
    let label = null, url = null;
    if (data.custom_url) {
      url = data.custom_url;
    } else if (data.link_id) {
      const { data: link } = await db().from('tap_links').select('label,url').eq('id', data.link_id).maybeSingle();
      if (link) { label = link.label; url = link.url; }
    }
    return {
      sectionId: data.section_id, linkId: data.link_id, customUrl: data.custom_url,
      updatedAt: data.updated_at, updatedBy: data.updated_by, label, url,
    };
  },
  async adminSetTapCurrentLink(sectionId, linkId, updatedBy) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('tap_current').upsert({
      section_id: sectionId, link_id: linkId, custom_url: null,
      updated_at: new Date().toISOString(), updated_by: updatedBy,
    });
    if (error) return { error: error.message };
    return { success: true };
  },
  async adminSetTapCurrentCustomUrl(sectionId, url, updatedBy) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('tap_current').upsert({
      section_id: sectionId, link_id: null, custom_url: url,
      updated_at: new Date().toISOString(), updated_by: updatedBy,
    });
    if (error) return { error: error.message };
    return { success: true };
  },
  async getTapEventStats(sectionId, sinceIso) {
    if (!db()) return { today: 0, sinceChange: 0 };
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const { data, error } = await db().from('tap_events')
      .select('tapped_at').eq('section_id', sectionId)
      .gte('tapped_at', startOfToday.toISOString())
      .order('tapped_at', { ascending: false });
    if (error) { console.error('[SupaDB] getTapEventStats:', error.message); return { today: 0, sinceChange: 0 }; }
    const rows = data || [];
    const sinceChange = sinceIso ? rows.filter(r => r.tapped_at >= sinceIso).length : rows.length;
    return { today: rows.length, sinceChange };
  },
```

- [ ] **Step 2: Verify syntax**

```bash
node --check js/db.js && echo OK
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add js/db.js
git commit -m "Add SupaDB methods for the chair-tag redirect system" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Admin control page

**Files:**
- Create: `admin/tap-control.html`

- [ ] **Step 1: Write the full page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chair Tag Control | Heritage Hill Church Admin</title>
  <link rel="icon" href="../assets/logos/logo-icon-color-white.png" />
  <link rel="manifest" href="../manifest.json" />
  <link rel="apple-touch-icon" href="../assets/pwa/apple-touch-icon.png" />
  <meta name="theme-color" content="#BC7A1E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --primary: #BC7A1E; --primary-light: rgba(188,122,30,.1);
      --secondary: #155CA2;
      --bg: #F4F4F2; --bg-card: #fff;
      --text: #1C1C1E; --text-muted: #6B6B6B;
      --border: #E4E4E4;
      --success: #16a34a; --danger: #ef4444;
      --radius: 12px; --shadow: 0 2px 14px rgba(0,0,0,.07);
    }
    body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }

    .topbar {
      background: #111318; padding: 0 20px; height: 58px;
      display: flex; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 50;
    }
    .topbar-left { display: flex; align-items: center; gap: 16px; }
    .topbar-back {
      display: inline-flex; align-items: center; gap: 6px;
      color: rgba(255,255,255,.6); text-decoration: none; font-size: .85rem; font-weight: 500;
      transition: color .2s;
    }
    .topbar-back:hover { color: #fff; }
    .topbar-title { color: #fff; font-size: 1rem; font-weight: 700; }
    .topbar-badge { font-size: .78rem; background: rgba(188,122,30,.2); color: #e8a84a; border-radius: 50px; padding: 3px 10px; font-weight: 600; }

    .page { max-width: 560px; margin: 0 auto; padding: 24px 18px 56px; }
    .loading { max-width: 560px; margin: 60px auto; text-align: center; color: var(--text-muted); font-size: .95rem; }
    .error-box {
      background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
      border-radius: var(--radius); padding: 16px 18px; font-size: .88rem; margin-bottom: 20px;
    }

    .card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; margin-bottom: 18px; }
    .card h2 { font-size: .95rem; font-weight: 700; margin-bottom: 12px; }

    .section-label { font-size: .78rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; margin-bottom: 4px; }
    .section-name { font-size: 1.1rem; font-weight: 700; margin-bottom: 18px; }

    .current-label { font-size: .78rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; }
    .current-value { font-size: 1.4rem; font-weight: 700; color: var(--primary); margin: 4px 0 6px; word-break: break-word; }
    .current-url { font-size: .8rem; color: var(--text-muted); word-break: break-all; margin-bottom: 8px; }
    .current-meta { font-size: .75rem; color: var(--text-muted); }

    .preset-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 16px; }
    .preset-btn {
      background: var(--bg); border: 2px solid var(--border); border-radius: var(--radius);
      padding: 18px 12px; font-family: inherit; font-size: .92rem; font-weight: 700; color: var(--text);
      cursor: pointer; min-height: 64px; transition: all .15s;
    }
    .preset-btn:hover { border-color: var(--primary); }
    .preset-btn.active { background: var(--primary); border-color: var(--primary); color: #fff; }

    .custom-row { display: flex; gap: 8px; margin-top: 16px; }
    .custom-row input {
      flex: 1; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px;
      font-family: inherit; font-size: .88rem;
    }
    .btn { padding: 10px 16px; border-radius: 8px; border: none; font-family: inherit; font-weight: 700; font-size: .85rem; cursor: pointer; white-space: nowrap; }
    .btn-primary { background: var(--primary); color: #fff; }
    .btn-secondary { background: var(--bg); color: var(--text); border: 1px solid var(--border); }
    .btn-danger { background: var(--danger); color: #fff; }
    .btn-sm { padding: 6px 12px; font-size: .78rem; }

    .manage-toggle { background: none; border: none; color: var(--secondary); font-family: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; padding: 4px 0; }
    .manage-body { display: none; margin-top: 14px; }
    .manage-body.open { display: block; }
    .link-row { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .link-row:last-child { border-bottom: none; }
    .link-row-info { flex: 1; min-width: 0; }
    .link-row-label { font-size: .85rem; font-weight: 700; }
    .link-row-url { font-size: .72rem; color: var(--text-muted); word-break: break-all; }
    .add-link-form { display: flex; flex-direction: column; gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
    .add-link-form input { padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; font-size: .85rem; }

    .stats-row { display: flex; gap: 18px; font-size: .85rem; color: var(--text-muted); }
    .stats-row strong { color: var(--text); }
    .refresh-link { background: none; border: none; color: var(--secondary); font-family: inherit; font-size: .8rem; font-weight: 600; cursor: pointer; }

    .tag-url-box { font-size: .74rem; color: var(--text-muted); background: var(--bg); border-radius: 8px; padding: 10px 12px; word-break: break-all; margin-top: 8px; }

    .toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px);
      background: #111; color: #fff; padding: 12px 20px; border-radius: 8px; font-size: .85rem;
      opacity: 0; pointer-events: none; transition: all .25s; z-index: 200; max-width: 90vw;
    }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
  </style>
</head>
<body>

<div class="topbar">
  <div class="topbar-left">
    <a href="dashboard.html" class="topbar-back">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      Dashboard
    </a>
    <span style="color:rgba(255,255,255,.2);">|</span>
    <span class="topbar-title">Chair Tag Control</span>
  </div>
  <span class="topbar-badge">Admin</span>
</div>

<div class="loading" id="loadingMsg">Loading…</div>

<div class="page" id="pageContent" style="display:none;">

  <div id="errorBox"></div>

  <div class="card" id="sectionCard" style="display:none;">
    <div class="section-label" id="sectionLabelWrap">Section</div>
    <div class="section-name" id="sectionName">–</div>

    <div class="current-label">Currently pointing to</div>
    <div class="current-value" id="currentLabel">–</div>
    <div class="current-url" id="currentUrl"></div>
    <div class="current-meta" id="currentMeta"></div>

    <div class="preset-grid" id="presetGrid"></div>

    <div class="custom-row">
      <input type="text" id="customUrlInput" placeholder="Or paste any URL…" />
      <button class="btn btn-primary" onclick="setCustomUrl()">Set</button>
    </div>
  </div>

  <div class="card" id="manageCard" style="display:none;">
    <button class="manage-toggle" onclick="toggleManage()" id="manageToggleBtn">Manage saved links ▾</button>
    <div class="manage-body" id="manageBody">
      <div id="linkRows"></div>
      <div class="add-link-form">
        <input type="text" id="newLinkLabel" placeholder="Label (e.g. Baptism Sign-Up)" />
        <input type="text" id="newLinkUrl" placeholder="https://…" />
        <button class="btn btn-secondary btn-sm" onclick="addLink()" style="align-self:flex-start;">+ Add saved link</button>
      </div>
    </div>
  </div>

  <div class="card" id="statsCard" style="display:none;">
    <h2>Today's taps</h2>
    <div class="stats-row">
      <span><strong id="statToday">0</strong> today</span>
      <span><strong id="statSinceChange">0</strong> since last change</span>
      <button class="refresh-link" onclick="refreshStats()">↻ Refresh</button>
    </div>
    <div class="tag-url-box" id="tagUrlBox"></div>
    <button class="btn btn-secondary btn-sm" onclick="copyTagUrl()" style="margin-top:10px;">Copy tag URL</button>
  </div>

</div>

<div class="toast" id="toast"></div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
<script src="../js/supabase-client.js"></script>
<script src="../js/db.js"></script>
<script>
let _user = null;
let _section = null;
let _links = [];
let _current = null;

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = isError ? '#dc2626' : '#111';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/* ── Auth guard + boot ── */
(async () => {
  try {
    _user = await SupaDB.getUser();
    if (!_user) { window.location.href = 'login.html?next=tap-control.html'; return; }
    const roleData = await SupaDB.getUserRoleByEmail(_user.email);
    if (!roleData || roleData.role === 'small_group_leader') { window.location.href = 'my-profile.html'; return; }
    if (roleData.role !== 'admin') { window.location.href = 'dashboard.html'; return; }
    await init();
  } catch (err) {
    document.getElementById('loadingMsg').textContent = 'Error loading page: ' + err.message;
  }
})();

async function init() {
  const sections = await SupaDB.getTapSections();
  document.getElementById('loadingMsg').style.display = 'none';
  document.getElementById('pageContent').style.display = 'block';

  if (!sections.length) {
    document.getElementById('errorBox').innerHTML =
      '<div class="error-box">No tap sections configured yet — run supabase/tap-redirect-schema.sql in the Supabase SQL editor first.</div>';
    return;
  }

  _section = sections.find(s => s.slug === 'main-auditorium') || sections[0];
  document.getElementById('sectionCard').style.display = 'block';
  document.getElementById('manageCard').style.display = 'block';
  document.getElementById('statsCard').style.display = 'block';
  document.getElementById('sectionName').textContent = _section.name;

  await loadLinks();
  await loadCurrent();
  await refreshStats();

  document.getElementById('tagUrlBox').textContent =
    `${SUPABASE_URL}/functions/v1/tap-redirect?section=${_section.slug}`;
}

async function loadLinks() {
  _links = await SupaDB.getTapLinks();
  renderPresetGrid();
  renderManageList();
}

async function loadCurrent() {
  _current = await SupaDB.getTapCurrent(_section.id);
  document.getElementById('currentLabel').textContent = _current
    ? (_current.label || 'Custom link')
    : 'Not set (falls back to homepage)';
  document.getElementById('currentUrl').textContent = _current ? _current.url : '';
  document.getElementById('currentMeta').textContent = _current && _current.updatedAt
    ? `Updated ${new Date(_current.updatedAt).toLocaleString()} by ${_current.updatedBy || 'unknown'}`
    : '';
  renderPresetGrid();
}

function renderPresetGrid() {
  const grid = document.getElementById('presetGrid');
  grid.innerHTML = _links.map(l => `
    <button class="preset-btn ${_current && _current.linkId === l.id ? 'active' : ''}" onclick="selectPreset('${l.id}')">
      ${escapeHtml(l.label)}
    </button>
  `).join('');
}

async function selectPreset(linkId) {
  const link = _links.find(l => l.id === linkId);
  const result = await SupaDB.adminSetTapCurrentLink(_section.id, linkId, _user.email);
  if (result.error) { showToast('Error: ' + result.error, true); return; }
  await loadCurrent();
  showToast(`✓ Switched to ${link ? link.label : 'link'}`);
}

async function setCustomUrl() {
  const input = document.getElementById('customUrlInput');
  const url = input.value.trim();
  if (!url || !/^https?:\/\//i.test(url)) {
    showToast('Enter a full URL starting with http:// or https://', true);
    return;
  }
  const result = await SupaDB.adminSetTapCurrentCustomUrl(_section.id, url, _user.email);
  if (result.error) { showToast('Error: ' + result.error, true); return; }
  input.value = '';
  await loadCurrent();
  showToast('✓ Custom URL set');
}

function toggleManage() {
  const body = document.getElementById('manageBody');
  const btn = document.getElementById('manageToggleBtn');
  const open = body.classList.toggle('open');
  btn.textContent = open ? 'Manage saved links ▴' : 'Manage saved links ▾';
}

function renderManageList() {
  const wrap = document.getElementById('linkRows');
  if (!_links.length) { wrap.innerHTML = '<p style="font-size:.82rem;color:var(--text-muted);">No saved links yet.</p>'; return; }
  wrap.innerHTML = _links.map(l => `
    <div class="link-row">
      <div class="link-row-info">
        <div class="link-row-label">${escapeHtml(l.label)}</div>
        <div class="link-row-url">${escapeHtml(l.url)}</div>
      </div>
      <button class="btn btn-secondary btn-sm" onclick="deleteLink('${l.id}','${escapeHtml(l.label).replace(/'/g,"\\'")}')">Delete</button>
    </div>
  `).join('');
}

async function addLink() {
  const label = document.getElementById('newLinkLabel').value.trim();
  const url = document.getElementById('newLinkUrl').value.trim();
  if (!label || !url) { showToast('Label and URL are both required.', true); return; }
  if (!/^https?:\/\//i.test(url)) { showToast('URL must start with http:// or https://', true); return; }
  const result = await SupaDB.adminSaveTapLink({ label, url, sortOrder: _links.length + 1 });
  if (result.error) { showToast('Error: ' + result.error, true); return; }
  document.getElementById('newLinkLabel').value = '';
  document.getElementById('newLinkUrl').value = '';
  await loadLinks();
  showToast(`✓ "${label}" saved`);
}

async function deleteLink(id, label) {
  if (!confirm(`Delete the saved link "${label}"? This won't change what's currently live if it's selected.`)) return;
  const result = await SupaDB.adminDeleteTapLink(id);
  if (result.error) { showToast('Error: ' + result.error, true); return; }
  await loadLinks();
  showToast('Link deleted.');
}

async function refreshStats() {
  const stats = await SupaDB.getTapEventStats(_section.id, _current ? _current.updatedAt : null);
  document.getElementById('statToday').textContent = stats.today;
  document.getElementById('statSinceChange').textContent = stats.sinceChange;
}

function copyTagUrl() {
  const url = `${SUPABASE_URL}/functions/v1/tap-redirect?section=${_section.slug}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Tag URL copied!');
  }).catch(() => {
    showToast('Could not copy — your browser blocked clipboard access.', true);
  });
}
</script>
</body>
</html>
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/tap-control.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_tapcontrol_check.js', scripts.join('\n;\n'));
"
node --check /tmp/_tapcontrol_check.js && echo OK
rm -f /tmp/_tapcontrol_check.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add admin/tap-control.html
git commit -m "Add admin/tap-control.html for switching the live chair-tag redirect" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Sidebar discoverability link

**Files:**
- Modify: `admin/dashboard.html:310-314`

- [ ] **Step 1: Add a link in the sidebar footer**

Current content at `admin/dashboard.html:310-314`:

```html
  <div class="sidebar-footer">
    <a href="../index.html" target="_blank">
      <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      View Website
    </a>
```

Replace with (adds a "Chair Tag Control" link right after "View Website", opening in a new tab the same way):

```html
  <div class="sidebar-footer">
    <a href="../index.html" target="_blank">
      <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      View Website
    </a>
    <a href="tap-control.html" target="_blank">
      <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M10 12h4M17 10v4"/></svg>
      Chair Tag Control
    </a>
```

This link only appears for whoever can see the sidebar footer (already limited to logged-in staff via the page's own auth guard); `admin/tap-control.html` has its own separate admin-only auth guard from Task 4, so a non-admin staff member clicking this link is redirected away by that page's own guard rather than relying on this link being hidden.

- [ ] **Step 2: Verify syntax**

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

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Link Chair Tag Control from the admin sidebar" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end verification and physical tag setup

This task is manual verification plus physical setup — no further code changes.

- [ ] **Step 1: Push the branch to staging**

```bash
git push staging claude/loving-darwin-e8d5ea:main
```

- [ ] **Step 2: Verify the admin panel loads and switches**

- Log into `admin/dashboard.html` on staging as an admin, click "Chair Tag Control" in the sidebar footer.
- Confirm the page shows "Main Auditorium", a current destination ("Welcome / Connect"), and 4 preset buttons.
- Tap the "Give" preset. Confirm the "Currently pointing to" value updates to "Give" immediately and the button highlights.
- Paste a custom URL (e.g. `https://heritagehill.church/prayer.html`) into the custom URL box and click Set. Confirm it becomes the current destination and no preset button shows as active.
- Add a new saved link via "Manage saved links", confirm it appears as a new preset button.
- Delete that saved link, confirm the button disappears.

- [ ] **Step 3: Verify the redirect itself**

With the admin panel's current destination set to "Give", visit `https://govvofbrhhpowtdnuzcw.supabase.co/functions/v1/tap-redirect?section=main-auditorium` directly in a browser. Confirm it redirects to `give.html`. Switch the panel to "Prayer" and repeat — confirm the redirect target changes within a few seconds (no caching lag).

- [ ] **Step 4: Verify tap analytics**

After a few manual redirect-URL visits from Step 3, reload `admin/tap-control.html` and confirm "Today's taps" reflects those visits, and "since last change" resets to a lower count after switching the destination again.

- [ ] **Step 5: Write the physical tags**

Using a free NFC-writing Android app (e.g. "NFC Tools" — not TagMo, which is built for Amiibo/game-console emulation despite the tag product listing mentioning it), write all 24 NTAG215 tags with a URI/URL NDEF record containing the exact URL shown in the admin panel's "Copy tag URL" button:

`https://govvofbrhhpowtdnuzcw.supabase.co/functions/v1/tap-redirect?section=main-auditorium`

Test by tapping a real written tag with a phone and confirming it lands on the admin panel's current destination.

- [ ] **Step 6: Report back**

Confirm to the user: staging deployment is live, the panel works, and the exact tag URL to write onto all 24 tags.
