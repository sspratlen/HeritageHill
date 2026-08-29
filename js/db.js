/* ================================================================
   Heritage Hill Church — Async Database Layer (Supabase)
   ================================================================
   Replaces the localStorage DB object in main.js.
   All methods are async and return plain JS objects matching
   the camelCase shape the existing page code expects.
   ================================================================ */

/* ── Edge Function URLs ─────────────────────────────────────── */
const CONTACT_FUNCTION_URL       = SUPABASE_URL + '/functions/v1/send-contact-email';
const MAILCHIMP_FUNCTION_URL     = SUPABASE_URL + '/functions/v1/mailchimp';
const PRAYER_NOTIFY_URL          = SUPABASE_URL + '/functions/v1/notify-pastors';
const LEADER_APPROVED_NOTIFY_URL = SUPABASE_URL + '/functions/v1/notify-leader-approved';

/* ── Column-name mappers (snake_case DB ↔ camelCase JS) ────── */

function eventFromDb(r) {
  return {
    id: r.id, title: r.title, date: r.date, dateSort: r.date_sort,
    endDate: r.end_date || '', endDateSort: r.end_date_sort || '',
    time: r.time, location: r.location, category: r.category,
    description: r.description, image: r.image,
    recurring: !!r.recurring, published: r.published !== false,
    rsvpEnabled: !!r.rsvp_enabled,
  };
}
function eventToDb(ev) {
  const o = {
    title: ev.title, date: ev.date, date_sort: ev.dateSort || '2099-12-31',
    end_date: ev.endDate || null, end_date_sort: ev.endDateSort || null,
    time: ev.time, location: ev.location, category: ev.category || 'Other',
    description: ev.description, image: ev.image,
    recurring: !!ev.recurring, published: ev.published !== false,
    rsvp_enabled: !!ev.rsvpEnabled,
  };
  if (ev.id) o.id = ev.id;
  return o;
}

function rsvpFromDb(r) {
  return {
    id: r.id, eventId: r.event_id, eventTitle: r.event_title,
    fullName: r.full_name, email: r.email, phone: r.phone || '',
    date: r.created_at,
  };
}
function rsvpToDb(r) {
  return {
    event_id: r.eventId, event_title: r.eventTitle,
    full_name: r.fullName, email: r.email, phone: r.phone || '',
  };
}

function groupFromDb(r) {
  return {
    id: r.id, name: r.name, leader: r.leader, leaderEmail: r.leader_email || '',
    day: r.day, time: r.time, location: r.location, type: r.type,
    audience: r.audience, description: r.description, image: r.image,
    open: r.open !== false, published: r.published !== false,
    semesterId: r.semester_id || null,
  };
}
function groupToDb(g) {
  const o = {
    name: g.name, leader: g.leader, leader_email: g.leaderEmail || '',
    day: g.day, time: g.time, location: g.location, type: g.type || 'Life Group',
    audience: g.audience || 'All Ages', description: g.description, image: g.image,
    open: g.open !== false, published: g.published !== false,
    semester_id: g.semesterId || null,
  };
  if (g.id) o.id = g.id;
  return o;
}

function growthTrackPartFromDb(r) {
  return {
    id: r.id, part: r.part, title: r.title, description: r.description || '',
    sessionDate: r.session_date, sessionTime: r.session_time || '',
    location: r.location || '', published: !!r.published,
    sundayOfMonth: r.sunday_of_month || null,
  };
}
function growthTrackPartToDb(p) {
  return {
    title: p.title, description: p.description || '',
    session_date: p.sessionDate || null, session_time: p.sessionTime || '',
    location: p.location || '', published: !!p.published,
    sunday_of_month: p.sundayOfMonth || null,
  };
}
function growthTrackRegistrationFromDb(r) {
  return {
    id: r.id, part: r.part, sessionDate: r.session_date, sessionTime: r.session_time || '',
    name: r.name, email: r.email, phone: r.phone || '', notes: r.notes || '',
    addedByAdmin: !!r.added_by_admin, createdAt: r.created_at,
    userId: r.user_id, attended: !!r.attended,
  };
}

function groupMembershipFromDb(r) {
  return {
    id: r.id, groupId: r.group_id, userId: r.user_id, name: r.name,
    email: r.email, phone: r.phone || '', joinedAt: r.joined_at,
    leftAt: r.left_at, notes: r.notes || '',
  };
}

function signupFromDb(r) {
  return {
    id: r.id, groupId: r.group_id, groupName: r.group_name,
    leaderName: r.leader_name, leaderEmail: r.leader_email || '',
    name: r.name, email: r.email, phone: r.phone || '', message: r.message || '',
    date: r.created_at, contacted: !!r.contacted,
    semesterId: r.semester_id || null,
  };
}
function signupToDb(s) {
  return {
    group_id: s.groupId || null, group_name: s.groupName,
    leader_name: s.leaderName, leader_email: s.leaderEmail || '',
    name: s.name, email: s.email, phone: s.phone || '', message: s.message || '',
    contacted: false,
    semester_id: s.semesterId || null,
  };
}

function applicationFromDb(r) {
  return {
    id: r.id, status: r.status || 'pending', submittedDate: r.submitted_date,
    name: r.name, email: r.email, phone: r.phone || '', attendance: r.attendance || '',
    groupName: r.group_name, type: r.type, audience: r.audience,
    day: r.day, time: r.time, location: r.location,
    description: r.description, why: r.why, notes: r.notes || '',
    semesterId: r.semester_id || null,
  };
}
function applicationToDb(a) {
  return {
    name: a.name, email: a.email, phone: a.phone || '', attendance: a.attendance || '',
    group_name: a.groupName, type: a.type, audience: a.audience,
    day: a.day, time: a.time, location: a.location,
    description: a.description, why: a.why, notes: a.notes || '',
    status: a.status || 'pending',
    semester_id: a.semesterId || null,
  };
}

function prayerRequestFromDb(r) {
  return {
    id: r.id, name: r.name || '', email: r.email || '',
    request: r.request, private: !!r.private,
    prayed: !!r.prayed, createdAt: r.created_at,
  };
}
function prayerRequestToDb(p) {
  return {
    name: p.name || '', email: p.email || '',
    request: p.request, private: !!p.private,
  };
}

function subscriberFromDb(r) {
  return {
    id: r.id,
    firstName: r.first_name || '',
    lastName: r.last_name || '',
    email: r.email,
    tags: r.tags || [],
    status: r.status || 'subscribed',
    createdAt: r.created_at,
  };
}
function subscriberToDb(s) {
  return {
    first_name: s.firstName || '',
    last_name: s.lastName || '',
    email: s.email,
    tags: s.tags || [],
    status: s.status || 'subscribed',
  };
}

function sermonFromDb(r) {
  return {
    id: r.id, title: r.title, speaker: r.speaker || '', series: r.series || '',
    date: r.date, dateSort: r.date_sort || '2099-12-31',
    youtubeId: r.youtube_id, description: r.description || '',
    published: r.published !== false,
  };
}
function sermonToDb(s) {
  const o = {
    title: s.title, speaker: s.speaker || '', series: s.series || '',
    date: s.date, date_sort: s.dateSort || '2099-12-31',
    youtube_id: s.youtubeId, description: s.description || '',
    published: s.published !== false,
  };
  if (s.id) o.id = s.id;
  return o;
}

function memberProfileFromDb(r) {
  return {
    userId: r.user_id, name: r.name, email: r.email, phone: r.phone || '',
    groupId: r.group_id, yearsAttending: r.years_attending || '',
    status: r.status, shareWithLeader: !!r.share_with_leader, createdAt: r.created_at,
    avatarUrl: r.avatar_url || null,
  };
}
function attemptFromDb(r) {
  return {
    id: r.id, userId: r.user_id, assessmentType: r.assessment_type,
    answers: r.answers, scores: r.scores, result: r.result, completedAt: r.completed_at,
  };
}

/* ── Helper ─────────────────────────────────────────────────── */
function db() { return window._supabase; }

/* ================================================================
   SupaDB — public API
   ================================================================ */
window.SupaDB = {

  /* ── Auth ────────────────────────────────────────────────── */
  async signIn(email, password) {
    if (!db()) return { error: 'Supabase not initialised' };
    const { data, error } = await db().auth.signInWithPassword({ email, password });
    return { data, error };
  },
  async signOut() {
    if (!db()) return;
    await db().auth.signOut();
  },
  async getUser() {
    if (!db()) return null;
    const { data: { user } } = await db().auth.getUser();
    return user;
  },
  async updatePassword(newPassword) {
    const { error } = await db().auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  /* ── PUBLIC: Events ─────────────────────────────────────── */
  async getPublishedEvents() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('events').select('*')
        .eq('published', true).order('date_sort');
      if (error) throw error;
      return (data || []).map(eventFromDb);
    } catch(e) { console.error('[SupaDB] getPublishedEvents:', e.message); return []; }
  },

  async getPublishedEventsByRange(startISO, endISO, includeRecurring = true) {
    if (!db()) return [];
    try {
      // Fetch all published events, filter in JS to avoid boolean type mismatches
      const { data, error } = await db().from('events').select('*')
        .eq('published', true).order('date_sort');
      if (error) throw error;
      const all = (data || []).map(eventFromDb);
      return all.filter(ev => {
        const inRange = ev.dateSort >= startISO && ev.dateSort <= endISO;
        const isRecurring = !!ev.recurring;
        return inRange || (includeRecurring && isRecurring);
      });
    } catch(e) { console.error('[SupaDB] getPublishedEventsByRange:', e.message); return []; }
  },

  /* ── PUBLIC: Groups ─────────────────────────────────────── */
  async getPublishedGroups() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('groups').select('*')
        .eq('published', true).order('name');
      if (error) throw error;
      return (data || []).map(groupFromDb);
    } catch(e) { console.error('[SupaDB] getPublishedGroups:', e.message); return []; }
  },
  async getGroupById(id) {
    if (!db()) return null;
    try {
      const { data, error } = await db().from('groups').select('*').eq('id', id).single();
      if (error) throw error;
      return data ? groupFromDb(data) : null;
    } catch(e) { console.error('[SupaDB] getGroupById:', e.message); return null; }
  },

  /* ── PUBLIC: Growth Track ───────────────────────────────── */
  async getPublishedGrowthTrackParts() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('growth_track_parts').select('*')
        .eq('published', true).order('part');
      if (error) throw error;
      return (data || []).map(growthTrackPartFromDb);
    } catch(e) { console.error('[SupaDB] getPublishedGrowthTrackParts:', e.message); return []; }
  },
  async submitGrowthTrackRegistration(reg) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
        user_id: reg.userId || null,
      });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] submitGrowthTrackRegistration:', e.message); return { error: e.message }; }
  },
  async adminFindMemberByEmail(email) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().from('member_profiles')
        .select('*').eq('email', email.toLowerCase()).eq('status', 'approved').maybeSingle();
      if (error) throw error;
      return data ? { userId: data.user_id } : null;
    } catch(e) { console.error('[SupaDB] adminFindMemberByEmail:', e.message); return null; }
  },

  /* ── PUBLIC: Sermons ────────────────────────────────────── */
  async getPublishedSermons() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('sermons').select('*')
        .eq('published', true).order('date_sort', { ascending: false });
      if (error) throw error;
      return (data || []).map(sermonFromDb);
    } catch(e) { console.error('[SupaDB] getPublishedSermons:', e.message); return []; }
  },

  /* ── PUBLIC: Submit signup ──────────────────────────────── */
  async submitSignup(signup) {
    if (!db()) return { error: 'Not configured' };
    try {
      const current = await this.getCurrentSemester();
      const { error } = await db().from('signups').insert(signupToDb({ ...signup, semesterId: current ? current.id : null }));
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] submitSignup:', e.message); return { error: e.message }; }
  },

  /* ── PUBLIC: Submit application ─────────────────────────── */
  async submitApplication(app) {
    if (!db()) return { error: 'Not configured' };
    try {
      // The Leader Application form now lets the applicant pick a semester
      // directly, so an explicit semesterId always wins. Auto-detection is
      // only a fallback for any other caller that doesn't supply one.
      let semesterId = app.semesterId || null;
      if (!semesterId) {
        const current = await this.getCurrentSemester();
        semesterId = current ? current.id : null;
      }
      const { error } = await db().from('applications').insert(applicationToDb({ ...app, semesterId }));
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] submitApplication:', e.message); return { error: e.message }; }
  },

  /* ── ADMIN: Events ──────────────────────────────────────── */
  async adminGetAllEvents() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('events').select('*').order('date_sort');
      if (error) throw error;
      return (data || []).map(eventFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllEvents:', e.message); return []; }
  },
  async saveEvent(ev) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { id: _id, ...row } = eventToDb(ev);
      const { data, error } = ev.id
        ? await db().from('events').update(row).eq('id', ev.id).select().single()
        : await db().from('events').insert(row).select().single();
      if (error) throw error;
      return { ok: true, data: eventFromDb(data) };
    } catch(e) { console.error('[SupaDB] saveEvent:', e.message); return { error: e.message }; }
  },
  async deleteEvent(id) {
    if (!db()) return;
    try {
      const { error } = await db().from('events').delete().eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] deleteEvent:', e.message); }
  },

  /* ── ADMIN: Groups ──────────────────────────────────────── */
  async adminGetAllGroups() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('groups').select('*').order('name');
      if (error) throw error;
      return (data || []).map(groupFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllGroups:', e.message); return []; }
  },
  async saveGroup(g) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { id: _id, ...row } = groupToDb(g);
      const { data, error } = g.id
        ? await db().from('groups').update(row).eq('id', g.id).select().single()
        : await db().from('groups').insert(row).select().single();
      if (error) throw error;
      return { ok: true, data: groupFromDb(data) };
    } catch(e) { console.error('[SupaDB] saveGroup:', e.message); return { error: e.message }; }
  },
  async deleteGroup(id) {
    if (!db()) return;
    try {
      const { error } = await db().from('groups').delete().eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] deleteGroup:', e.message); }
  },

  /* ── ADMIN: Growth Track ─────────────────────────────────── */
  async adminGetAllGrowthTrackParts() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('growth_track_parts').select('*').order('part');
      if (error) throw error;
      return (data || []).map(growthTrackPartFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllGrowthTrackParts:', e.message); return []; }
  },
  async adminUpdateGrowthTrackPart(id, p) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_parts')
        .update(growthTrackPartToDb(p)).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminUpdateGrowthTrackPart:', e.message); return { error: e.message }; }
  },
  async getGrowthTrackCancellations() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('growth_track_cancellations').select('*');
      if (error) throw error;
      return (data || []).map(r => ({ part: r.part, sessionDate: r.session_date }));
    } catch(e) { console.error('[SupaDB] getGrowthTrackCancellations:', e.message); return []; }
  },
  async adminCancelGrowthTrackOccurrence(part, sessionDate) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_cancellations')
        .upsert({ part, session_date: sessionDate }, { onConflict: 'part,session_date' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminCancelGrowthTrackOccurrence:', e.message); return { error: e.message }; }
  },
  async adminReinstateGrowthTrackOccurrence(part, sessionDate) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_cancellations')
        .delete().eq('part', part).eq('session_date', sessionDate);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminReinstateGrowthTrackOccurrence:', e.message); return { error: e.message }; }
  },
  async adminGetGrowthTrackRegistrations(part) {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('growth_track_registrations')
        .select('*').eq('part', part).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(growthTrackRegistrationFromDb);
    } catch(e) { console.error('[SupaDB] adminGetGrowthTrackRegistrations:', e.message); return []; }
  },
  async adminAddGrowthTrackRegistration(reg) {
    if (!db()) return { error: 'Not configured' };
    try {
      const match = await this.adminFindMemberByEmail(reg.email);
      const { error } = await db().from('growth_track_registrations').insert({
        part: reg.part, session_date: reg.sessionDate || null, session_time: reg.sessionTime || '',
        name: reg.name, email: reg.email, phone: reg.phone || '', notes: reg.notes || '',
        added_by_admin: true, user_id: match ? match.userId : null,
      });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminAddGrowthTrackRegistration:', e.message); return { error: e.message }; }
  },
  async adminSetGtAttended(id, attended) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations')
        .update({ attended: !!attended }).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminSetGtAttended:', e.message); return { error: e.message }; }
  },
  async getGrowthTrackRegistrationsForUser(userId) {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('growth_track_registrations')
        .select('*').eq('user_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(growthTrackRegistrationFromDb);
    } catch(e) { console.error('[SupaDB] getGrowthTrackRegistrationsForUser:', e.message); return []; }
  },
  async adminGetGroupMembers(groupId) {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('group_memberships')
        .select('*').eq('group_id', groupId).is('left_at', null).order('joined_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(groupMembershipFromDb);
    } catch(e) { console.error('[SupaDB] adminGetGroupMembers:', e.message); return []; }
  },
  async adminGetAllCurrentGroupMembers() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('group_memberships')
        .select('*').is('left_at', null);
      if (error) throw error;
      return (data || []).map(groupMembershipFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllCurrentGroupMembers:', e.message); return []; }
  },
  async adminProvisionMember({ name, email, phone, groupId }) {
    if (!db() || !email) return { error: 'Email required' };
    try {
      const lower = email.toLowerCase();
      const [profileCheck, roleCheck] = await Promise.all([
        db().from('member_profiles').select('user_id').eq('email', lower).maybeSingle(),
        db().from('user_roles').select('email').eq('email', lower).maybeSingle(),
      ]);
      if (profileCheck.data || roleCheck.data) return { skipped: true };

      const { data: { session } } = await db().auth.getSession();
      const res = await fetch(SUPABASE_URL + '/functions/v1/admin-create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (session ? session.access_token : ''),
          'apikey': SUPABASE_ANON_KEY,
        },
        // action: 'createIfNew' — if this email already has an auth account
        // (e.g. self-registered but hasn't visited my-profile.html yet to get
        // a member_profiles row), never touch its password. Just report the
        // existing userId so we can still create the missing profile row.
        body: JSON.stringify({ email: lower, action: 'createIfNew' }),
      });
      const json = await res.json();
      if (!res.ok || json.error) return { error: json.error || ('HTTP ' + res.status) };

      const { error: insertErr } = await db().from('member_profiles').insert({
        user_id: json.userId, name: name || lower, email: lower, phone: phone || '',
        group_id: groupId || null, status: 'approved',
      });
      if (insertErr) return { error: insertErr.message };
      return { created: true, userId: json.userId };
    } catch(e) { console.error('[SupaDB] adminProvisionMember:', e.message); return { error: e.message }; }
  },
  async adminAddGroupMember(m) {
    if (!db()) return { error: 'Not configured' };
    try {
      let match = await this.adminFindMemberByEmail(m.email);
      if (!match) {
        const provisioned = await this.adminProvisionMember({
          name: m.name, email: m.email, phone: m.phone, groupId: m.groupId,
        });
        if (provisioned.userId) match = { userId: provisioned.userId };
      }
      const { error } = await db().from('group_memberships').insert({
        group_id: m.groupId, name: m.name, email: m.email, phone: m.phone || '',
        notes: m.notes || '', user_id: match ? match.userId : null,
      });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminAddGroupMember:', e.message); return { error: e.message }; }
  },
  async adminRemoveGroupMember(id) {
    if (!db()) return { error: 'Not configured' };
    try {
      const now = new Date();
      const localToday = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      const { error } = await db().from('group_memberships')
        .update({ left_at: localToday }).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminRemoveGroupMember:', e.message); return { error: e.message }; }
  },
  async getGroupMembershipsForUser(userId) {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('group_memberships')
        .select('*').eq('user_id', userId).order('joined_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(groupMembershipFromDb);
    } catch(e) { console.error('[SupaDB] getGroupMembershipsForUser:', e.message); return []; }
  },
  async adminDeleteGrowthTrackRegistration(id) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('growth_track_registrations').delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminDeleteGrowthTrackRegistration:', e.message); return { error: e.message }; }
  },

  /* ── ADMIN: Signups ─────────────────────────────────────── */
  async adminGetAllSignups() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('signups').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(signupFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllSignups:', e.message); return []; }
  },
  async updateSignup(id, updates) {
    if (!db()) return;
    try {
      const { error } = await db().from('signups').update(updates).eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] updateSignup:', e.message); }
  },
  async deleteSignup(id) {
    if (!db()) return;
    try {
      const { error } = await db().from('signups').delete().eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] deleteSignup:', e.message); }
  },
  async adminGetSignupsByGroup(groupId) {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('signups').select('*')
        .eq('group_id', groupId).order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(signupFromDb);
    } catch(e) { console.error('[SupaDB] adminGetSignupsByGroup:', e.message); return []; }
  },

  /* ── ADMIN: Applications ────────────────────────────────── */
  async adminGetAllApplications() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('applications').select('*').order('submitted_date', { ascending: false });
      if (error) throw error;
      return (data || []).map(applicationFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllApplications:', e.message); return []; }
  },
  async updateApplication(id, updates) {
    if (!db()) return;
    try {
      const { error } = await db().from('applications').update(updates).eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] updateApplication:', e.message); }
  },
  async deleteApplication(id) {
    if (!db()) return;
    try {
      const { error } = await db().from('applications').delete().eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] deleteApplication:', e.message); }
  },

  /* ── ADMIN: Sermons ─────────────────────────────────────── */
  async adminGetAllSermons() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('sermons').select('*').order('date_sort', { ascending: false });
      if (error) throw error;
      return (data || []).map(sermonFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllSermons:', e.message); return []; }
  },
  async saveSermon(s) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { id: _id, ...row } = sermonToDb(s);
      const { data, error } = s.id
        ? await db().from('sermons').update(row).eq('id', s.id).select().single()
        : await db().from('sermons').insert(row).select().single();
      if (error) throw error;
      return { ok: true, data: sermonFromDb(data) };
    } catch(e) { console.error('[SupaDB] saveSermon:', e.message); return { error: e.message }; }
  },
  async deleteSermon(id) {
    if (!db()) return;
    try {
      const { error } = await db().from('sermons').delete().eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] deleteSermon:', e.message); }
  },

  /* ── PUBLIC: Subscribe to newsletter ───────────────────── */
  async addSubscriber(sub) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('subscribers').insert(subscriberToDb(sub));
      if (error) {
        if (error.code === '23505') return { duplicate: true };
        throw error;
      }
      // Sync to Mailchimp audience (fire-and-forget — don't block UI)
      fetch(MAILCHIMP_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action: 'add_subscriber', email: sub.email, firstName: sub.firstName || '', lastName: sub.lastName || '' }),
      }).catch(e => console.warn('[SupaDB] Mailchimp sync failed (non-critical):', e.message));
      return { ok: true };
    } catch(e) { console.error('[SupaDB] addSubscriber:', e.message); return { error: e.message }; }
  },

  /* ── MAILCHIMP: Admin operations ────────────────────────── */
  async mailchimp(action, payload = {}) {
    try {
      const res = await fetch(MAILCHIMP_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ action, ...payload }),
      });
      return await res.json();
    } catch(e) { console.error('[SupaDB] mailchimp:', e.message); return { error: e.message }; }
  },

  /* ── ADMIN: Subscribers ─────────────────────────────────── */
  async adminGetAllSubscribers() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('subscribers').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(subscriberFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllSubscribers:', e.message); return []; }
  },
  async deleteSubscriber(id) {
    if (!db()) return;
    try {
      const { error } = await db().from('subscribers').delete().eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] deleteSubscriber:', e.message); }
  },

  async upsertSubscriber(sub) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('subscribers')
        .upsert(subscriberToDb(sub), { onConflict: 'email' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] upsertSubscriber:', e.message); return { error: e.message }; }
  },

  async upsertSubscribersFromMailchimp(members) {
    if (!db()) return { error: 'Not configured' };
    try {
      // Delete all existing subscribers then insert fresh from Mailchimp (Mailchimp is source of truth)
      const { error: delError } = await db().from('subscribers').delete().neq('id', 0);
      if (delError) throw delError;

      if (!members.length) return { ok: true, count: 0 };

      const rows = members.map(m => subscriberToDb({
        firstName: m.firstName || '',
        lastName: m.lastName || '',
        email: m.email,
        tags: m.tags || [],
        status: m.status || 'subscribed',
      }));
      const { error } = await db().from('subscribers').insert(rows);
      if (error) throw error;
      return { ok: true, count: rows.length };
    } catch(e) { console.error('[SupaDB] upsertSubscribersFromMailchimp:', e.message); return { error: e.message }; }
  },

  /* ── PUBLIC: Contact Form ───────────────────────────────── */
  async submitContactMessage({ name, email, phone, message, source, honeypot }) {
    try {
      const res = await fetch(CONTACT_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ name, email, phone: phone || '', message, source, honeypot: honeypot || '' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { success: true };
    } catch(e) { console.error('[SupaDB] submitContactMessage:', e.message); return { error: e.message }; }
  },

  /* ── PUBLIC: Prayer Requests ───────────────────────────── */
  async submitPrayerRequest(req) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('prayer_requests').insert(prayerRequestToDb(req));
      if (error) throw error;
      // Fire-and-forget pastor notification (non-blocking)
      fetch(PRAYER_NOTIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ name: req.name || '', email: req.email || '', request: req.request, private: !!req.private }),
      }).catch(e => console.warn('[SupaDB] Pastor notify failed (non-critical):', e.message));
      return { ok: true };
    } catch(e) { console.error('[SupaDB] submitPrayerRequest:', e.message); return { error: e.message }; }
  },

  /* ── ADMIN: Pastor Email Settings ──────────────────────── */
  async getPastorEmails() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('site_settings').select('value').eq('key', 'pastor_emails').single();
      if (error) return [];
      return Array.isArray(data?.value) ? data.value : [];
    } catch(e) { console.error('[SupaDB] getPastorEmails:', e.message); return []; }
  },
  async savePastorEmails(emails) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'pastor_emails', value: emails, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] savePastorEmails:', e.message); return { error: e.message }; }
  },

  /* ── ADMIN: Leader Approval Notification ───────────────── */
  notifyLeaderApproved(applicantEmail, applicantName, groupName) {
    fetch(LEADER_APPROVED_NOTIFY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
      body:    JSON.stringify({ applicantEmail, applicantName, groupName }),
    }).catch(e => console.warn('[SupaDB] Leader approval notify failed (non-critical):', e.message));
  },

  /* ── ADMIN: Retreat Registrations ──────────────────────── */
  async adminGetAllRetreatRegistrations() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('retreat_registrations')
        .select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => ({
        id:        r.id,
        createdAt: r.created_at,
        fullName:  r.full_name,
        email:     r.email,
        phone:      r.phone        || '',
        church:     r.church       || '',
        cookingRole: r.cooking_role || '',
        tshirtSize:  r.tshirt_size  || '',
        lodging:    r.lodging      || '',
        dietary:    r.dietary      || '',
        paid:       !!r.paid,
        checkedIn:  !!r.checked_in,
        notes:      r.admin_notes  || '',
      }));
    } catch(e) { console.error('[SupaDB] adminGetAllRetreatRegistrations:', e.message); return []; }
  },

  async updateRetreatRegistration(id, updates) {
    if (!db()) return { error: 'No DB' };
    try {
      const d = {};
      if (updates.fullName  !== undefined) d.full_name   = updates.fullName;
      if (updates.email     !== undefined) d.email       = updates.email;
      if (updates.phone     !== undefined) d.phone       = updates.phone;
      if (updates.church     !== undefined) d.church       = updates.church;
      if (updates.cookingRole !== undefined) d.cooking_role = updates.cookingRole;
      if (updates.tshirtSize  !== undefined) d.tshirt_size  = updates.tshirtSize;
      if (updates.lodging    !== undefined) d.lodging      = updates.lodging;
      if (updates.dietary    !== undefined) d.dietary      = updates.dietary;
      if (updates.paid      !== undefined) d.paid        = updates.paid;
      if (updates.checkedIn !== undefined) d.checked_in  = updates.checkedIn;
      if (updates.notes     !== undefined) d.admin_notes = updates.notes;
      const { error } = await db().from('retreat_registrations').update(d).eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] updateRetreatRegistration:', e.message); return { error: e.message }; }
  },

  async deleteRetreatRegistration(id) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('retreat_registrations').delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] deleteRetreatRegistration:', e.message); return { error: e.message }; }
  },

  /* ── ADMIN: Prayer Requests ─────────────────────────────── */
  async adminGetAllPrayerRequests() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('prayer_requests').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(prayerRequestFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllPrayerRequests:', e.message); return []; }
  },
  async updatePrayerRequest(id, updates) {
    if (!db()) return;
    try {
      const { error } = await db().from('prayer_requests').update(updates).eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] updatePrayerRequest:', e.message); }
  },
  async deletePrayerRequest(id) {
    if (!db()) return;
    try {
      const { error } = await db().from('prayer_requests').delete().eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] deletePrayerRequest:', e.message); }
  },

  /* ── PUBLIC: Submit Event RSVP ─────────────────────────── */
  async submitEventRsvp(rsvp) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('event_rsvps').insert(rsvpToDb(rsvp));
      if (error) throw error;
      return { success: true };
    } catch(e) { console.error('[SupaDB] submitEventRsvp:', e.message); return { error: e.message }; }
  },

  /* ── ADMIN: Event RSVPs ─────────────────────────────────── */
  async adminGetAllRsvps() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('event_rsvps').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(rsvpFromDb);
    } catch(e) { console.error('[SupaDB] adminGetAllRsvps:', e.message); return []; }
  },
  async deleteEventRsvp(id) {
    if (!db()) return;
    try {
      const { error } = await db().from('event_rsvps').delete().eq('id', id);
      if (error) throw error;
    } catch(e) { console.error('[SupaDB] deleteEventRsvp:', e.message); }
  },

  /* ── Site Settings (banner, etc.) ──────────────────────── */
  /* ── Site Settings: Save the Dates ─────────────────────────── */
  async getSaveDates() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('site_settings').select('value').eq('key', 'save_the_dates').single();
      if (error) return [];
      return Array.isArray(data?.value) ? data.value : [];
    } catch(e) { console.error('[SupaDB] getSaveDates:', e.message); return []; }
  },
  async saveSaveDates(items) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'save_the_dates', value: items, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] saveSaveDates:', e.message); return { error: e.message }; }
  },

  /* ── Site Settings: Small Group Semesters ──────────────── */
  async getSemesters() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('site_settings').select('value').eq('key', 'semesters').single();
      if (error) return [];
      return Array.isArray(data?.value) ? data.value : [];
    } catch(e) { console.error('[SupaDB] getSemesters:', e.message); return []; }
  },
  async saveSemesters(items) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'semesters', value: items, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] saveSemesters:', e.message); return { error: e.message }; }
  },
  async getCurrentSemester() {
    // "Current" is whichever configured semester extends furthest into the
    // future (by end date) — not whichever semester's range contains today.
    // This is deliberate: a broad catch-all semester (e.g. one admins label
    // "old" to bucket historical groups) can have an end date that still
    // technically covers today, but the semester admins are actively setting
    // groups up for — often weeks before its start date — should win.
    const list = await this.getSemesters();
    if (!list.length) return null;
    return list.slice().sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  },

  async getBannerSettings() {
    if (!db()) return null;
    try {
      const { data, error } = await db().from('site_settings').select('value').eq('key','announcement_bar').single();
      if (error) throw error;
      return data ? data.value : null;
    } catch(e) { console.error('[SupaDB] getBannerSettings:', e.message); return null; }
  },
  async saveBannerSettings(settings) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'announcement_bar', value: settings, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { success: true };
    } catch(e) { console.error('[SupaDB] saveBannerSettings:', e.message); return { error: e.message }; }
  },

  /* ── Site Settings: Retreat Registration Toggle ────────── */
  async getRetreatRegistrationOpen() {
    if (!db()) return true;
    try {
      const { data, error } = await db().from('site_settings').select('value').eq('key','retreat_registration_open').single();
      if (error) return true;
      return data?.value !== false;
    } catch(e) { console.error('[SupaDB] getRetreatRegistrationOpen:', e.message); return true; }
  },
  async setRetreatRegistrationOpen(isOpen) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('site_settings')
        .upsert({ key: 'retreat_registration_open', value: isOpen, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
      return { success: true };
    } catch(e) { console.error('[SupaDB] setRetreatRegistrationOpen:', e.message); return { error: e.message }; }
  },

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
  async adminDeleteAttendance(id) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('attendance').delete().eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  },

/* ── Small Group Attendance ─────────────────────────────── */
  async adminGetAllGroupAttendance() {
    if (!db()) return [];
    const { data, error } = await db()
      .from('group_attendance')
      .select('*')
      .order('meeting_date', { ascending: false });
    if (error) { console.error('[SupaDB] adminGetAllGroupAttendance:', error.message); return []; }
    return (data || []).map(r => ({
      id:          r.id,
      groupId:     r.group_id,
      groupName:   r.group_name,
      meetingDate: r.meeting_date,
      headcount:   r.headcount,
      notes:       r.notes || '',
      createdAt:   r.created_at,
    }));
  },
  async adminAddGroupAttendance({ groupId, groupName, meetingDate, headcount, notes }) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('group_attendance').insert({
      group_id:     groupId || null,
      group_name:   groupName,
      meeting_date: meetingDate,
      headcount:    headcount,
      notes:        notes || null,
    });
    if (error) return { error: error.message };
    return { success: true };
  },
  async adminUpdateGroupAttendance(id, { meetingDate, headcount, notes }) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('group_attendance').update({
      meeting_date: meetingDate,
      headcount:    headcount,
      notes:        notes || null,
    }).eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  },
  async adminDeleteGroupAttendance(id) {
    if (!db()) return { error: 'Not configured' };
    const { error } = await db().from('group_attendance').delete().eq('id', id);
    if (error) return { error: error.message };
    return { success: true };
  },

/* ── User Roles ─────────────────────────────────────────── */
  async getUserRoleByEmail(email) {
    if (!db() || !email) return null;
    try {
      const { data, error } = await db().from('user_roles').select('*').eq('email', email.toLowerCase()).single();
      if (error) return null;
      return data ? {
        email: data.email, displayName: data.display_name || '', role: data.role,
        createdAt: data.created_at, forcePasswordChange: !!data.force_password_change,
      } : null;
    } catch(e) { return null; }
  },
  async adminSetForcePasswordChange(email, value = true) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('user_roles')
        .update({ force_password_change: value }).eq('email', email.toLowerCase());
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminSetForcePasswordChange:', e.message); return { error: e.message }; }
  },
  async adminGetAllUserRoles() {
    if (!db()) return [];
    try {
      const { data, error } = await db().from('user_roles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map(r => ({ email: r.email, displayName: r.display_name || '', role: r.role, createdAt: r.created_at, forcePasswordChange: !!r.force_password_change }));
    } catch(e) { console.error('[SupaDB] adminGetAllUserRoles:', e.message); return []; }
  },
  async adminUpsertUserRole({ email, displayName, role, forcePasswordChange }) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('user_roles')
        .upsert({ email: email.toLowerCase(), display_name: displayName || '', role, force_password_change: !!forcePasswordChange }, { onConflict: 'email' });
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminUpsertUserRole:', e.message); return { error: e.message }; }
  },
  async adminDeleteUserRole(email) {
    if (!db()) return { error: 'No DB' };
    try {
      const { error } = await db().from('user_roles').delete().eq('email', email.toLowerCase());
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] adminDeleteUserRole:', e.message); return { error: e.message }; }
  },

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
  async updateMyAvatar(avatarUrl) {
    if (!db()) return { error: 'Not configured' };
    const { data: { user } } = await db().auth.getUser();
    if (!user) return { error: 'Not signed in' };
    const { error } = await db().from('member_profiles')
      .update({ avatar_url: avatarUrl || null }).eq('user_id', user.id);
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

/* ── YouTube (via Supabase Edge Function) ───────────────── */
  async getLatestYouTubeVideos(maxResults = 12) {
    try {
      const res = await fetch(`${YOUTUBE_FUNCTION_URL}?maxResults=${maxResults}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return (json.items || []).map(item => ({
        id:          item.id.videoId,
        title:       item.snippet.title,
        description: item.snippet.description,
        thumbnail:   item.snippet.thumbnails?.high?.url || `https://img.youtube.com/vi/${item.id.videoId}/hqdefault.jpg`,
        publishedAt: item.snippet.publishedAt,
        channelTitle: item.snippet.channelTitle,
      }));
    } catch(e) {
      console.warn('[SupaDB] getLatestYouTubeVideos:', e.message);
      return [];
    }
  },
};
