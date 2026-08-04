# Men's Retreat Registration On/Off Toggle — Design Spec

## Purpose

Give admins a way to open or close registration for the Men's Retreat public page (`mensretreat/index.html`) without touching code or deploying. Registration should start **closed** the moment this ships.

## Constraint

The site is hosted on static GitHub Pages — there is no server-side routing or access control. "Turning the page off" cannot mean the URL stops resolving; it means the page's own JavaScript detects the closed state and replaces its content with a closed message before the visitor sees the registration form. A visitor with the URL can still reach the page; they just won't see the form or retreat details while it's closed.

## Data Layer

Reuse the existing `site_settings` key/value table (`supabase/schema.sql`), which already has:
- `"Public can read site settings"` — `select` for anyone (`using (true)`)
- `"Admin full access to site settings"` — full access for `auth.role() = 'authenticated'`

No schema or RLS changes are needed. Add one migration that seeds a single row:

```sql
insert into site_settings (key, value)
values ('retreat_registration_open', 'false'::jsonb)
on conflict (key) do nothing;
```

`value` is a plain JSON boolean (`true` or `false`). Seeding `false` means registration is closed as soon as this migration runs, satisfying the immediate request. `on conflict do nothing` makes it safe to re-run without clobbering a value an admin already set.

## SupaDB Methods (`js/db.js`)

Add next to the existing `getBannerSettings`/`saveBannerSettings` pair (same file section, same pattern):

```js
async getRetreatRegistrationOpen() {
  if (!db()) return true;
  try {
    const { data, error } = await db().from('site_settings').select('value').eq('key','retreat_registration_open').single();
    if (error) return true;
    return data?.value !== false;
  } catch(e) { console.error('[SupaDB] getRetreatRegistrationOpen:', e.message); return true; }
},
async setRetreatRegistrationOpen(isOpen) {
  if (!db()) return { error: 'No DB' };
  try {
    const { error } = await db().from('site_settings')
      .upsert({ key: 'retreat_registration_open', value: isOpen, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) throw error;
    return { success: true };
  } catch(e) { console.error('[SupaDB] setRetreatRegistrationOpen:', e.message); return { error: e.message }; }
},
```

`getRetreatRegistrationOpen` fails open (`true`) on any read error or missing row — a transient DB hiccup for the *admin dashboard's* toggle state should not accidentally read as "closed" and confuse an admin into re-toggling something that isn't actually broken. (The public page, described below, does not use this method — it reads the setting directly via REST, and fails *closed* there. See Error Handling.)

## Admin Control (`admin/dashboard.html`, Retreat 2026 tab)

In the existing `#panelRetreat` header row (the row containing `#retreatCount` and the "Download CSV" button, `admin/dashboard.html` around line 972-975), add a toggle switch before the CSV button:

```html
<label style="display:flex;align-items:center;gap:8px;font-size:.85rem;color:var(--text-muted);cursor:pointer;">
  <input type="checkbox" id="retreatOpenToggle" onchange="toggleRetreatOpen(this.checked)" style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;" />
  Registration Open
</label>
```

On tab render (`renderRetreatTable()`), also load and reflect the current state:

```js
async function loadRetreatOpenState() {
  const isOpen = await SupaDB.getRetreatRegistrationOpen();
  const el = document.getElementById('retreatOpenToggle');
  if (el) el.checked = isOpen;
}

async function toggleRetreatOpen(isOpen) {
  const res = await SupaDB.setRetreatRegistrationOpen(isOpen);
  if (res.error) {
    showToast('Failed to update registration status: ' + res.error);
    loadRetreatOpenState(); // revert checkbox to actual state
  }
}
```

`renderRetreatTable()` calls `loadRetreatOpenState()` alongside its existing work. Reverting the checkbox on save failure keeps the UI truthful — the toggle should never visually claim a state it failed to persist.

## Public Page (`mensretreat/index.html`)

This page is self-contained: it uses its own inline `fetch`-based Supabase REST calls (no `js/main.js`/`db.js`), so the check is added directly in its existing `<script>` IIFE, not through `SupaDB`.

**Markup change:** wrap the entire existing body content (everything between `<header class="hero">` and the closing `</footer>`) in a single container, initially hidden:

```html
<div id="page-content" style="visibility:hidden;">
  <!-- existing hero, sections, footer, unchanged -->
</div>

<div id="closed-message" style="display:none;min-height:100vh;display:none;align-items:center;justify-content:center;text-align:center;padding:40px 16px;background:#1a1a1a;color:#F5F0E8;">
  <div>
    <h1 style="font-size:1.8rem;margin-bottom:12px;">Registration Is Currently Closed</h1>
    <p style="opacity:.7;">Check back soon, or reach out to <a href="mailto:scottspratlen@heritagehill.church" style="color:#E8891A;">scottspratlen@heritagehill.church</a> with questions.</p>
  </div>
</div>
```

**Script change:** at the very top of the existing IIFE, before anything else runs, fetch the setting and decide which container to reveal:

```js
(function () {
  var SUPA_URL = 'https://ktyplbmawlaerzohkdqy.supabase.co';
  var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0eXBsYm1hd2xhZXJ6b2hrZHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjU4MDgsImV4cCI6MjA5MzY0MTgwOH0.Pe0_syQjPqkwrdl8cno9YliY2i1i8x77R8bYCG8KXr4'; // unchanged, already in file

  fetch(SUPA_URL + '/rest/v1/site_settings?key=eq.retreat_registration_open&select=value', {
    headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY },
  })
    .then(function (res) { return res.ok ? res.json() : []; })
    .then(function (rows) {
      var isOpen = rows.length ? rows[0].value !== false : true;
      if (isOpen) {
        document.getElementById('page-content').style.visibility = 'visible';
      } else {
        document.getElementById('closed-message').style.display = 'flex';
      }
    })
    .catch(function () {
      // Network/parse failure: fail OPEN here, matching the admin-side default,
      // rather than blocking legitimate registration due to a transient error.
      document.getElementById('page-content').style.visibility = 'visible';
    });

  window.handleRetreatSubmit = async function (e) { /* unchanged */ };
}());
```

This keeps the existing `handleRetreatSubmit` function and its raw-fetch registration POST completely untouched — the toggle only gates whether the form is ever shown, not the submit path itself. (A determined visitor could theoretically still POST directly to the API while the UI is closed; the site's existing RLS on `retreat_registrations` already governs that, and no request in this spec changes it. Fully blocking writes at the database level while the UI is closed is out of scope — see YAGNI note below.)

## Error Handling

- **Admin toggle (`getRetreatRegistrationOpen`)**: fails open (`true`) on error, so a transient DB issue doesn't misrepresent state to the admin.
- **Public page fetch**: also fails open, for the same underlying reason — a network hiccup should not silently close registration for real visitors. This is consistent, not contradictory, with "seed the row closed": the seeded row is an explicit closed value, not an error state, so it's read correctly as closed on first load.
- **Toggle save failure**: checkbox reverts to the last known real state and a toast reports the error, so the admin isn't left believing a state it didn't actually persist.

## Out of Scope (YAGNI)

- No RLS change to block direct `POST` to `retreat_registrations` while closed — the UI-level gate is what was asked for; adding write-blocking RLS is a separate, bigger change (would need a Postgres function or trigger checking `site_settings`) not requested here.
- No scheduling ("auto-open on date X") — this is a manual toggle only.
- No toggle for any other event/registration page — scoped to Men's Retreat only, per the request.
