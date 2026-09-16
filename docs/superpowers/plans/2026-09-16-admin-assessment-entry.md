# Admin-Entered Assessment Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin record a DISC or Spiritual Gifts result for an existing member from a paper copy — either by entering the person's raw per-question answers (auto-scored identically to the online quiz) or by entering the final result directly — from a new "Record Assessment" flow in the admin Analytics tab.

**Architecture:** No schema or RLS changes — `assessment_attempts` already lets admins insert a row for any `user_id`. One new `SupaDB` method mirrors the existing self-serve `addAssessmentAttempt` but takes an explicit target `userId`. The admin UI is a new modal in `admin/dashboard.html`'s Analytics tab, reusing the exact same scoring functions (`Assessments.scoreDisc`/`scoreGifts`) and content (`assessment_content` rows) the live quiz pages already use, so an admin-entered result is byte-for-byte indistinguishable from a self-taken one.

**Tech Stack:** Static HTML/JS, Supabase Postgres (existing RLS, no migration), following this codebase's existing `SupaDB` client-layer pattern. No build step — verification is via `node --check`-style syntax checks and manual browser testing.

**Spec:** `docs/superpowers/specs/2026-09-16-admin-assessment-entry-design.md`

---

### Task 1: SupaDB method

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Add `adminAddAssessmentAttempt`**

Insert this method immediately after the existing `addAssessmentAttempt` method (which ends with its own closing `},` right before `async getMyAttempts() {`):

```javascript
  async adminAddAssessmentAttempt({ userId, assessmentType, answers, scores, result }) {
    if (!db()) return { error: 'Not configured' };
    if (!userId) return { error: 'No person selected' };
    const { error } = await db().from('assessment_attempts').insert({
      user_id: userId, assessment_type: assessmentType,
      answers, scores, result,
    });
    if (error) return { error: error.message };
    const { data: person } = await db().from('people').select('id').eq('user_id', userId).maybeSingle();
    if (person) this.recordMilestone(person.id, assessmentType === 'disc' ? 'assessment_disc_completed' : 'assessment_gifts_completed');
    return { success: true };
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
git commit -m "Add adminAddAssessmentAttempt for recording results on a member's behalf" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Modal styles

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Add the scoped CSS**

Find this line (the modal size-variant rule):

```html
    .modal.modal-lg { max-width: min(960px, 94vw); }
```

Replace with (adds the new modal's own styles right after it — prefixed `.raa-` for "record admin assessment" so nothing here can collide with any existing class in this large file):

```html
    .modal.modal-lg { max-width: min(960px, 94vw); }
    .raa-person-chip { display:inline-flex; align-items:center; gap:10px; background:var(--bg); border:1px solid var(--border); border-radius:50px; padding:8px 16px; font-size:.88rem; }
    .raa-person-chip button { background:none; border:none; color:var(--secondary); font-family:inherit; font-size:.82rem; cursor:pointer; padding:0; margin-left:4px; }
    .raa-search-results { max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:8px; margin-top:8px; }
    .raa-search-row { padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--border); font-size:.88rem; }
    .raa-search-row:last-child { border-bottom:none; }
    .raa-search-row:hover { background:var(--bg); }
    .raa-search-row .email { color:var(--text-muted); font-size:.8rem; }
    .raa-toggle-row { display:flex; gap:8px; margin-bottom:16px; }
    .raa-toggle-btn { flex:1; padding:10px; border-radius:8px; border:1.5px solid var(--border); background:#fff; font-family:inherit; font-weight:600; font-size:.88rem; cursor:pointer; color:var(--text-muted); }
    .raa-toggle-btn.active { background:var(--primary); border-color:var(--primary); color:#fff; }
    .raa-q-block { padding:14px 0; border-bottom:1px solid var(--border); }
    .raa-q-block:last-child { border-bottom:none; }
    .raa-q-text { font-size:.9rem; font-weight:500; margin-bottom:8px; }
    .raa-q-scale { display:flex; gap:6px; flex-wrap:wrap; }
    .raa-q-scale label { border:1.5px solid var(--border); border-radius:8px; padding:6px 12px; font-size:.82rem; cursor:pointer; }
    .raa-q-scale input { display:none; }
    .raa-q-scale label:has(input:checked) { background:var(--primary); border-color:var(--primary); color:#fff; }
    .raa-gift-check { display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--border); font-size:.88rem; }
    .raa-gift-check:last-child { border-bottom:none; }
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/dashboard.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_dash_check_t2.js', scripts.join('\n;\n'));
"
node --check /tmp/_dash_check_t2.js && echo OK
rm -f /tmp/_dash_check_t2.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add styles for the Record Assessment modal" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Modal HTML and Analytics tab button

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Add the "Record Assessment" button**

Find:

```html
    <div class="tab-panel" id="panelAnalytics">
      <div class="action-bar">
        <h2>Assessment Analytics</h2>
      </div>
```

Replace with:

```html
    <div class="tab-panel" id="panelAnalytics">
      <div class="action-bar">
        <h2>Assessment Analytics</h2>
        <button class="btn btn-primary" onclick="openRecordAssessmentModal()">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Record Assessment
        </button>
      </div>
```

- [ ] **Step 2: Add the modal markup**

Find the end of the event sign-ups modal:

```html
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeEventSignupsModal()">Close</button></div>
  </div>
</div>

<!-- GROUP MODAL -->
```

Replace with (adds the new modal right after it):

```html
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeEventSignupsModal()">Close</button></div>
  </div>
</div>

<!-- RECORD ASSESSMENT MODAL -->
<div class="modal-overlay" id="recordAssessmentModal">
  <div class="modal modal-lg">
    <div class="modal-header"><h3>Record Assessment Result</h3><button class="modal-close" onclick="closeRecordAssessmentModal()">✕</button></div>
    <div class="modal-body">

      <div id="raaPersonPicker">
        <label style="font-size:.85rem;font-weight:600;margin-bottom:6px;display:block;">Person</label>
        <input type="text" id="raaSearchInput" placeholder="Search by name or email…" oninput="raaFilterPeople()"
          style="width:100%;padding:.6rem .9rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;box-sizing:border-box;" />
        <div class="raa-search-results" id="raaSearchResults" style="display:none;"></div>
      </div>
      <div id="raaPersonChip" style="display:none;margin-bottom:16px;">
        <span class="raa-person-chip">Recording for: <strong id="raaPersonName"></strong> (<span id="raaPersonEmail"></span>) <button onclick="raaClearPerson()">Change</button></span>
      </div>

      <div class="raa-toggle-row" style="margin-top:20px;">
        <button type="button" class="raa-toggle-btn active" id="raaTypeDisc" onclick="raaSetType('disc')">DISC</button>
        <button type="button" class="raa-toggle-btn" id="raaTypeGifts" onclick="raaSetType('gifts')">Spiritual Gifts</button>
      </div>
      <div class="raa-toggle-row">
        <button type="button" class="raa-toggle-btn active" id="raaModeAnswers" onclick="raaSetMode('answers')">Enter Answers</button>
        <button type="button" class="raa-toggle-btn" id="raaModeDirect" onclick="raaSetMode('direct')">Enter Result Directly</button>
      </div>

      <div id="raaAnswersForm">
        <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:8px;" id="raaProgressLabel">0 of 0 answered</div>
        <div id="raaQList"></div>
      </div>

      <div id="raaDirectForm" style="display:none;">
        <div id="raaDiscDirectWrap">
          <label style="font-size:.85rem;font-weight:600;margin-bottom:6px;display:block;">DISC Blend</label>
          <select id="raaDiscBlendSelect" style="width:100%;padding:.6rem .9rem;border:1.5px solid var(--border);border-radius:8px;font-family:'DM Sans',sans-serif;font-size:.9rem;outline:none;">
            <option value="">— Select —</option>
          </select>
        </div>
        <div id="raaGiftsDirectWrap" style="display:none;">
          <label style="font-size:.85rem;font-weight:600;margin-bottom:6px;display:block;">Top Gifts (check all that apply)</label>
          <div id="raaGiftsChecklist"></div>
        </div>
      </div>

    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeRecordAssessmentModal()">Close</button>
      <button class="btn btn-primary" id="raaSaveBtn" onclick="raaSave()" disabled>Save Result</button>
    </div>
  </div>
</div>

<!-- GROUP MODAL -->
```

- [ ] **Step 3: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/dashboard.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_dash_check_t3.js', scripts.join('\n;\n'));
"
node --check /tmp/_dash_check_t3.js && echo OK
rm -f /tmp/_dash_check_t3.js
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Record Assessment modal markup and Analytics tab button" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Modal JavaScript

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Add the Record Assessment JS**

Find the end of `generateClaudeAnalysis()`:

```javascript
    showToast('Analysis generated');
    await loadAnalyticsReports();
  } catch(e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Generate Analysis';
  }
}

async function bulkRegisterLeadersAttendees() {
```

Replace with (inserts the new block between the two existing functions):

```javascript
    showToast('Analysis generated');
    await loadAnalyticsReports();
  } catch(e) {
    showToast('Error: ' + e.message, true);
  } finally {
    btn.disabled = false; btn.textContent = 'Generate Analysis';
  }
}

/* ── RECORD ASSESSMENT (admin-entered paper results) ────── */
let _raaProfiles = [];
let _raaContent = null;
let _raaSelectedPerson = null;
let _raaType = 'disc';
let _raaMode = 'answers';
const RAA_SCALES = {
  disc: [[1,'Never'],[2,'Rarely'],[3,'Sometimes'],[4,'Often'],[5,'Always']],
  gifts: [[1,'Almost Never'],[2,'Sometimes'],[3,'Almost Always']],
};

async function openRecordAssessmentModal() {
  document.getElementById('recordAssessmentModal').classList.add('open');
  const [profiles, content] = await Promise.all([
    SupaDB.adminGetAllMemberProfiles(), SupaDB.getAssessmentContent(),
  ]);
  _raaProfiles = profiles;
  _raaContent = Assessments.splitContent(content);
  raaClearPerson();
  raaSetType('disc');
  raaSetMode('answers');
}
function closeRecordAssessmentModal() {
  document.getElementById('recordAssessmentModal').classList.remove('open');
}

function raaFilterPeople() {
  const q = document.getElementById('raaSearchInput').value.trim().toLowerCase();
  const results = document.getElementById('raaSearchResults');
  if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
  const matches = _raaProfiles.filter(p =>
    (p.name && p.name.toLowerCase().includes(q)) || (p.email && p.email.toLowerCase().includes(q))
  ).slice(0, 8);
  results.style.display = 'block';
  if (!matches.length) {
    results.innerHTML = '<div class="raa-search-row" style="color:var(--text-muted);">No matches</div>';
    return;
  }
  results.innerHTML = matches.map(p => `
    <div class="raa-search-row" onclick="raaSelectPerson('${p.userId}')">
      <div>${escapeHtml(p.name || '(no name)')}</div>
      <div class="email">${escapeHtml(p.email)}</div>
    </div>`).join('');
}

function raaSelectPerson(userId) {
  const p = _raaProfiles.find(x => x.userId === userId);
  if (!p) return;
  _raaSelectedPerson = p;
  document.getElementById('raaPersonPicker').style.display = 'none';
  document.getElementById('raaPersonChip').style.display = 'block';
  document.getElementById('raaPersonName').textContent = p.name || '(no name)';
  document.getElementById('raaPersonEmail').textContent = p.email;
  document.getElementById('raaSearchInput').value = '';
  document.getElementById('raaSearchResults').style.display = 'none';
  raaUpdateSaveEnabled();
}
function raaClearPerson() {
  _raaSelectedPerson = null;
  document.getElementById('raaPersonPicker').style.display = 'block';
  document.getElementById('raaPersonChip').style.display = 'none';
  raaUpdateSaveEnabled();
}

function raaSetType(type) {
  _raaType = type;
  document.getElementById('raaTypeDisc').classList.toggle('active', type === 'disc');
  document.getElementById('raaTypeGifts').classList.toggle('active', type === 'gifts');
  raaRenderQuestions();
  raaRenderDirectForm();
}
function raaSetMode(mode) {
  _raaMode = mode;
  document.getElementById('raaModeAnswers').classList.toggle('active', mode === 'answers');
  document.getElementById('raaModeDirect').classList.toggle('active', mode === 'direct');
  document.getElementById('raaAnswersForm').style.display = mode === 'answers' ? 'block' : 'none';
  document.getElementById('raaDirectForm').style.display = mode === 'direct' ? 'block' : 'none';
  raaUpdateSaveEnabled();
}

function raaCurrentQuestions() {
  if (!_raaContent) return [];
  return _raaType === 'disc' ? _raaContent.discQuestions : _raaContent.giftQuestions;
}

function raaRenderQuestions() {
  const questions = raaCurrentQuestions();
  const scale = RAA_SCALES[_raaType];
  document.getElementById('raaQList').innerHTML = questions.map((q, i) => `
    <div class="raa-q-block">
      <div class="raa-q-text">${i + 1}. ${escapeHtml(q.text)}</div>
      <div class="raa-q-scale">${scale.map(([v, label]) => `
        <label><input type="radio" name="raaq${q.id}" value="${v}" onchange="raaOnAnswer()" /><span>${label}</span></label>`).join('')}
      </div>
    </div>`).join('');
  raaOnAnswer();
}

function raaCollectAnswers() {
  const answers = {};
  raaCurrentQuestions().forEach(q => {
    const sel = document.querySelector(`input[name="raaq${q.id}"]:checked`);
    if (sel) answers[q.id] = Number(sel.value);
  });
  return answers;
}

function raaOnAnswer() {
  const answers = raaCollectAnswers();
  const total = raaCurrentQuestions().length;
  const done = Object.keys(answers).length;
  document.getElementById('raaProgressLabel').textContent = `${done} of ${total} answered`;
  raaUpdateSaveEnabled();
}

function raaRenderDirectForm() {
  if (!_raaContent) return;
  document.getElementById('raaDiscDirectWrap').style.display = _raaType === 'disc' ? 'block' : 'none';
  document.getElementById('raaGiftsDirectWrap').style.display = _raaType === 'gifts' ? 'block' : 'none';

  const blendSelect = document.getElementById('raaDiscBlendSelect');
  blendSelect.innerHTML = '<option value="">— Select —</option>' +
    _raaContent.discBlends.map(b => `<option value="${b.code}">${b.code} — ${escapeHtml((b.extra && b.extra.name) || '')}</option>`).join('');
  blendSelect.onchange = raaUpdateSaveEnabled;

  document.getElementById('raaGiftsChecklist').innerHTML = _raaContent.gifts.map(g => `
    <label class="raa-gift-check"><input type="checkbox" value="${escapeHtml((g.extra && g.extra.name) || g.code)}" onchange="raaUpdateSaveEnabled()" /> ${escapeHtml((g.extra && g.extra.name) || g.code)}</label>`).join('');
}

function raaUpdateSaveEnabled() {
  let ready = !!_raaSelectedPerson;
  if (ready) {
    if (_raaMode === 'answers') {
      const total = raaCurrentQuestions().length;
      const done = Object.keys(raaCollectAnswers()).length;
      ready = total > 0 && done === total;
    } else if (_raaType === 'disc') {
      ready = !!document.getElementById('raaDiscBlendSelect').value;
    } else {
      ready = document.querySelectorAll('#raaGiftsChecklist input:checked').length > 0;
    }
  }
  document.getElementById('raaSaveBtn').disabled = !ready;
}

async function raaSave() {
  const btn = document.getElementById('raaSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  let answers = {}, scores = {}, result;
  if (_raaMode === 'answers') {
    answers = raaCollectAnswers();
    if (_raaType === 'disc') {
      const r = Assessments.scoreDisc(answers, raaCurrentQuestions());
      scores = r.totals; result = r.result;
    } else {
      const r = Assessments.scoreGifts(answers, raaCurrentQuestions(), _raaContent.gifts);
      scores = r.totals; result = JSON.stringify(r.result);
    }
  } else if (_raaType === 'disc') {
    result = document.getElementById('raaDiscBlendSelect').value;
  } else {
    const names = [...document.querySelectorAll('#raaGiftsChecklist input:checked')].map(el => el.value);
    result = JSON.stringify(names);
  }
  const saved = await SupaDB.adminAddAssessmentAttempt({
    userId: _raaSelectedPerson.userId, assessmentType: _raaType, answers, scores, result,
  });
  btn.textContent = 'Save Result';
  if (saved.error) {
    showToast('Error: ' + saved.error, true);
    btn.disabled = false;
    return;
  }
  showToast(`✓ Recorded ${_raaType === 'disc' ? 'DISC' : 'Spiritual Gifts'} result for ${_raaSelectedPerson.name || _raaSelectedPerson.email}`);
  raaClearPerson();
  raaSetType(_raaType);
  document.getElementById('raaSearchInput').focus();
  renderAnalyticsTab();
}

async function bulkRegisterLeadersAttendees() {
```

- [ ] **Step 2: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/dashboard.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_dash_check_t4.js', scripts.join('\n;\n'));
"
node --check /tmp/_dash_check_t4.js && echo OK
rm -f /tmp/_dash_check_t4.js
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add Record Assessment modal logic" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end verification

Manual verification, no further code changes.

- [ ] **Step 1: Push the branch to staging**

```bash
git push staging claude/loving-darwin-e8d5ea:main
```

- [ ] **Step 2: Enter Answers mode, DISC**

Log into `admin/dashboard.html` on staging as admin, go to Analytics, click "Record Assessment." Search for and select a real member. Leave type on DISC and mode on "Enter Answers." Answer every question with a known pattern (e.g. all "Always" for D-coded questions, low for others) and save. Confirm the toast shows the expected result, and that re-opening the modal for the same or a different person shows a fresh, empty form (not the previous answers).

- [ ] **Step 3: Enter Answers mode, Gifts**

Repeat for Spiritual Gifts with a different test member — answer every question, save, confirm the toast.

- [ ] **Step 4: Enter Result Directly mode, both types**

Switch to "Enter Result Directly." For DISC, pick a blend from the dropdown and save. For Gifts, check 3-4 gifts and save. Confirm both succeed and the Save button is correctly disabled until a blend is picked / at least one gift is checked.

- [ ] **Step 5: Verify the recorded results show up correctly**

Log in as (or view via the admin's own member-dashboard drilldown for) each test member used above. Confirm their DISC/Gifts result displays exactly as it would for a self-taken assessment, with no visual difference. Confirm the Analytics tab's stat counts and distribution charts updated to include the new attempts without a manual page reload (the modal's save flow calls `renderAnalyticsTab()` itself).

- [ ] **Step 6: Verify Save button gating**

Confirm the Save button stays disabled with no person selected, and with a person selected but an incomplete form (some but not all DISC/Gifts questions answered, or no blend picked / no gift checked in direct mode).

- [ ] **Step 7: Verify non-admin gating**

Confirm the Analytics tab (and therefore the Record Assessment button) is not reachable by a non-admin staff role via the existing `ROLE_TABS` client-side gating, and that `adminAddAssessmentAttempt` would be rejected server-side by RLS for a non-admin session.

- [ ] **Step 8: Report back**

Confirm to the user: staging deployment is live, both entry modes work for both assessment types, and the Analytics tab reflects new admin-entered results immediately.
