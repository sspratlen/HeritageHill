# Assessments Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members register, take DISC + spiritual-gifts assessments, and see results; admins approve members, browse a roster with drill-in, and view church-wide analytics; group leaders see opted-in members of their groups.

**Architecture:** Static HTML pages + Supabase (Postgres/RLS/Auth) + Chart.js, exactly like the rest of the site. Three new tables (`member_profiles`, `assessment_attempts`, `assessment_content`), four new member pages sharing `css/portal.css`, scoring in `js/assessments.js`, new "People" tab in `admin/dashboard.html`, new `admin/gifts-dashboard.html` analytics page.

**Tech Stack:** Vanilla JS, Supabase JS v2 (`window._supabase` via `js/supabase-client.js`, `SupaDB` API in `js/db.js`), Chart.js (CDN, as in attendance-dashboard), Deno edge functions.

**Spec:** `docs/superpowers/specs/2026-07-22-church-management-assessments-design.md`

**Testing note:** This repo is a static site with no test framework. Each task ends with concrete manual/SQL verification steps instead of automated tests. Scoring logic (the one pure-logic unit) gets a browser-console test harness in Task 4.

**Copyright rule:** NEVER commit question text, gift descriptions, or blend descriptions from the Growth Track book. All content ships as a placeholder seed template that Scott fills in himself.

**Key facts an implementer needs:**
- `groups.id` is `bigint generated always as identity` (verified in `supabase/schema.sql:45`).
- `user_roles` is keyed by lowercase `email` with `role` in `admin|event_manager|small_group_leader`. Members must NEVER get a `user_roles` row (privilege-escalation risk; see spec).
- Existing auth guard pattern: `SupaDB.getUser()` → redirect to `login.html?next=...` if null.
- `SupaDB` methods return camelCase objects; snake_case↔camelCase mappers live at the top of `js/db.js`.
- Site pushes: commit → `git push staging HEAD:main` → verify on staging → `git push origin HEAD:main`. NEVER push origin without staging first.

---

### Task 1: Database schema + RLS

**Files:**
- Create: `supabase/assessments-schema.sql`

- [ ] **Step 1: Write the schema file**

```sql
-- ============================================================
-- Assessments module: member_profiles, assessment_attempts,
-- assessment_content + RLS. Run in Supabase SQL editor.
-- Safe to re-run (idempotent).
-- ============================================================

-- ── Helper functions ─────────────────────────────────────────
create or replace function public.jwt_email() returns text
language sql stable as
$$ select lower(coalesce(auth.jwt()->>'email','')) $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (
     select 1 from public.user_roles
     where lower(email) = public.jwt_email() and role = 'admin'
   ) $$;

-- ── Tables ───────────────────────────────────────────────────
create table if not exists public.member_profiles (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  name              text not null,
  email             text not null,
  phone             text not null default '',
  group_id          bigint references public.groups(id) on delete set null,
  years_attending   text not null default '',
  status            text not null default 'pending' check (status in ('pending','approved')),
  share_with_leader boolean not null default false,
  created_at        timestamptz not null default now()
);

create table if not exists public.assessment_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  assessment_type text not null check (assessment_type in ('disc','gifts')),
  answers         jsonb not null,
  scores          jsonb not null,
  result          text not null,
  completed_at    timestamptz not null default now()
);
create index if not exists assessment_attempts_user_type_idx
  on public.assessment_attempts (user_id, assessment_type, completed_at desc);

create table if not exists public.assessment_content (
  id    uuid primary key default gen_random_uuid(),
  kind  text not null check (kind in ('disc_question','disc_blend','gift_question','gift')),
  code  text not null default '',   -- disc_question: D/I/S/C · disc_blend: e.g. DI · gift_question: gift letter A-X · gift: letter A-X
  sort  int  not null default 0,    -- display order within kind
  text  text not null,              -- question text / description body
  extra jsonb not null default '{}'::jsonb  -- gift: {"name","scriptures","ministries":[]} · blend: {"name","scriptures"}
);

-- ── Prevent members from self-approving / changing email ────
create or replace function public.protect_member_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.status := old.status;
    new.email  := old.email;
  end if;
  return new;
end $$;

drop trigger if exists member_profiles_protect on public.member_profiles;
create trigger member_profiles_protect
  before update on public.member_profiles
  for each row execute function public.protect_member_profile_fields();

-- ── RLS ──────────────────────────────────────────────────────
alter table public.member_profiles    enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_content enable row level security;

-- member_profiles
drop policy if exists "own profile insert"    on public.member_profiles;
drop policy if exists "own profile select"    on public.member_profiles;
drop policy if exists "own profile update"    on public.member_profiles;
drop policy if exists "admin all profiles"    on public.member_profiles;
drop policy if exists "leader shared profiles" on public.member_profiles;

create policy "own profile insert" on public.member_profiles
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own profile select" on public.member_profiles
  for select to authenticated using (auth.uid() = user_id);
create policy "own profile update" on public.member_profiles
  for update to authenticated using (auth.uid() = user_id);
create policy "admin all profiles" on public.member_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "leader shared profiles" on public.member_profiles
  for select to authenticated using (
    share_with_leader and status = 'approved' and group_id in (
      select id from public.groups
      where lower(leader_email) = public.jwt_email()
    )
  );

-- assessment_attempts (no update policy: attempts are immutable)
drop policy if exists "own attempts insert"   on public.assessment_attempts;
drop policy if exists "own attempts select"   on public.assessment_attempts;
drop policy if exists "admin all attempts"    on public.assessment_attempts;
drop policy if exists "leader shared attempts" on public.assessment_attempts;

create policy "own attempts insert" on public.assessment_attempts
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own attempts select" on public.assessment_attempts
  for select to authenticated using (auth.uid() = user_id);
create policy "admin all attempts" on public.assessment_attempts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "leader shared attempts" on public.assessment_attempts
  for select to authenticated using (
    user_id in (
      select mp.user_id from public.member_profiles mp
      where mp.share_with_leader and mp.status = 'approved' and mp.group_id in (
        select id from public.groups
        where lower(leader_email) = public.jwt_email()
      )
    )
  );

-- assessment_content
drop policy if exists "authed read content" on public.assessment_content;
drop policy if exists "admin write content" on public.assessment_content;

create policy "authed read content" on public.assessment_content
  for select to authenticated using (true);
create policy "admin write content" on public.assessment_content
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
```

- [ ] **Step 2: Have Scott run it in the Supabase SQL editor** (Claude cannot; the Supabase MCP is unauthenticated in this session). Paste the whole file, run once.

- [ ] **Step 3: Verify** — run in SQL editor:

```sql
select tablename, rowsecurity from pg_tables
 where tablename in ('member_profiles','assessment_attempts','assessment_content');
select polname, tablename from pg_policies
 where tablename in ('member_profiles','assessment_attempts','assessment_content');
```
Expected: all three tables `rowsecurity = true`; 11 policies total (5 + 4 + 2).

- [ ] **Step 4: Commit**

```bash
git add supabase/assessments-schema.sql
git commit -m "Add assessments module schema + RLS"
```

---

### Task 2: Content seed template (placeholders only)

**Files:**
- Create: `supabase/assessments-content-template.sql`

- [ ] **Step 1: Write the template.** Structure below shows the FIRST row of each kind fully plus a repeat-comment; the actual file must contain ALL rows (20 disc_question, 16 disc_blend, 72 gift_question, 24 gift) with `REPLACE_ME` placeholder text. Question→section and question→gift mappings are mechanical and MUST be complete:
  - disc_question sorts 1–5 code `D`, 6–10 code `I`, 11–15 code `S`, 16–20 code `C`.
  - disc_blend codes in order: `D`,`DI`,`DS`,`DC`,`I`,`ID`,`IS`,`IC`,`S`,`SD`,`SI`,`SC`,`C`,`CI`,`CS`,`CD` (sort 1–16).
  - gift_question sort n (1–72) has code = letter A–X where letter index = ((n−1) mod 24). So sorts 1, 25, 49 → `A`; 2, 26, 50 → `B`; … 24, 48, 72 → `X`.
  - gift codes A–X, sort 1–24, extra holds `name` (Administration, Apostleship, Craftsmanship, Discernment, Evangelism, Exhortation, Faith, Giving, Healing, Helps, Hospitality, Intercession, Knowledge, Leadership, Mercy, Miracles, Missionary, Music/Worship, Pastor/Shepherd, Prophecy, Service, Teaching, Tongues & Interpretation, Wisdom — names are a factual list, fine to include), `scriptures: "REPLACE_ME"`, `ministries: []`.

```sql
-- ============================================================
-- Assessments content seed TEMPLATE.
-- Scott: replace every REPLACE_ME with text from the Heritage Hill
-- Growth Track book, fill ministries arrays with Heritage Hill
-- ministry-team names, then run in the Supabase SQL editor.
-- Do NOT commit the filled-in version to git.
-- ============================================================
truncate public.assessment_content;

insert into public.assessment_content (kind, code, sort, text, extra) values
-- DISC questions: 4 sections x 5 statements, rated 1-5
('disc_question','D',1,'REPLACE_ME','{}'),
-- ... rows 2-20 following the section mapping above ...

-- DISC blend descriptions (16)
('disc_blend','D',1,'REPLACE_ME','{"name":"D"}'),
-- ... 15 more ...

-- Gifts questions: 72 statements, rated 1-3
('gift_question','A',1,'REPLACE_ME','{}'),
-- ... rows 2-72 following the (n-1) mod 24 mapping ...

-- Gifts (24): description in text, name/scriptures/ministries in extra
('gift','A',1,'REPLACE_ME','{"name":"Administration","scriptures":"REPLACE_ME","ministries":[]}');
-- ... 23 more ...
```

- [ ] **Step 2: Verify the template mapping** — after writing the full file, run this locally:

```bash
grep -c "disc_question" supabase/assessments-content-template.sql   # expect 21 (20 rows + header comment) or count rows: expect 20 value rows
grep -c "gift_question" supabase/assessments-content-template.sql
```
Expected: 20 `disc_question` rows, 16 `disc_blend`, 72 `gift_question`, 24 `gift`.

- [ ] **Step 3: Commit**

```bash
git add supabase/assessments-content-template.sql
git commit -m "Add assessments content seed template (placeholders)"
```

- [ ] **Step 4: Hand off to Scott** to fill in and run. For development before he finishes, he can run the template as-is — pages will show REPLACE_ME text but everything is exercisable.

---

### Task 3: `SupaDB` methods in `js/db.js`

**Files:**
- Modify: `js/db.js` (add mapper near other mappers ~line 120; add methods before the closing `};` of the SupaDB object, after the User Roles section ~line 830)

- [ ] **Step 1: Add mapper** (after `prayerRequestToDb`):

```js
function memberProfileFromDb(r) {
  return {
    userId: r.user_id, name: r.name, email: r.email, phone: r.phone || '',
    groupId: r.group_id, yearsAttending: r.years_attending || '',
    status: r.status, shareWithLeader: !!r.share_with_leader, createdAt: r.created_at,
  };
}
```

- [ ] **Step 2: Add methods** (new section after `/* ── User Roles ── */` block):

```js
/* ── Member Profiles & Assessments ──────────────────────── */
  async signUpMember(email, password, meta) {
    // meta: { name, phone, groupId, yearsAttending } stored in auth user_metadata;
    // my-profile.html lazily creates the member_profiles row from it.
    if (!db()) return { error: 'Not configured' };
    const { data, error } = await db().auth.signUp({
      email, password,
      options: { data: {
        name: meta.name || '', phone: meta.phone || '',
        group_id: meta.groupId || null, years_attending: meta.yearsAttending || '',
      } },
    });
    if (error) return { error: error.message };
    return { user: data.user, session: data.session };
  },
  async getMyProfile() {
    if (!db()) return null;
    const { data: { user } } = await db().auth.getUser();
    if (!user) return null;
    const { data, error } = await db().from('member_profiles')
      .select('*').eq('user_id', user.id).maybeSingle();
    if (error) { console.error('[SupaDB] getMyProfile:', error.message); return null; }
    return data ? memberProfileFromDb(data) : null;
  },
  async createMyProfile() {
    // Builds the row from the auth user's metadata (registration) or email (staff).
    if (!db()) return { error: 'Not configured' };
    const { data: { user } } = await db().auth.getUser();
    if (!user) return { error: 'Not signed in' };
    const m = user.user_metadata || {};
    const { error } = await db().from('member_profiles').insert({
      user_id: user.id,
      name: m.name || user.email.split('@')[0],
      email: user.email.toLowerCase(),
      phone: m.phone || '',
      group_id: m.group_id || null,
      years_attending: m.years_attending || '',
    });
    if (error) return { error: error.message };
    return { success: true };
  },
  async updateMyProfile({ name, phone, groupId, yearsAttending, shareWithLeader }) {
    if (!db()) return { error: 'Not configured' };
    const { data: { user } } = await db().auth.getUser();
    if (!user) return { error: 'Not signed in' };
    const { error } = await db().from('member_profiles').update({
      name, phone: phone || '', group_id: groupId || null,
      years_attending: yearsAttending || '', share_with_leader: !!shareWithLeader,
    }).eq('user_id', user.id);
    if (error) return { error: error.message };
    return { success: true };
  },
  async adminGetAllMemberProfiles() {
    if (!db()) return [];
    const { data, error } = await db().from('member_profiles')
      .select('*').order('created_at', { ascending: false });
    if (error) { console.error('[SupaDB] adminGetAllMemberProfiles:', error.message); return []; }
    return (data || []).map(memberProfileFromDb);
  },
  async adminSetMemberStatus(userId, status) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('member_profiles')
      .update({ status }).eq('user_id', userId);
    if (error) return { error: error.message };
    return { success: true };
  },
  async adminDeleteMember(userId) {
    // Deletes the auth user via edge function; member_profiles row cascades.
    if (!db()) return { error: 'Not configured' };
    try {
      const { data: { session } } = await db().auth.getSession();
      const res = await fetch(SUPABASE_URL + '/functions/v1/admin-create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (session ? session.access_token : ''),
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ action: 'delete', userId }),
      });
      const json = await res.json();
      if (!res.ok || json.error) return { error: json.error || ('HTTP ' + res.status) };
      return { success: true };
    } catch (e) { return { error: e.message }; }
  },
  async getAssessmentContent() {
    if (!db()) return [];
    const { data, error } = await db().from('assessment_content')
      .select('*').order('sort', { ascending: true });
    if (error) { console.error('[SupaDB] getAssessmentContent:', error.message); return []; }
    return (data || []).map(r => ({
      id: r.id, kind: r.kind, code: r.code, sort: r.sort, text: r.text, extra: r.extra || {},
    }));
  },
  async addAssessmentAttempt({ assessmentType, answers, scores, result }) {
    if (!db()) return { error: 'Not configured' };
    const { data: { user } } = await db().auth.getUser();
    if (!user) return { error: 'Not signed in' };
    const { error } = await db().from('assessment_attempts').insert({
      user_id: user.id, assessment_type: assessmentType,
      answers, scores, result,
    });
    if (error) return { error: error.message };
    return { success: true };
  },
  async getMyAttempts() {
    if (!db()) return [];
    const { data: { user } } = await db().auth.getUser();
    if (!user) return [];
    const { data, error } = await db().from('assessment_attempts')
      .select('*').eq('user_id', user.id).order('completed_at', { ascending: false });
    if (error) { console.error('[SupaDB] getMyAttempts:', error.message); return []; }
    return (data || []).map(attemptFromDb);
  },
  async getVisibleAttempts() {
    // RLS scopes rows: admins see all, leaders see shared group members, members see own.
    if (!db()) return [];
    const { data, error } = await db().from('assessment_attempts')
      .select('*').order('completed_at', { ascending: false });
    if (error) { console.error('[SupaDB] getVisibleAttempts:', error.message); return []; }
    return (data || []).map(attemptFromDb);
  },
  async getVisibleMemberProfiles() {
    // Same idea for leaders (RLS returns shared members of their groups).
    if (!db()) return [];
    const { data, error } = await db().from('member_profiles')
      .select('*').order('name', { ascending: true });
    if (error) { console.error('[SupaDB] getVisibleMemberProfiles:', error.message); return []; }
    return (data || []).map(memberProfileFromDb);
  },
```

- [ ] **Step 3: Add `attemptFromDb` mapper** (next to `memberProfileFromDb`):

```js
function attemptFromDb(r) {
  return {
    id: r.id, userId: r.user_id, assessmentType: r.assessment_type,
    answers: r.answers, scores: r.scores, result: r.result, completedAt: r.completed_at,
  };
}
```

- [ ] **Step 4: Verify** — open any admin page on the local preview, run in browser console:

```js
typeof SupaDB.signUpMember === 'function' && typeof SupaDB.getVisibleAttempts === 'function'
```
Expected: `true`. Also confirm no syntax error banner in console on page load.

- [ ] **Step 5: Commit**

```bash
git add js/db.js
git commit -m "Add member profile + assessment methods to SupaDB"
```

---

### Task 4: Scoring module `js/assessments.js`

**Files:**
- Create: `js/assessments.js`

- [ ] **Step 1: Write the module** — pure functions, no DOM, no Supabase:

```js
/* ================================================================
   Heritage Hill — Assessment scoring (pure functions)
   ================================================================ */
const Assessments = {
  // answers: { [contentRowId]: 1..5 }, questions: [{id, code}] where code ∈ D/I/S/C
  scoreDisc(answers, questions) {
    const totals = { D: 0, I: 0, S: 0, C: 0 };
    questions.forEach(q => { totals[q.code] += (answers[q.id] || 0); });
    const order = ['D', 'I', 'S', 'C'];   // book box order = tiebreak order
    const ranked = order.slice().sort((a, b) =>
      totals[b] - totals[a] || order.indexOf(a) - order.indexOf(b));
    return { totals, result: ranked[0] + ranked[1] };
  },

  // answers: { [contentRowId]: 1..3 }, questions: [{id, code}] code ∈ A..X,
  // gifts: [{code, extra:{name}}]
  scoreGifts(answers, questions, gifts) {
    const totals = {};
    gifts.forEach(g => { totals[g.code] = 0; });
    questions.forEach(q => { totals[q.code] += (answers[q.id] || 0); });
    const sorted = gifts.slice().sort((a, b) =>
      totals[b.code] - totals[a.code] || a.code.localeCompare(b.code));
    const thirdScore = sorted.length >= 3 ? totals[sorted[2].code] : 0;
    const top = sorted.filter((g, i) => i < 3 || totals[g.code] === thirdScore);
    return { totals, result: top.map(g => (g.extra && g.extra.name) || g.code) };
  },

  // Splits a content dump (from SupaDB.getAssessmentContent) by kind.
  splitContent(rows) {
    const by = k => rows.filter(r => r.kind === k).sort((a, b) => a.sort - b.sort);
    return {
      discQuestions: by('disc_question'),
      discBlends:    by('disc_blend'),
      giftQuestions: by('gift_question'),
      gifts:         by('gift'),
    };
  },
};
```

- [ ] **Step 2: Write the console test harness** at the bottom of the same file:

```js
// Run Assessments.selfTest() in the browser console to verify scoring.
Assessments.selfTest = function () {
  const dq = [];
  ['D','I','S','C'].forEach((c, s) => {
    for (let i = 0; i < 5; i++) dq.push({ id: c + i, code: c });
  });
  // All D answers 5, I=4, S=2, C=1 → totals D25 I20 S10 C5 → "DI"
  const a1 = {}; dq.forEach(q => {
    a1[q.id] = { D: 5, I: 4, S: 2, C: 1 }[q.code];
  });
  const r1 = Assessments.scoreDisc(a1, dq);
  console.assert(r1.result === 'DI' && r1.totals.D === 25, 'disc basic', r1);
  // Tie: D and I both 25 → tiebreak D first → "DI"
  const a2 = {}; dq.forEach(q => { a2[q.id] = { D: 5, I: 5, S: 2, C: 1 }[q.code]; });
  console.assert(Assessments.scoreDisc(a2, dq).result === 'DI', 'disc tie');

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWX'.split('');
  const gifts = letters.map((c, i) => ({ code: c, sort: i + 1, extra: { name: 'Gift' + c } }));
  const gq = [];
  for (let n = 1; n <= 72; n++) gq.push({ id: 'q' + n, code: letters[(n - 1) % 24] });
  // A=3s (9), B=3s (9), C=2s (6), everything else 1 (3) → top3 A,B,C
  const a3 = {}; gq.forEach(q => {
    a3[q.id] = q.code === 'A' || q.code === 'B' ? 3 : q.code === 'C' ? 2 : 1;
  });
  const r3 = Assessments.scoreGifts(a3, gq, gifts);
  console.assert(JSON.stringify(r3.result) === '["GiftA","GiftB","GiftC"]', 'gifts basic', r3);
  // Tie at 3rd: C and D both 6 → both included (4 results)
  const a4 = {}; gq.forEach(q => {
    a4[q.id] = q.code === 'A' || q.code === 'B' ? 3 : (q.code === 'C' || q.code === 'D') ? 2 : 1;
  });
  const r4 = Assessments.scoreGifts(a4, gq, gifts);
  console.assert(r4.result.length === 4, 'gifts tie at third', r4);
  console.log('Assessments.selfTest: all assertions ran (failures above if any)');
};
```

- [ ] **Step 3: Verify** — open the preview of any page that loads the script (or a bare `about:blank` + paste file), run `Assessments.selfTest()`. Expected: no assertion failures.

- [ ] **Step 4: Commit**

```bash
git add js/assessments.js
git commit -m "Add assessment scoring module with console self-test"
```

---

### Task 5: Shared portal stylesheet `css/portal.css`

**Files:**
- Create: `css/portal.css`

- [ ] **Step 1: Write it** — extracted from login.html's design language (DM Sans, gold `#BC7A1E`, dark `#0D0F14`, rounded cards). Complete file:

```css
/* Heritage Hill member portal — shared styles (register, my-profile, tests) */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --primary: #BC7A1E; --primary-dark: #9A6118;
  --dark: #0D0F14; --border: #E4E4E4; --bg: #F4F4F2;
  --text: #1C1C1E; --text-muted: #6B6B6B;
  --error: #ef4444; --success: #16a34a;
  --radius: 14px; --shadow: 0 2px 14px rgba(0,0,0,.07);
}
body { font-family: 'DM Sans', sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
.portal-topbar {
  background: var(--dark); height: 58px; padding: 0 24px; position: sticky; top: 0; z-index: 50;
  display: flex; align-items: center; justify-content: space-between;
}
.portal-topbar img { height: 30px; }
.portal-topbar .bar-title { color: #fff; font-weight: 700; font-size: 1rem; }
.portal-topbar .bar-actions { display: flex; gap: 14px; align-items: center; }
.portal-topbar a, .portal-topbar button {
  color: rgba(255,255,255,.65); background: none; border: none; cursor: pointer;
  font-family: inherit; font-size: .85rem; font-weight: 500; text-decoration: none;
}
.portal-topbar a:hover, .portal-topbar button:hover { color: #fff; }
.portal-page { max-width: 860px; margin: 0 auto; padding: 28px 20px 64px; }
.portal-card {
  background: #fff; border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 28px; margin-bottom: 20px;
}
.portal-card h2 { font-size: 1.2rem; margin-bottom: 4px; }
.portal-card .sub { color: var(--text-muted); font-size: .9rem; margin-bottom: 20px; }
.form-group { margin-bottom: 16px; }
.form-group label { display: block; font-size: .85rem; font-weight: 600; margin-bottom: 6px; }
.form-group input, .form-group select {
  width: 100%; padding: .65rem 1rem; border: 1.5px solid var(--border); border-radius: 10px;
  font-family: inherit; font-size: .9375rem; outline: none; background: #fff; transition: border-color .2s;
}
.form-group input:focus, .form-group select:focus {
  border-color: var(--primary); box-shadow: 0 0 0 3px rgba(188,122,30,.15);
}
.btn-primary {
  display: inline-block; padding: .7rem 1.6rem; background: var(--primary); color: #fff;
  border: none; border-radius: 50px; font-family: inherit; font-size: .95rem; font-weight: 600;
  cursor: pointer; text-decoration: none; transition: background .2s;
}
.btn-primary:hover { background: var(--primary-dark); }
.btn-primary:disabled { opacity: .6; cursor: default; }
.btn-ghost {
  display: inline-block; padding: .6rem 1.4rem; background: none; color: var(--text);
  border: 1.5px solid var(--border); border-radius: 50px; font-family: inherit;
  font-size: .9rem; font-weight: 600; cursor: pointer; text-decoration: none;
}
.msg-error {
  background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.3); color: var(--error);
  border-radius: 8px; padding: 10px 14px; font-size: .875rem; margin-top: 12px; display: none;
}
.msg-error.show { display: block; }
.msg-success {
  background: rgba(34,197,94,.08); border: 1px solid rgba(34,197,94,.3); color: var(--success);
  border-radius: 8px; padding: 10px 14px; font-size: .875rem; margin-top: 12px; display: none;
}
.msg-success.show { display: block; }
.banner-pending {
  background: rgba(188,122,30,.1); border: 1px solid rgba(188,122,30,.35); color: #92400e;
  border-radius: 10px; padding: 12px 16px; font-size: .9rem; margin-bottom: 20px;
}
/* Test-taking */
.q-block { padding: 18px 0; border-bottom: 1px solid var(--border); }
.q-block:last-child { border-bottom: none; }
.q-text { font-size: .95rem; font-weight: 500; margin-bottom: 10px; }
.q-scale { display: flex; gap: 8px; flex-wrap: wrap; }
.q-scale label {
  flex: 1; min-width: 72px; text-align: center; padding: 9px 6px; border: 1.5px solid var(--border);
  border-radius: 10px; font-size: .8rem; cursor: pointer; user-select: none; transition: all .15s;
}
.q-scale input { display: none; }
.q-scale input:checked + span { font-weight: 700; }
.q-scale label:has(input:checked) { background: var(--primary); border-color: var(--primary); color: #fff; }
.progress-wrap { position: sticky; top: 58px; background: var(--bg); padding: 12px 0; z-index: 40; }
.progress-bar { height: 8px; background: #e6e2da; border-radius: 6px; overflow: hidden; }
.progress-bar > div { height: 100%; background: var(--primary); width: 0; transition: width .25s; }
.progress-label { font-size: .8rem; color: var(--text-muted); margin-top: 6px; }
/* Results */
.result-badge {
  display: inline-block; background: var(--primary); color: #fff; font-weight: 800;
  font-size: 1.6rem; border-radius: 12px; padding: 10px 22px; letter-spacing: .05em;
}
.gift-pill {
  display: inline-block; background: rgba(188,122,30,.12); color: #92400e; font-weight: 700;
  border-radius: 20px; padding: 5px 14px; font-size: .9rem; margin: 0 6px 6px 0;
}
.score-row { display: flex; align-items: center; gap: 10px; margin: 6px 0; font-size: .85rem; }
.score-row .bar { flex: 1; height: 10px; background: #eee; border-radius: 6px; overflow: hidden; }
.score-row .bar > div { height: 100%; background: var(--primary); }
.toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
@media (max-width: 560px) { .q-scale label { min-width: 30%; } }
```

- [ ] **Step 2: Commit**

```bash
git add css/portal.css
git commit -m "Add shared portal stylesheet for member pages"
```

---

### Task 6: `admin/register.html`

**Files:**
- Create: `admin/register.html`

- [ ] **Step 1: Write the page.** Same dark-centered-card look as login.html (inline styles copied from login.html's `<style>` block are fine; it already has everything needed). Body:

```html
<div class="login-wrap">
  <div class="login-logo">
    <img src="../assets/logos/logo-left-full-dark.png" alt="Heritage Hill Church" />
    <span>Member Registration</span>
  </div>
  <div class="login-card" id="registerCard">
    <h2>Create Your Profile</h2>
    <p>Register to take the personality and spiritual gifts assessments.</p>
    <form id="regForm" onsubmit="handleRegister(event)">
      <div class="form-group"><label for="regName">Full Name</label>
        <input type="text" id="regName" required /></div>
      <div class="form-group"><label for="regEmail">Email Address</label>
        <input type="email" id="regEmail" autocomplete="email" required /></div>
      <div class="form-group"><label for="regPhone">Phone (optional)</label>
        <input type="tel" id="regPhone" /></div>
      <div class="form-group"><label for="regGroup">Small Group (optional)</label>
        <select id="regGroup"><option value="">— Not in a group yet —</option></select></div>
      <div class="form-group"><label for="regYears">How long have you attended Heritage Hill?</label>
        <select id="regYears">
          <option value="">— Select —</option>
          <option>Less than 1 year</option><option>1–3 years</option>
          <option>3–5 years</option><option>More than 5 years</option>
        </select></div>
      <div class="form-group"><label for="regPassword">Password</label>
        <input type="password" id="regPassword" placeholder="At least 8 characters" autocomplete="new-password" required /></div>
      <button type="submit" class="btn-login" id="regBtn">Create Account</button>
      <div class="error-msg" id="regError"></div>
    </form>
    <div style="text-align:center; margin-top:14px;">
      <a href="login.html" class="forgot-link" style="text-decoration:underline;">Already have an account? Sign in</a>
    </div>
  </div>
  <!-- Shown when email confirmation is required -->
  <div class="login-card" id="confirmCard" style="display:none;">
    <h2>Check Your Email</h2>
    <p style="margin-bottom:0;">We sent a confirmation link to <strong id="confirmEmail"></strong>. Click it, then sign in to take your assessments.</p>
  </div>
  <a href="../index.html" class="back-link">← Back to Heritage Hill Website</a>
</div>
```

Script (after the same three script tags login.html uses — supabase CDN, `../js/supabase-client.js`, `../js/db.js`):

```js
(async () => {
  const groups = await SupaDB.getAllGroups();   // published groups (existing method)
  const sel = document.getElementById('regGroup');
  groups.forEach(g => {
    const o = document.createElement('option');
    o.value = g.id; o.textContent = g.name;
    sel.appendChild(o);
  });
})();

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('regBtn');
  const err = document.getElementById('regError');
  err.classList.remove('show');
  const pw = document.getElementById('regPassword').value;
  if (pw.length < 8) {
    err.textContent = 'Password must be at least 8 characters.';
    err.classList.add('show'); return;
  }
  btn.textContent = 'Creating…'; btn.disabled = true;
  const email = document.getElementById('regEmail').value.trim();
  const { session, error } = await SupaDB.signUpMember(email, pw, {
    name: document.getElementById('regName').value.trim(),
    phone: document.getElementById('regPhone').value.trim(),
    groupId: document.getElementById('regGroup').value || null,
    yearsAttending: document.getElementById('regYears').value,
  });
  if (error) {
    err.textContent = /already|registered/i.test(error)
      ? 'An account with this email already exists — sign in instead.' : error;
    err.classList.add('show');
    btn.textContent = 'Create Account'; btn.disabled = false;
    return;
  }
  if (session) { window.location.href = 'my-profile.html'; }
  else {
    document.getElementById('registerCard').style.display = 'none';
    document.getElementById('confirmEmail').textContent = email;
    document.getElementById('confirmCard').style.display = 'block';
  }
}
```

Check `js/db.js` for the exact name of the public groups getter (`getAllGroups` vs `getPublishedGroups`) before writing — use whatever exists.

- [ ] **Step 2: Verify in preview** — open `admin/register.html`, confirm groups dropdown populates, register a throwaway email; expect either redirect to my-profile (confirmation off) or the Check Your Email card (confirmation on).

- [ ] **Step 3: Add a "Register" link to `admin/login.html`** under the sign-in button:

```html
<div style="text-align:center; margin-top:8px;">
  <a href="register.html" class="forgot-link" style="text-decoration:underline;">New here? Create a member profile</a>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add admin/register.html admin/login.html
git commit -m "Add member registration page and login link"
```

---

### Task 7: `admin/my-profile.html`

**Files:**
- Create: `admin/my-profile.html`

- [ ] **Step 1: Write the page.** Head loads DM Sans + `../css/portal.css`. Topbar: logo, "My Profile" title, actions = (staff only) "Dashboard" link, "Sign Out" button. Sections:

```html
<div class="portal-page">
  <div id="pendingBanner" class="banner-pending" style="display:none;">
    Your profile is awaiting approval from church staff. You can take your
    assessments now — results will appear to staff once you're approved.
  </div>

  <div class="portal-card" id="profileCard">
    <h2>My Information</h2>
    <p class="sub">Keep your contact info and group up to date.</p>
    <div class="form-group"><label>Full Name</label><input id="pfName" /></div>
    <div class="form-group"><label>Email</label><input id="pfEmail" disabled /></div>
    <div class="form-group"><label>Phone</label><input id="pfPhone" /></div>
    <div class="form-group"><label>Small Group</label><select id="pfGroup"></select></div>
    <div class="form-group"><label>How long at Heritage Hill?</label>
      <select id="pfYears">
        <option value="">— Select —</option>
        <option>Less than 1 year</option><option>1–3 years</option>
        <option>3–5 years</option><option>More than 5 years</option>
      </select></div>
    <div class="toggle-row" style="margin:18px 0;">
      <div><strong>Share my results with my group leader</strong>
        <div class="sub" style="margin:0;">Your leader can see your personality and gifts to help you find your place.</div></div>
      <input type="checkbox" id="pfShare" style="width:22px;height:22px;" />
    </div>
    <button class="btn-primary" onclick="saveProfile()">Save Changes</button>
    <div class="msg-success" id="pfSaved">Saved.</div>
    <div class="msg-error" id="pfError"></div>
  </div>

  <div class="portal-card" id="discCard">
    <h2>Personality Assessment</h2>
    <p class="sub">20 questions · about 3 minutes</p>
    <div id="discResult"></div>
    <a href="test-personality.html" class="btn-primary" id="discCta">Take the Assessment</a>
  </div>

  <div class="portal-card" id="giftsCard">
    <h2>Spiritual Gifts Assessment</h2>
    <p class="sub">72 questions · about 6 minutes</p>
    <div id="giftsResult"></div>
    <a href="test-gifts.html" class="btn-primary" id="giftsCta">Take the Assessment</a>
  </div>

  <div class="portal-card">
    <h2>Change Password</h2>
    <div class="form-group"><label>New Password</label><input type="password" id="pwNew" /></div>
    <div class="form-group"><label>Confirm</label><input type="password" id="pwConfirm" /></div>
    <button class="btn-primary" onclick="changePassword()">Update Password</button>
    <div class="msg-success" id="pwSaved">Password updated.</div>
    <div class="msg-error" id="pwError"></div>
  </div>
</div>
```

Script — loads supabase CDN, `../js/supabase-client.js`, `../js/db.js`, `../js/assessments.js`:

```js
let _profile = null, _content = null;

(async () => {
  const user = await SupaDB.getUser();
  if (!user) { window.location.href = 'login.html?next=my-profile.html'; return; }

  // Staff get a Dashboard link in the topbar
  const roleData = await SupaDB.getUserRoleByEmail(user.email);
  if (roleData) document.getElementById('dashLink').style.display = '';

  // Lazy-create profile (covers both fresh registrations and existing staff)
  _profile = await SupaDB.getMyProfile();
  if (!_profile) {
    const r = await SupaDB.createMyProfile();
    if (!r.error) _profile = await SupaDB.getMyProfile();
  }
  if (!_profile) { alert('Could not load your profile. Please try again.'); return; }

  if (_profile.status === 'pending' && !roleData)
    document.getElementById('pendingBanner').style.display = '';

  // Fill form
  document.getElementById('pfName').value  = _profile.name;
  document.getElementById('pfEmail').value = _profile.email;
  document.getElementById('pfPhone').value = _profile.phone;
  document.getElementById('pfYears').value = _profile.yearsAttending || '';
  document.getElementById('pfShare').checked = _profile.shareWithLeader;
  const groups = await SupaDB.getAllGroups();
  const sel = document.getElementById('pfGroup');
  sel.innerHTML = '<option value="">— Not in a group —</option>' +
    groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
  sel.value = _profile.groupId || '';

  // Results
  const [attempts, content] = await Promise.all([
    SupaDB.getMyAttempts(), SupaDB.getAssessmentContent(),
  ]);
  _content = Assessments.splitContent(content);
  renderResult('disc',  attempts.filter(a => a.assessmentType === 'disc'));
  renderResult('gifts', attempts.filter(a => a.assessmentType === 'gifts'));
})();

function renderResult(type, attempts) {
  const box = document.getElementById(type === 'disc' ? 'discResult' : 'giftsResult');
  const cta = document.getElementById(type === 'disc' ? 'discCta' : 'giftsCta');
  if (!attempts.length) return;
  cta.textContent = 'Retake';
  const latest = attempts[0];
  if (type === 'disc') {
    const blend = _content.discBlends.find(b => b.code === latest.result);
    const primary = _content.discBlends.find(b => b.code === latest.result[0]);
    box.innerHTML = `
      <div class="result-badge">${latest.result}</div>
      <div style="margin:14px 0;">
        ${['D','I','S','C'].map(k => `
          <div class="score-row"><strong style="width:16px;">${k}</strong>
            <div class="bar"><div style="width:${(latest.scores[k] / 25) * 100}%"></div></div>
            <span>${latest.scores[k]}</span></div>`).join('')}
      </div>
      ${primary ? `<p style="font-size:.9rem;margin-bottom:10px;">${primary.text}</p>` : ''}
      ${blend && blend !== primary ? `<p style="font-size:.9rem;">${blend.text}</p>` : ''}
      <p class="sub" style="margin-top:10px;">Taken ${new Date(latest.completedAt).toLocaleDateString()}
        ${attempts.length > 1 ? `· ${attempts.length} attempts` : ''}</p>`;
  } else {
    const names = JSON.parse(latest.result);
    box.innerHTML = `
      <div>${names.map(n => `<span class="gift-pill">${n}</span>`).join('')}</div>
      <div style="margin:14px 0;">${names.map(n => {
        const g = _content.gifts.find(x => (x.extra && x.extra.name) === n);
        if (!g) return '';
        const min = (g.extra.ministries || []).join(', ');
        return `<div style="margin-bottom:12px;"><strong>${n}</strong>
          <p style="font-size:.88rem;">${g.text}</p>
          <p class="sub" style="margin:2px 0 0;">${g.extra.scriptures || ''}</p>
          ${min ? `<p class="sub" style="margin:2px 0 0;">Serve here: ${min}</p>` : ''}</div>`;
      }).join('')}</div>
      <p class="sub">Taken ${new Date(latest.completedAt).toLocaleDateString()}
        ${attempts.length > 1 ? `· ${attempts.length} attempts` : ''}</p>`;
  }
}

async function saveProfile() {
  const r = await SupaDB.updateMyProfile({
    name: document.getElementById('pfName').value.trim(),
    phone: document.getElementById('pfPhone').value.trim(),
    groupId: document.getElementById('pfGroup').value || null,
    yearsAttending: document.getElementById('pfYears').value,
    shareWithLeader: document.getElementById('pfShare').checked,
  });
  const ok = document.getElementById('pfSaved'), err = document.getElementById('pfError');
  ok.classList.toggle('show', !r.error);
  err.classList.toggle('show', !!r.error);
  if (r.error) err.textContent = r.error;
  setTimeout(() => ok.classList.remove('show'), 2500);
}

async function changePassword() {
  const pw = document.getElementById('pwNew').value;
  const err = document.getElementById('pwError'), ok = document.getElementById('pwSaved');
  err.classList.remove('show'); ok.classList.remove('show');
  if (pw.length < 8) { err.textContent = 'At least 8 characters.'; err.classList.add('show'); return; }
  if (pw !== document.getElementById('pwConfirm').value) {
    err.textContent = 'Passwords do not match.'; err.classList.add('show'); return;
  }
  const r = await SupaDB.updatePassword(pw);
  if (r && r.error) { err.textContent = r.error; err.classList.add('show'); }
  else { ok.classList.add('show'); document.getElementById('pwNew').value = ''; document.getElementById('pwConfirm').value = ''; }
}

async function signOut() { await SupaDB.signOut(); window.location.href = 'login.html'; }
```

Topbar markup (dashLink hidden by default):

```html
<div class="portal-topbar">
  <span class="bar-title">My Profile — Heritage Hill</span>
  <div class="bar-actions">
    <a href="dashboard.html" id="dashLink" style="display:none;">Dashboard</a>
    <a href="../index.html">Website</a>
    <button onclick="signOut()">Sign Out</button>
  </div>
</div>
```

Check `js/db.js` for the exact names of `signOut` and `updatePassword` before writing; both exist (updatePassword added in the profile-modal work).

- [ ] **Step 2: Verify** — log in as the throwaway member from Task 6: profile card pre-filled from registration metadata, pending banner visible, both test cards show "Take the Assessment". Save a phone change, reload, confirm it persisted. In SQL editor: `select * from member_profiles;` — row exists with `status='pending'`.

- [ ] **Step 3: Commit**

```bash
git add admin/my-profile.html
git commit -m "Add member profile hub page"
```

---

### Task 8: Test pages (`test-personality.html`, `test-gifts.html`)

**Files:**
- Create: `admin/test-personality.html`
- Create: `admin/test-gifts.html`

Both pages share the identical skeleton; only the config object differs. Write personality first, copy for gifts, change the config.

- [ ] **Step 1: Write `admin/test-personality.html`.** Head: DM Sans + `../css/portal.css`. Body: portal topbar ("← My Profile" link, Sign Out) + progress bar + form. Script config + logic:

```js
const TEST = {
  type: 'disc',
  contentKind: 'disc_question',
  scale: [[1,'Never'],[2,'Rarely'],[3,'Sometimes'],[4,'Often'],[5,'Always']],
  draftKey: 'hh_draft_disc',
};

let _questions = [], _gifts = [], _blends = [];

(async () => {
  const user = await SupaDB.getUser();
  if (!user) { window.location.href = 'login.html?next=' + location.pathname.split('/').pop(); return; }
  const content = Assessments.splitContent(await SupaDB.getAssessmentContent());
  _questions = TEST.type === 'disc' ? content.discQuestions : content.giftQuestions;
  _gifts = content.gifts; _blends = content.discBlends;
  if (!_questions.length) {
    document.getElementById('qList').innerHTML =
      '<p style="padding:20px;">The assessment isn\'t set up yet — please check back soon.</p>';
    return;
  }
  const draft = JSON.parse(localStorage.getItem(TEST.draftKey) || '{}');
  document.getElementById('qList').innerHTML = _questions.map((q, i) => `
    <div class="q-block" id="qb${q.id}">
      <div class="q-text">${i + 1}. ${q.text}</div>
      <div class="q-scale">${TEST.scale.map(([v, label]) => `
        <label><input type="radio" name="q${q.id}" value="${v}"
          ${draft[q.id] == v ? 'checked' : ''} onchange="onAnswer()" /><span>${label}</span></label>`).join('')}
      </div>
    </div>`).join('');
  onAnswer();
})();

function collectAnswers() {
  const answers = {};
  _questions.forEach(q => {
    const sel = document.querySelector(`input[name="q${q.id}"]:checked`);
    if (sel) answers[q.id] = Number(sel.value);
  });
  return answers;
}

function onAnswer() {
  const answers = collectAnswers();
  localStorage.setItem(TEST.draftKey, JSON.stringify(answers));
  const done = Object.keys(answers).length, total = _questions.length;
  document.querySelector('.progress-bar > div').style.width = (done / total * 100) + '%';
  document.getElementById('progressLabel').textContent = `${done} of ${total} answered`;
  document.getElementById('submitBtn').disabled = done < total;
}

async function submitTest() {
  const btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  const answers = collectAnswers();
  let scores, result;
  if (TEST.type === 'disc') {
    const r = Assessments.scoreDisc(answers, _questions);
    scores = r.totals; result = r.result;
  } else {
    const r = Assessments.scoreGifts(answers, _questions, _gifts);
    scores = r.totals; result = JSON.stringify(r.result);
  }
  const saved = await SupaDB.addAssessmentAttempt({
    assessmentType: TEST.type, answers, scores, result,
  });
  if (saved.error) {
    alert('Could not save: ' + saved.error);
    btn.disabled = false; btn.textContent = 'See My Results';
    return;
  }
  localStorage.removeItem(TEST.draftKey);
  window.location.href = 'my-profile.html';
}
```

Form footer under `#qList`:

```html
<div style="text-align:center; padding: 24px 0;">
  <button class="btn-primary" id="submitBtn" onclick="submitTest()" disabled>See My Results</button>
</div>
```

- [ ] **Step 2: Write `admin/test-gifts.html`** — copy the file, change title to "Spiritual Gifts Assessment", and config to:

```js
const TEST = {
  type: 'gifts',
  contentKind: 'gift_question',
  scale: [[1,'Almost Never'],[2,'Sometimes'],[3,'Almost Always']],
  draftKey: 'hh_draft_gifts',
};
```

- [ ] **Step 3: Verify** — with template content seeded (REPLACE_ME text is fine): take the personality test as the throwaway member; progress bar fills; submit disabled until all 20 answered; on submit, redirected to my-profile with a blend badge and score bars. Refresh mid-test → answers restored from localStorage. SQL: `select assessment_type, scores, result from assessment_attempts;` shows the row. Repeat for gifts (72 questions, top-3 pills shown).

- [ ] **Step 4: Commit**

```bash
git add admin/test-personality.html admin/test-gifts.html
git commit -m "Add DISC and spiritual gifts test pages"
```

---

### Task 9: Login routing for members

**Files:**
- Modify: `admin/login.html` (the already-logged-in redirect ~line 260 and post-login redirect ~line 288)
- Modify: `admin/dashboard.html` (auth guard ~line 1823)

- [ ] **Step 1: Add a routing helper in login.html's script** and use it in both places:

```js
async function routeAfterLogin() {
  const explicit = new URLSearchParams(window.location.search).get('next');
  if (explicit) { window.location.href = explicit; return; }
  const user = await SupaDB.getUser();
  const roleData = user ? await SupaDB.getUserRoleByEmail(user.email) : null;
  window.location.href = roleData ? 'dashboard.html' : 'my-profile.html';
}
```

Replace the two existing redirect blocks (`const redirect = ... window.location.href = redirect;`) with `await routeAfterLogin();`.

- [ ] **Step 2: Dashboard guard — bounce members.** In dashboard.html's auth IIFE, after `const roleData = await SupaDB.getUserRoleByEmail(user.email);` replace `window._userRole = roleData ? roleData.role : 'admin';` with:

```js
if (!roleData) { window.location.href = 'my-profile.html'; return; }
window._userRole = roleData.role;
```

(Note: this also removes the old default-to-admin fallback, which was itself a latent hole — any authed user without a role row previously rendered the admin UI. RLS protected the data, but the UI shouldn't show either.)

- [ ] **Step 3: Add "My Profile" to the dashboard topbar.** Find the profile (person-icon) button in the topbar; next to it add:

```html
<a href="my-profile.html" title="My Profile & Assessments"
   style="color:rgba(255,255,255,.65); font-size:.85rem; text-decoration:none; margin-right:10px;">My Profile</a>
```

- [ ] **Step 4: Verify** — log in as member → lands on my-profile; member manually opens dashboard.html → bounced back to my-profile. Log in as admin → lands on dashboard; "My Profile" link in topbar works both directions.

- [ ] **Step 5: Commit**

```bash
git add admin/login.html admin/dashboard.html
git commit -m "Route members to my-profile; bounce non-staff from dashboard"
```

---

### Task 10: Edge function — delete member (admin-only)

**Files:**
- Modify: `supabase/functions/admin-create-user/index.ts`

- [ ] **Step 1: Add the delete action.** After `const { email } = await req.json()` change to parse the full body and branch:

```ts
const body = await req.json()
const { email, action, userId } = body

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

if (action === 'delete') {
  // Verify the CALLER is an admin (delete is destructive; create/reset was
  // already exposed, but deletion must be gated).
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  const { data: caller, error: callerErr } = await admin.auth.getUser(jwt)
  if (callerErr || !caller?.user?.email) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  const { data: roleRow } = await admin.from('user_roles')
    .select('role').eq('email', caller.user.email.toLowerCase()).maybeSingle()
  if (!roleRow || roleRow.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Admins only' }), {
      status: 403, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId required' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) throw delErr
  return new Response(JSON.stringify({ ok: true, action: 'deleted' }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ...existing create/reset flow continues below using `email`...
```

(Keep the existing create/reset code path unchanged below this block; the `admin` client is now created once above both paths — delete the duplicate `createClient` call from the old path.)

- [ ] **Step 2: Deploy** — Scott runs (or Claude if supabase CLI is authed):

```bash
supabase functions deploy admin-create-user
```

- [ ] **Step 3: Verify** — from the dashboard as admin (after Task 11 wires the button), delete a throwaway member: auth user gone (Supabase Auth dashboard), `member_profiles` row cascaded. Calling with a member JWT returns 403 (test via console fetch with the member session token).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-create-user/index.ts
git commit -m "Add admin-gated delete action to admin-create-user function"
```

---

### Task 11: Dashboard "People" tab (admin) + "My Group" (leader)

**Files:**
- Modify: `admin/dashboard.html` — sidebar (~line 207 People section), `ROLE_TABS`/`ALL_TABS`/`switchTab` (~lines 1789–1885), new panel HTML (add next to other `panel*` divs), new JS section (add next to other render functions)

- [ ] **Step 1: Sidebar entries.** In the People nav section, after the signups link, add:

```html
<a onclick="switchTab('people')" id="sidePeople" data-tab="people">
  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  Members <span id="peopleBadge" style="display:none; background:#BC7A1E; color:#fff; border-radius:10px; font-size:.7rem; padding:1px 7px; margin-left:auto;">0</span>
</a>
<a onclick="switchTab('mygroup')" id="sideMygroup" data-tab="mygroup">
  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
  My Group
</a>
```

- [ ] **Step 2: Role wiring.**

```js
const ROLE_TABS = {
  admin:               ['events','groups','signups','applications','subscribers','rsvps','prayer','retreat','attendance','sermons','email','settings','users','people'],
  event_manager:       ['events','rsvps','sermons','email'],
  small_group_leader:  ['groups','signups','mygroup'],
};
```

Add `'people','mygroup'` to `ALL_TABS`. In `switchTab`'s `titles` object add `people:'Members & Assessments', mygroup:'My Group'`. Add dispatch lines:

```js
else if(tab==='people')  renderPeoplePanel();
else if(tab==='mygroup') renderMyGroupPanel();
```

Note `switchTab` capitalizes tab → element ids `panelPeople`/`sidePeople` and `panelMygroup`/`sideMygroup` (only first letter uppercased, so `mygroup` → `Mygroup` — panel ids must match exactly).

- [ ] **Step 3: Panel HTML** (next to the other `tab-panel` divs):

```html
<div class="tab-panel" id="panelPeople">
  <div class="panel-actions" style="display:flex; gap:10px; justify-content:flex-end; margin-bottom:14px;">
    <a href="gifts-dashboard.html" class="btn btn-secondary btn-sm">📊 Analytics</a>
  </div>
  <div id="pendingMembersBox" style="display:none; margin-bottom:20px;">
    <h3 style="font-size:.95rem; margin-bottom:10px;">Pending Approval</h3>
    <div id="pendingMembersList"></div>
  </div>
  <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
    <input id="pplSearch" placeholder="Search name or email…" oninput="applyPeopleFilter()"
           style="flex:1; min-width:180px; padding:8px 12px; border:1.5px solid var(--border); border-radius:8px;" />
    <select id="pplGiftFilter" onchange="applyPeopleFilter()"><option value="">All Gifts</option></select>
    <select id="pplDiscFilter" onchange="applyPeopleFilter()">
      <option value="">All Personalities</option>
      <option value="D">D</option><option value="I">I</option><option value="S">S</option><option value="C">C</option>
    </select>
    <select id="pplGroupFilter" onchange="applyPeopleFilter()"><option value="">All Groups</option></select>
  </div>
  <div id="peopleTableWrap"></div>
</div>

<div class="tab-panel" id="panelMygroup">
  <p style="font-size:.85rem; color:var(--text-muted); margin-bottom:14px;">
    Members of your groups who chose to share their assessment results with you.
  </p>
  <div id="myGroupTableWrap"></div>
</div>

<!-- Member drill-in modal -->
<div class="modal-overlay" id="memberModal" style="display:none;">
  <div class="modal" style="max-width:640px;">
    <div class="modal-header"><h3 id="mmName"></h3>
      <button class="modal-close" onclick="document.getElementById('memberModal').style.display='none'">×</button></div>
    <div class="modal-body" id="mmBody"></div>
  </div>
</div>
```

(Match the modal/button class names actually used in dashboard.html — check an existing modal like `groupAttendanceModal` and copy its exact structure/classes.)

- [ ] **Step 4: JS section.** Core logic (uses camelCase SupaDB objects; latest attempt per user/type computed once):

```js
/* PEOPLE (members & assessments) */
let _pplProfiles = [], _pplLatest = {}; // _pplLatest[userId] = {disc, gifts}

function latestByUser(attempts) {
  const map = {};
  attempts.forEach(a => {
    map[a.userId] = map[a.userId] || {};
    if (!map[a.userId][a.assessmentType]) map[a.userId][a.assessmentType] = a; // list is newest-first
  });
  return map;
}
function giftNames(a) { try { return JSON.parse(a.result); } catch(e) { return []; } }

async function renderPeoplePanel() {
  const [profiles, attempts, groups, content] = await Promise.all([
    SupaDB.adminGetAllMemberProfiles(), SupaDB.getVisibleAttempts(),
    SupaDB.adminGetAllGroups(), SupaDB.getAssessmentContent(),
  ]);
  _pplProfiles = profiles; _pplLatest = latestByUser(attempts);
  window._pplGroups = groups;

  // Pending list + badge
  const pending = profiles.filter(p => p.status === 'pending');
  const badge = document.getElementById('peopleBadge');
  badge.style.display = pending.length ? '' : 'none';
  badge.textContent = pending.length;
  const box = document.getElementById('pendingMembersBox');
  box.style.display = pending.length ? '' : 'none';
  document.getElementById('pendingMembersList').innerHTML = pending.map(p => `
    <div style="display:flex; align-items:center; gap:12px; padding:10px 12px; background:#fff7ea; border:1px solid rgba(188,122,30,.3); border-radius:10px; margin-bottom:8px;">
      <div style="flex:1;"><strong>${p.name}</strong> · ${p.email}
        <span style="color:var(--text-muted); font-size:.82rem;">
          ${groupName(p.groupId)} · registered ${new Date(p.createdAt).toLocaleDateString()}</span></div>
      <button class="btn btn-primary btn-sm" onclick="approveMember('${p.userId}')">Approve</button>
      <button class="btn btn-danger btn-sm" onclick="deleteMember('${p.userId}','${p.name.replace(/'/g,"\\'")}')">Delete</button>
    </div>`).join('');

  // Filter dropdowns
  const gsel = document.getElementById('pplGroupFilter');
  gsel.innerHTML = '<option value="">All Groups</option>' +
    groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
  const gifts = content.filter(c => c.kind === 'gift');
  document.getElementById('pplGiftFilter').innerHTML = '<option value="">All Gifts</option>' +
    gifts.map(g => `<option>${(g.extra && g.extra.name) || g.code}</option>`).join('');

  applyPeopleFilter();
}

function groupName(id) {
  const g = (window._pplGroups || []).find(x => String(x.id) === String(id));
  return g ? g.name : '—';
}

function applyPeopleFilter() {
  const q = document.getElementById('pplSearch').value.toLowerCase();
  const gift = document.getElementById('pplGiftFilter').value;
  const disc = document.getElementById('pplDiscFilter').value;
  const grp  = document.getElementById('pplGroupFilter').value;
  let rows = _pplProfiles.filter(p => p.status === 'approved');
  if (q) rows = rows.filter(p => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  if (grp) rows = rows.filter(p => String(p.groupId) === String(grp));
  if (disc) rows = rows.filter(p => {
    const a = (_pplLatest[p.userId] || {}).disc;
    return a && a.result[0] === disc;
  });
  if (gift) rows = rows.filter(p => {
    const a = (_pplLatest[p.userId] || {}).gifts;
    return a && giftNames(a).includes(gift);
  });
  document.getElementById('peopleTableWrap').innerHTML = memberTable(rows, true);
}

function memberTable(rows, isAdmin) {
  if (!rows.length) return '<p style="color:var(--text-muted); padding:20px;">No members match.</p>';
  return `<table class="data-table"><thead><tr>
    <th>Name</th><th>Group</th><th>Personality</th><th>Top Gifts</th><th>Last Test</th><th></th>
  </tr></thead><tbody>${rows.map(p => {
    const d = (_pplLatest[p.userId] || {}).disc, g = (_pplLatest[p.userId] || {}).gifts;
    const last = [d, g].filter(Boolean).map(a => a.completedAt).sort().pop();
    return `<tr>
      <td><strong>${p.name}</strong><br><span style="font-size:.8rem; color:var(--text-muted);">${p.email}</span></td>
      <td>${groupName(p.groupId)}</td>
      <td>${d ? d.result : '—'}</td>
      <td>${g ? giftNames(g).slice(0,3).join(', ') : '—'}</td>
      <td>${last ? new Date(last).toLocaleDateString() : '—'}</td>
      <td><button class="btn btn-secondary btn-sm" onclick="openMemberModal('${p.userId}')">View</button></td>
    </tr>`;
  }).join('')}</tbody></table>`;
}

async function approveMember(userId) {
  const r = await SupaDB.adminSetMemberStatus(userId, 'approved');
  if (r.error) { showToast('Error: ' + r.error); return; }
  showToast('Member approved');
  renderPeoplePanel();
}

async function deleteMember(userId, name) {
  if (!confirm(`Delete ${name}'s account entirely? This cannot be undone.`)) return;
  const r = await SupaDB.adminDeleteMember(userId);
  if (r.error) { showToast('Error: ' + r.error); return; }
  showToast('Member deleted');
  renderPeoplePanel();
}

function openMemberModal(userId) {
  const p = _pplProfiles.find(x => x.userId === userId);
  if (!p) return;
  const d = (_pplLatest[userId] || {}).disc, g = (_pplLatest[userId] || {}).gifts;
  document.getElementById('mmName').textContent = p.name;
  document.getElementById('mmBody').innerHTML = `
    <p style="font-size:.9rem;">${p.email}${p.phone ? ' · ' + p.phone : ''}<br>
      ${groupName(p.groupId)} · ${p.yearsAttending || 'tenure not set'} ·
      ${p.shareWithLeader ? 'shares with leader' : 'not shared with leader'}</p>
    <h4 style="margin:16px 0 8px;">Personality</h4>
    ${d ? `<strong style="font-size:1.2rem;">${d.result}</strong>
      ${['D','I','S','C'].map(k => `<div style="font-size:.85rem;">${k}: ${d.scores[k]}</div>`).join('')}
      <p style="font-size:.8rem; color:var(--text-muted);">Taken ${new Date(d.completedAt).toLocaleDateString()}</p>`
      : '<p style="color:var(--text-muted);">Not taken yet.</p>'}
    <h4 style="margin:16px 0 8px;">Spiritual Gifts</h4>
    ${g ? `<p><strong>${giftNames(g).join(', ')}</strong></p>
      <div style="columns:2; font-size:.82rem;">${Object.entries(g.scores)
        .sort((a,b) => b[1]-a[1]).map(([c,s]) => `<div>${c}: ${s}</div>`).join('')}</div>
      <p style="font-size:.8rem; color:var(--text-muted);">Taken ${new Date(g.completedAt).toLocaleDateString()}</p>`
      : '<p style="color:var(--text-muted);">Not taken yet.</p>'}`;
  document.getElementById('memberModal').style.display = 'flex';
}

/* MY GROUP (leader view — RLS already scopes the data) */
async function renderMyGroupPanel() {
  const [profiles, attempts] = await Promise.all([
    SupaDB.getVisibleMemberProfiles(), SupaDB.getVisibleAttempts(),
  ]);
  const me = (window._currentUser && window._currentUser.id) || '';
  _pplProfiles = profiles.filter(p => p.userId !== me);
  _pplLatest = latestByUser(attempts);
  window._pplGroups = window._myGroups || [];
  document.getElementById('myGroupTableWrap').innerHTML = memberTable(_pplProfiles, false);
}
```

Check dashboard.html for the exact names of `showToast`, table css class (`data-table` or otherwise), and button classes; use whatever exists.

- [ ] **Step 5: Badge on load for admins** — in the auth IIFE, after `if (window._userRole === 'admin') updateStats();` add:

```js
if (window._userRole === 'admin') {
  SupaDB.adminGetAllMemberProfiles().then(ps => {
    const n = ps.filter(p => p.status === 'pending').length;
    const b = document.getElementById('peopleBadge');
    if (n) { b.style.display = ''; b.textContent = n; }
  });
}
```

- [ ] **Step 6: Verify** — as admin: Members tab shows pending member with Approve/Delete; approve → member moves to roster; filters narrow correctly; View modal shows scores. As leader (with a member in their group who toggled sharing ON): My Group shows that member only; toggling sharing OFF (as the member) removes them.

- [ ] **Step 7: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Members tab (admin) and My Group view (leader) to dashboard"
```

---

### Task 12: Analytics page `admin/gifts-dashboard.html`

**Files:**
- Create: `admin/gifts-dashboard.html` (clone the structure/styles of `admin/attendance-dashboard.html` — same topbar, stat cards, chart cards, Chart.js CDN)

- [ ] **Step 1: Write the page.** Copy attendance-dashboard.html, strip its charts/stats, keep the CSS + topbar (back link → `dashboard.html?tab=people`, title "Gifts & Personality Analytics"). Auth guard: require login AND `user_roles` row with role `admin` (copy attendance-dashboard's guard; if it only checks login, add the role check and redirect non-admins to `dashboard.html`). Layout:

```html
<div class="stats-grid">
  <div class="stat-card"><div class="stat-label">Approved Members</div><div class="stat-value" id="statMembers">–</div></div>
  <div class="stat-card"><div class="stat-label">Tests Completed</div><div class="stat-value" id="statTests">–</div><div class="stat-sub" id="statTestsSub"></div></div>
  <div class="stat-card"><div class="stat-label">Most Common Gift</div><div class="stat-value" id="statTopGift" style="font-size:1.2rem;">–</div></div>
  <div class="stat-card"><div class="stat-label">Most Common Personality</div><div class="stat-value" id="statTopDisc">–</div></div>
</div>
<div class="charts-grid">
  <div class="chart-card"><div class="chart-title">Gift Distribution <span>members with gift in top 3</span></div>
    <div class="chart-wrap" style="height:520px;"><canvas id="giftChart"></canvas></div></div>
  <div>
    <div class="chart-card" style="margin-bottom:20px;"><div class="chart-title">Personality Types</div>
      <div class="chart-wrap" style="height:200px;"><canvas id="discDonut"></canvas></div></div>
    <div class="chart-card"><div class="chart-title">Least Represented Gifts</div><div id="gapList"></div></div>
  </div>
</div>
<div class="chart-card" style="margin-bottom:24px;"><div class="chart-title">Personality Blends</div>
  <div class="chart-wrap"><canvas id="blendChart"></canvas></div></div>
<div class="chart-card" style="margin-bottom:24px;">
  <div class="chart-title">Ministry Coverage <span>members gifted for each ministry</span></div>
  <div class="chart-wrap"><canvas id="ministryChart"></canvas></div></div>
<div class="chart-card">
  <div class="chart-title">Group Breakdown
    <select id="grpSelect" onchange="renderGroupBreakdown()"></select></div>
  <div id="groupBreakdown"></div>
</div>
<div style="text-align:right; margin-top:16px;">
  <button class="btn-export" onclick="exportCsv()">Export CSV</button>
</div>
```

- [ ] **Step 2: Data + charts JS** (loads db.js + assessments.js + Chart.js):

```js
let _profiles = [], _latest = {}, _content = null, _groups = [];

async function init() {
  const [profiles, attempts, contentRows, groups] = await Promise.all([
    SupaDB.adminGetAllMemberProfiles(), SupaDB.getVisibleAttempts(),
    SupaDB.getAssessmentContent(), SupaDB.adminGetAllGroups(),
  ]);
  _profiles = profiles.filter(p => p.status === 'approved');
  _content = Assessments.splitContent(contentRows);
  _groups = groups;
  const byUser = {};
  attempts.forEach(a => {
    byUser[a.userId] = byUser[a.userId] || {};
    if (!byUser[a.userId][a.assessmentType]) byUser[a.userId][a.assessmentType] = a;
  });
  _latest = byUser;
  render();
}

function approvedLatest(type) {
  return _profiles.map(p => (_latest[p.userId] || {})[type]).filter(Boolean);
}
function giftNames(a) { try { return JSON.parse(a.result); } catch(e) { return []; } }

function render() {
  const discs = approvedLatest('disc'), giftsA = approvedLatest('gifts');

  // Stats
  document.getElementById('statMembers').textContent = _profiles.length;
  const tested = _profiles.filter(p => _latest[p.userId] && (_latest[p.userId].disc || _latest[p.userId].gifts)).length;
  document.getElementById('statTests').textContent = discs.length + giftsA.length;
  document.getElementById('statTestsSub').textContent =
    _profiles.length ? Math.round(tested / _profiles.length * 100) + '% of members tested' : '';

  // Gift distribution
  const giftCounts = {};
  _content.gifts.forEach(g => { giftCounts[g.extra.name || g.code] = 0; });
  giftsA.forEach(a => giftNames(a).forEach(n => { if (n in giftCounts) giftCounts[n]++; }));
  const sortedGifts = Object.entries(giftCounts).sort((a, b) => b[1] - a[1]);
  document.getElementById('statTopGift').textContent = sortedGifts.length && sortedGifts[0][1] ? sortedGifts[0][0] : '–';
  new Chart(document.getElementById('giftChart'), {
    type: 'bar',
    data: { labels: sortedGifts.map(x => x[0]),
      datasets: [{ data: sortedGifts.map(x => x[1]), backgroundColor: '#BC7A1E' }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } },
      scales: { x: { ticks: { precision: 0 } } }, maintainAspectRatio: false },
  });
  document.getElementById('gapList').innerHTML = sortedGifts.slice(-5).reverse().map(([n, c]) =>
    `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border); font-size:.88rem;">
      <span>${n}</span><strong>${c}</strong></div>`).join('');

  // DISC
  const primary = { D: 0, I: 0, S: 0, C: 0 }, blends = {};
  discs.forEach(a => { primary[a.result[0]]++; blends[a.result] = (blends[a.result] || 0) + 1; });
  const topDisc = Object.entries(primary).sort((a, b) => b[1] - a[1])[0];
  document.getElementById('statTopDisc').textContent = topDisc && topDisc[1] ? topDisc[0] : '–';
  new Chart(document.getElementById('discDonut'), {
    type: 'doughnut',
    data: { labels: ['D','I','S','C'], datasets: [{ data: ['D','I','S','C'].map(k => primary[k]),
      backgroundColor: ['#BC7A1E','#155CA2','#16a34a','#6B6B6B'] }] },
    options: { maintainAspectRatio: false },
  });
  const blendCodes = _content.discBlends.map(b => b.code).filter(c => c.length === 2);
  new Chart(document.getElementById('blendChart'), {
    type: 'bar',
    data: { labels: blendCodes, datasets: [{ data: blendCodes.map(c => blends[c] || 0), backgroundColor: '#155CA2' }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } }, maintainAspectRatio: false },
  });

  // Ministry coverage — union of members whose top gifts map to each ministry
  const ministryMembers = {};
  _content.gifts.forEach(g => (g.extra.ministries || []).forEach(m => { ministryMembers[m] = new Set(); }));
  _profiles.forEach(p => {
    const a = (_latest[p.userId] || {}).gifts;
    if (!a) return;
    giftNames(a).forEach(n => {
      const g = _content.gifts.find(x => x.extra.name === n);
      (g && g.extra.ministries || []).forEach(m => ministryMembers[m].add(p.userId));
    });
  });
  const mEntries = Object.entries(ministryMembers).map(([m, s]) => [m, s.size]).sort((a, b) => b[1] - a[1]);
  new Chart(document.getElementById('ministryChart'), {
    type: 'bar',
    data: { labels: mEntries.map(x => x[0]), datasets: [{ data: mEntries.map(x => x[1]), backgroundColor: '#BC7A1E' }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { precision: 0 } } }, maintainAspectRatio: false },
  });

  // Group select
  document.getElementById('grpSelect').innerHTML =
    _groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
  renderGroupBreakdown();
}

function renderGroupBreakdown() {
  const gid = document.getElementById('grpSelect').value;
  const members = _profiles.filter(p => String(p.groupId) === String(gid));
  if (!members.length) {
    document.getElementById('groupBreakdown').innerHTML =
      '<p style="color:var(--text-muted); padding:16px;">No approved members in this group yet.</p>';
    return;
  }
  document.getElementById('groupBreakdown').innerHTML = `<table><thead><tr>
    <th>Name</th><th>Personality</th><th>Top Gifts</th></tr></thead><tbody>` +
    members.map(p => {
      const d = (_latest[p.userId] || {}).disc, g = (_latest[p.userId] || {}).gifts;
      return `<tr><td>${p.name}</td><td>${d ? d.result : '–'}</td>
        <td>${g ? giftNames(g).join(', ') : '–'}</td></tr>`;
    }).join('') + '</tbody></table>';
}

function exportCsv() {
  const headers = ['Name','Email','Group','Personality','Top Gifts','Share w/ Leader'];
  const rows = _profiles.map(p => {
    const d = (_latest[p.userId] || {}).disc, g = (_latest[p.userId] || {}).gifts;
    const grp = _groups.find(x => String(x.id) === String(p.groupId));
    return [p.name, p.email, grp ? grp.name : '', d ? d.result : '',
      g ? giftNames(g).join('; ') : '', p.shareWithLeader ? 'yes' : 'no'];
  });
  const csv = [headers, ...rows].map(r =>
    r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'gifts-personality.csv';
  a.click();
}

init();
```

- [ ] **Step 2b:** Copy the exact auth-guard IIFE pattern from attendance-dashboard.html (lines ~270-283) and add the admin-role check per Step 1.

- [ ] **Step 3: Verify** — as admin with ≥1 approved+tested member: stat cards populate, gift bars render, donut renders, ministry chart renders (empty until ministries arrays are filled — acceptable), group breakdown lists the member, CSV downloads. As leader: page redirects to dashboard.

- [ ] **Step 4: Commit**

```bash
git add admin/gifts-dashboard.html
git commit -m "Add gifts & personality analytics dashboard"
```

---

### Task 13: End-to-end verification + staging deploy

- [ ] **Step 1: Full flow as member** — register fresh email → my-profile (pending banner) → take both tests → results render → toggle share ON → change group to a leader-led group.
- [ ] **Step 2: As admin** — approve the member; roster shows them; filters + modal work; analytics counts them; delete a second throwaway member (auth user + profile both gone).
- [ ] **Step 3: As leader** — My Group shows the shared member; member toggles share OFF → row disappears on refresh.
- [ ] **Step 4: RLS spot-check in SQL editor** (impersonation): as `anon` role no rows visible; via the API as the member only their own rows come back (verify with browser console `SupaDB.getVisibleMemberProfiles()` as the member — expect only self).
- [ ] **Step 5: Scoring cross-check** — hand-work one DISC and one gifts example from the book, enter the same answers on the site, confirm identical totals and result.
- [ ] **Step 6: Deploy to staging**

```bash
git push staging HEAD:main
```
Verify on the staging URL, then have Scott confirm before:

```bash
git push origin HEAD:main
```

---

## Post-plan self-review (done at write time)

- **Spec coverage:** registration+approval (T1,6,11), tests+scoring+history (T1,4,8), member hub+sharing (T7), routing (T9), delete (T10), People tab+leader view (T11), analytics incl. gaps/ministry/group/CSV (T12), content licensing handled via template (T2), rollout (T13). Password-change on my-profile covers spec's profile-hub requirement.
- **Types consistent:** `memberProfileFromDb`/`attemptFromDb` camelCase used everywhere; `result` is text (`"DI"` or JSON array string) parsed via `giftNames()` helper in both dashboard and analytics.
- **Known intentional gaps:** template REPLACE_ME content until Scott fills it; ministry mappings empty until provided.
