HERITAGE HILL CHURCH — WEBSITE
================================
A fully portable static website for Heritage Hill Church,
Papillion, Nebraska. Copy the entire folder to any web host
(shared hosting, Netlify, GitHub Pages, etc.) and it works.

FILE STRUCTURE
--------------
index.html          Homepage
about.html          About Us + Plan a Visit
events.html         Events (public, filtered, JS-rendered)
small-groups.html   Small Groups (public, filtered, JS-rendered)
sermons.html        Sermons page
give.html           Giving page
css/style.css       All shared styles
js/main.js          Shared JS: nav, data helpers, seed data
admin/login.html    Admin login
admin/dashboard.html  Admin panel (Events & Groups management)
README.txt          This file


ADMIN LOGIN
-----------
URL:      yoursite.com/admin/login.html
Username: admin
Password: hhcadmin2024

IMPORTANT: Change the password before going live.
Open admin/login.html and update these two lines near the bottom:
  const ADMIN_USER = 'admin';
  const ADMIN_PASS = 'hhcadmin2024';  ← change this


HOW DATA WORKS (No Server Required)
-------------------------------------
All events and small groups are stored in the browser's
localStorage. This means:
- Data persists on the device/browser where it was entered
- The admin can add/edit/delete events and groups from any device
  that is logged in, and those changes show on the public pages
  immediately in that same browser

For a shared-hosting site where multiple admins use different
computers, consider upgrading to a backend (PHP + MySQL, or a
headless CMS like Contentful or Netlify CMS) in the future.


HOSTING
-------
Option A — Shared Hosting (GoDaddy, Bluehost, etc.)
  Upload all files via FTP to your public_html folder.

Option B — Netlify (Free)
  1. Go to netlify.com → "Add new site" → "Deploy manually"
  2. Drag the HHCWebsite folder into the deploy zone.
  Done — your site is live in seconds.

Option C — GitHub Pages (Free)
  1. Push folder contents to a GitHub repo
  2. Settings → Pages → Deploy from main branch

No build process needed. No Node, no npm, no server.


BRANDING
--------
Logo URLs:  Heritage Hill CDN (hosted by Nucleus)
Colors:     Primary amber  #BC7A1E
            Secondary blue #155CA2
            Dark navy      #0D0F14
Font:       DM Sans (loaded from Google Fonts)


CUSTOMIZATION QUICK REFERENCE
------------------------------
Change service times:  index.html (service-grid section)
                       about.html (Plan a Visit section)
Change address/phone:  js/main.js does NOT have these — edit each
                       footer in the HTML files directly.
                       Address: 6909 Cornhusker Rd, Papillion, NE 68133
                       Phone:   (402) 331-8900
                       Email:   heritagehillchurch@gmail.com
Add/edit events:       Log in to admin panel and use the Events tab
Add/edit groups:       Log in to admin panel and use the Small Groups tab
Update sermons:        Edit sermons.html directly (or add YouTube embeds)
Update giving link:    Edit give.html — the "Give Online Now" button
                       currently links to the ChurchTeams portal.


SOCIAL MEDIA LINKS
------------------
Currently set to "#" placeholders. Update in index.html footer:
  Facebook:  replace href="#" with your Facebook page URL
  Instagram: replace href="#" with your Instagram URL
  YouTube:   replace href="#" with your YouTube channel URL
Also update in sermons.html (the YouTube channel link at the bottom).
