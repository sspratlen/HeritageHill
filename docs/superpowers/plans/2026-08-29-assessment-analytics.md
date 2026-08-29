# Assessment Analytics (DISC/Gifts Inventory + Claude Analysis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the senior pastor a congregation-wide DISC/Spiritual Gifts inventory (participation stats + distribution charts) plus an on-demand, saved-history Claude analysis that identifies ministry gift-coverage gaps and DISC patterns — not just a restatement of the counts.

**Architecture:** A new `assessment_analytics_reports` table stores generated analyses. A new stateless Supabase Edge Function (`analyze-assessments`) calls the Claude API with only aggregate counts (no PII) and returns analysis text; the client persists it via a normal RLS-protected `SupaDB` insert. A new admin-only "Analytics" tab in `admin/dashboard.html` computes the aggregate snapshot client-side from data already fetched elsewhere in this codebase (`getVisibleAttempts`, `adminGetAllMemberProfiles`, `getAssessmentContent`, plus the already-existing `latestByUser`/`giftNames` helpers), renders distribution bar lists, and drives the generate/history flow.

**Tech Stack:** Static HTML/JS, Supabase Postgres + Edge Functions (Deno), Claude API (`claude-opus-5`, called via raw `fetch()` from the Edge Function — matching this codebase's existing Resend/Mailchimp Edge Functions, which also use raw HTTP rather than an SDK). No build step — verification is via `node --check`-style syntax checks, HTML tag-balance checks, and manual browser verification.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/assessment-analytics-schema.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- Assessment Analytics: stores Claude-generated congregation-wide
-- DISC/Spiritual Gifts analyses, each with the aggregate stat
-- snapshot it was generated from. Run in the Supabase SQL editor.
-- Safe to re-run (idempotent).
-- ============================================================

create table if not exists assessment_analytics_reports (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  created_by    text,
  summary_stats jsonb not null,
  analysis_text text not null
);

alter table assessment_analytics_reports enable row level security;

drop policy if exists "Staff can view analytics reports" on assessment_analytics_reports;
drop policy if exists "Staff can insert analytics reports" on assessment_analytics_reports;
create policy "Staff can view analytics reports"
  on assessment_analytics_reports for select
  using (auth.role() = 'authenticated');
create policy "Staff can insert analytics reports"
  on assessment_analytics_reports for insert
  with check (auth.role() = 'authenticated');
```

- [ ] **Step 2: Verify by inspection**

Confirm the RLS policy shape (`auth.role() = 'authenticated'` for both `select` and `insert`, no `update`/`delete` policy — reports are append-only) matches the pattern already used in `supabase/growth-track-recurring-schedule.sql` for `growth_track_cancellations`.

- [ ] **Step 3: Commit**

```bash
git add supabase/assessment-analytics-schema.sql
git commit -m "Add migration for assessment analytics reports table"
```

---

### Task 2: SupaDB methods

**Files:**
- Modify: `js/db.js` (add two new methods, plus a mapper function, near the other assessment-related methods — after `adminGetGrowthTrackRegistrations`-style methods; exact anchor given below)

- [ ] **Step 1: Add the mapper and CRUD methods**

Find this exact block in `js/db.js` (locate by text match — line numbers may have drifted slightly):

```js
function growthTrackRegistrationFromDb(r) {
  return {
    id: r.id, part: r.part, sessionDate: r.session_date, sessionTime: r.session_time || '',
    name: r.name, email: r.email, phone: r.phone || '', notes: r.notes || '',
    addedByAdmin: !!r.added_by_admin, createdAt: r.created_at,
    userId: r.user_id, attended: !!r.attended,
  };
}
```

Replace with:

```js
function growthTrackRegistrationFromDb(r) {
  return {
    id: r.id, part: r.part, sessionDate: r.session_date, sessionTime: r.session_time || '',
    name: r.name, email: r.email, phone: r.phone || '', notes: r.notes || '',
    addedByAdmin: !!r.added_by_admin, createdAt: r.created_at,
    userId: r.user_id, attended: !!r.attended,
  };
}
function analyticsReportFromDb(r) {
  return {
    id: r.id, createdAt: r.created_at, createdBy: r.created_by || '',
    summaryStats: r.summary_stats || {}, analysisText: r.analysis_text,
  };
}
```

Now find this exact block (the end of the `adminGetGrowthTrackRegistrations` method's closing pattern, immediately followed by another admin method — locate by text match):

```js
  async adminGetGrowthTrackRegistrations(part) {
```

Insert immediately **before** that line (i.e. after whatever method currently precedes it):

```js
  async adminGetAssessmentAnalyticsReports() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('assessment_analytics_reports')
        .select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(analyticsReportFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAssessmentAnalyticsReports:', e.message); return []; }
  },
  async adminSaveAssessmentAnalyticsReport({ summaryStats, analysisText }) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { data: { user } } = await db().auth.getUser();
      const { error } = await db().from('assessment_analytics_reports').insert({
        created_by: (user && user.email) || null,
        summary_stats: summaryStats,
        analysis_text: analysisText,
      });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminSaveAssessmentAnalyticsReport:', e.message); return { error: e.message }; }
  },
  async adminGetGrowthTrackRegistrations(part) {
```

If the exact `async adminGetGrowthTrackRegistrations(part) {` anchor text cannot be located verbatim, STOP and report BLOCKED with what you found instead — do not guess or improvise a different insertion point.

- [ ] **Step 2: Verify by inspection**

Run: `node --check js/db.js`
Expected: no output (exits 0)

- [ ] **Step 3: Commit**

```bash
git add js/db.js
git commit -m "Add SupaDB methods for assessment analytics reports"
```

---

### Task 3: Claude analysis Edge Function

**Files:**
- Create: `supabase/functions/analyze-assessments/index.ts`

- [ ] **Step 1: Write the Edge Function**

```ts
// Supabase Edge Function: analyze-assessments
// Given an aggregate DISC/Spiritual Gifts snapshot (no PII — counts and
// gift/ministry names only), asks Claude for a ministry-gap analysis for
// the admin dashboard's Analytics tab.
//
// Required secret (set via Supabase Dashboard → Settings → Secrets):
//   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
//
// Deploy:
//   supabase functions deploy analyze-assessments

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // Auth check — same pattern as the mailchimp function's admin-only actions:
    // confirm the caller has a valid Supabase session, but don't restrict to a
    // specific role (front-end ROLE_TABS already gates who sees this tab).
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )
    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const { summaryStats } = await req.json()
    if (!summaryStats) {
      return new Response(JSON.stringify({ error: 'summaryStats is required' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const systemPrompt = `You are a ministry-planning analyst for a local church, Heritage Hill Church. You are given aggregate, anonymous statistics about which DISC personality types and Spiritual Gifts the congregation's assessed members have — no names, no individually-identifying information, only counts.

Your job is to help the senior pastor understand where the congregation's gift base is thin relative to the ministries that depend on those gifts, and to surface any DISC-pattern observations genuinely worth their attention. You are given, for each spiritual gift, the list of ministries at this church that rely on that gift (already configured by church staff).

Write a short, direct analysis in markdown for the pastor. Specifically:
- Name specific gifts that are thin (low count, especially zero) relative to the ministries that depend on them, and name those ministries.
- Note any real DISC-distribution pattern worth flagging (e.g., very few of a given type, if that plausibly affects leadership pipeline or team composition) — only if the data actually supports it, not one for every letter just to have something to say.
- Close with a small number (2-4) of concrete, actionable notes for the pastor.
- Do not simply restate every number — the pastor already sees the raw counts elsewhere. Your value is inference: what the numbers imply.
- Do not invent specifics about the church, its ministries, or its people beyond what is present in the data you're given.
- Participation counts (how many people have taken each assessment out of how many approved members) are provided too — factor in whether the sample is large enough to draw a conclusion, and say so if it's thin.`

    const userContent = `Aggregate assessment data:\n\n${JSON.stringify(summaryStats, null, 2)}`

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-5',
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text()
      throw new Error(`Claude API error: ${err}`)
    }

    const claudeJson = await claudeRes.json()
    const textBlock = (claudeJson.content || []).find((b: { type: string }) => b.type === 'text')
    const analysisText = textBlock ? textBlock.text : ''
    if (!analysisText) throw new Error('Claude returned no analysis text')

    return new Response(
      JSON.stringify({ analysisText }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    )

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[analyze-assessments]', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    )
  }
})
```

Note: `claude-opus-5` with `thinking: {type: "adaptive"}` runs adaptive thinking by default on this model — no `budget_tokens` is set (that parameter is removed/rejected on this model family). The response's `content` array may include non-`text` blocks (e.g. thinking blocks); the code above filters to the first `text`-type block rather than assuming `content[0]` is the answer.

- [ ] **Step 2: Verify by inspection**

Confirm the request/response shape matches `supabase/functions/notify-retreat-registrant/index.ts`'s structure (CORS handling, try/catch, `Deno.env.get` for the secret, JSON error contract) and that no other Edge Function in this repo is modified.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/analyze-assessments/index.ts
git commit -m "Add analyze-assessments Edge Function calling Claude for ministry-gap analysis"
```

- [ ] **Step 4: Remind about manual deployment**

This task only creates the function's source file in the repo — it is not live until deployed. Note for the user (surfaced in Task 5's final report, not something to act on now): the function must be deployed with `supabase functions deploy analyze-assessments`, and an `ANTHROPIC_API_KEY` secret must be added via the Supabase dashboard before this feature will work end-to-end. This plan does not run either of those — they require the user's Supabase CLI session / dashboard access.

---

### Task 4: Admin dashboard — Analytics tab

**Files:**
- Modify: `admin/dashboard.html` (sidebar nav, `ROLE_TABS`, `ALL_TABS`, `switchTab` titles/dispatch, new panel HTML, new JS functions)

- [ ] **Step 1: Add the sidebar nav link**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```html
    <a onclick="switchTab('people')" id="sidePeople" data-tab="people">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Members <span id="peopleBadge" style="display:none; background:#BC7A1E; color:#fff; border-radius:10px; font-size:.7rem; padding:1px 7px; margin-left:auto;">0</span>
    </a>
    <a onclick="switchTab('mygroup')" id="sideMygroup" data-tab="mygroup">
```

Replace with:

```html
    <a onclick="switchTab('people')" id="sidePeople" data-tab="people">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      Members <span id="peopleBadge" style="display:none; background:#BC7A1E; color:#fff; border-radius:10px; font-size:.7rem; padding:1px 7px; margin-left:auto;">0</span>
    </a>
    <a onclick="switchTab('analytics')" id="sideAnalytics" data-tab="analytics">
      <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      Analytics
    </a>
    <a onclick="switchTab('mygroup')" id="sideMygroup" data-tab="mygroup">
```

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
Expected: `BALANCED`. This step adds no `<div>`/`</div>`, so the count should be unchanged from before this task.

- [ ] **Step 3: Add `analytics` to `ROLE_TABS.admin` and `ALL_TABS`**

Find this exact block:

```js
const ROLE_TABS = {
  admin:               ['events','groups','signups','applications','subscribers','rsvps','prayer','retreat','attendance','sermons','email','settings','users','people','growthtrack'],
  event_manager:       ['events','rsvps','sermons','email'],
  small_group_leader:  ['groups','signups','mygroup'],
};
```

Replace with:

```js
const ROLE_TABS = {
  admin:               ['events','groups','signups','applications','subscribers','rsvps','prayer','retreat','attendance','sermons','email','settings','users','people','analytics','growthtrack'],
  event_manager:       ['events','rsvps','sermons','email'],
  small_group_leader:  ['groups','signups','mygroup'],
};
```

Find this exact block:

```js
const ALL_TABS = ['events','groups','signups','applications','subscribers','rsvps','prayer','retreat','attendance','sermons','email','settings','users','people','mygroup','growthtrack'];
```

Replace with:

```js
const ALL_TABS = ['events','groups','signups','applications','subscribers','rsvps','prayer','retreat','attendance','sermons','email','settings','users','people','analytics','mygroup','growthtrack'];
```

- [ ] **Step 4: Wire up the tab title and render dispatch in `switchTab`**

Find this exact block:

```js
  const titles = {events:'Events',groups:'Small Groups',signups:'Sign-Up Requests',applications:'Leader Applications',subscribers:'Newsletter Subscribers',rsvps:'Event RSVPs',prayer:'Prayer Requests',retreat:'Retreat 2026',attendance:'Attendance',sermons:'Sermons',email:'Email',settings:'Settings',users:'User Permissions',people:'Members & Assessments',mygroup:'My Group',growthtrack:'Growth Track'};
```

Replace with:

```js
  const titles = {events:'Events',groups:'Small Groups',signups:'Sign-Up Requests',applications:'Leader Applications',subscribers:'Newsletter Subscribers',rsvps:'Event RSVPs',prayer:'Prayer Requests',retreat:'Retreat 2026',attendance:'Attendance',sermons:'Sermons',email:'Email',settings:'Settings',users:'User Permissions',people:'Members & Assessments',analytics:'Analytics',mygroup:'My Group',growthtrack:'Growth Track'};
```

Find this exact block:

```js
  else if(tab==='people')  renderPeoplePanel();
  else if(tab==='mygroup') renderMyGroupPanel();
```

Replace with:

```js
  else if(tab==='people')  renderPeoplePanel();
  else if(tab==='analytics') renderAnalyticsTab();
  else if(tab==='mygroup') renderMyGroupPanel();
```

- [ ] **Step 5: Add the panel HTML**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```html
    <div class="tab-panel" id="panelGrowthtrack">
      <div class="action-bar">
        <h2>Growth Track</h2>
      </div>
      <div id="gtCards" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px;"></div>
    </div>

  </div>
</div>
```

Replace with:

```html
    <div class="tab-panel" id="panelGrowthtrack">
      <div class="action-bar">
        <h2>Growth Track</h2>
      </div>
      <div id="gtCards" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px;"></div>
    </div>

    <div class="tab-panel" id="panelAnalytics">
      <div class="action-bar">
        <h2>Assessment Analytics</h2>
      </div>
      <div id="analyticsEmpty" style="display:none;color:var(--text-muted);padding:20px;">
        No assessment data yet — once members start taking the DISC and Spiritual Gifts assessments, their results will appear here.
      </div>
      <div id="analyticsContent" style="display:none;">
        <div class="stats-row" style="grid-template-columns:repeat(2,1fr);margin-bottom:24px;">
          <div class="stat-card"><div class="num" id="analyticsDiscStat">–</div><div class="lbl">Members Taken DISC</div></div>
          <div class="stat-card"><div class="num" id="analyticsGiftsStat">–</div><div class="lbl">Members Taken Gifts</div></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:24px;">
          <div class="chart-card" style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:20px;">
            <h3 style="font-size:1.05rem;margin-bottom:14px;">DISC Distribution</h3>
            <div id="analyticsDiscChart"></div>
          </div>
          <div class="chart-card" style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:20px;">
            <h3 style="font-size:1.05rem;margin-bottom:14px;">Spiritual Gifts Distribution</h3>
            <div id="analyticsGiftsChart" style="max-height:520px;overflow-y:auto;"></div>
          </div>
        </div>
        <div class="chart-card" style="background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:20px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="font-size:1.05rem;">Claude Ministry Analysis</h3>
            <button class="btn btn-primary btn-sm" id="analyticsGenerateBtn" onclick="generateClaudeAnalysis()">Generate Analysis</button>
          </div>
          <div id="analyticsReports"></div>
        </div>
      </div>
    </div>

  </div>
</div>
```

- [ ] **Step 6: Verify div/tag balance again**

Run the same balance-check command from Step 2.
Expected: `BALANCED`.

- [ ] **Step 7: Add the JS logic**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```js
function giftNames(a) { try { const n = JSON.parse(a.result); return Array.isArray(n) ? n : []; } catch(e) { return []; } }
```

Insert immediately after it:

```js

/* ── ASSESSMENT ANALYTICS ─────────────────────────────────── */
let _analyticsReports = [];

function computeAssessmentAnalytics(profiles, attempts, content) {
  const approved = profiles.filter(p => p.status === 'approved');
  const latest = latestByUser(attempts);
  const gifts = content.filter(c => c.kind === 'gift');

  const discCounts = { D: 0, I: 0, S: 0, C: 0 };
  let discTaken = 0;
  const giftCounts = {};
  gifts.forEach(g => { giftCounts[(g.extra && g.extra.name) || g.code] = 0; });
  let giftsTaken = 0;

  approved.forEach(p => {
    const a = latest[p.userId] || {};
    if (a.disc) {
      discTaken++;
      a.disc.result.split('').forEach(letter => { if (discCounts[letter] !== undefined) discCounts[letter]++; });
    }
    if (a.gifts) {
      giftsTaken++;
      giftNames(a.gifts).forEach(name => { if (giftCounts[name] !== undefined) giftCounts[name]++; });
    }
  });

  const giftMinistries = {};
  gifts.forEach(g => { giftMinistries[(g.extra && g.extra.name) || g.code] = (g.extra && g.extra.ministries) || []; });

  return {
    totalApprovedMembers: approved.length,
    discTaken, giftsTaken,
    discCounts, giftCounts, giftMinistries,
  };
}

function analyticsBarList(counts, maxScale) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = maxScale || Math.max(1, ...entries.map(([, v]) => v));
  return entries.map(([label, count]) => `
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0;font-size:.85rem;">
      <span style="width:130px;flex-shrink:0;">${escapeHtml(label)}</span>
      <div style="flex:1;height:10px;background:#eee;border-radius:6px;overflow:hidden;">
        <div style="width:${(count / max) * 100}%;height:100%;background:var(--primary);"></div>
      </div>
      <span style="width:24px;text-align:right;color:var(--text-muted);">${count}</span>
    </div>`).join('');
}

async function renderAnalyticsTab() {
  const [profiles, attempts, content] = await Promise.all([
    SupaDB.adminGetAllMemberProfiles(), SupaDB.getVisibleAttempts(), SupaDB.getAssessmentContent(),
  ]);
  const stats = computeAssessmentAnalytics(profiles, attempts, content);
  window._analyticsStats = stats;

  const hasData = stats.totalApprovedMembers > 0 && (stats.discTaken > 0 || stats.giftsTaken > 0);
  document.getElementById('analyticsEmpty').style.display = hasData ? 'none' : '';
  document.getElementById('analyticsContent').style.display = hasData ? '' : 'none';
  document.getElementById('analyticsGenerateBtn').disabled = !hasData;
  if (!hasData) return;

  const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;
  document.getElementById('analyticsDiscStat').textContent =
    `${stats.discTaken} / ${stats.totalApprovedMembers} (${pct(stats.discTaken, stats.totalApprovedMembers)}%)`;
  document.getElementById('analyticsGiftsStat').textContent =
    `${stats.giftsTaken} / ${stats.totalApprovedMembers} (${pct(stats.giftsTaken, stats.totalApprovedMembers)}%)`;

  document.getElementById('analyticsDiscChart').innerHTML = analyticsBarList(stats.discCounts);
  document.getElementById('analyticsGiftsChart').innerHTML = analyticsBarList(stats.giftCounts);

  await loadAnalyticsReports();
}

async function loadAnalyticsReports() {
  _analyticsReports = await SupaDB.adminGetAssessmentAnalyticsReports();
  const box = document.getElementById('analyticsReports');
  if (!_analyticsReports.length) {
    box.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;">No analysis generated yet.</p>';
    return;
  }
  box.innerHTML = _analyticsReports.map((r, i) => {
    const dateStr = new Date(r.createdAt).toLocaleString();
    const bodyHtml = r.analysisText.split('\n').map(line => `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`).join('');
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:10px;overflow:hidden;">
        <div onclick="const d=this.nextElementSibling; const open=d.style.display==='none'; d.style.display=open?'':'none'; this.querySelector('.acc-chevron').textContent=open?'▲':'▼';"
             style="cursor:pointer;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;background:#fafafa;">
          <span style="font-size:.85rem;"><strong>${dateStr}</strong>${r.createdBy ? ' · ' + escapeHtml(r.createdBy) : ''}</span>
          <span class="acc-chevron" style="color:var(--text-muted);">${i === 0 ? '▲' : '▼'}</span>
        </div>
        <div style="${i === 0 ? '' : 'display:none;'}padding:14px;font-size:.88rem;">${bodyHtml}</div>
      </div>`;
  }).join('');
}

async function generateClaudeAnalysis() {
  const btn = document.getElementById('analyticsGenerateBtn');
  const stats = window._analyticsStats;
  if (!stats) return;
  btn.disabled = true; btn.textContent = 'Generating… (up to a minute)';
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/analyze-assessments', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ summaryStats: stats }),
    });
    const json = await res.json();
    if (json.error) { showToast(json.error, true); return; }
    const saveResult = await SupaDB.adminSaveAssessmentAnalyticsReport({ summaryStats: stats, analysisText: json.analysisText });
    if (saveResult.error) { showToast(saveResult.error, true); return; }
    showToast('Analysis generated');
    await loadAnalyticsReports();
  } catch(e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Generate Analysis';
  }
}
```

`escapeHtml`, `showToast`, `latestByUser`, `giftNames`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` are all already defined/in scope elsewhere in this file — no new imports needed. `analyticsBarList`'s per-row analysis-text rendering escapes each line (`escapeHtml`) since Claude's output is model-generated text, not admin-authored trusted content like the assessment descriptions — unlike those, it must not be trusted as raw HTML.

- [ ] **Step 8: Verify div/tag balance one more time**

Run the same balance-check command from Step 2.
Expected: `BALANCED` (this step only touches `<script>` content, so the count should be unchanged from Step 6).

- [ ] **Step 9: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 10: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Assessment Analytics tab with participation stats, distribution charts, and Claude ministry-gap analysis"
```

---

### Task 5: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (the project's existing `static-site` preview launch config). Confirm:

- `admin/dashboard.html` loads with no console errors beyond the expected unauthenticated redirect to login.
- `node --check js/db.js` and the `admin/dashboard.html` script-syntax check (Task 4, Step 9) both still pass.

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual steps required before this feature works (report to user, do not attempt yourself)**

1. Run `supabase/assessment-analytics-schema.sql` in the Supabase SQL editor (same DB serves staging and production per this project's setup).
2. Deploy the new function: `supabase functions deploy analyze-assessments` (requires the user's Supabase CLI session).
3. Add an `ANTHROPIC_API_KEY` secret via the Supabase Dashboard → Settings → Secrets.

- [ ] **Step 4: Manual verification on staging (after the user completes Step 3's prerequisites)**

1. Log into `admin/dashboard.html` as an admin, confirm the new "Analytics" sidebar item appears (and does **not** appear when logged in as an `event_manager` or `small_group_leader` role account, if one is available to test with).
2. Confirm the participation stat cards, DISC distribution bars, and Gifts distribution bars all show correct counts — cross-check a couple of numbers by hand against the Members tab's DISC/Gift filters.
3. Click "Generate Analysis" — confirm the button shows a loading state, then a new report appears at the top of the history, expanded, with ministry-gap-focused prose (not just a restatement of the counts).
4. Reload the page, switch away and back to the Analytics tab — confirm the generated report is still there (persisted, not just in-memory).
5. Generate a second analysis — confirm both reports now appear in history, most recent expanded, the older one collapsed but clickable.
6. If feasible, temporarily test the "no data" empty state (e.g. against a fresh/empty environment, or by reasoning about the `hasData` check) — not required if there's no easy way to simulate zero approved members with assessments on staging.

- [ ] **Step 5: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
