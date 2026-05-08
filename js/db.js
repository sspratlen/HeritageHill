/* ================================================================
   Heritage Hill Church — Async Database Layer (Supabase)
   ================================================================
   Replaces the localStorage DB object in main.js.
   All methods are async and return plain JS objects matching
   the camelCase shape the existing page code expects.
   ================================================================ */

/* ── Column-name mappers (snake_case DB ↔ camelCase JS) ────── */

function eventFromDb(r) {
  return {
    id: r.id, title: r.title, date: r.date, dateSort: r.date_sort,
    endDate: r.end_date || '', endDateSort: r.end_date_sort || '',
    time: r.time, location: r.location, category: r.category,
    description: r.description, image: r.image,
    recurring: !!r.recurring, published: r.published !== false,
  };
}
function eventToDb(ev) {
  const o = {
    title: ev.title, date: ev.date, date_sort: ev.dateSort || '2099-12-31',
    end_date: ev.endDate || null, end_date_sort: ev.endDateSort || null,
    time: ev.time, location: ev.location, category: ev.category || 'Other',
    description: ev.description, image: ev.image,
    recurring: !!ev.recurring, published: ev.published !== false,
  };
  if (ev.id) o.id = ev.id;
  return o;
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

function subscriberFromDb(r) {
  return {
    id: r.id, fullName: r.full_name, email: r.email,
    createdAt: r.created_at,
  };
}
function subscriberToDb(s) {
  return { full_name: s.fullName, email: s.email };
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
      return { ok: true };
    } catch(e) { console.error('[SupaDB] addSubscriber:', e.message); return { error: e.message }; }
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
