# Assessment Analytics (DISC/Gifts Inventory + Claude Analysis) Design Spec

## Purpose

The senior pastor has no congregation-wide view of DISC and Spiritual Gifts results — only the per-member breakdown built in the previous feature. This adds a new admin-only **Analytics** tab showing aggregate participation and distribution across everyone who's taken the assessments, plus an on-demand, Claude-generated "ministry gaps" analysis that goes beyond restating the numbers — it cross-references gift distribution against which ministries each gift serves (already recorded in `assessment_content`) and surfaces where the congregation may be short-handed, along with DISC-pattern observations worth the pastor's attention.

## Confirmed Decisions (from brainstorming)

- Lives in a new top-level "Analytics" sidebar tab, admin-only (same role-gating convention as the existing "Members"/"User Permissions" tabs — listed only in `ROLE_TABS.admin`).
- The Claude analysis is saved with history: each generation is a timestamped, re-viewable row, not an ephemeral one-off.
- The analysis focuses specifically on ministry gaps and coverage (which gifts are thin relative to the ministries that need them, DISC clustering worth noting) rather than a generic summary.
- Only aggregate counts are sent to Claude — no member names, emails, or any other PII. The prompt payload is pure statistics (e.g. "14 people have Administration, 2 have Evangelism") plus each gift's associated ministry names.
- Requires a manual one-time step: an `ANTHROPIC_API_KEY` secret added to the Supabase project (same pattern as the existing `RESEND_API_KEY`/`MAILCHIMP_API_KEY` secrets) — this spec cannot set that; the user must add it via the Supabase dashboard before the feature will work.

## Data Model

### New table: `assessment_analytics_reports`

```
id            bigint identity primary key
created_at    timestamptz not null default now()
created_by    text                          -- admin's email, for a light audit trail
summary_stats jsonb not null                -- the aggregate snapshot this report was generated from
analysis_text text not null                 -- Claude's generated analysis (markdown)
```

- RLS: `select`/`insert` both `using/with check (auth.role() = 'authenticated')` — matching this codebase's established convention (front-end `ROLE_TABS` gating decides who sees the tab at all; RLS itself is broadly "any authenticated staff", the same pattern already used for other admin-only tables like semesters and growth track cancellations).
- `summary_stats` is stored (not recomputed from `analysis_text` alone) so a past report stays internally consistent and auditable even as new assessment attempts come in later — the pastor can see exactly what numbers a given analysis was reacting to.
- No update/delete policy — reports are append-only history, matching the "save history" decision. (Deleting old reports, if ever needed, is a manual Supabase SQL editor action, same as other rarely-needed admin housekeeping in this codebase.)

## Aggregation (client-side, no new read endpoints)

All the raw data this needs is already fetched elsewhere in `admin/dashboard.html`:

- `SupaDB.adminGetAllMemberProfiles()` — for the approved-member count (denominator for participation %).
- `SupaDB.getVisibleAttempts()` — all assessment attempts; admins see all rows via RLS.
- `SupaDB.getAssessmentContent()` — for each gift's `extra.ministries` (the "serve here" list already authored today) and `extra.name`.
- `latestByUser(attempts)` (already defined in `admin/dashboard.html`, used today by the People tab) — dedupes attempts to the latest one per user per assessment type. Reused as-is, not reimplemented.
- `giftNames(a)` (already defined in `admin/dashboard.html`) — parses a gifts attempt's `result` JSON into an array of gift names. Reused as-is.

A new function, `computeAssessmentAnalytics(profiles, attempts, content)`, builds the aggregate snapshot:

```js
function computeAssessmentAnalytics(profiles, attempts, content) {
  const approved = profiles.filter(p => p.status === 'approved');
  const latest = latestByUser(attempts);
  const gifts = content.filter(c => c.kind === 'gift');

  const discCounts = { D: 0, I: 0, S: 0, C: 0 };
  let discTaken = 0;
  const giftCounts = {}; // gift name -> count
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
    discCounts,                 // { D: 12, I: 8, S: 15, C: 6 }
    giftCounts,                 // { Administration: 14, Evangelism: 2, ... } — all 24 keys present, 0 if nobody has it
    giftMinistries,             // { Administration: ["Events","Operations"], ... }
  };
}
```

This mirrors exactly what the DISC/Gifts full-breakdown feature already computes per-member, just summed across everyone instead of shown per person — no new scoring logic, no changes to `js/assessments.js`.

## Analytics Tab UI

**Sidebar:** a new nav link inserted after "Members" (`sidePeople`) and before "My Group", added to `ALL_TABS` and to `ROLE_TABS.admin` only (not `event_manager` or `small_group_leader` — matching how `people`/`users` are admin-only today):

```html
<a onclick="switchTab('analytics')" id="sideAnalytics" data-tab="analytics">
  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  Analytics
</a>
```

**Panel content** (`panelAnalytics`), rendered by `renderAnalyticsTab()`:

1. **Participation stat cards** (reusing the existing top-of-page stat-card visual style already used for Published Events/Small Groups/etc.): "X of Y members (Z%) have taken DISC", same for Gifts.
2. **DISC distribution**: a 4-row bar list (D/I/S/C), each showing the count of people with that letter in their result and a proportional bar — same visual language as the per-member DISC accordion's bars, scaled to the aggregate max instead of a fixed 25-point scale.
3. **Spiritual Gifts distribution**: all 24 gifts as a sorted (highest count first) bar list, same visual language.
4. **Claude Ministry Analysis** section:
   - A "Generate Analysis" button. Disabled with a tooltip/note if `discTaken + giftsTaken === 0` (nothing to analyze yet).
   - Below it, the report history: most recent report shown expanded by default, older ones collapsed in an accordion (same inline self-toggling accordion pattern introduced in the DISC/Gifts full-breakdown feature — reused, not reinvented), each labeled with its `created_at` date and `created_by`.

If there's no data yet (`totalApprovedMembers === 0` or nobody has taken either assessment), the whole panel shows a single empty-state message instead of zeroed-out charts, matching this codebase's general empty-state convention.

## Claude Edge Function: `analyze-assessments`

A new, stateless Supabase Edge Function — it does not touch the database at all; it only calls the Claude API and returns text. Persisting the result is the client's job (see below), matching how this codebase's simplest Edge Functions (`send-contact-email`, `notify-*`) are scoped to one external side-effect each.

- **Input** (POST body): `{ summaryStats }` — the exact object `computeAssessmentAnalytics()` produced. No other fields; no PII is ever included since `summaryStats` contains only counts and gift/ministry names.
- **Auth**: same pattern as `mailchimp`'s admin-only actions — verify the caller's Supabase auth token via `supabase.auth.getUser(token)` before proceeding; reject with 401 if there's no authenticated user. (Not scoped to `role === 'admin'` specifically, matching this codebase's existing convention of role-gating in the front end while RLS/Edge Function auth checks just confirm "is a logged-in staff member" — consistent with how the `mailchimp` function's admin actions already work.)
- **Model call**: `claude-opus-5`, `thinking: {type: "adaptive"}`, non-streaming (the analysis is a bounded-length report, not large enough to need streaming), `max_tokens: 4096`.
- **System prompt** frames Claude as a ministry-planning analyst for a local church, given: total approved members, how many have taken each assessment (so it can note participation gaps too), the DISC letter distribution, the full gift distribution with counts, and each gift's associated ministries. It's explicitly instructed to:
  - Identify specific gifts that are thin (low count, especially zero) relative to the ministries that depend on them, naming those ministries by name.
  - Note any notable DISC-pattern skew (e.g. very few high-D people, if that's relevant to leadership pipeline observations) — only if the data actually supports an observation, not manufactured for every letter.
  - Give a small number of concrete, actionable notes for the pastor, not a restatement of every number already visible in the charts above it.
  - Explicitly avoid inventing specifics about the church not present in the provided data — the analysis is grounded only in the counts it was given.
- **Output**: `{ analysisText: "<markdown text>" }` on success, `{ error: "<message>" }` on failure (matching every other Edge Function's error contract in this codebase).
- **Secret required**: `ANTHROPIC_API_KEY`, set manually in the Supabase dashboard (see Confirmed Decisions).

## Generation Flow

`generateClaudeAnalysis()` in `admin/dashboard.html`:

1. Recompute `summaryStats` fresh via `computeAssessmentAnalytics()` (so the analysis always reflects current data, not a stale render).
2. POST to `SUPABASE_URL + '/functions/v1/analyze-assessments'` with `{ summaryStats }`, using the same `apikey`/`Authorization: Bearer <anon key>` header pattern already used for `send-group-email` and other function calls in this file.
3. On error: show it via `showToast(..., true)`; do not save anything.
4. On success: call `SupaDB.adminSaveAssessmentAnalyticsReport({ summaryStats, analysisText })` (a new SupaDB method — a plain authenticated insert into `assessment_analytics_reports`, mirroring the shape of every other `adminXxx` write method in `js/db.js`), then re-render the report history so the new one appears at the top, expanded.
5. Button shows a loading state ("Generating… this can take up to a minute") while the request is in flight, since the Claude call is synchronous from the client's perspective and may take several seconds.

## Error Handling

- Missing/invalid `ANTHROPIC_API_KEY` on the server: the edge function's fetch to the Claude API fails; it returns `{ error: <message> }`, surfaced via toast — same as any other misconfigured-secret failure in this codebase's existing functions.
- No data to analyze: the "Generate Analysis" button is disabled rather than allowed to produce a request that would fail or produce a vacuous report.
- Report list fetch failure: fails open — the charts above it still render; the history section shows an inline error message rather than blocking the rest of the tab.

## Out of Scope (YAGNI)

- No scheduled/automatic report generation — every report is a manual admin action.
- No editing or deleting of saved reports through the UI (manual SQL if ever needed, matching this codebase's existing rare-housekeeping pattern).
- No per-ministry or per-small-group breakdown beyond what the gift-to-ministry mapping already supports — no new "ministries" table or UI to manage ministry names; this reuses the free-text `extra.ministries` lists already on each gift's content row.
- No changes to individual member-level DISC/Gifts display (the accordion feature already shipped) — this is purely a new aggregate view layered on top.
- No non-admin access (`event_manager`/`small_group_leader` roles do not get this tab).
