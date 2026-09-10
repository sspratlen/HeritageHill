/* ================================================================
   Heritage Hill Church — Announcement Banner Loader
   Fetches banner settings from Supabase and renders the bar on
   every public page. Works standalone (no SDK required).
   ================================================================ */
(async () => {
  /* Staging (sspratlen.github.io) talks to a separate Supabase project so it
     never touches production data. Everything else uses production. */
  const HHC_IS_STAGING    = location.hostname === 'sspratlen.github.io';
  const SUPABASE_URL      = HHC_IS_STAGING
    ? 'https://govvofbrhhpowtdnuzcw.supabase.co'
    : 'https://ktyplbmawlaerzohkdqy.supabase.co';
  const SUPABASE_ANON_KEY = HHC_IS_STAGING
    ? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvdnZvZmJyaGhwb3d0ZG51emN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMzgzOTIsImV4cCI6MjEwNDYxNDM5Mn0.uI4LwK03_af2QPNTQJi0qmELzgndayO8gmhjygZFU5Q'
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0eXBsYm1hd2xhZXJ6b2hrZHF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjU4MDgsImV4cCI6MjA5MzY0MTgwOH0.Pe0_syQjPqkwrdl8cno9YliY2i1i8x77R8bYCG8KXr4';

  /* Ensure the bar element exists in the DOM */
  let bar = document.getElementById('announcementBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'announcementBar';
    bar.className = 'announcement-bar';
    bar.style.display = 'none';
    document.body.insertBefore(bar, document.body.firstChild);
  } else {
    bar.style.display = 'none';
    bar.innerHTML = '';
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/site_settings?key=eq.announcement_bar&select=value`,
      { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) return;
    const rows = await res.json();
    if (!rows || !rows.length) return;
    const s = rows[0].value;
    if (!s || !s.enabled) return;

    let html = s.text || '';
    if (s.link_text && s.link_url) {
      html += `&nbsp; <a href="${s.link_url}">${s.link_text}</a>`;
    }
    bar.innerHTML = html;
    bar.style.display = '';
  } catch (e) {
    console.warn('[HHC] Banner load failed:', e.message);
  }
})();
