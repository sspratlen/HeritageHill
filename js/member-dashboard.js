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
  // groups: result of SupaDB.adminGetAllGroups() (for name lookup)
  renderGroupHistory(containerEl, memberships, groups) {
    if (!memberships.length) {
      containerEl.innerHTML = '<p style="color:var(--text-muted);font-size:.9rem;">No group history yet.</p>';
      return;
    }
    const groupName = id => {
      const g = groups.find(x => String(x.id) === String(id));
      return g ? g.name : 'Unknown Group';
    };
    const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    containerEl.innerHTML = `<table><thead><tr><th>Group</th><th>Joined</th><th>Status</th></tr></thead><tbody>` +
      memberships.map(m => `
        <tr>
          <td>${this.escapeHtml(groupName(m.groupId))}</td>
          <td>${fmt(m.joinedAt)}</td>
          <td>${m.leftAt ? 'Left ' + fmt(m.leftAt) : '<span class="badge badge-green">Current</span>'}</td>
        </tr>`).join('') + '</tbody></table>';
  },
};
