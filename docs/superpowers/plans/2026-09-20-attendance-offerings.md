# Weekly Offerings Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins record a weekly offerings total alongside worship/small-group attendance, and see it on the Attendance Analytics page (its own chart, stat cards, table column, and CSV export).

**Architecture:** One new nullable `offerings numeric` column on the existing `attendance` table. `js/db.js`'s three attendance methods thread the new field through unchanged otherwise. `admin/dashboard.html`'s existing entry card/edit modal/table gain an Offerings field. `admin/attendance-dashboard.html` gains a dedicated chart (separate from the headcount trend chart, since dollars and headcounts don't share a sensible y-axis), two new stat cards, a table column, and CSV inclusion.

**Tech Stack:** Static HTML/JS, Supabase Postgres, Chart.js (already loaded on the analytics page). No build step — verification via `node --check`-style syntax checks and manual browser testing.

**Spec:** `docs/superpowers/specs/2026-09-20-attendance-offerings-design.md`

---

### Task 1: Database migration

**Files:**
- Create: `supabase/attendance-offerings-schema.sql`

- [ ] **Step 1: Create the tracked migration file**

```sql
-- Adds a weekly offerings (giving) total alongside the existing worship
-- and small-group attendance figures on the attendance table.
-- See docs/superpowers/specs/2026-09-20-attendance-offerings-design.md
-- Run in the Supabase SQL editor (or via MCP apply_migration). Not
-- idempotent -- run once per environment (staging, then production).

alter table public.attendance add column offerings numeric;
```

- [ ] **Step 2: Apply to staging**

Apply this migration against the staging Supabase project (`govvofbrhhpowtdnuzcw`) via the Supabase MCP's `apply_migration` (name: `attendance_offerings_schema`) or the SQL editor. Confirm via `list_tables`/`execute_sql` that `public.attendance` now has an `offerings` column.

- [ ] **Step 3: Commit**

```bash
git add supabase/attendance-offerings-schema.sql
git commit -m "Add offerings column to attendance table" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: SupaDB attendance methods

**Files:**
- Modify: `js/db.js`

- [ ] **Step 1: Thread `offerings` through the three attendance methods**

Find:

```javascript
  /* ── Attendance ─────────────────────────────────────────── */
  async adminGetAllAttendance() {
    if (!db()) return [];
    const { data, error } = await db()
      .from('attendance')
      .select('*')
      .order('service_date', { ascending: false });
    if (error) { console.error('[SupaDB] adminGetAllAttendance:', error.message); return []; }
    return (data || []).map(r => ({
      id:              r.id,
      serviceDate:     r.service_date,
      worshipCount:    r.worship_count,
      smallGroupCount: r.small_group_count,
      notes:           r.notes,
      createdAt:       r.created_at,
    }));
  },
  async adminAddAttendance({ serviceDate, worshipCount, smallGroupCount, notes }) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('attendance').insert({
      service_date:      serviceDate,
      worship_count:     worshipCount  ?? null,
      small_group_count: smallGroupCount ?? null,
      notes:             notes || null,
    });
    if (error) return { error: error.message };
    return { success: true };
  },
  async adminUpdateAttendance(id, { serviceDate, worshipCount, smallGroupCount, notes }) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('attendance').update({
      service_date:      serviceDate,
      worship_count:     worshipCount  ?? null,
      small_group_count: smallGroupCount ?? null,
      notes:             notes || null,
    }).eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  },
```

Replace with:

```javascript
  /* ── Attendance ─────────────────────────────────────────── */
  async adminGetAllAttendance() {
    if (!db()) return [];
    const { data, error } = await db()
      .from('attendance')
      .select('*')
      .order('service_date', { ascending: false });
    if (error) { console.error('[SupaDB] adminGetAllAttendance:', error.message); return []; }
    return (data || []).map(r => ({
      id:              r.id,
      serviceDate:     r.service_date,
      worshipCount:    r.worship_count,
      smallGroupCount: r.small_group_count,
      offerings:       r.offerings,
      notes:           r.notes,
      createdAt:       r.created_at,
    }));
  },
  async adminAddAttendance({ serviceDate, worshipCount, smallGroupCount, offerings, notes }) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('attendance').insert({
      service_date:      serviceDate,
      worship_count:     worshipCount  ?? null,
      small_group_count: smallGroupCount ?? null,
      offerings:         offerings ?? null,
      notes:             notes || null,
    });
    if (error) return { error: error.message };
    return { success: true };
  },
  async adminUpdateAttendance(id, { serviceDate, worshipCount, smallGroupCount, offerings, notes }) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('attendance').update({
      service_date:      serviceDate,
      worship_count:     worshipCount  ?? null,
      small_group_count: smallGroupCount ?? null,
      offerings:         offerings ?? null,
      notes:             notes || null,
    }).eq('id', id);
    if (error) return { error: error.message };
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
git commit -m "Thread offerings through the attendance SupaDB methods" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Admin dashboard entry form, edit modal, and table

**Files:**
- Modify: `admin/dashboard.html`

- [ ] **Step 1: Add the Offerings field to the "Add Weekly Entry" card**

Find:

```html
        <div style="display:grid;grid-template-columns:160px 1fr 1fr auto;gap:12px;align-items:end;flex-wrap:wrap;">
          <div class="field">
            <label>Date</label>
            <input type="date" id="attDate" />
          </div>
          <div class="field">
            <label>Worship Attendance</label>
            <input type="number" id="attWorship" placeholder="e.g. 142" min="0" />
          </div>
          <div class="field">
            <label>Notes <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
            <input type="text" id="attNotes" placeholder="e.g. Easter Sunday" />
          </div>
          <button class="btn btn-primary" onclick="addAttendanceEntry()" id="attAddBtn" style="margin-bottom:1px;">Add</button>
        </div>
```

Replace with:

```html
        <div style="display:grid;grid-template-columns:160px 1fr 1fr 1fr auto;gap:12px;align-items:end;flex-wrap:wrap;">
          <div class="field">
            <label>Date</label>
            <input type="date" id="attDate" />
          </div>
          <div class="field">
            <label>Worship Attendance</label>
            <input type="number" id="attWorship" placeholder="e.g. 142" min="0" />
          </div>
          <div class="field">
            <label>Offerings <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
            <input type="number" id="attOfferings" placeholder="e.g. 4250.00" min="0" step="0.01" />
          </div>
          <div class="field">
            <label>Notes <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
            <input type="text" id="attNotes" placeholder="e.g. Easter Sunday" />
          </div>
          <button class="btn btn-primary" onclick="addAttendanceEntry()" id="attAddBtn" style="margin-bottom:1px;">Add</button>
        </div>
```

- [ ] **Step 2: Add the Offerings column header**

Find:

```html
          <thead><tr>
            <th>Date</th>
            <th>Worship</th>
            <th>Small Groups</th>
            <th>SG Rate</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr></thead>
          <tbody id="attendanceTable"></tbody>
```

Replace with:

```html
          <thead><tr>
            <th>Date</th>
            <th>Worship</th>
            <th>Small Groups</th>
            <th>SG Rate</th>
            <th>Offerings</th>
            <th>Notes</th>
            <th>Actions</th>
          </tr></thead>
          <tbody id="attendanceTable"></tbody>
```

- [ ] **Step 3: Add the Offerings field to the edit modal**

Find:

```html
    <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
      <input type="hidden" id="attEditId" />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label>Date</label><input type="date" id="attEditDate" /></div>
        <div class="field"><label>Worship Attendance</label><input type="number" id="attEditWorship" min="0" /></div>
      </div>
      <div class="field"><label>Notes</label><input type="text" id="attEditNotes" placeholder="Optional" /></div>
    </div>
```

Replace with:

```html
    <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
      <input type="hidden" id="attEditId" />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="field"><label>Date</label><input type="date" id="attEditDate" /></div>
        <div class="field"><label>Worship Attendance</label><input type="number" id="attEditWorship" min="0" /></div>
      </div>
      <div class="field"><label>Offerings</label><input type="number" id="attEditOfferings" min="0" step="0.01" placeholder="Optional" /></div>
      <div class="field"><label>Notes</label><input type="text" id="attEditNotes" placeholder="Optional" /></div>
    </div>
```

- [ ] **Step 4: Update the table render, add/edit JS functions**

Find:

```javascript
  tbody.innerHTML = _cachedAttendance.map(r => {
    const sgCount = sgSumForDate(r.serviceDate);
    const sgDisplay = sgCount > 0 ? sgCount.toLocaleString() : '–';
    const rate = (r.worshipCount && sgCount)
      ? Math.round(sgCount / r.worshipCount * 100) + '%'
      : '–';
    return `<tr>
      <td style="font-weight:600;">${fmt(r.serviceDate)}</td>
      <td>${r.worshipCount != null ? r.worshipCount.toLocaleString() : '–'}</td>
      <td>${sgDisplay}</td>
      <td><span style="background:rgba(188,122,30,.1);color:var(--primary);font-size:.8rem;font-weight:700;padding:2px 8px;border-radius:20px;">${rate}</span></td>
      <td style="color:var(--text-muted);font-size:.85rem;">${r.notes || ''}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="editAttEntry('${r.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAttEntry('${r.id}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function addAttendanceEntry() {
  const btn   = document.getElementById('attAddBtn');
  const errEl = document.getElementById('attAddError');
  const okEl  = document.getElementById('attAddSuccess');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  const date    = document.getElementById('attDate').value;
  const worship = document.getElementById('attWorship').value;
  const notes   = document.getElementById('attNotes').value.trim();

  if (!date)    { errEl.textContent = 'Please select a date.';              errEl.style.display = ''; return; }
  if (!worship) { errEl.textContent = 'Please enter the worship headcount.'; errEl.style.display = ''; return; }

  btn.disabled = true;
  const res = await SupaDB.adminAddAttendance({ serviceDate: date, worshipCount: parseInt(worship), notes });
  btn.disabled = false;

  if (res.error) {
    errEl.textContent = res.error.includes('23505') ? 'An entry for this date already exists.' : res.error;
    errEl.style.display = ''; return;
  }
  ['attDate','attWorship','attNotes'].forEach(id => document.getElementById(id).value = '');
  okEl.style.display = '';
  setTimeout(() => okEl.style.display = 'none', 2500);
  renderAttendanceTable();
}

function editAttEntry(id) {
  const r = _cachedAttendance.find(x => x.id === id);
  if (!r) return;
  document.getElementById('attEditId').value      = id;
  document.getElementById('attEditDate').value    = r.serviceDate;
  document.getElementById('attEditWorship').value = r.worshipCount ?? '';
  document.getElementById('attEditNotes').value   = r.notes || '';
  document.getElementById('attEditModal').classList.add('open');
}
function closeAttEditModal() { document.getElementById('attEditModal').classList.remove('open'); }

async function saveAttEdit() {
  const id      = document.getElementById('attEditId').value;
  const date    = document.getElementById('attEditDate').value;
  const worship = document.getElementById('attEditWorship').value;
  const notes   = document.getElementById('attEditNotes').value.trim();
  const res = await SupaDB.adminUpdateAttendance(id, {
    serviceDate: date,
    worshipCount: worship !== '' ? parseInt(worship) : null,
    notes,
  });
  if (res.error) { alert('Error: ' + res.error); return; }
  closeAttEditModal();
  renderAttendanceTable();
}
```

Replace with:

```javascript
  const fmtMoney = v => v != null ? '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '–';

  tbody.innerHTML = _cachedAttendance.map(r => {
    const sgCount = sgSumForDate(r.serviceDate);
    const sgDisplay = sgCount > 0 ? sgCount.toLocaleString() : '–';
    const rate = (r.worshipCount && sgCount)
      ? Math.round(sgCount / r.worshipCount * 100) + '%'
      : '–';
    return `<tr>
      <td style="font-weight:600;">${fmt(r.serviceDate)}</td>
      <td>${r.worshipCount != null ? r.worshipCount.toLocaleString() : '–'}</td>
      <td>${sgDisplay}</td>
      <td><span style="background:rgba(188,122,30,.1);color:var(--primary);font-size:.8rem;font-weight:700;padding:2px 8px;border-radius:20px;">${rate}</span></td>
      <td>${fmtMoney(r.offerings)}</td>
      <td style="color:var(--text-muted);font-size:.85rem;">${r.notes || ''}</td>
      <td><div class="td-actions">
        <button class="btn btn-ghost btn-sm" onclick="editAttEntry('${r.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteAttEntry('${r.id}')">Delete</button>
      </div></td>
    </tr>`;
  }).join('');
}

async function addAttendanceEntry() {
  const btn   = document.getElementById('attAddBtn');
  const errEl = document.getElementById('attAddError');
  const okEl  = document.getElementById('attAddSuccess');
  errEl.style.display = 'none'; okEl.style.display = 'none';

  const date      = document.getElementById('attDate').value;
  const worship   = document.getElementById('attWorship').value;
  const offerings = document.getElementById('attOfferings').value;
  const notes     = document.getElementById('attNotes').value.trim();

  if (!date)    { errEl.textContent = 'Please select a date.';              errEl.style.display = ''; return; }
  if (!worship) { errEl.textContent = 'Please enter the worship headcount.'; errEl.style.display = ''; return; }

  btn.disabled = true;
  const res = await SupaDB.adminAddAttendance({
    serviceDate: date, worshipCount: parseInt(worship),
    offerings: offerings !== '' ? parseFloat(offerings) : null, notes,
  });
  btn.disabled = false;

  if (res.error) {
    errEl.textContent = res.error.includes('23505') ? 'An entry for this date already exists.' : res.error;
    errEl.style.display = ''; return;
  }
  ['attDate','attWorship','attOfferings','attNotes'].forEach(id => document.getElementById(id).value = '');
  okEl.style.display = '';
  setTimeout(() => okEl.style.display = 'none', 2500);
  renderAttendanceTable();
}

function editAttEntry(id) {
  const r = _cachedAttendance.find(x => x.id === id);
  if (!r) return;
  document.getElementById('attEditId').value        = id;
  document.getElementById('attEditDate').value      = r.serviceDate;
  document.getElementById('attEditWorship').value   = r.worshipCount ?? '';
  document.getElementById('attEditOfferings').value = r.offerings ?? '';
  document.getElementById('attEditNotes').value     = r.notes || '';
  document.getElementById('attEditModal').classList.add('open');
}
function closeAttEditModal() { document.getElementById('attEditModal').classList.remove('open'); }

async function saveAttEdit() {
  const id        = document.getElementById('attEditId').value;
  const date      = document.getElementById('attEditDate').value;
  const worship   = document.getElementById('attEditWorship').value;
  const offerings = document.getElementById('attEditOfferings').value;
  const notes     = document.getElementById('attEditNotes').value.trim();
  const res = await SupaDB.adminUpdateAttendance(id, {
    serviceDate: date,
    worshipCount: worship !== '' ? parseInt(worship) : null,
    offerings: offerings !== '' ? parseFloat(offerings) : null,
    notes,
  });
  if (res.error) { alert('Error: ' + res.error); return; }
  closeAttEditModal();
  renderAttendanceTable();
}
```

- [ ] **Step 5: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/dashboard.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_dash_check_off.js', scripts.join('\n;\n'));
"
node --check /tmp/_dash_check_off.js && echo OK
rm -f /tmp/_dash_check_off.js
```

Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add admin/dashboard.html
git commit -m "Add offerings field to attendance entry form, edit modal, and table" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Analytics page — stat cards, chart, table, CSV

**Files:**
- Modify: `admin/attendance-dashboard.html`

- [ ] **Step 1: Add the two new stat cards**

Find:

```html
    <div class="stat-card">
      <div class="stat-label">Avg Small Groups (4-wk)</div>
      <div class="stat-value" id="statAvgSG">–</div>
      <div class="stat-sub" id="statAvgSGSub"></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">SG Engagement Rate</div>
```

Replace with:

```html
    <div class="stat-card">
      <div class="stat-label">Avg Small Groups (4-wk)</div>
      <div class="stat-value" id="statAvgSG">–</div>
      <div class="stat-sub" id="statAvgSGSub"></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Latest Offerings</div>
      <div class="stat-value" id="statLatestOfferings">–</div>
      <div class="stat-sub" id="statLatestOfferingsSub"></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Avg Offerings (4-wk)</div>
      <div class="stat-value" id="statAvgOfferings">–</div>
      <div class="stat-sub" id="statAvgOfferingsSub"></div>
    </div>
    <div class="stat-card">
      <div class="stat-label">SG Engagement Rate</div>
```

- [ ] **Step 2: Add the Offerings chart card**

Find:

```html
    <div class="chart-card">
      <div class="chart-title">SG Engagement Rate</div>
      <div class="chart-wrap"><canvas id="rateChart"></canvas></div>
    </div>
  </div>
```

Replace with:

```html
    <div class="chart-card">
      <div class="chart-title">SG Engagement Rate</div>
      <div class="chart-wrap"><canvas id="rateChart"></canvas></div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Offerings Over Time</div>
      <div class="chart-wrap"><canvas id="offeringsChart"></canvas></div>
    </div>
  </div>
```

- [ ] **Step 3: Add the Offerings table column header**

Find:

```html
      <thead><tr>
        <th>Date</th>
        <th>Worship</th>
        <th>vs Prior</th>
        <th>Small Groups</th>
        <th>vs Prior</th>
        <th>SG Rate</th>
        <th>Notes</th>
      </tr></thead>
```

Replace with:

```html
      <thead><tr>
        <th>Date</th>
        <th>Worship</th>
        <th>vs Prior</th>
        <th>Small Groups</th>
        <th>vs Prior</th>
        <th>SG Rate</th>
        <th>Offerings</th>
        <th>vs Prior</th>
        <th>Notes</th>
      </tr></thead>
```

- [ ] **Step 4: Add a money formatter, wire stats**

Find:

```javascript
function fmtFull(d) {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return new Date(y, m-1, day).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
```

Replace with:

```javascript
function fmtFull(d) {
  if (!d) return '';
  const [y,m,day] = d.split('-');
  return new Date(y, m-1, day).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function fmtMoney(v) {
  return v != null ? '$' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '–';
}
```

- [ ] **Step 5: Add the offerings stats to `updateStats`**

Find:

```javascript
  // Peak worship
  if (worshipRows.length) {
    const peak = worshipRows.reduce((best, r) => r.worshipCount > best.worshipCount ? r : best);
    document.getElementById('statPeak').textContent = peak.worshipCount.toLocaleString();
    document.getElementById('statPeakSub').textContent = fmtFull(peak.serviceDate);
  }
}
```

Replace with:

```javascript
  // Peak worship
  if (worshipRows.length) {
    const peak = worshipRows.reduce((best, r) => r.worshipCount > best.worshipCount ? r : best);
    document.getElementById('statPeak').textContent = peak.worshipCount.toLocaleString();
    document.getElementById('statPeakSub').textContent = fmtFull(peak.serviceDate);
  }

  // Offerings
  const offeringsRows = data.filter(r => r.offerings != null);
  const latestO = offeringsRows.at(-1);
  document.getElementById('statLatestOfferings').textContent = fmtMoney(latestO ? latestO.offerings : null);
  document.getElementById('statLatestOfferingsSub').textContent = latestO ? fmtFull(latestO.serviceDate) : '';
  const avg4O = offeringsRows.slice(-4);
  const avgO = avg4O.length ? avg4O.reduce((s,r) => s + Number(r.offerings), 0) / avg4O.length : null;
  document.getElementById('statAvgOfferings').textContent = fmtMoney(avgO);
  document.getElementById('statAvgOfferingsSub').textContent = avg4O.length ? `avg of last ${avg4O.length} entries` : '';
}
```

- [ ] **Step 6: Add the Offerings chart to `updateCharts`**

Find:

```javascript
function updateCharts(data) {
  const labels  = data.map(r => fmt(r.serviceDate));
  const worship = data.map(r => r.worshipCount);
  const sg      = data.map(r => r.smallGroupCount);
  const rates   = data.map(r => (r.worshipCount && r.smallGroupCount)
    ? Math.round(r.smallGroupCount / r.worshipCount * 100) : null);
```

Replace with:

```javascript
function updateCharts(data) {
  const labels    = data.map(r => fmt(r.serviceDate));
  const worship   = data.map(r => r.worshipCount);
  const sg        = data.map(r => r.smallGroupCount);
  const offerings = data.map(r => r.offerings != null ? Number(r.offerings) : null);
  const rates     = data.map(r => (r.worshipCount && r.smallGroupCount)
    ? Math.round(r.smallGroupCount / r.worshipCount * 100) : null);
```

- [ ] **Step 7: Add the Offerings chart instance, after the Rate chart**

Find:

```javascript
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 }, maxRotation: 45 } },
        y: {
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 }, callback: v => v + '%' },
          beginAtZero: true,
          max: 100,
        },
      },
    },
  });
}

function updateTable(data) {
```

Replace with:

```javascript
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 }, maxRotation: 45 } },
        y: {
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 }, callback: v => v + '%' },
          beginAtZero: true,
          max: 100,
        },
      },
    },
  });

  // Offerings chart
  if (_offeringsChart) _offeringsChart.destroy();
  _offeringsChart = new Chart(document.getElementById('offeringsChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Offerings',
        data: offerings,
        backgroundColor: offerings.map(v => v != null ? 'rgba(21,92,162,.75)' : 'transparent'),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          bodyFont: { family: 'DM Sans' },
          titleFont: { family: 'DM Sans' },
          callbacks: { label: ctx => ctx.raw != null ? fmtMoney(ctx.raw) : 'N/A' },
        },
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 }, maxRotation: 45 } },
        y: {
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { family: 'DM Sans', size: 11 }, callback: v => '$' + v.toLocaleString() },
          beginAtZero: true,
        },
      },
    },
  });
}

function updateTable(data) {
```

- [ ] **Step 8: Declare the new chart variable**

Find:

```javascript
let _trendChart, _rateChart;
```

Replace with:

```javascript
let _trendChart, _rateChart, _offeringsChart;
```

- [ ] **Step 9: Add the offerings column + diff to `updateTable`**

Find:

```javascript
    const wDiff = (r.worshipCount != null && prev?.worshipCount != null)
      ? r.worshipCount - prev.worshipCount : null;
    const sDiff = (r.smallGroupCount != null && prev?.smallGroupCount != null)
      ? r.smallGroupCount - prev.smallGroupCount : null;

    const diffPill = (diff) => {
      if (diff == null) return '<span style="color:var(--text-muted);">–</span>';
      if (diff > 0) return `<span class="pill pill-up">+${diff}</span>`;
      if (diff < 0) return `<span class="pill pill-down">${diff}</span>`;
      return `<span class="pill" style="background:var(--bg);">0</span>`;
    };

    const rate = (r.worshipCount && r.smallGroupCount)
      ? Math.round(r.smallGroupCount / r.worshipCount * 100) + '%' : '–';

    return `<tr>
      <td style="font-weight:600;">${fmtFull(r.serviceDate)}</td>
      <td>${r.worshipCount != null ? r.worshipCount.toLocaleString() : '–'}</td>
      <td>${diffPill(wDiff)}</td>
      <td>${r.smallGroupCount != null ? r.smallGroupCount.toLocaleString() : '–'}</td>
      <td>${diffPill(sDiff)}</td>
      <td><span class="pill pill-amber">${rate}</span></td>
      <td style="color:var(--text-muted);font-size:.82rem;">${r.notes || ''}</td>
    </tr>`;
  }).join('');
}
```

Replace with:

```javascript
    const wDiff = (r.worshipCount != null && prev?.worshipCount != null)
      ? r.worshipCount - prev.worshipCount : null;
    const sDiff = (r.smallGroupCount != null && prev?.smallGroupCount != null)
      ? r.smallGroupCount - prev.smallGroupCount : null;
    const oDiff = (r.offerings != null && prev?.offerings != null)
      ? Number(r.offerings) - Number(prev.offerings) : null;

    const diffPill = (diff) => {
      if (diff == null) return '<span style="color:var(--text-muted);">–</span>';
      if (diff > 0) return `<span class="pill pill-up">+${diff}</span>`;
      if (diff < 0) return `<span class="pill pill-down">${diff}</span>`;
      return `<span class="pill" style="background:var(--bg);">0</span>`;
    };
    const moneyDiffPill = (diff) => {
      if (diff == null) return '<span style="color:var(--text-muted);">–</span>';
      if (diff > 0) return `<span class="pill pill-up">+${fmtMoney(diff)}</span>`;
      if (diff < 0) return `<span class="pill pill-down">-${fmtMoney(Math.abs(diff))}</span>`;
      return `<span class="pill" style="background:var(--bg);">$0</span>`;
    };

    const rate = (r.worshipCount && r.smallGroupCount)
      ? Math.round(r.smallGroupCount / r.worshipCount * 100) + '%' : '–';

    return `<tr>
      <td style="font-weight:600;">${fmtFull(r.serviceDate)}</td>
      <td>${r.worshipCount != null ? r.worshipCount.toLocaleString() : '–'}</td>
      <td>${diffPill(wDiff)}</td>
      <td>${r.smallGroupCount != null ? r.smallGroupCount.toLocaleString() : '–'}</td>
      <td>${diffPill(sDiff)}</td>
      <td><span class="pill pill-amber">${rate}</span></td>
      <td>${fmtMoney(r.offerings)}</td>
      <td>${moneyDiffPill(oDiff)}</td>
      <td style="color:var(--text-muted);font-size:.82rem;">${r.notes || ''}</td>
    </tr>`;
  }).join('');
}
```

- [ ] **Step 10: Add offerings to the "no data" empty row colspan and to CSV export**

Find:

```javascript
  if (!reversed.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No data yet — add entries in the dashboard.</td></tr>';
    return;
  }
```

Replace with:

```javascript
  if (!reversed.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">No data yet — add entries in the dashboard.</td></tr>';
    return;
  }
```

Find:

```javascript
function exportCSV() {
  const headers = ['Date','Worship Attendance','Small Groups','SG Engagement Rate','Notes'];
  const rows = [..._allData].reverse().map(r => {
    const rate = (r.worshipCount && r.smallGroupCount)
      ? Math.round(r.smallGroupCount / r.worshipCount * 100) + '%' : '';
    return [fmtFull(r.serviceDate), r.worshipCount ?? '', r.smallGroupCount ?? '', rate, r.notes || ''];
  });
```

Replace with:

```javascript
function exportCSV() {
  const headers = ['Date','Worship Attendance','Small Groups','SG Engagement Rate','Offerings','Notes'];
  const rows = [..._allData].reverse().map(r => {
    const rate = (r.worshipCount && r.smallGroupCount)
      ? Math.round(r.smallGroupCount / r.worshipCount * 100) + '%' : '';
    return [fmtFull(r.serviceDate), r.worshipCount ?? '', r.smallGroupCount ?? '', rate, r.offerings ?? '', r.notes || ''];
  });
```

- [ ] **Step 11: Verify syntax**

```bash
node -e "
const fs = require('fs');
const html = fs.readFileSync('admin/attendance-dashboard.html', 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync('/tmp/_attdash_check.js', scripts.join('\n;\n'));
"
node --check /tmp/_attdash_check.js && echo OK
rm -f /tmp/_attdash_check.js
```

Expected: `OK`

- [ ] **Step 12: Commit**

```bash
git add admin/attendance-dashboard.html
git commit -m "Add offerings chart, stats, table column, and CSV export to Attendance Analytics" -m "Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Deploy and verify

- [ ] **Step 1: Push to staging**

```bash
git push staging claude/loving-darwin-e8d5ea:main
```

- [ ] **Step 2: Verify the GitHub Pages build**

```bash
gh api repos/sspratlen/HeritageHill-staging/pages/builds/latest --jq '.status'
```

Poll until `built`.

- [ ] **Step 3: Manual verification on staging**

Log into `admin/dashboard.html` on staging as admin, go to the Attendance tab. Add a weekly entry with an offerings amount, confirm it saves and shows in the table. Edit an entry to add/change offerings. Open `attendance-dashboard.html` (View Analytics), confirm the two new stat cards, the new Offerings chart, the table's Offerings + vs Prior columns, and the CSV export all show correct data — including a week with no offerings entered, to confirm blanks are handled gracefully.

- [ ] **Step 4: Once confirmed on staging, apply the same migration to production and push the code there too**

Apply `attendance-offerings-schema.sql` to the production Supabase project (`ktyplbmawlaerzohkdqy`), then repeat Steps 1–3 against the `origin` remote (production). Do not do this until explicitly asked — staging verification comes first.

- [ ] **Step 5: Report back**

Confirm to the user: staging deployment is live, offerings can be entered/edited, and the analytics page correctly shows the new chart/stats/table/CSV data.
