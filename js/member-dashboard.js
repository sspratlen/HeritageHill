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

  GT_LABELS: { about_us: 'Plant', about_you: 'Discover', get_involved: 'Grow' },
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
  // onGroupClick: optional (groupId) => void -- when given, each row
  // becomes clickable (e.g. to open that group's details).
  renderGroupHistory(containerEl, memberships, groups, email, semesters, onGroupClick) {
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
    const clickable = typeof onGroupClick === 'function';
    containerEl.innerHTML = `<table><thead><tr><th>Group</th><th>Joined</th><th>Status</th></tr></thead><tbody>` +
      rows.map(m => `
        <tr${clickable ? ` class="jp-row-clickable" data-group-id="${this.escapeHtml(String(m.groupId))}"` : ''}>
          <td>${this.escapeHtml(groupName(m.groupId))}</td>
          <td>${m.isLeader ? this.escapeHtml(semesterName(m.semesterId)) : fmt(m.joinedAt)}</td>
          <td>${m.isLeader ? '<span class="badge badge-blue">Leader</span>' : (m.leftAt ? 'Left ' + fmt(m.leftAt) : '<span class="badge badge-green">Current</span>')}</td>
        </tr>`).join('') + '</tbody></table>';
    if (clickable) {
      containerEl.querySelectorAll('tr[data-group-id]').forEach(row => {
        row.addEventListener('click', () => onGroupClick(row.dataset.groupId));
      });
    }
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

  // Renders the 4-stage Found/Filled/Freed/Forged journey pipeline into
  // containerEl, using css/journey-pipeline.css (must be linked by the
  // host page). Every field is real data -- no placeholder content.
  //
  // opts:
  //   memberSince, baptizedAt: date strings or null/undefined
  //   groupMemberships, groups, email: same shape as renderGroupHistory,
  //     used to build the Filled roster -- attended groups only. Leading a
  //     group is service, not attendance, so it's folded into Forged
  //     instead (as its own "<Group> (Small Group)" row).
  //   gtRegistrations: result of getGrowthTrackRegistrationsForUser
  //   discAttempt, giftsAttempt: latest attempt or falsy
  //   discAttemptCount, giftsAttemptCount: optional, same convention as
  //     renderDiscResult/renderGiftsResult's own attemptCount arg
  //   discBlends, giftsContent: _content.discBlends / _content.gifts --
  //     required to render the full assessment breakdown; if omitted, the
  //     Freed stage just shows a taken/not-taken line with no detail
  //   assessmentCtaHrefs: { disc, gifts } -- when given, renders a Take/
  //     Retake link under each assessment (only makes sense on a person's
  //     own profile, so admin/member-dashboard.html omits this)
  //   teamMemberships, teams: same shape as groupMemberships/groups, for
  //     the Forged roster (member + led rows), each row also showing
  //     whether that person is trained for that team -- plus any group
  //     `email` leads, appended the same way
  renderJourneyPipeline(containerEl, opts) {
    // Some dates here are plain `date` columns ("2026-09-12") and some are
    // `timestamptz` columns rendered as full ISO strings ("2026-09-12T00:
    // 00:00+00:00") -- these only ever carry a calendar date, never a real
    // time, so take just the first 10 chars and parse as local midnight.
    // Parsing the timestamptz string as-is would apply its UTC offset, then
    // display would re-render in the browser's own zone -- shifting the
    // date back a day for anyone west of UTC.
    const fmt = d => d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    const yesNo = (isYes, dateStr) => isYes
      ? `<span class="jp-yes">✓${dateStr ? ' · ' + this.escapeHtml(fmt(dateStr)) : ''}</span>`
      : `<span class="jp-no">✗</span>`;

    // ── Filled: small groups this person actively attends. Leading a group
    // is an act of service, not attendance -- that goes under Forged
    // instead, alongside impact teams.
    const groups = opts.groups || [];
    const memberships = opts.groupMemberships || [];
    const email = opts.email || '';
    const groupRows = memberships
      .filter(m => !m.leftAt)
      .map(m => ({ name: (groups.find(g => String(g.id) === String(m.groupId)) || {}).name || 'Unknown Group' }));

    // ── Forged: impact team roster (leader + member rows), plus any small
    // group this person leads, shown as a team of its own.
    const teams = opts.teams || [];
    const teamMemberships = (opts.teamMemberships || []).filter(m => !m.leftAt);
    const teamRows = teamMemberships.map(m => ({
      name: (teams.find(t => String(t.id) === String(m.teamId)) || {}).name || 'Unknown Team',
      role: m.role === 'leader' ? 'leader' : 'member',
      trained: m.trained, trainedAt: m.trainedAt,
    }));
    const ledGroupRows = (email
      ? groups.filter(g => g.leaderEmail && g.leaderEmail.toLowerCase() === email.toLowerCase())
      : []
    ).map(g => ({ name: g.name + ' (Small Group)', role: 'leader', trained: undefined }));
    const forgedRows = teamRows.concat(ledGroupRows);

    // ── Freed: Growth Track history, in fixed part order.
    const byPart = {};
    (opts.gtRegistrations || []).forEach(r => {
      const existing = byPart[r.part];
      if (!existing || (r.attended && !existing.attended)) byPart[r.part] = r;
    });
    const gtRows = this.GT_ORDER.map(part => {
      const r = byPart[part];
      const label = this.GT_LABELS[part];
      if (!r) return `<div class="jp-roster-row"><span class="jp-roster-name">${label}</span><span class="jp-no">Not registered</span></div>`;
      if (r.attended) return `<div class="jp-roster-row"><span class="jp-roster-name">${label}</span>${yesNo(true, r.sessionDate)}</div>`;
      return `<div class="jp-roster-row"><span class="jp-roster-name">${label}</span><span class="jp-val">Registered${r.sessionDate ? ' · ' + this.escapeHtml(fmt(r.sessionDate)) : ''}</span></div>`;
    }).join('');
    const plantAttended = byPart.about_us && byPart.about_us.attended;

    const rosterOrEmpty = (rows, emptyText, renderRow) =>
      rows.length ? `<div class="jp-roster">${rows.map(renderRow).join('')}</div>` : `<p class="jp-empty">${emptyText}</p>`;

    const ctaHrefs = opts.assessmentCtaHrefs || {};
    const assessmentCta = (href, taken) => href
      ? `<a href="${this.escapeHtml(href)}" class="jp-cta">${taken ? 'Retake' : 'Take the Assessment'}</a>` : '';

    containerEl.innerHTML = `
      <div class="journey-pipeline">
        <div class="jp-stage">
          <div class="jp-stage-head"><span class="jp-stage-name">Found</span><span class="jp-stage-verse">by God</span></div>
          <div class="jp-card">
            <div class="jp-label">Attendance</div>
            <div class="jp-field"><span>Baptism</span>${yesNo(!!opts.baptizedAt, opts.baptizedAt)}</div>
            <div class="jp-field"><span>Member</span>${yesNo(!!opts.memberSince, opts.memberSince)}</div>
          </div>
        </div>

        <div class="jp-stage">
          <div class="jp-stage-head"><span class="jp-stage-name">Filled</span><span class="jp-stage-verse">by the Spirit</span></div>
          <div class="jp-card">
            <div class="jp-label">Small groups</div>
            ${rosterOrEmpty(groupRows, 'Not in a small group yet.', g => `
              <div class="jp-roster-row">
                <span class="jp-roster-name">${this.escapeHtml(g.name)}</span>
              </div>`)}
          </div>
        </div>

        <div class="jp-stage">
          <div class="jp-stage-head"><span class="jp-stage-name">Freed</span><span class="jp-stage-verse">to live like Jesus</span></div>
          <div class="jp-card">
            <div class="jp-label">Growth Track history</div>
            <div class="jp-roster">${gtRows}</div>
            ${plantAttended ? '<span class="jp-pill">Plant attended → membership</span>' : ''}
            <div class="jp-label" style="margin-top:2px;">Personality (DISC)</div>
            <div id="jpDiscResult"></div>
            ${assessmentCta(ctaHrefs.disc, !!opts.discAttempt)}
            <div class="jp-label" style="margin-top:2px;">Spiritual Gifts</div>
            <div id="jpGiftsResult"></div>
            ${assessmentCta(ctaHrefs.gifts, !!opts.giftsAttempt)}
          </div>
        </div>

        <div class="jp-stage">
          <div class="jp-stage-head"><span class="jp-stage-name">Forged</span><span class="jp-stage-verse">for mission</span></div>
          <div class="jp-card">
            <div class="jp-label">Impact teams</div>
            ${rosterOrEmpty(forgedRows, 'Not serving on a team yet.', t => `
              <div class="jp-roster-row">
                <span class="jp-roster-name">${this.escapeHtml(t.name)}</span>
                <span class="jp-role-tag ${t.role === 'leader' ? 'jp-leads' : 'jp-member'}">${t.role === 'leader' ? 'Leads' : 'Member'}</span>
              </div>
              ${t.trained === undefined ? '' : `<div class="jp-roster-sub" style="padding:0 0 6px;">${t.trained ? `✓ Trained${t.trainedAt ? ' · ' + this.escapeHtml(fmt(t.trainedAt)) : ''}` : 'Not yet trained'}</div>`}`)}
          </div>
        </div>
      </div>`;

    // The DISC/gifts boxes above are placeholders -- fill them in now that
    // they're actually in the DOM. renderDiscResult/renderGiftsResult are
    // no-ops on a falsy attempt, so an untaken assessment just gets the
    // "Not taken yet" fallback below instead.
    const discBox = containerEl.querySelector('#jpDiscResult');
    if (discBox) {
      if (opts.discAttempt && opts.discBlends) {
        this.renderDiscResult(discBox, opts.discAttempt, opts.discBlends, opts.discAttemptCount);
      } else {
        discBox.innerHTML = '<p class="jp-empty">Not taken yet.</p>';
      }
    }
    const giftsBox = containerEl.querySelector('#jpGiftsResult');
    if (giftsBox) {
      if (opts.giftsAttempt && opts.giftsContent) {
        this.renderGiftsResult(giftsBox, opts.giftsAttempt, opts.giftsContent, opts.giftsAttemptCount);
      } else {
        giftsBox.innerHTML = '<p class="jp-empty">Not taken yet.</p>';
      }
    }
  },

  // ── Standalone Found/Filled/Freed/Forged cards, one stage at a time --
  // used by pages that put each stage in its own nav destination (e.g. a
  // Found/Filled/Freed/Forged sidebar) rather than one consolidated page
  // like renderJourneyPipeline above. Same jp-* CSS, same date-formatting
  // rule (timestamptz strings only ever carry a calendar date -- take the
  // first 10 chars and parse as local midnight, never the raw ISO string).
  _jpFmt(d) {
    return d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  },

  // opts: { baptism: a person_milestones row or null, onPrintCertificate }
  renderBaptismCard(containerEl, opts) {
    const baptism = opts.baptism;
    containerEl.innerHTML = `
      <div class="jp-card">
        <div class="jp-label">Attendance</div>
        ${baptism
          ? `<div class="jp-field"><span>Baptism</span><span class="jp-yes">✓ · ${this.escapeHtml(this._jpFmt(baptism.achievedAt))}</span></div>
             ${baptism.notes ? `<div class="jp-field"><span>Notes</span><span class="jp-val">${this.escapeHtml(baptism.notes)}</span></div>` : ''}`
          : `<p class="jp-empty">Not on record yet — talk to a staff member to get your baptism added.</p>`}
        ${baptism && opts.onPrintCertificate ? '<button type="button" class="jp-cta" id="jpPrintCertBtn" style="margin-top:10px;border:none;cursor:pointer;">Print Certificate</button>' : ''}
      </div>`;
    const btn = containerEl.querySelector('#jpPrintCertBtn');
    if (btn && opts.onPrintCertificate) btn.addEventListener('click', opts.onPrintCertificate);
  },

  // opts: { memberships, groups, email, semesters, onGroupClick } --
  // same shape as renderGroupHistory, which does the actual rendering.
  renderGroupsCard(containerEl, opts) {
    containerEl.innerHTML = '<div class="jp-card"><div class="jp-label">Small groups</div><div id="_jpGroupsInner"></div></div>';
    this.renderGroupHistory(containerEl.querySelector('#_jpGroupsInner'), opts.memberships || [], opts.groups || [], opts.email || '', opts.semesters || [], opts.onGroupClick);
  },

  // opts: { gtRegistrations, memberSince, discAttempt, giftsAttempt,
  //   discAttemptCount, giftsAttemptCount, discBlends, giftsContent,
  //   assessmentCtaHrefs: {disc, gifts}, onPrintMemberCard, onLearnImpactTeams }
  renderGrowthTrackCard(containerEl, opts) {
    const fmt = d => this._jpFmt(d);
    const attendedByPart = { about_us: [], about_you: [], get_involved: [] };
    (opts.gtRegistrations || []).forEach(r => { if (r.attended && attendedByPart[r.part]) attendedByPart[r.part].push(r.sessionDate); });
    const datesLine = part => {
      const dates = attendedByPart[part].filter(Boolean).sort();
      return dates.length
        ? `<div class="jp-val" style="margin:2px 0 8px;">Attended: ${dates.map(fmt).join(', ')}</div>`
        : `<div class="jp-val" style="margin:2px 0 8px;">Not attended yet.</div>`;
    };

    const plantExtra = opts.memberSince
      ? `<div class="jp-val">Member since ${this.escapeHtml(fmt(opts.memberSince))}${opts.onPrintMemberCard ? ' · <button type=\"button\" class=\"jp-cta\" id=\"jpPrintMemberBtn\" style=\"border:none;cursor:pointer;\">Print Member Card</button>' : ''}</div>`
      : `<div class="jp-val">Attend Plant to become a member.</div>`;

    const ctaHrefs = opts.assessmentCtaHrefs || {};
    const discoverExtra = (ctaHrefs.disc || ctaHrefs.gifts) ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 8px;">
        ${ctaHrefs.disc ? `<a href="${this.escapeHtml(ctaHrefs.disc)}" class="jp-cta">${opts.discAttempt ? 'Retake' : 'Take'} DISC Survey</a>` : ''}
        ${ctaHrefs.gifts ? `<a href="${this.escapeHtml(ctaHrefs.gifts)}" class="jp-cta">${opts.giftsAttempt ? 'Retake' : 'Take'} Spiritual Gifts Survey</a>` : ''}
      </div>` : '';

    const growExtra = opts.onLearnImpactTeams
      ? '<button type="button" class="jp-cta" id="jpLearnTeamsBtn" style="border:none;cursor:pointer;">See what Impact Teams are available</button>'
      : '';

    containerEl.innerHTML = `
      <div class="jp-card">
        <div class="jp-label">Growth Track history</div>
        <div class="jp-roster-row"><span class="jp-roster-name">Plant</span></div>
        ${datesLine('about_us')}${plantExtra}
        <div class="jp-roster-row" style="border-top:1px solid var(--border);"><span class="jp-roster-name">Discover</span></div>
        ${datesLine('about_you')}${discoverExtra}
        <div class="jp-roster-row" style="border-top:1px solid var(--border);"><span class="jp-roster-name">Grow</span></div>
        ${datesLine('get_involved')}${growExtra}
        <div class="jp-label" style="margin-top:6px;">Spiritual Gifts</div>
        <div id="_jpGiftsInner"></div>
        <div class="jp-label" style="margin-top:6px;">Personality (DISC)</div>
        <div id="_jpDiscInner"></div>
      </div>`;

    const printBtn = containerEl.querySelector('#jpPrintMemberBtn');
    if (printBtn && opts.onPrintMemberCard) printBtn.addEventListener('click', opts.onPrintMemberCard);
    const learnBtn = containerEl.querySelector('#jpLearnTeamsBtn');
    if (learnBtn && opts.onLearnImpactTeams) learnBtn.addEventListener('click', opts.onLearnImpactTeams);

    const giftsBox = containerEl.querySelector('#_jpGiftsInner');
    if (opts.giftsAttempt && opts.giftsContent) this.renderGiftsResult(giftsBox, opts.giftsAttempt, opts.giftsContent, opts.giftsAttemptCount);
    else giftsBox.innerHTML = '<p class="jp-empty">Not taken yet.</p>';

    const discBox = containerEl.querySelector('#_jpDiscInner');
    if (opts.discAttempt && opts.discBlends) this.renderDiscResult(discBox, opts.discAttempt, opts.discBlends, opts.discAttemptCount);
    else discBox.innerHTML = '<p class="jp-empty">Not taken yet.</p>';
  },

  // opts: { teamMemberships, teams, groups, email } -- groups/email are
  // used to also surface any small group this person leads, the same way
  // as renderJourneyPipeline's Forged stage (leading is service too).
  renderImpactTeamsCard(containerEl, opts) {
    const fmt = d => this._jpFmt(d);
    const teams = opts.teams || [];
    const rows = (opts.teamMemberships || []).filter(m => !m.leftAt).map(m => ({
      name: (teams.find(t => String(t.id) === String(m.teamId)) || {}).name || 'Unknown Team',
      role: m.role === 'leader' ? 'leader' : 'member', trained: m.trained, trainedAt: m.trainedAt,
    }));
    const email = opts.email || '';
    const ledGroups = (email
      ? (opts.groups || []).filter(g => g.leaderEmail && g.leaderEmail.toLowerCase() === email.toLowerCase())
      : []
    ).map(g => ({ name: g.name + ' (Small Group)', role: 'leader', trained: undefined }));
    const allRows = rows.concat(ledGroups);

    containerEl.innerHTML = `
      <div class="jp-card">
        <div class="jp-label">Impact teams</div>
        ${allRows.length ? `<div class="jp-roster">${allRows.map(t => `
          <div class="jp-roster-row">
            <span class="jp-roster-name">${this.escapeHtml(t.name)}</span>
            <span class="jp-role-tag ${t.role === 'leader' ? 'jp-leads' : 'jp-member'}">${t.role === 'leader' ? 'Leads' : 'Member'}</span>
          </div>
          ${t.trained === undefined ? '' : `<div class="jp-roster-sub" style="padding:0 0 6px;">${t.trained ? `✓ Trained${t.trainedAt ? ' · ' + this.escapeHtml(fmt(t.trainedAt)) : ''}` : 'Not yet trained'}</div>`}`).join('')}</div>`
          : '<p class="jp-empty">Not serving on a team yet.</p>'}
      </div>`;
  },
};
