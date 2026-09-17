# Branded NFC Tap Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make NFC tag taps show a Heritage Hill-branded experience instead of a raw Supabase URL, by pointing tags at a new `tap/` landing page that resolves the destination via a background fetch instead of a visible redirect through Supabase.

**Architecture:** The existing `tap-redirect` Edge Function gains an opt-in `?format=json` response mode (default 302 behavior unchanged). A new static page, `tap/index.html`, is the NFC tag's actual target — it fetches the JSON-mode response and does a single top-level `location.replace()` straight to the real destination, so the Supabase URL never appears in the browser's address bar or history. The admin's tag-URL display is updated to show/copy this new branded URL.

**Tech Stack:** Static HTML/JS, Supabase Edge Functions (Deno). No build step — verification via `node --check`-style syntax checks and manual browser/curl testing.

**Spec:** `docs/superpowers/specs/2026-09-17-branded-tap-redirect-design.md`

---

### Task 1: Add JSON mode to the `tap-redirect` Edge Function

**Files:**
- Modify: `supabase/functions/tap-redirect/index.ts`

- [ ] **Step 1: Replace the whole file with the JSON-mode-aware version**

The whole file changes shape (response construction moves into a shared helper), so this step replaces the entire file content rather than a partial find/replace.

Find (the entire current file):

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

    const { data: sectionRow, error: sectionErr } = await admin.from('tap_sections')
      .select('id').eq('slug', section).maybeSingle()
    if (sectionErr) console.error('[tap-redirect] tap_sections lookup error:', sectionErr.message)
    if (!sectionRow) return fallback()

    const { data: current, error: currentErr } = await admin.from('tap_current')
      .select('link_id, custom_url').eq('section_id', sectionRow.id).maybeSingle()
    if (currentErr) console.error('[tap-redirect] tap_current lookup error:', currentErr.message)
    if (!current) return fallback()

    let destUrl: string | null = null
    let destLabel: string | null = null

    if (current.custom_url) {
      destUrl = current.custom_url
    } else if (current.link_id) {
      const { data: link, error: linkErr } = await admin.from('tap_links')
        .select('label, url').eq('id', current.link_id).maybeSingle()
      if (linkErr) console.error('[tap-redirect] tap_links lookup error:', linkErr.message)
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

Replace with:

```typescript
// Supabase Edge Function: tap-redirect
// Public, unauthenticated endpoint hit directly by a phone's browser when
// someone taps an NFC chair tag. Resolves the tapped section's CURRENT
// destination (set live from admin/tap-control.html) and issues a true
// HTTP 302 -- no intermediate page. Every failure path falls back to the
// site homepage so a guest never sees a raw error.
//
// Optional JSON mode: pass ?format=json to get back { url } as JSON (200)
// instead of a redirect. Used by the branded tap/ landing page so a
// guest's browser never navigates to this raw Supabase URL at all -- the
// landing page fetches this JSON in the background and does its own
// location.replace() straight to the real destination. Default behavior
// (no format param) is unchanged for any direct caller.
//
// Deploy with --no-verify-jwt (see deployment note below) -- this
// codebase's other public GET endpoint, the `youtube` function, is
// called from js/db.js with no Authorization header at all, which only
// works because it was deployed the same way.
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (both
// auto-injected by Supabase for every Edge Function).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FALLBACK_URL = 'https://heritagehill.church/'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = new URL(req.url)
  const asJson = url.searchParams.get('format') === 'json'
  const respond = (destUrl: string) => asJson
    ? Response.json({ url: destUrl }, { headers: CORS })
    : Response.redirect(destUrl, 302)
  const fallback = () => respond(FALLBACK_URL)

  try {
    const section = url.searchParams.get('section')
    if (!section) return fallback()

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: sectionRow, error: sectionErr } = await admin.from('tap_sections')
      .select('id').eq('slug', section).maybeSingle()
    if (sectionErr) console.error('[tap-redirect] tap_sections lookup error:', sectionErr.message)
    if (!sectionRow) return fallback()

    const { data: current, error: currentErr } = await admin.from('tap_current')
      .select('link_id, custom_url').eq('section_id', sectionRow.id).maybeSingle()
    if (currentErr) console.error('[tap-redirect] tap_current lookup error:', currentErr.message)
    if (!current) return fallback()

    let destUrl: string | null = null
    let destLabel: string | null = null

    if (current.custom_url) {
      destUrl = current.custom_url
    } else if (current.link_id) {
      const { data: link, error: linkErr } = await admin.from('tap_links')
        .select('label, url').eq('id', current.link_id).maybeSingle()
      if (linkErr) console.error('[tap-redirect] tap_links lookup error:', linkErr.message)
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

    return respond(destUrl)

  } catch (e: unknown) {
    console.error('[tap-redirect]', e instanceof Error ? e.message : String(e))
    return fallback()
  }
})
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "
const fs = require('fs');
let src = fs.readFileSync('supabase/functions/tap-redirect/index.ts', 'utf8');
src = src.replace(/: Request/g, '').replace(/!;/g, ';').replace(/: string \| null/g, '').replace(/: unknown/g, '');
fs.writeFileSync('/tmp/_tapredirect_check.js', src);
"
node --check /tmp/_tapredirect_check.js && echo OK
rm -f /tmp/_tapredirect_check.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/tap-redirect/index.ts
git commit -m "Add opt-in JSON response mode to tap-redirect" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: New branded landing page

**Files:**
- Create: `tap/index.html`

- [ ] **Step 1: Create the page**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Heritage Hill Church</title>
  <link rel="icon" href="../assets/logos/logo-icon-color-white.png" />
  <meta name="theme-color" content="#BC7A1E" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/style.css" />
  <style>
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:var(--bg,#F4F4F2); font-family:'DM Sans',sans-serif; }
    .tap-wrap { text-align:center; }
    .tap-logo { width:64px; height:64px; margin-bottom:20px; object-fit:contain; }
    .tap-spinner { width:28px; height:28px; border:3px solid rgba(188,122,30,.25); border-top-color:var(--primary,#BC7A1E); border-radius:50%; margin:0 auto 16px; animation:tap-spin .8s linear infinite; }
    @keyframes tap-spin { to { transform:rotate(360deg); } }
    .tap-msg { color:var(--text-muted,#6B6B6B); font-size:.95rem; }
  </style>
</head>
<body>
  <div class="tap-wrap">
    <img class="tap-logo" src="../assets/logos/logo-icon-color-dark.png" alt="Heritage Hill Church" onerror="this.style.display='none'" />
    <div class="tap-spinner"></div>
    <p class="tap-msg">Taking you there&hellip;</p>
  </div>
  <script src="../js/supabase-client.js"></script>
  <script>
    (function () {
      const section = new URLSearchParams(location.search).get('section');
      if (!section) { location.replace('../'); return; }
      fetch(`${SUPABASE_URL}/functions/v1/tap-redirect?section=${encodeURIComponent(section)}&format=json`)
        .then(r => r.json())
        .then(data => { location.replace(data.url || '../'); })
        .catch(() => { location.replace('../'); });
    })();
  </script>
</body>
</html>
```

**Note:** the favicon (`link rel="icon"`) intentionally still uses `logo-icon-color-white.png` (matching every other page's favicon reference) — only the large on-page logo uses the `-dark` variant, since that one needs to read clearly against this page's light background. If `logo-icon-color-dark.png` doesn't look right once deployed, it's a one-line asset swap (try `logo-centered-full-dark.png` instead).

- [ ] **Step 2: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('tap/index.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_tap_page_check.js', scripts.join('\n;\n'));
"
node --check /tmp/_tap_page_check.js && echo OK
rm -f /tmp/_tap_page_check.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add tap/index.html
git commit -m "Add branded NFC tap landing page" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Update the admin tag-URL display

**Files:**
- Modify: `admin/tap-control.html`

- [ ] **Step 1: Point the tag URL box at the new branded page**

Find:

```javascript
async function selectSection(id) {
  _section = _sections.find(s => s.id === id) || _sections[0];
  renderSectionSelect();
  await loadCurrent();
  await refreshStats();
  document.getElementById('tagUrlBox').textContent =
    `${SUPABASE_URL}/functions/v1/tap-redirect?section=${_section.slug}`;
}
```

Replace with:

```javascript
async function selectSection(id) {
  _section = _sections.find(s => s.id === id) || _sections[0];
  renderSectionSelect();
  await loadCurrent();
  await refreshStats();
  document.getElementById('tagUrlBox').textContent =
    `${location.origin}${location.pathname.replace(/admin\/tap-control\.html$/, 'tap/')}?section=${_section.slug}`;
}
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/tap-control.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_tapctrl_check_url.js', scripts.join('\n;\n'));
"
node --check /tmp/_tapctrl_check_url.js && echo OK
rm -f /tmp/_tapctrl_check_url.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add admin/tap-control.html
git commit -m "Show the branded tap URL in admin/tap-control.html instead of the raw Supabase URL" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Deploy and verify

- [ ] **Step 1: Deploy the updated Edge Function to staging**

Use the Supabase MCP's `deploy_edge_function` (or `supabase functions deploy tap-redirect` via CLI) against the staging project (`govvofbrhhpowtdnuzcw`), with the same `verify_jwt` setting the function already has (`false`, per its `--no-verify-jwt` deployment note — confirm via `list_edge_functions` before deploying, don't just assume).

- [ ] **Step 2: Push the branch to staging**

```bash
git push staging claude/loving-darwin-e8d5ea:main
```

- [ ] **Step 3: Verify the GitHub Pages build**

```bash
gh api repos/sspratlen/HeritageHill-staging/pages/builds/latest --jq '.status'
```

Poll until `built`.

- [ ] **Step 4: Manual end-to-end verification**

- Visit `https://sspratlen.github.io/HeritageHill-staging/tap/?section=<a real section slug>` directly, confirm the branded "Taking you there…" page flashes briefly, then lands on the correct final destination, with the Supabase URL never appearing in the address bar (check the browser's back button after — it should skip straight from the `tap/` page to the real destination).
- Visit `tap/` with no `section` param, confirm immediate redirect to the site homepage.
- Visit `tap/?section=not-a-real-slug`, confirm fallback to homepage.
- `curl -sI "https://govvofbrhhpowtdnuzcw.supabase.co/functions/v1/tap-redirect?section=<slug>"` (no `format=json`), confirm it's still a direct `302` — the raw Edge Function's default behavior is unchanged.
- In `admin/tap-control.html` on staging, confirm the tag URL box and "Copy tag URL" now show `https://sspratlen.github.io/HeritageHill-staging/tap/?section=<slug>`.

- [ ] **Step 5: Report back**

Confirm to the user: staging is live, the branded flow works end-to-end, and the raw Edge Function's direct-hit behavior is unchanged. Remind them the one existing physical NFC tag needs to be re-flashed to the new `tap/?section=…` URL shown in the admin tag URL box.
