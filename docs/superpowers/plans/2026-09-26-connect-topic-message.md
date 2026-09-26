# Connect Card: Topic + Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Topic (dropdown) and Message (textarea) fields to the Connect card on `connect/index.html`, store them in `connect_submissions`, and surface them in the admin Connect submissions table.

**Architecture:** One new nullable-column migration on the existing `connect_submissions` table, two new form fields wired through the existing `handleConnectSubmit` → `SupaDB.submitConnectCard` → Supabase insert path, and a display-only update to the existing admin table row template (`renderConnectPanel`). No new files besides the migration; no new tables, pages, or edge functions.

**Tech Stack:** Static HTML/JS (no build step), Supabase Postgres (via `@supabase/supabase-js` v2 CDN client), plain inline `<script>` blocks.

**Full design context:** `docs/superpowers/specs/2026-09-26-connect-topic-message-design.md`

**Testing note:** This repo has no automated test suite (static HTML/JS site, no build step). Verification instead uses this repo's established patterns: SQL queries against the live Supabase project, reading deployed source via `curl`, opening local static HTML directly in a browser, and — for anything requiring an authenticated admin session — asking Scott to click through and confirm, per the "Admin login / testing limitation" section of `CLAUDE.md`.

---

### Task 1: Schema migration — add `topic` and `message` columns

**Files:**
- Create: `supabase/connect-submissions-topic-message-schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Add Topic + Message fields to Connect card submissions.
-- See docs/superpowers/specs/2026-09-26-connect-topic-message-design.md
-- Safe to re-run (idempotent). Apply to staging (govvofbrhhpowtdnuzcw)
-- first; do not apply to production (ktyplbmawlaerzohkdqy) until
-- explicitly approved.
-- ============================================================

alter table public.connect_submissions
  add column if not exists topic   text,
  add column if not exists message text;
```

- [ ] **Step 2: Apply to the staging Supabase project**

If Supabase MCP is connected and scoped to the staging project, run this file's SQL via `execute_sql`. If MCP is not connected (check for an `AUTH_HEADER_REJECTED` or similar error), give Scott the exact SQL block above to paste into the staging project's SQL Editor (`https://supabase.com/dashboard/project/govvofbrhhpowtdnuzcw/sql/new`) and wait for confirmation it ran.

- [ ] **Step 3: Verify the columns exist**

Run this query (via MCP `execute_sql`, or ask Scott to run it and paste back the result):

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'connect_submissions'
  and column_name in ('topic', 'message');
```

Expected: two rows, both `data_type = 'text'`, both `is_nullable = 'YES'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/connect-submissions-topic-message-schema.sql
git commit -m "Add topic and message columns to connect_submissions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Visitor-facing form fields

**Files:**
- Modify: `connect/index.html:88-92` (insert new fields after the existing Phone field, before the submit button)

- [ ] **Step 1: Insert the Topic and Message fields**

In `connect/index.html`, find this block (the existing Phone field, immediately followed by the submit button):

```html
          <div>
            <label for="ccPhone" style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.35rem;">Phone (optional)</label>
            <input type="tel" id="ccPhone"
              style="width:100%;box-sizing:border-box;padding:.65rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;" />
          </div>
          <button type="submit" id="ccBtn" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:.5rem;">Connect</button>
```

Replace it with (Phone field unchanged, two new fields inserted before the button):

```html
          <div>
            <label for="ccPhone" style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.35rem;">Phone (optional)</label>
            <input type="tel" id="ccPhone"
              style="width:100%;box-sizing:border-box;padding:.65rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;" />
          </div>
          <div>
            <label for="ccTopic" style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.35rem;">Topic (optional)</label>
            <select id="ccTopic"
              style="width:100%;box-sizing:border-box;padding:.65rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;background:#fff;">
              <option value="">Select a topic (optional)</option>
              <option value="General Church Question/Comment">General Church Question/Comment</option>
              <option value="Pastoral Care">Pastoral Care</option>
              <option value="App/Web/Login Question/Comment">App/Web/Login Question/Comment</option>
            </select>
          </div>
          <div>
            <label for="ccMessage" style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.35rem;">Message (optional)</label>
            <textarea id="ccMessage" rows="3" placeholder="Let us know how we can help"
              style="width:100%;box-sizing:border-box;padding:.65rem 1rem;border:1px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;resize:vertical;"></textarea>
          </div>
          <button type="submit" id="ccBtn" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:.5rem;">Connect</button>
```

- [ ] **Step 2: Visually verify in the browser**

Open `connect/index.html` directly as a local file in a browser (e.g. `file:///Users/scottspratlen/Documents/Claude/Projects/HHCWebsite/connect/index.html#connect-card`) and confirm: the Topic dropdown shows the blank option plus the three choices in order, the Message textarea renders below it with the placeholder text visible, and both match the visual style of the existing Name/Email/Phone fields (same border, padding, font). No Supabase connection is needed for this check — it's pure layout/markup.

- [ ] **Step 3: Commit**

```bash
git add connect/index.html
git commit -m "Add Topic and Message fields to the Connect card form

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Wire the new fields through submission

**Files:**
- Modify: `connect/index.html` (the `handleConnectSubmit` function, inside the `<script>` block near the bottom)
- Modify: `js/db.js:1901-1912` (`submitConnectCard`)

- [ ] **Step 1: Read the new field values in `handleConnectSubmit`**

In `connect/index.html`, find:

```js
    const name  = document.getElementById('ccName').value.trim();
    const email = document.getElementById('ccEmail').value.trim();
    const phone = document.getElementById('ccPhone').value.trim();
    const errEl = document.getElementById('ccError');
    const btn   = document.getElementById('ccBtn');
    errEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Connecting…';

    const result = await SupaDB.submitConnectCard({ name, email, phone });
```

Replace with:

```js
    const name    = document.getElementById('ccName').value.trim();
    const email   = document.getElementById('ccEmail').value.trim();
    const phone   = document.getElementById('ccPhone').value.trim();
    const topic   = document.getElementById('ccTopic').value;
    const message = document.getElementById('ccMessage').value.trim();
    const errEl = document.getElementById('ccError');
    const btn   = document.getElementById('ccBtn');
    errEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Connecting…';

    const result = await SupaDB.submitConnectCard({ name, email, phone, topic, message });
```

- [ ] **Step 2: Update `SupaDB.submitConnectCard` to store the new fields**

In `js/db.js`, find:

```js
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
```

Replace with:

```js
  async submitConnectCard({ name, email, phone, topic, message }) {
    if (!db()) return { error: 'Not configured' };
    try {
      const personId = await this.upsertPerson({ name, email, phone });
      const { error } = await db().from('connect_submissions').insert({
        person_id: personId, name, email, phone: phone || '',
        topic: topic || '', message: message || '',
      });
      if (error) throw error;
      if (personId) this.recordMilestone(personId, 'connect_card_submitted');
      return { success: true };
    } catch(e) { console.error('[SupaDB] submitConnectCard:', e.message); return { error: e.message }; }
  },
```

- [ ] **Step 3: Commit**

```bash
git add connect/index.html js/db.js
git commit -m "Pass Topic and Message through to connect_submissions insert

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Update the DB-row mapper

**Files:**
- Modify: `js/db.js:171-177` (`connectSubmissionFromDb`)

- [ ] **Step 1: Add `topic` and `message` to the mapped object**

Find:

```js
function connectSubmissionFromDb(r) {
  return {
    id: r.id, personId: r.person_id, name: r.name, email: r.email, phone: r.phone || '',
    contacted: !!r.contacted, contactedAt: r.contacted_at || null, contactedBy: r.contacted_by || '',
    createdAt: r.created_at,
  };
}
```

Replace with:

```js
function connectSubmissionFromDb(r) {
  return {
    id: r.id, personId: r.person_id, name: r.name, email: r.email, phone: r.phone || '',
    topic: r.topic || '', message: r.message || '',
    contacted: !!r.contacted, contactedAt: r.contacted_at || null, contactedBy: r.contacted_by || '',
    createdAt: r.created_at,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add js/db.js
git commit -m "Map topic and message fields on connect submission rows

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Admin display

**Files:**
- Modify: `admin/dashboard.html:3358-3366` (`renderConnectPanel`'s row template)

- [ ] **Step 1: Add the Topic badge and Message snippet to the row template**

Find:

```js
    grid.innerHTML=_cachedConnectSubmissions.map(c=>{
      const ds=c.createdAt?new Date(c.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
      return`<tr>
        <td><strong>${escapeHtml(c.name)}</strong><br><a href="mailto:${escapeHtml(c.email)}" style="font-size:.8rem;color:var(--primary);">${escapeHtml(c.email)}</a>${c.phone?`<br><span style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(c.phone)}</span>`:''}</td>
        <td style="font-size:.82rem;color:var(--text-muted);">${ds}</td>
        <td>${c.contacted?'<span class="badge badge-green">Contacted</span>':'<span class="badge badge-amber">New</span>'}</td>
        <td><button class="btn btn-sm ${c.contacted?'btn-ghost':'btn-success'}" onclick="toggleConnectContacted(${c.id})">${c.contacted?'↩ Mark Uncontacted':'✓ Mark Contacted'}</button></td>
      </tr>`;
    }).join('');
```

Replace with:

```js
    grid.innerHTML=_cachedConnectSubmissions.map(c=>{
      const ds=c.createdAt?new Date(c.createdAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'';
      const messageSnippet = c.message
        ? `<br><span title="${escapeHtml(c.message)}" style="display:inline-block;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8rem;font-style:italic;color:var(--text-muted);">${escapeHtml(c.message)}</span>`
        : '';
      const topicBadge = c.topic ? ` <span class="badge badge-gray">${escapeHtml(c.topic)}</span>` : '';
      return`<tr>
        <td><strong>${escapeHtml(c.name)}</strong><br><a href="mailto:${escapeHtml(c.email)}" style="font-size:.8rem;color:var(--primary);">${escapeHtml(c.email)}</a>${c.phone?`<br><span style="font-size:.8rem;color:var(--text-muted);">${escapeHtml(c.phone)}</span>`:''}${messageSnippet}</td>
        <td style="font-size:.82rem;color:var(--text-muted);">${ds}</td>
        <td>${c.contacted?'<span class="badge badge-green">Contacted</span>':'<span class="badge badge-amber">New</span>'}${topicBadge}</td>
        <td><button class="btn btn-sm ${c.contacted?'btn-ghost':'btn-success'}" onclick="toggleConnectContacted(${c.id})">${c.contacted?'↩ Mark Uncontacted':'✓ Mark Contacted'}</button></td>
      </tr>`;
    }).join('');
```

- [ ] **Step 2: Commit**

```bash
git add admin/dashboard.html
git commit -m "Show Topic and Message on admin Connect submissions table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: End-to-end verification on staging

**Files:** none (verification only)

- [ ] **Step 1: Push the branch to staging**

```bash
git push staging main
```

- [ ] **Step 2: Confirm the deployed Connect page has the new fields**

```bash
curl -s https://sspratlen.github.io/HeritageHill-staging/connect/index.html | grep -o 'id="ccTopic"\|id="ccMessage"'
```

Expected: both `id="ccTopic"` and `id="ccMessage"` appear in the output. (GitHub Pages deploys aren't always instant — see the "GitHub Pages deploys" gotcha in `CLAUDE.md` if this doesn't show up within a few minutes.)

- [ ] **Step 3: Insert a test submission via SQL against staging**

Run against the staging project (`govvofbrhhpowtdnuzcw`), via MCP `execute_sql` or by asking Scott to paste it into the SQL Editor:

```sql
insert into public.connect_submissions (name, email, phone, topic, message)
values ('Test Visitor', 'test-visitor@example.com', '', 'Pastoral Care', 'This is a test message to verify the admin display.');
```

- [ ] **Step 4: Ask Scott to confirm the admin view**

Since no admin credentials are available in this session, ask Scott to log into the staging admin dashboard's Connect Submissions tab and confirm: the test row shows a gray "Pastoral Care" badge next to the "New" status badge, and hovering the italic message snippet under the email shows the full test message text.

- [ ] **Step 5: Clean up the test row**

Once confirmed, delete the test row (via MCP `execute_sql` or ask Scott to run it):

```sql
delete from public.connect_submissions where email = 'test-visitor@example.com';
```

- [ ] **Step 6: Stop here — do not touch production**

Per the design doc and `CLAUDE.md`'s standing deployment rule, do not apply the schema migration or push code to `origin` (production) until Scott explicitly approves promoting this specific change.

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1), visitor form (Task 2), submission flow (Task 3 + 4 — the spec's "submission flow" section implies the mapper update too, since the admin display in Task 5 reads through `connectSubmissionFromDb`), admin display (Task 5), rollout/testing (Task 6). All spec sections have a corresponding task.
- **Placeholder scan:** No TBD/TODO; every step has literal code or an exact command.
- **Type/name consistency:** `topic` and `message` are used identically (same names, same casing) across the HTML field IDs, `handleConnectSubmit`, `submitConnectCard`, `connectSubmissionFromDb`, and `renderConnectPanel` — checked end-to-end.
