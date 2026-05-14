-- ================================================================
--  Heritage Hill Church — Supabase Schema
--  Run this entire file in the Supabase SQL Editor to set up
--  all tables, indexes, RLS policies, and seed data.
-- ================================================================

-- ── Enable UUID generation ──────────────────────────────────────
create extension if not exists "pgcrypto";


-- ================================================================
--  EVENTS
-- ================================================================
create table if not exists events (
  id          bigint generated always as identity primary key,
  title       text        not null,
  date        text        not null,           -- display string, e.g. "June 14, 2026"
  date_sort   text        not null default '2099-12-31', -- ISO date for ordering
  time        text,
  location    text,
  category    text        not null default 'Other',
  description text,
  image       text,
  recurring   boolean     not null default false,
  published   boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table events enable row level security;

-- Public: read published events
create policy "Public can view published events"
  on events for select
  using (published = true);

-- Admin: full access
create policy "Admin full access to events"
  on events for all
  using (auth.role() = 'authenticated');


-- ================================================================
--  GROUPS
-- ================================================================
create table if not exists groups (
  id           bigint generated always as identity primary key,
  name         text        not null,
  leader       text,
  leader_email text,
  day          text,
  time         text,
  location     text,
  type         text        not null default 'Life Group',
  audience     text        not null default 'All Ages',
  description  text,
  image        text,
  open         boolean     not null default true,
  published    boolean     not null default true,
  created_at   timestamptz not null default now()
);

alter table groups enable row level security;

-- Public: read published groups
create policy "Public can view published groups"
  on groups for select
  using (published = true);

-- Admin: full access
create policy "Admin full access to groups"
  on groups for all
  using (auth.role() = 'authenticated');


-- ================================================================
--  SIGNUPS  (small-group join requests)
-- ================================================================
create table if not exists signups (
  id           bigint generated always as identity primary key,
  group_id     bigint references groups(id) on delete set null,
  group_name   text        not null,
  leader_name  text,
  leader_email text,
  name         text        not null,
  email        text        not null,
  phone        text,
  message      text,
  contacted    boolean     not null default false,
  created_at   timestamptz not null default now()
);

alter table signups enable row level security;

-- Public: insert only (no select — protects personal info)
create policy "Public can submit signups"
  on signups for insert
  with check (true);

-- Admin: full access
create policy "Admin full access to signups"
  on signups for all
  using (auth.role() = 'authenticated');


-- ================================================================
--  APPLICATIONS  (lead-a-group requests)
-- ================================================================
create table if not exists applications (
  id             bigint generated always as identity primary key,
  status         text        not null default 'pending', -- pending | approved | rejected
  submitted_date timestamptz not null default now(),
  name           text        not null,
  email          text        not null,
  phone          text,
  attendance     text,
  group_name     text        not null,
  type           text,
  audience       text,
  day            text,
  time           text,
  location       text,
  description    text,
  why            text,
  notes          text
);

alter table applications enable row level security;

-- Public: insert only
create policy "Public can submit applications"
  on applications for insert
  with check (true);

-- Admin: full access
create policy "Admin full access to applications"
  on applications for all
  using (auth.role() = 'authenticated');


-- ================================================================
--  SERMONS
-- ================================================================
create table if not exists sermons (
  id          bigint generated always as identity primary key,
  title       text        not null,
  speaker     text        not null default '',
  series      text        not null default '',
  date        text        not null,           -- display string, e.g. "May 4, 2025"
  date_sort   text        not null default '2099-12-31',
  youtube_id  text        not null,           -- YouTube video ID, e.g. "dQw4w9WgXcQ"
  description text        not null default '',
  published   boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table sermons enable row level security;

-- Public: read published sermons
create policy "Public can view published sermons"
  on sermons for select
  using (published = true);

-- Admin: full access
create policy "Admin full access to sermons"
  on sermons for all
  using (auth.role() = 'authenticated');


-- ================================================================
--  SUBSCRIBERS  (newsletter opt-ins, synced with Mailchimp)
-- ================================================================
create table if not exists subscribers (
  id         bigint generated always as identity primary key,
  first_name text        not null default '',
  last_name  text        not null default '',
  email      text        not null unique,
  tags       text[]      not null default '{}',
  status     text        not null default 'subscribed',
  created_at timestamptz not null default now()
);

-- Safe migrations: add columns if the table already existed without them
alter table subscribers add column if not exists tags   text[] not null default '{}';
alter table subscribers add column if not exists status text   not null default 'subscribed';

alter table subscribers enable row level security;

-- Public: insert only (signup form)
create policy "Public can subscribe"
  on subscribers for insert
  with check (true);

-- Admin: full access
create policy "Admin full access to subscribers"
  on subscribers for all
  using (auth.role() = 'authenticated');


-- ================================================================
--  PRAYER REQUESTS
-- ================================================================
create table if not exists prayer_requests (
  id         bigint generated always as identity primary key,
  name       text,
  email      text,
  request    text        not null,
  private    boolean     not null default false,
  prayed     boolean     not null default false,
  created_at timestamptz not null default now()
);

alter table prayer_requests enable row level security;

create policy "Public can submit prayer requests"
  on prayer_requests for insert
  with check (true);

create policy "Admin full access to prayer requests"
  on prayer_requests for all
  using (auth.role() = 'authenticated');


-- ================================================================
--  CONTACT MESSAGES
-- ================================================================
create table if not exists contact_messages (
  id         bigint generated always as identity primary key,
  name       text        not null,
  email      text        not null,
  phone      text,
  message    text        not null,
  source     text,
  created_at timestamptz not null default now()
);

alter table contact_messages enable row level security;

create policy "Public can submit contact messages"
  on contact_messages for insert
  with check (true);

create policy "Admin full access to contact messages"
  on contact_messages for all
  using (auth.role() = 'authenticated');


-- ================================================================
--  EVENT RSVPs
-- ================================================================
create table if not exists event_rsvps (
  id          bigint generated always as identity primary key,
  event_id    bigint references events(id) on delete set null,
  event_title text,
  full_name   text        not null,
  email       text        not null,
  phone       text,
  created_at  timestamptz not null default now()
);

alter table event_rsvps enable row level security;

create policy "Public can submit RSVPs"
  on event_rsvps for insert
  with check (true);

create policy "Admin full access to event RSVPs"
  on event_rsvps for all
  using (auth.role() = 'authenticated');


-- ================================================================
--  SITE SETTINGS  (key/value store for banner, pastor emails, etc.)
-- ================================================================
create table if not exists site_settings (
  key        text primary key,
  value      jsonb,
  updated_at timestamptz not null default now()
);

alter table site_settings enable row level security;

create policy "Public can read site settings"
  on site_settings for select
  using (true);

create policy "Admin full access to site settings"
  on site_settings for all
  using (auth.role() = 'authenticated');


-- ================================================================
--  INDEXES  (speed up common queries)
-- ================================================================
create index if not exists events_date_sort_idx  on events  (date_sort);
create index if not exists events_published_idx  on events  (published);
create index if not exists groups_published_idx  on groups  (published);
create index if not exists sermons_date_sort_idx on sermons (date_sort desc);
create index if not exists sermons_published_idx on sermons (published);
create index if not exists signups_group_id_idx  on signups (group_id);
create index if not exists signups_created_idx   on signups (created_at desc);
create index if not exists apps_status_idx       on applications (status);


-- ================================================================
--  SEED DATA — Initial Events
--  (Remove or comment out after first run if you don't want duplicates)
-- ================================================================
insert into events (title, date, date_sort, time, location, category, description, image, recurring, published) values
  ('Sunday Worship Service',
   'Every Sunday', '2099-01-01',
   '9:00 AM & 11:00 AM', '6909 Cornhusker Rd, Papillion, NE',
   'Worship',
   'Join us every Sunday for an uplifting worship experience. We''d love to meet you!',
   'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&q=80',
   true, true),

  ('Community Picnic',
   'June 14, 2026', '2026-06-14',
   '12:00 PM – 4:00 PM', 'Halleck Park, Papillion, NE',
   'Community',
   'Bring the whole family! We''re hosting a summer community picnic with food, games, and fellowship.',
   'https://images.unsplash.com/photo-1529543544282-ea669407fca3?w=800&q=80',
   false, true),

  ('Men''s Retreat',
   'August 22–24, 2026', '2026-08-22',
   'All Weekend', 'Camp Moses Merrill, Fullerton, NE',
   'Men''s Ministry',
   'A weekend of brotherhood, worship, and renewal. Register early — spots are limited!',
   'https://images.unsplash.com/photo-1519834785169-98be25ec3f84?w=800&q=80',
   false, true),

  ('Vacation Bible School',
   'July 7–11, 2026', '2026-07-07',
   '9:00 AM – 12:00 PM', '6909 Cornhusker Rd, Papillion, NE',
   'Children''s Ministry',
   'An incredible week of Bible stories, crafts, music, and fun for kids ages 4–12.',
   'https://images.unsplash.com/photo-1544776193-352d25ca82cd?w=800&q=80',
   false, true),

  ('Women''s Bible Study',
   'Every Tuesday', '2099-01-02',
   '6:30 PM', 'Heritage Hill Church – Room 102',
   'Women''s Ministry',
   'Gather weekly with women in our church for deep study, encouragement, and prayer.',
   'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80',
   true, true),

  ('Fall Family Festival',
   'October 25, 2026', '2026-10-25',
   '3:00 PM – 7:00 PM', '6909 Cornhusker Rd, Papillion, NE',
   'Community',
   'Celebrate fall with games, food trucks, trunk-or-treat, and live music for the whole family.',
   'https://images.unsplash.com/photo-1506439773649-6e0eb8cfb237?w=800&q=80',
   false, true);


-- ================================================================
--  SEED DATA — Initial Groups
-- ================================================================
insert into groups (name, leader, leader_email, day, time, location, type, audience, description, image, open, published) values
  ('Sunday Morning Bible Study',
   'Pastor Mike Thompson', '',
   'Sunday', '8:00 AM', 'Room 201 – Heritage Hill Church',
   'Bible Study', 'All Ages',
   'Dig deeper into the week''s sermon text in an interactive discussion format before service.',
   'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&q=80',
   true, true),

  ('Tuesday Women''s Group',
   'Sarah Jennings', '',
   'Tuesday', '6:30 PM', 'Room 102 – Heritage Hill Church',
   'Women''s Ministry', 'Women',
   'A warm, welcoming group for women of all ages to study Scripture, pray together, and build lasting friendships.',
   'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&q=80',
   true, true),

  ('Thursday Men''s Group',
   'Dave Carter', '',
   'Thursday', '6:00 AM', 'Cornerstone Coffee – Papillion',
   'Men''s Ministry', 'Men',
   'Early morning gathering for men to study Proverbs, encourage one another, and start the day grounded in truth.',
   'https://images.unsplash.com/photo-1543269664-56d93c1b41a6?w=600&q=80',
   true, true),

  ('Young Families Connect',
   'Josh & Amy Harmon', '',
   'Friday', '6:30 PM', 'Rotating Homes',
   'Life Group', 'Families',
   'Connect with other young families navigating marriage, parenting, and faith together. Childcare provided.',
   'https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=600&q=80',
   true, true),

  ('Youth Life Group',
   'Tyler Marsh', '',
   'Wednesday', '7:00 PM', 'Student Center – Heritage Hill',
   'Youth', 'Youth (6–12th grade)',
   'A dynamic group for middle and high schoolers to explore faith, ask big questions, and build real community.',
   'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&q=80',
   true, true),

  ('Senior Saints Fellowship',
   'Bob & Dorothy Wells', '',
   'Wednesday', '10:00 AM', 'Fellowship Hall – Heritage Hill',
   'Life Group', 'Seniors',
   'A cherished community for seniors to gather in prayer, study, and enjoy each other''s company.',
   'https://images.unsplash.com/photo-1516534775068-ba3e7458af70?w=600&q=80',
   true, true);
