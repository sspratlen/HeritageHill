# Supabase Setup Guide — Heritage Hill Church Website

This guide covers the four manual steps only you can do. Everything else (all the code) is already done.

---

## Step 1 — Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New project**.
3. Fill in:
   - **Name**: `heritage-hill-church` (or anything you like)
   - **Database Password**: choose a strong password and save it somewhere
   - **Region**: `US East (N. Virginia)` — closest to Nebraska
4. Click **Create new project** and wait ~2 minutes for it to provision.
5. Once ready, go to **Project Settings → API** (left sidebar).
6. Copy two values — you'll need them in Step 5:
   - **Project URL** (looks like `https://xyzabc.supabase.co`)
   - **anon public** key (a long JWT string under "Project API keys")

---

## Step 2 — Run the Database Schema

1. In your Supabase project, click **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file `supabase/schema.sql` from this project folder.
4. Copy the entire contents and paste it into the SQL editor.
5. Click **Run** (or press `Cmd+Enter`).
6. You should see "Success. No rows returned" — this means the tables, policies, and indexes were all created.

> **What this creates:** Five tables (`events`, `groups`, `signups`, `applications`, `sermons`), Row Level Security policies (public can read published content; authenticated admins get full access), and indexes for fast filtering.

---

## Step 3 — Create Your Admin Account

1. In your Supabase project, click **Authentication** in the left sidebar.
2. Click **Users**, then **Invite user** (or **Add user → Create new user**).
3. Enter your email address and a strong password.
4. Click **Create user**.

> This is the email and password you'll use to log into the Heritage Hill admin dashboard at `/admin/login.html`.

---

## Step 4 — Set Up YouTube Integration (Optional but Recommended)

This enables the YouTube sermon feed on the Sermons page. If you skip this, the feed section just won't appear.

### 4a — Get a YouTube Data API v3 Key

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com) and sign in with a Google account.
2. Create a new project (top bar → dropdown → **New Project**). Name it anything.
3. In the left menu, go to **APIs & Services → Library**.
4. Search for **YouTube Data API v3** and click **Enable**.
5. Go to **APIs & Services → Credentials**.
6. Click **Create Credentials → API key**.
7. Copy the API key that appears.
8. (Recommended) Click **Restrict key** → under "API restrictions" select "YouTube Data API v3" → Save.

### 4b — Deploy the YouTube Edge Function

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) installed. Run these commands from the `HHCWebsite` project folder in Terminal:

```bash
# Install Supabase CLI (if not already installed)
brew install supabase/tap/supabase

# Log in
supabase login

# Link to your project (use the project ref from your Supabase URL: xyzabc.supabase.co → ref is "xyzabc")
supabase link --project-ref YOUR_PROJECT_REF

# Set the YouTube API key as a secret
supabase secrets set YOUTUBE_API_KEY=YOUR_API_KEY_FROM_STEP_4A

# Deploy the Edge Function
supabase functions deploy youtube
```

> The Edge Function file is already written at `supabase/functions/youtube/index.ts`.

---

## Step 5 — Paste Your Credentials into the Website

1. Open `js/supabase-client.js` in this project folder.
2. Replace the two placeholder values with the ones you copied in Step 1:

```js
const SUPABASE_URL  = 'https://YOUR_PROJECT_REF.supabase.co';  // ← paste Project URL
const SUPABASE_ANON = 'YOUR_ANON_PUBLIC_KEY';                   // ← paste anon key
```

3. Save the file.

---

## Step 6 — Push to GitHub & Deploy

Once credentials are in place:

```bash
git add -A
git commit -m "Add Supabase integration"
git push
```

Your site on GitHub Pages / Namecheap will pick up the changes automatically.

---

## Quick Verification Checklist

After completing all steps, verify the following:

- [ ] Go to `your-site.com/events.html` — the page loads without errors (empty is fine, no data yet)
- [ ] Go to `your-site.com/admin/login.html` — log in with the email/password from Step 3
- [ ] After login, you land on the dashboard — stats show 0s, no JS errors in console
- [ ] Add a test event in the dashboard and publish it — it appears on the Events page
- [ ] Add a test group in the dashboard and publish it — it appears on the Small Groups page
- [ ] Add a test sermon with a YouTube video ID — thumbnail appears in the modal preview

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| "Failed to fetch" errors on the site | Wrong URL or anon key in `supabase-client.js` | Double-check Step 5 |
| Login says "Invalid login credentials" | Admin user not created | Redo Step 3 |
| Events/groups show up for everyone (no auth needed) | RLS not enabled | Rerun `schema.sql` |
| YouTube feed doesn't appear | Edge Function not deployed or API key not set | Redo Step 4b |
| Edge Function returns 401 | `YOUTUBE_API_KEY` secret not set | Run `supabase secrets set YOUTUBE_API_KEY=...` again |

---

*Generated for Heritage Hill Church website — Heritage Hill Church, Papillion NE*
