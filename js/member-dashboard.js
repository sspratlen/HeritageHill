/* ================================================================
   Heritage Hill — shared Growth Track progress + group history
   rendering, used by admin/member-dashboard.html and my-profile.html
   ================================================================ */
const MemberDashboard = {
  escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  },

  GT_LABELS: { about_us: 'About Us', about_you: 'About You', get_involved: 'Get Involved' },
  GT_ORDER: ['about_us', 'about_you', 'get_involved'],

  // Renders a 3-row Growth Track checklist into containerEl.
  // registrations: result of SupaDB.getGrowthTrackRegistrationsForUser(userId)
  renderGrowthTrackProgress(containerEl, registrations) {
    const byPart = {};
    registrations.forEach(r => {
      const existing = byPart[r.part];
      if (!existing || (r.attended && !existing.attended)) byPart[r.part] = r;
    });
    containerEl.innerHTML = this.GT_ORDER.map(part => {
      const r = byPart[part];
      const label = this.GT_LABELS[part];
      if (!r) {
        return `<div class="gt-progress-row"><span>${label}</span><span style="color:var(--text-muted);">Not Registered</span></div>`;
      }
      const dateStr = r.sessionDate ? new Date(r.sessionDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      if (r.attended) {
        return `<div class="gt-progress-row"><span>${label}</span><span style="color:var(--success,#16a34a);font-weight:600;">✓ Attended${dateStr ? ' · ' + dateStr : ''}</span></div>`;
      }
      return `<div class="gt-progress-row"><span>${label}</span><span>Registered${dateStr ? ' · ' + dateStr : ''}</span></div>`;
    }).join('');
  },

  // Renders a small group history table into containerEl.
  // memberships: result of SupaDB.getGroupMembershipsForUser(userId)
  // groups: for name lookup — SupaDB.adminGetAllGroups() (admin caller) or
  // SupaDB.getPublishedGroups() (member's own page); a group unpublished
  // since a past membership falls back to "Unknown Group" in the latter case.
  // email: the member's own email — used to also surface groups they lead
  // (matched against groups[].leaderEmail) even if they have no separate
  // group_memberships row for that group. Leading a group counts as having
  // attended it.
  // semesters: result of SupaDB.getSemesters() — used to show the group's
  // semester name (e.g. "Fall 2026") in the Joined column for a leader row,
  // since there's no tracked join date for leading (only for real
  // memberships, which keep their real joined date).
  renderGroupHistory(containerEl, memberships, groups, email, semesters) {
    const led = (email
      ? groups.filter(g => g.leaderEmail && g.leaderEmail.toLowerCase() === email.toLowerCase())
      : []
    ).filter(g => !memberships.some(m => String(m.groupId) === String(g.id)))
     .map(g => ({ groupId: g.id, joinedAt: null, leftAt: null, isLeader: true, semesterId: g.semesterId }));

    const rows = memberships.concat(led);

    if (!rows.length) {
      containerEl.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;">No group history yet.</p>';
      return;
    }
    const groupName = id => {
      const g = groups.find(x => String(x.id) === String(id));
      return g ? g.name : 'Unknown Group';
    };
    const semesterName = id => {
      const s = (semesters || []).find(x => x.id === id);
      return s ? s.name : '—';
    };
    const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
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
