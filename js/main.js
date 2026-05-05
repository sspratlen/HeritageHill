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

/* ── Admin login check ────────────────────────────────── */
function isAdminLoggedIn() {
  return sessionStorage.getItem('hhc_admin') === 'true';
}

/* ── localStorage helpers ─────────────────────────────── */
const DB = {
  get(key, fallback = []) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  },
  set(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }
};

/* ── Default seed data ────────────────────────────────── */
function seedData() {
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
