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
  };
}
function groupToDb(g) {
  const o = {
    name: g.name, leader: g.leader, leader_email: g.leaderEmail || '',
    day: g.day, time: g.time, location: g.location, type: g.type || 'Life Group',
    audience: g.audience || 'All Ages', description: g.description, image: g.image,
    open: g.open !== false, published: g.published !== false,
  };
  if (g.id) o.id = g.id;
  return o;
}

function signupFromDb(r) {
  return {
    id: r.id, groupId: r.group_id, groupName: r.group_name,
    leaderName: r.leader_name, leaderEmail: r.leader_email || '',
    name: r.name, email: r.email, phone: r.phone || '', message: r.message || '',
    date: r.created_at, contacted: !!r.contacted,
  };
}
function signupToDb(s) {
  return {
    group_id: s.groupId || null, group_name: s.groupName,
    leader_name: s.leaderName, leader_email: s.leaderEmail || '',
    name: s.name, email: s.email, phone: s.phone || '', message: s.message || '',
    contacted: false,
  };
}

function applicationFromDb(r) {
  return {
    id: r.id, status: r.status || 'pending', submittedDate: r.submitted_date,
    name: r.name, email: r.email, phone: r.phone || '', attendance: r.attendance || '',
    groupName: r.group_name, type: r.type, audience: r.audience,
    day: r.day, time: r.time, location: r.location,
    description: r.description, why: r.why, notes: r.notes || '',
  };
}
function applicationToDb(a) {
  return {
    name: a.name, email: a.email, phone: a.phone || '', attendance: a.attendance || '',
    group_name: a.groupName, type: a.type, audience: a.audience,
    day: a.day, time: a.time, location: a.location,
    description: a.description, why: a.why, notes: a.notes || '',
    status: a.status || 'pending',
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
      const { error } = await db().from('signups').insert(signupToDb(signup));
      if (error) throw error;
      return { ok: true };
    } catch(e) { console.error('[SupaDB] submitSignup:', e.message); return { error: e.message }; }
  },

  /* ── PUBLIC: Submit application ─────────────────────────── */
  async submitApplication(app) {
    if (!db()) return { error: 'Not configured' };
    try {
      const { error } = await db().from('applications').insert(applicationToDb(app));
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
