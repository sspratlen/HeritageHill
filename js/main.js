/* ============================================================
   Heritage Hill Church — Main JS
============================================================ */

/* ── Sticky nav scroll effect ─────────────────────────── */
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  }, { passive: true });
}

/* ── Mobile hamburger ─────────────────────────────────── */
const hamburger = document.getElementById('hamburger');
const mobileNav = document.getElementById('mobileNav');
if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', open);
    // Animate spans
    const spans = hamburger.querySelectorAll('span');
    if (open) {
      spans[0].style.transform = 'translateY(7px) rotate(45deg)';
      spans[1].style.opacity   = '0';
      spans[2].style.transform = 'translateY(-7px) rotate(-45deg)';
    } else {
      spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    }
  });
  // Close on outside click
  document.addEventListener('click', e => {
    if (!navbar.contains(e.target) && !mobileNav.contains(e.target)) {
      mobileNav.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    }
  });
}

/* ── Active nav link ──────────────────────────────────── */
(function markActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a, .nav-mobile a').forEach(a => {
    const href = a.getAttribute('href');
    if (href && href !== '#' && path === href.split('/').pop()) {
      a.classList.add('active');
    }
  });
})();

/* ── Scroll-reveal animation ──────────────────────────── */
(function initReveal() {
  const els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(22px)';
    el.style.transition = 'opacity .5s ease, transform .5s ease';
    obs.observe(el);
  });
  document.querySelectorAll('.revealed').forEach = undefined; // prevent double-init
  document.addEventListener('animationend', () => {});
})();

// Apply revealed style
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `.revealed { opacity: 1 !important; transform: none !important; }`;
  document.head.appendChild(style);
});

function initialsFor(name, email) {
  const source = (name && name.trim()) || (email && email.split('@')[0]) || '';
  if (!source) return null;
  const parts = source.trim().split(/\s+/);
  const initials = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]) : source.slice(0, 2);
  return initials.toUpperCase();
}

function escapeHtmlAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// avatar_url is written by the profile owner (or an admin) via updateMyAvatar,
// but RLS only restricts WHO can write it, not WHAT — the value itself isn't
// validated server-side. Only trust it as an image source if it's actually a
// data: or https: URL, and HTML-escape it regardless before it's injected via
// outerHTML (which parses as markup, not text), so a crafted string can't
// break out of the src attribute.
function isSafeAvatarUrl(url) {
  return typeof url === 'string' && /^(data:image\/|https:\/\/)/i.test(url);
}

function buildAvatarHtml({ name, email, avatarUrl }, sizePx) {
  sizePx = sizePx || 34;
  if (avatarUrl && isSafeAvatarUrl(avatarUrl)) {
    return `<img src="${escapeHtmlAttr(avatarUrl)}" alt="Profile" style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;object-fit:cover;display:block;" />`;
  }
  const initials = initialsFor(name, email);
  if (!initials) {
    const iconSize = Math.round(sizePx * 0.55);
    return `<span style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:#F4F4F2;display:flex;align-items:center;justify-content:center;color:#6B6B6B;"><svg width="${iconSize}" height="${iconSize}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></span>`;
  }
  const fontSize = Math.round(sizePx * 0.4);
  return `<span style="width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:#BC7A1E;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${fontSize}px;font-family:'DM Sans',sans-serif;">${escapeHtmlAttr(initials)}</span>`;
}

async function renderNavAvatar() {
  if (!window.SupaDB) return;
  try {
    const user = await SupaDB.getUser();
    if (!user) return;
    const [roleData, profile] = await Promise.all([
      SupaDB.getUserRoleByEmail(user.email), SupaDB.getMyProfile(),
    ]);
    const dest = roleData ? 'admin/dashboard.html' : 'admin/my-profile.html';
    const name = profile ? profile.name : '';
    const avatarUrl = profile ? profile.avatarUrl : null;
    const html = buildAvatarHtml({ name, email: user.email, avatarUrl }, 34);
    ['navLoginBtn', 'navLoginBtnMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.outerHTML = `<a href="${dest}" id="${id}" style="display:inline-flex;align-items:center;">${html}</a>`;
    });
  } catch (e) { console.error('[renderNavAvatar]', e.message); }
}

/* ── Floating "Need Prayer?" button ───────────────────── */
function initPrayerFab() {
  // Allowlist, not a blocklist: js/main.js is also loaded by admin pages
  // (e.g. admin/dashboard.html, for the profile avatar) which must never
  // show this public-site button or use its root-relative "prayer.html" link.
  const PUBLIC_PAGES = ['index', 'about', 'events', 'small-groups', 'growth-track', 'sermons', 'give', 'lead-a-group'];
  const path = window.location.pathname.split('/').pop() || 'index.html';
  const bare = path.replace(/\.html$/, '') || 'index';
  if (!PUBLIC_PAGES.includes(bare)) return;

  const STORAGE_KEY = 'hhc_prayerFabPos';
  const DRAG_THRESHOLD = 6;

  const btn = document.createElement('button');
  btn.className = 'prayer-fab';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Need Prayer? Contact us for prayer support');
  btn.innerHTML = '<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg><span>Need Prayer?</span>';
  document.body.appendChild(btn);

  function clamp(x, y) {
    const rect = btn.getBoundingClientRect();
    const maxX = Math.max(window.innerWidth - rect.width, 0);
    const maxY = Math.max(window.innerHeight - rect.height, 0);
    return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
  }

  function applyPosition(x, y) {
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  }

  function loadSavedPosition() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const pos = JSON.parse(raw);
      if (typeof pos.left !== 'number' || typeof pos.top !== 'number') return null;
      return pos;
    } catch { return null; }
  }

  function savePosition(x, y) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: x, top: y })); } catch {}
  }

  const saved = loadSavedPosition();
  if (saved) {
    const c = clamp(saved.left, saved.top);
    applyPosition(c.x, c.y);
  }

  let dragging = false;
  let startX = 0, startY = 0, originLeft = 0, originTop = 0, moved = 0;

  btn.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = 0;
    startX = e.clientX;
    startY = e.clientY;
    const rect = btn.getBoundingClientRect();
    originLeft = rect.left;
    originTop = rect.top;
    btn.setPointerCapture(e.pointerId);
  });

  btn.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    moved = Math.max(moved, Math.hypot(dx, dy));
    const c = clamp(originLeft + dx, originTop + dy);
    applyPosition(c.x, c.y);
  });

  btn.addEventListener('pointerup', (e) => {
    if (!dragging) return;
    dragging = false;
    if (moved < DRAG_THRESHOLD) {
      window.location.href = 'prayer.html';
      return;
    }
    const rect = btn.getBoundingClientRect();
    savePosition(rect.left, rect.top);
  });

  btn.addEventListener('pointercancel', () => { dragging = false; });

  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      window.location.href = 'prayer.html';
    }
  });

  window.addEventListener('resize', () => {
    const rect = btn.getBoundingClientRect();
    const c = clamp(rect.left, rect.top);
    applyPosition(c.x, c.y);
  });
}
initPrayerFab();

/* ── Legacy localStorage helpers (kept for backwards compat) ── */
const DB = {
  get(key, fallback = []) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

/* ── Seed data removed — data now lives in Supabase ──────
   (Run supabase/schema.sql to seed initial data)
   ──────────────────────────────────────────────────────── */
function seedData() {
  // No-op: data is managed through the admin panel and stored in Supabase.
  // To seed sample data, run the INSERT statements in supabase/schema.sql.
  if (!localStorage.getItem('hhc_seeded')) {
    DB.set('hhc_events', [
      {
        id: 1,
        title: 'Sunday Worship Service',
        date: 'Every Sunday',
        dateSort: '2099-01-01',
        time: '9:00 AM & 11:00 AM',
        location: '6909 Cornhusker Rd, Papillion, NE',
        category: 'Worship',
        description: 'Join us every Sunday for an uplifting worship experience. We\'d love to meet you!',
        image: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80',
        recurring: true
      },
      {
        id: 2,
        title: 'Community Picnic',
        date: 'June 14, 2026',
        dateSort: '2026-06-14',
        time: '12:00 PM – 4:00 PM',
        location: 'Halleck Park, Papillion, NE',
        category: 'Community',
        description: 'Bring the whole family! We\'re hosting a summer community picnic with food, games, and fellowship.',
        image: 'https://images.unsplash.com/photo-1529543544282-ea669407fca3?w=800&q=80',
        recurring: false
      },
      {
        id: 3,
        title: "Men's Retreat",
        date: 'August 22–24, 2026',
        dateSort: '2026-08-22',
        time: 'All Weekend',
        location: 'Camp Moses Merrill, Fullerton, NE',
        category: "Men's Ministry",
        description: 'A weekend of brotherhood, worship, and renewal. Register early — spots are limited!',
        image: 'https://images.unsplash.com/photo-1519834785169-98be25ec3f84?w=800&q=80',
        recurring: false
      },
      {
        id: 4,
        title: 'Vacation Bible School',
        date: 'July 7–11, 2026',
        dateSort: '2026-07-07',
        time: '9:00 AM – 12:00 PM',
        location: '6909 Cornhusker Rd, Papillion, NE',
        category: "Children's Ministry",
        description: 'An incredible week of Bible stories, crafts, music, and fun for kids ages 4–12.',
        image: 'https://images.unsplash.com/photo-1544776193-352d25ca82cd?w=800&q=80',
        recurring: false
      },
      {
        id: 5,
        title: "Women's Bible Study",
        date: 'Every Tuesday',
        dateSort: '2099-01-02',
        time: '6:30 PM',
        location: 'Heritage Hill Church – Room 102',
        category: "Women's Ministry",
        description: 'Gather weekly with women in our church for deep study, encouragement, and prayer.',
        image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80',
        recurring: true
      },
      {
        id: 6,
        title: 'Fall Family Festival',
        date: 'October 25, 2026',
        dateSort: '2026-10-25',
        time: '3:00 PM – 7:00 PM',
        location: '6909 Cornhusker Rd, Papillion, NE',
        category: 'Community',
        description: 'Celebrate fall with games, food trucks, trunk-or-treat, and live music for the whole family.',
        image: 'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800&q=80',
        recurring: false
      }
    ]);

    DB.set('hhc_groups', [
      {
        id: 1,
        name: 'Sunday Morning Bible Study',
        leader: 'Pastor Mike Thompson',
        day: 'Sunday',
        time: '8:00 AM',
        location: 'Room 201 – Heritage Hill Church',
        type: 'Bible Study',
        audience: 'All Ages',
        description: 'Dig deeper into the week\'s sermon text in an interactive discussion format before service.',
        image: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',
        open: true
      },
      {
        id: 2,
        name: "Tuesday Women's Group",
        leader: 'Sarah Jennings',
        day: 'Tuesday',
        time: '6:30 PM',
        location: 'Room 102 – Heritage Hill Church',
        type: 'Women\'s Ministry',
        audience: 'Women',
        description: 'A warm, welcoming group for women of all ages to study Scripture, pray together, and build lasting friendships.',
        image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&q=80',
        open: true
      },
      {
        id: 3,
        name: "Thursday Men's Group",
        leader: 'Dave Carter',
        day: 'Thursday',
        time: '6:00 AM',
        location: 'Cornerstone Coffee – Papillion',
        type: "Men's Ministry",
        audience: 'Men',
        description: 'Early morning gathering for men to study Proverbs, encourage one another, and start the day grounded in truth.',
        image: 'https://images.unsplash.com/photo-1543269664-56d93c1b41a6?w=600&q=80',
        open: true
      },
      {
        id: 4,
        name: 'Young Families Connect',
        leader: 'Josh & Amy Harmon',
        day: 'Friday',
        time: '6:30 PM',
        location: 'Rotating Homes',
        type: 'Life Group',
        audience: 'Families',
        description: 'Connect with other young families navigating marriage, parenting, and faith together. Childcare provided.',
        image: 'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=600&q=80',
        open: true
      },
      {
        id: 5,
        name: 'Youth Life Group',
        leader: 'Tyler Marsh',
        day: 'Wednesday',
        time: '7:00 PM',
        location: 'Student Center – Heritage Hill',
        type: 'Youth',
        audience: 'Youth (6–12th grade)',
        description: 'A dynamic group for middle and high schoolers to explore faith, ask big questions, and build real community.',
        image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&q=80',
        open: true
      },
      {
        id: 6,
        name: 'Senior Saints Fellowship',
        leader: 'Bob & Dorothy Wells',
        day: 'Wednesday',
        time: '10:00 AM',
        location: 'Fellowship Hall – Heritage Hill',
        type: 'Life Group',
        audience: 'Seniors',
        description: 'A cherished community for seniors to gather in prayer, study, and enjoy each other\'s company.',
        image: 'https://images.unsplash.com/photo-1516534775068-ba3e7458af70?w=600&q=80',
        open: true
      }
    ]);

    localStorage.setItem('hhc_seeded', 'true');
  }
}
seedData();
