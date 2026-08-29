# Assessment Results Full Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every DISC letter (D/I/S/C) and every Spiritual Gift (all 24), not just the top result, as an inline accordion — the person's actual result stays pre-expanded and visually marked, everything else is collapsed but clickable — identically on the admin's member-viewing page and the member's own profile page.

**Architecture:** Two new shared rendering methods, `MemberDashboard.renderDiscResult()` and `MemberDashboard.renderGiftsResult()`, are added to `js/member-dashboard.js` (already the shared module between `admin/member-dashboard.html` and `admin/my-profile.html`). Both pages' existing result-rendering code is replaced with calls to these shared methods. No backend, schema, or content changes — all DISC-letter and gift descriptions already exist in `assessment_content`.

**Tech Stack:** Static HTML/JS, no build step, no new CSS files (all styling is inline `style=` using CSS custom properties — `--primary`, `--text-muted`, `--border`, `--radius` — already defined identically in both `css/portal.css` and `admin/dashboard.html`'s own `<style>` block). Verification is via `node --check` syntax checks and manual browser verification (both pages require an authenticated session, so full interaction can't be smoke-tested unauthenticated).

---

### Task 1: Shared accordion renderers in `MemberDashboard`

**Files:**
- Modify: `js/member-dashboard.js` (add two new methods to the `MemberDashboard` object)

- [ ] **Step 1: Add `renderDiscResult` and `renderGiftsResult`**

Find this exact block (the end of the `MemberDashboard` object — locate by text match, line numbers may have drifted slightly):

```js
    containerEl.innerHTML = `<table><thead><tr><th>Group</th><th>Joined</th><th>Status</th></tr></thead><tbody>` +
      rows.map(m => `
        <tr>
          <td>${this.escapeHtml(groupName(m.groupId))}</td>
          <td>${m.isLeader ? this.escapeHtml(semesterName(m.semesterId)) : fmt(m.joinedAt)}</td>
          <td>${m.isLeader ? '<span class="badge badge-blue">Leader</span>' : (m.leftAt ? 'Left ' + fmt(m.leftAt) : '<span class="badge badge-green">Current</span>')}</td>
        </tr>`).join('') + '</tbody></table>';
  },
};
```

Replace with:

```js
    containerEl.innerHTML = `<table><thead><tr><th>Group</th><th>Joined</th><th>Status</th></tr></thead><tbody>` +
      rows.map(m => `
        <tr>
          <td>${this.escapeHtml(groupName(m.groupId))}</td>
          <td>${m.isLeader ? this.escapeHtml(semesterName(m.semesterId)) : fmt(m.joinedAt)}</td>
          <td>${m.isLeader ? '<span class="badge badge-blue">Leader</span>' : (m.leftAt ? 'Left ' + fmt(m.leftAt) : '<span class="badge badge-green">Current</span>')}</td>
        </tr>`).join('') + '</tbody></table>';
  },

  // Inline accordion row/detail pair, shared by renderDiscResult and
  // renderGiftsResult. Self-toggling — no global state or per-row IDs needed,
  // matching this codebase's existing inline-onclick convention. `isOpen`
  // controls the pre-expanded state (used for the person's actual result).
  _accordionRow(labelHtml, metaHtml, detailHtml, isOpen) {
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;overflow:hidden;${isOpen ? 'background:#fdf6ec;' : ''}">
        <div onclick="const d=this.nextElementSibling; const open=d.style.display==='none'; d.style.display=open?'':'none'; this.querySelector('.acc-chevron').textContent=open?'▲':'▼';"
             style="cursor:pointer;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;gap:12px;">
          ${labelHtml}
          <div style="display:flex;align-items:center;gap:10px;">
            ${metaHtml}
            <span class="acc-chevron" style="color:var(--text-muted);">${isOpen ? '▲' : '▼'}</span>
          </div>
        </div>
        <div style="${isOpen ? '' : 'display:none;'}padding:10px 14px;border-top:1px solid var(--border);">
          ${detailHtml}
        </div>
      </div>`;
  },

  // Renders the DISC result: the result badge, the person's blend-specific
  // description, and all 4 letters (fixed D/I/S/C order) as accordion rows —
  // the letter(s) making up `attempt.result` start expanded and marked.
  // attempt: latest disc attempt ({ result, scores, completedAt }) or falsy.
  // discBlends: _content.discBlends (all 16 disc_blend rows).
  // attemptCount: optional — when > 1, appends "· N attempts" to the footer
  // (my-profile.html has this; admin/member-dashboard.html doesn't track it
  // today and simply omits the argument, preserving its existing behavior).
  renderDiscResult(containerEl, attempt, discBlends, attemptCount) {
    if (!attempt) return;
    const order = ['D', 'I', 'S', 'C'];
    const blend = discBlends.find(b => b.code === attempt.result);
    const primary = discBlends.find(b => b.code === attempt.result[0]);

    const rows = order.map(letter => {
      const isResult = attempt.result.includes(letter);
      const entry = discBlends.find(b => b.code === letter);
      const score = Number(attempt.scores[letter]) || 0;
      const barPct = Math.min(100, score / 25 * 100);
      const label = `<strong style="width:16px;">${this.escapeHtml(letter)}</strong>
        <div style="flex:1;height:10px;background:#eee;border-radius:6px;overflow:hidden;min-width:80px;">
          <div style="width:${barPct}%;height:100%;background:var(--primary);"></div>
        </div>`;
      const meta = `<span style="font-size:.85rem;color:var(--text-muted);">${this.escapeHtml(score)}</span>
        ${isResult ? '<span style="font-size:.78rem;color:var(--primary);font-weight:600;">your result</span>' : ''}`;
      const detail = `<p style="font-size:.85rem;color:var(--text-muted);margin:0;">${entry ? entry.text : ''}</p>`;
      return this._accordionRow(label, meta, detail, isResult);
    }).join('');

    containerEl.innerHTML = `
      <div style="display:inline-block;background:var(--primary);color:#fff;font-weight:800;font-size:1.6rem;border-radius:12px;padding:10px 22px;letter-spacing:.05em;">${this.escapeHtml(attempt.result)}</div>
      ${blend ? `<p style="font-size:.9rem;margin:10px 0;">${blend.text}</p>` : (primary ? `<p style="font-size:.9rem;margin:10px 0;">${primary.text}</p>` : '')}
      <div style="margin:14px 0;">${rows}</div>
      <p style="margin-top:10px;color:var(--text-muted);font-size:.82rem;">Taken ${new Date(attempt.completedAt).toLocaleDateString()}${attemptCount > 1 ? ` · ${attemptCount} attempts` : ''}</p>`;
  },

  // Renders the Spiritual Gifts result: pills for the top result names, then
  // all 24 gifts (sorted by this person's score, descending) as accordion
  // rows — the gift(s) in the top result start expanded and marked.
  // attempt: latest gifts attempt ({ result: JSON string, scores, completedAt }) or falsy.
  // gifts: _content.gifts (all 24 gift rows).
  // attemptCount: optional, same convention as renderDiscResult.
  renderGiftsResult(containerEl, attempt, gifts, attemptCount) {
    if (!attempt) return;
    let names;
    try { names = JSON.parse(attempt.result); if (!Array.isArray(names)) throw new Error('not array'); }
    catch (e) { containerEl.innerHTML = '<p style="color:var(--text-muted);">Could not display this result.</p>'; return; }

    const sorted = gifts.slice().sort((a, b) => {
      const diff = (Number(attempt.scores[b.code]) || 0) - (Number(attempt.scores[a.code]) || 0);
      return diff !== 0 ? diff : a.sort - b.sort;
    });

    const rows = sorted.map(g => {
      const gName = (g.extra && g.extra.name) || g.code;
      const isResult = names.includes(gName);
      const score = Number(attempt.scores[g.code]) || 0;
      const min = ((g.extra && g.extra.ministries) || []).join(', ');
      const label = `<strong>${this.escapeHtml(gName)}</strong>`;
      const meta = `<span style="font-size:.85rem;color:var(--text-muted);">${this.escapeHtml(score)}</span>
        ${isResult ? '<span style="font-size:.78rem;color:var(--primary);font-weight:600;">your result</span>' : ''}`;
      const detail = `
        <p style="font-size:.85rem;margin:0 0 4px;">${g.text}</p>
        <p style="color:var(--text-muted);font-size:.8rem;margin:0;">${(g.extra && g.extra.scriptures) || ''}</p>
        ${min ? `<p style="color:var(--text-muted);font-size:.8rem;margin:4px 0 0;">Serve here: ${min}</p>` : ''}`;
      return this._accordionRow(label, meta, detail, isResult);
    }).join('');

    containerEl.innerHTML = `
      <div>${names.map(n => `<span style="display:inline-block;background:rgba(188,122,30,.12);color:#92400e;font-weight:700;border-radius:20px;padding:5px 14px;font-size:.9rem;margin:0 6px 6px 0;">${this.escapeHtml(n)}</span>`).join('')}</div>
      <div style="margin:14px 0;">${rows}</div>
      <p style="color:var(--text-muted);font-size:.82rem;">Taken ${new Date(attempt.completedAt).toLocaleDateString()}${attemptCount > 1 ? ` · ${attemptCount} attempts` : ''}</p>`;
  },
};
```

Note: `.result-badge` and `.gift-pill` (used by the original `admin/my-profile.html` markup) are defined in `css/portal.css` but **not** in `admin/dashboard.html`'s stylesheet — since this renderer must look identical on both pages, the badge and pills are written with the equivalent inline styles instead of those class names, copied directly from `css/portal.css`'s `.result-badge`/`.gift-pill` rules. `.sub` (used for muted footer text in the original) has the same problem and is replaced with an inline `color:var(--text-muted);font-size:.82rem;` style. `--border`, `--text-muted`, `--primary`, `--radius` are confirmed defined identically in both `css/portal.css` and `admin/dashboard.html`.

Text fields that already rendered as raw HTML today (`.text`, `.extra.scriptures`, ministry names) stay unescaped here too — this matches the existing trust convention in both pages' current code (only user-facing *labels* like letter codes, scores, and gift names were passed through `escapeHtml`, never the admin-authored description/scripture/ministry content).

- [ ] **Step 2: Verify JS syntax**

Run: `node --check js/member-dashboard.js`
Expected: no output (exits 0)

- [ ] **Step 3: Commit**

```bash
git add js/member-dashboard.js
git commit -m "Add shared DISC/Spiritual Gifts full-breakdown accordion renderers"
```

---

### Task 2: Wire into `admin/my-profile.html` (self-view)

**Files:**
- Modify: `admin/my-profile.html` (`renderResult` function)

- [ ] **Step 1: Replace the markup-building logic with calls to the shared renderers**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```js
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
      <div class="result-badge">${escapeHtml(latest.result)}</div>
      <div style="margin:14px 0;">
        ${['D','I','S','C'].map(k => `
          <div class="score-row"><strong style="width:16px;">${k}</strong>
            <div class="bar"><div style="width:${(Number(latest.scores[k]) || 0) / 25 * 100}%"></div></div>
            <span>${escapeHtml(latest.scores[k])}</span></div>`).join('')}
      </div>
      ${primary ? `<p style="font-size:.9rem;margin-bottom:10px;">${primary.text}</p>` : ''}
      ${blend && blend !== primary ? `<p style="font-size:.9rem;">${blend.text}</p>` : ''}
      <p class="sub" style="margin-top:10px;">Taken ${new Date(latest.completedAt).toLocaleDateString()}
        ${attempts.length > 1 ? `· ${attempts.length} attempts` : ''}</p>`;
  } else {
    let names;
    try { names = JSON.parse(latest.result); if (!Array.isArray(names)) throw new Error('not array'); }
    catch (e) { box.innerHTML = '<p class="sub">Could not display this result.</p>'; return; }
    box.innerHTML = `
      <div>${names.map(n => `<span class="gift-pill">${escapeHtml(n)}</span>`).join('')}</div>
      <div style="margin:14px 0;">${names.map(n => {
        const g = _content.gifts.find(x => (x.extra && x.extra.name) === n);
        if (!g) return '';
        const min = (g.extra.ministries || []).join(', ');
        return `<div style="margin-bottom:12px;"><strong>${escapeHtml(n)}</strong>
          <p style="font-size:.88rem;">${g.text}</p>
          <p class="sub" style="margin:2px 0 0;">${g.extra.scriptures || ''}</p>
          ${min ? `<p class="sub" style="margin:2px 0 0;">Serve here: ${min}</p>` : ''}</div>`;
      }).join('')}</div>
      <p class="sub">Taken ${new Date(latest.completedAt).toLocaleDateString()}
        ${attempts.length > 1 ? `· ${attempts.length} attempts` : ''}</p>`;
  }
}
```

Replace with:

```js
function renderResult(type, attempts) {
  const box = document.getElementById(type === 'disc' ? 'discResult' : 'giftsResult');
  const cta = document.getElementById(type === 'disc' ? 'discCta' : 'giftsCta');
  if (!attempts.length) return;
  cta.textContent = 'Retake';
  const latest = attempts[0];
  if (type === 'disc') {
    MemberDashboard.renderDiscResult(box, latest, _content.discBlends, attempts.length);
  } else {
    MemberDashboard.renderGiftsResult(box, latest, _content.gifts, attempts.length);
  }
}
```

`MemberDashboard` is already available on this page — `../js/member-dashboard.js` is already loaded via `<script>` tag (used today by `MemberDashboard.renderGrowthTrackProgress` / `renderGroupHistory` later in this same file). `_content` is already populated via `Assessments.splitContent(content)` earlier in this file's initialization.

- [ ] **Step 2: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/my-profile.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 3: Commit**

```bash
git add admin/my-profile.html
git commit -m "Use shared full-breakdown accordion for DISC/Gifts results on My Profile"
```

---

### Task 3: Wire into `admin/member-dashboard.html` (staff view)

**Files:**
- Modify: `admin/member-dashboard.html` (`loadCurrentMember` function)

- [ ] **Step 1: Replace the `mdDisc`/`mdGifts` innerHTML assignments with calls to the shared renderers**

Find this exact block (locate by text match — line numbers may have drifted slightly):

```js
  document.getElementById('mdDisc').innerHTML = d
    ? `<strong style="font-size:1.2rem;">${escapeHtml(d.result)}</strong>
       ${['D','I','S','C'].map(k => `<div style="font-size:.85rem;">${k}: ${escapeHtml(d.scores[k])}</div>`).join('')}
       <p style="font-size:.8rem; color:var(--text-muted);">Taken ${new Date(d.completedAt).toLocaleDateString()}</p>`
    : '<p style="color:var(--text-muted);">Not taken yet.</p>';

  const rec = g ? recommendedMinistries(giftNames(g)) : [];
  document.getElementById('mdGifts').innerHTML = g
    ? `<p><strong>${giftNames(g).map(escapeHtml).join(', ')}</strong></p>
       <div style="columns:2; font-size:.82rem;">${Object.entries(g.scores)
         .sort((a,b) => b[1]-a[1]).map(([c,s]) => `<div>${escapeHtml(c)}: ${escapeHtml(s)}</div>`).join('')}</div>
       <p style="font-size:.8rem; color:var(--text-muted);">Taken ${new Date(g.completedAt).toLocaleDateString()}</p>`
    : '<p style="color:var(--text-muted);">Not taken yet.</p>';
```

Replace with:

```js
  const mdDiscBox = document.getElementById('mdDisc');
  if (d) MemberDashboard.renderDiscResult(mdDiscBox, d, _content.discBlends);
  else mdDiscBox.innerHTML = '<p style="color:var(--text-muted);">Not taken yet.</p>';

  const rec = g ? recommendedMinistries(giftNames(g)) : [];
  const mdGiftsBox = document.getElementById('mdGifts');
  if (g) MemberDashboard.renderGiftsResult(mdGiftsBox, g, _content.gifts);
  else mdGiftsBox.innerHTML = '<p style="color:var(--text-muted);">Not taken yet.</p>';
```

`MemberDashboard` is already loaded on this page (used today by `renderGrowthTrackProgress`/`renderGroupHistory` a few lines above this block). `_content` is already populated via `Assessments.splitContent(contentRows)` in this file's initialization. `recommendedMinistries(giftNames(g))` and the `mdMinistries` rendering that follows this block are unchanged.

- [ ] **Step 2: Verify JS syntax**

Run: `node -e "new Function(require('fs').readFileSync('admin/member-dashboard.html','utf8').match(/<script>([\s\S]*?)<\/script>/g).map(s=>s.replace(/<\/?script>/g,'')).join('\n'))" && echo SYNTAX_OK`
Expected: `SYNTAX_OK`

- [ ] **Step 3: Commit**

```bash
git add admin/member-dashboard.html
git commit -m "Use shared full-breakdown accordion for DISC/Gifts results on Member Dashboard"
```

---

### Task 4: End-to-end verification + staging deploy

**Files:** none (verification only)

- [ ] **Step 1: Local static-file smoke test**

Serve the repo root locally (the project's existing `static-site` preview launch config). Confirm:

- `admin/my-profile.html` and `admin/member-dashboard.html` both load with no console errors (redirect to login when unauthenticated, as expected).
- `js/member-dashboard.js` has no syntax errors (already checked in Task 1, Step 2).

- [ ] **Step 2: Push to staging**

```bash
git push staging HEAD:main
```

- [ ] **Step 3: Manual verification on staging**

1. Log in as a member who has taken both assessments (or take them fresh via `test-personality.html` / `test-gifts.html`), then open `admin/my-profile.html`:
   - DISC card shows the result badge, the blend description, and all 4 letters (D, I, S, C in that order) as rows with score bars — the letter(s) in the result are pre-expanded and marked "your result"; the others are collapsed.
   - Click a collapsed letter — confirm it expands to show that letter's own description, and the chevron flips. Click again — confirm it collapses.
   - Gifts card shows the result pills, then all 24 gifts sorted by that person's score (their top gifts should be near the top even before expanding anything) — the gift(s) in the result are pre-expanded and marked; the others are collapsed and expand/collapse on click the same way.
2. Log in as an admin, open `admin/member-dashboard.html`, and pull up that same member:
   - Confirm the DISC and Gifts sections show the identical accordion behavior described above — same pre-expanded state, same descriptions, same expand/collapse interaction.
   - Confirm the "Ministries" recommendation section below the Gifts accordion still shows the same badges as before this change (unaffected).
3. Pull up a member who has **not** taken one or both assessments — confirm the "Not taken yet." message still shows for the missing one(s), on both pages.
4. Visually compare the result badge and gift pills against how they looked before this change (or against `admin/my-profile.html`'s look, since `css/portal.css`'s `.result-badge`/`.gift-pill` styles were ported inline) — confirm the colors/shape match on both pages, including on `admin/member-dashboard.html` which doesn't load `css/portal.css` at all.

- [ ] **Step 4: Report results back to the user**

Summarize what was verified and confirm current state before considering this task complete — do not push to production (`origin`) without explicit go-ahead, per this project's standing deployment rule.
