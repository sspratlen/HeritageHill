# Event Deep-Link for Announcement Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Announcement Banner's "Link URL" point at a specific event's detail popup instead of just a whole page, by adding an `?event=<id>` URL param to `events.html` that auto-opens that event's existing modal, plus a one-click "Copy Link" button in the admin Events tab to generate that URL.

**Architecture:** `events.html` already has an `openEventDetail(eventId)` function that a card click calls to open the detail modal — this plan just calls that same function automatically on page load when a matching `event` query param is present, reusing the existing URL-param-handling block that already supports a `filter` param. The admin Events table gets one new button per row, following the exact style of its existing "📣 Media"/"📅 Calendar" quick-action buttons, that copies `events.html?event=<id>` to the clipboard.

**Tech Stack:** Static HTML/JS, `URLSearchParams`, `navigator.clipboard`, no build step — verification is via `node --check`-style syntax checks, HTML tag-balance checks (for `admin/dashboard.html`), and manual browser verification, matching this codebase's established pattern.

---

### Task 1: Auto-open event modal from `?event=` URL param

**Files:**
- Modify: `events.html:321-336`

- [ ] **Step 1: Add the `event` param check after the existing `filter` param handling**

Current content at `events.html:321-336`:

```js
  // Load events from Supabase then apply any URL param filter
  SupaDB.getPublishedEvents().then(data => {
    _allEvents = data;

    // Check for URL param filter
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    if (filterParam) {
      const catSelect = document.getElementById('eventCategory');
      for (let opt of catSelect.options) {
        if (opt.value === filterParam) { catSelect.value = filterParam; break; }
      }
    }

    filterEvents();
  });
```

Replace with:

```js
  // Load events from Supabase then apply any URL param filter
  SupaDB.getPublishedEvents().then(data => {
    _allEvents = data;

    // Check for URL param filter
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    if (filterParam) {
      const catSelect = document.getElementById('eventCategory');
      for (let opt of catSelect.options) {
        if (opt.value === filterParam) { catSelect.value = filterParam; break; }
      }
    }

    filterEvents();

    // Check for a direct link to a specific event (e.g. from the announcement banner)
    const eventParam = urlParams.get('event');
    if (eventParam) {
      const targetId = parseInt(eventParam, 10);
      if (_allEvents.some(e => e.id === targetId)) {
        openEventDetail(targetId);
      }
    }
  });
```

This runs after `filterEvents()` so the grid behind the modal is already rendered correctly (matching the existing `filter` param's own precedent of running before this new check), and it's a silent no-op if `eventParam` is missing, non-numeric (`parseInt` produces `NaN`, which `.some(e => e.id === NaN)` never matches), or doesn't match any currently-loaded (published) event — no error, no console warning, matching the graceful-degradation behavior already established for the `filter` param.

`openEventDetail` is defined later in the same `<script>` block (`events.html:358`) as a function declaration, so it's hoisted and safely callable here regardless of its position later in the file — this is the same existing function every event card's click handler already calls, not a new one.

- [ ] **Step 2: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('events.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 3: Commit**

```bash
git add events.html
git commit -m "Auto-open event detail modal from ?event= URL param"
```

---

### Task 2: "Copy Link" button in admin Events tab

**Files:**
- Modify: `admin/dashboard.html:2068-2081` (`renderEventsTable`)

- [ ] **Step 1: Add the Copy Link button to the Actions cell**

Current content at `admin/dashboard.html:2068-2081`:

```js
  tbody.innerHTML=events.map(ev=>`
    <tr>
      <td><strong>${ev.title}</strong><br><span style="font-size:.8rem;color:var(--text-muted);">${(ev.description||'').slice(0,60)}…</span></td>
      <td>${ev.date}${ev.endDate?` – ${ev.endDate}`:''}<br><span style="font-size:.8rem;color:var(--text-muted);">${ev.time}</span></td>
      <td><span class="badge badge-blue">${ev.category}</span></td>
      <td>${ev.recurring?'<span class="badge badge-amber">Recurring</span>':'<span class="badge badge-green">One-time</span>'}</td>
      <td>${ev.published?'<span class="badge badge-green">Published</span>':'<span class="badge badge-gray">Draft</span>'}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="editEvent(${ev.id})">Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="openMediaModal(${ev.id})" style="color:var(--primary);">📣 Media</button>
        <button class="btn btn-ghost btn-sm" onclick="openGCalForEvent(${ev.id})" style="color:var(--secondary);">📅 Calendar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('event',${ev.id},'${ev.title.replace(/'/g,"\\'")}')">Delete</button>
      </div></td>
    </tr>`).join('');
}
```

Replace with:

```js
  tbody.innerHTML=events.map(ev=>`
    <tr>
      <td><strong>${ev.title}</strong><br><span style="font-size:.8rem;color:var(--text-muted);">${(ev.description||'').slice(0,60)}…</span></td>
      <td>${ev.date}${ev.endDate?` – ${ev.endDate}`:''}<br><span style="font-size:.8rem;color:var(--text-muted);">${ev.time}</span></td>
      <td><span class="badge badge-blue">${ev.category}</span></td>
      <td>${ev.recurring?'<span class="badge badge-amber">Recurring</span>':'<span class="badge badge-green">One-time</span>'}</td>
      <td>${ev.published?'<span class="badge badge-green">Published</span>':'<span class="badge badge-gray">Draft</span>'}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="editEvent(${ev.id})">Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="openMediaModal(${ev.id})" style="color:var(--primary);">📣 Media</button>
        <button class="btn btn-ghost btn-sm" onclick="openGCalForEvent(${ev.id})" style="color:var(--secondary);">📅 Calendar</button>
        <button class="btn btn-ghost btn-sm" onclick="copyEventLink(${ev.id})" style="color:var(--text-muted);">🔗 Copy Link</button>
        <button class="btn btn-danger btn-sm" onclick="deleteItem('event',${ev.id},'${ev.title.replace(/'/g,"\\'")}')">Delete</button>
      </div></td>
    </tr>`).join('');
}

function copyEventLink(id) {
  const url = `events.html?event=${id}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast("Link copied! Paste it into the Banner's Link URL field.");
  }).catch(() => {
    showToast('Could not copy link — your browser blocked clipboard access.', true);
  });
}
```

`copyEventLink` is a plain top-level function (matching the style of every other admin-dashboard action function, e.g. `editEvent`, `openMediaModal`), placed immediately after `renderEventsTable()`. It builds a relative URL (`events.html?event=<id>`, no origin/domain prefix) matching the existing Banner "Link URL" field's own placeholder example of `events.html`, and every other internal link already in this codebase. `showToast(msg)` and `showToast(msg, true)` are the existing toast helper (`admin/dashboard.html:3983` area) — `true` as the second argument renders it as an error toast, used here only if the clipboard write itself fails (e.g. `navigator.clipboard` unavailable in that browser/context).

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
Expected: `BALANCED`. This file has a history of dangling-`</div>` bugs — mandatory before committing any change here. This specific edit adds no new `<div>`/`</div>` pairs (just one new `<button>` and one new top-level JS function), so the count should be unchanged from before this task; if it's not balanced, find and fix your edit before proceeding.

- [ ] **Step 3: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Copy Link button to admin Events tab"
```

---

### Task 3: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (e.g. the project's existing `static-site` preview launch config). Confirm:

- Opening `events.html` (no query params) loads normally, no modal auto-opens, no console errors.
- Opening `events.html?event=<a real published event's id>` auto-opens that event's detail modal on load — check the modal shows the correct title/date/description for that specific event, matching what clicking its card manually shows.
- Opening `events.html?event=999999` (or any id that doesn't exist) loads normally with no modal and no console error.
- Opening `events.html?event=abc` (non-numeric) loads normally with no modal and no console error.
- Opening `events.html?filter=<a real category>&event=<a real event id>` — confirm both work together: the grid is filtered to that category AND the modal for the specified event opens on top of it.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

1. Log into `admin/dashboard.html`, open the Events tab, click "🔗 Copy Link" on a real event — confirm a success toast appears.
2. Paste the copied link somewhere (e.g. a scratch text field) and confirm it's exactly `events.html?event=<that event's id>`.
3. Open that URL directly in a new tab on the staging site — confirm the correct event's modal opens automatically.
4. In Settings, paste that same URL into the Announcement Banner's "Link URL" field, fill in Link Text, save, and confirm the banner link on any public page now opens straight to that event's modal when clicked.

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
