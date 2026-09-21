# Heritage Hill Church Website — Operating Guide

This file is loaded automatically by Claude Code at the start of any session in this repo, on any account. It's the durable record of how this project actually works — read it before making changes, especially around deployment.

## What this is

A static HTML/JS site (no build step) for Heritage Hill Church (Papillion, NE), backed by Supabase (Postgres + Auth + Edge Functions), deployed via GitHub Pages. No framework, no bundler — every page is a standalone `.html` file with inline `<script>` blocks, loading shared helpers from `js/*.js`.

## Environments — two of everything

| | Production | Staging |
|---|---|---|
| Live site | `heritagehill.church` | `sspratlen.github.io/HeritageHill-staging` |
| GitHub repo | `sspratlen/HeritageHill` | `sspratlen/HeritageHill-staging` |
| Git remote name (in this worktree) | `origin` | `staging` |
| Supabase project ref | `ktyplbmawlaerzohkdqy` | `govvofbrhhpowtdnuzcw` |
| Supabase project name | "HHCWebsite" | "HeritageHill Staging" |

`js/supabase-client.js` auto-detects which project to talk to at runtime, based on `location.hostname === 'sspratlen.github.io'`. Nothing in the app code needs manual environment switching — the same files serve both environments correctly.

**As of 2026-09-21, production and staging are in full parity** — same git history, same schema, same edge functions. Verify this is still true before assuming it (see "Checking parity" below); it will drift again as new work lands on staging first.

## Deployment workflow — the one rule that matters most

**Direction is always: local → staging → production. Never reverse it without explicit, current approval from Scott.**

The default posture for most of this project's history has been "staging only, ask before touching production" — a long-running data-model rebuild (the People Backbone initiative, plus chair-tag redirects, Connect page, Impact Teams, and more) was deliberately kept off `origin` for months while it was built out. On 2026-09-20/21, after a full deep-dive comparison (see `docs/superpowers/2026-09-20-production-deployment-readiness-report.md`), Scott explicitly approved promoting all of it to production. **That approval does not carry forward automatically** — treat every future production push as needing its own explicit go-ahead, the same way this session did, unless Scott says otherwise.

Practical checklist before pushing to `origin` (production):
1. The same change must already be verified working on `staging` first.
2. If it touches the database, the migration must be run on the **staging** Supabase project first, verified, then run again on **production** — migrations are never auto-applied by a code push; they're separate manual (or MCP-driven) SQL steps.
3. Confirm with Scott before the actual `git push origin`, unless he's already explicitly said to proceed with this specific change.
4. After pushing, poll the deploy and spot-check the live site (see "GitHub Pages deploys" below — they aren't always instant or reliable).

### Checking parity

```bash
git fetch origin && git fetch staging
git log HEAD..origin/main --oneline    # commits on production not yet local
git log HEAD..staging/main --oneline   # commits on staging not yet local
git log origin/main..HEAD --oneline    # local commits not yet on production
git log staging/main..HEAD --oneline   # local commits not yet on staging
```

If `origin/main` has commits `HEAD` doesn't (i.e. someone pushed directly to production outside this workflow, or hand-edited a live Edge Function in the Supabase dashboard), **do not just force-push over it** — merge properly and look closely at what actually changed (`git show <sha>` on each). This has happened before (a security fix landed independently on both lines of history) and once caused a merge to silently take the wrong side of a delete/re-add conflict — see "Gotchas" below.

## Commit attribution

Every commit this session ends with:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```
Follow whatever the current system reminder says for attribution — it can change between sessions/accounts. Never amend commits; always create new ones, including to fix a mistake in the immediately prior commit.

## The `docs/superpowers/` workflow

Non-trivial features in this repo go through a consistent pipeline (the "superpowers" skills: `brainstorming` → `writing-plans` → `subagent-driven-development`):

1. **Brainstorm** — clarifying questions, then a design doc written to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, committed.
2. **Plan** — an implementation plan with exact find/replace code blocks, written to `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`, committed.
3. **Execute** — either inline, or by dispatching a fresh subagent per task with a spec-compliance review and a code-quality review after each one.

**These spec/plan docs are the durable record of *why* something was built a certain way** — read them (and `git log`) before assuming intent from code alone. There are ~15+ of these pairs in the repo already, covering the People Backbone data model, chair-tag NFC redirects, the Connect page, admin-entered assessments, Impact Teams, the branded invite-link system, and more.

## Database schema — a real gap to watch for

**The tracked `.sql` files under `supabase/` are not guaranteed to be a complete record of what's actually live on either database.** On 2026-09-20, a deep-dive comparison found 4 schema pieces (the entire Impact Teams feature, a training-tracking column, an RPC function, and two `events` columns) that had been applied directly to the staging database — via the Supabase SQL editor or MCP `execute_sql`/`apply_migration` — and were **never saved as a tracked file in this repo**. They were reconstructed and backfilled into `supabase/*.sql` files after the fact, but the underlying habit (making a schema change without immediately committing the matching `.sql` file) has happened before and will happen again if not actively avoided.

**Rule going forward:** any `apply_migration`/`execute_sql` DDL call against either database must be paired with a `git commit` of the equivalent `.sql` file in the same work session, not "later." If you ever need to know the *true* current schema, query the live database directly (`information_schema.columns`, `pg_policies`, or Supabase's own migration history table `supabase_migrations.schema_migrations` which has a `statements` column with the exact SQL that was run) rather than trusting the repo's `.sql` files alone.

## Gotchas discovered the hard way

- **Inline-style CSS selector matching is inconsistent across load paths.** A `[style*="grid-template-columns:1fr 1fr"]` selector will NOT reliably match depending on how the page was loaded (a real top-level navigation normalizes spacing around `:`; some other render paths don't). Any such selector needs to list **both** the spaced and unspaced form to be reliable.
- **`window.location.origin` excludes the path** — on a GitHub Pages *project* site (like staging, served under `/HeritageHill-staging/`), `location.origin + '/some/page.html'` silently drops that subpath prefix and produces a broken URL. Production (served from the domain root) never surfaces this, so it's easy to miss in testing. Use `location.origin + location.pathname.replace(/currentfile\.html$/, 'target.html')` instead, which correctly preserves any subpath. This bug has recurred multiple times (invite-link redirects, tag-URL display) — check for it whenever building a redirect URL from `location.origin` alone.
- **Supabase Auth's Site URL / Redirect URLs are per-project dashboard settings, not something set via SQL or this repo's code.** Both staging and production needed their own `Authentication → URL Configuration` set correctly (Site URL = the real domain, Redirect URLs includes `<domain>/**`) before invite/reset links would land on the right page instead of Supabase's default `localhost:3000`. There's no MCP tool to read or set this — it must be checked manually in each project's dashboard.
- **GitHub Pages deploys sometimes get genuinely stuck**, either (a) rejected outright because a prior deploy for the same repo is still "in progress" per GitHub's internal lock, even after that prior deploy actually finished successfully — fix: `gh run rerun <run-id> --repo <owner>/<repo>` — or (b) just slow (multi-minute `deploy` job when it's normally ~20s) with no real error, which usually clears on its own within several minutes. The legacy `gh api repos/<owner>/<repo>/pages/builds/latest` endpoint can report stale "building" forever even after the real deploy (visible via `gh run list --repo <owner>/<repo>`) has completed — prefer `gh run list`/`gh run view` over the legacy builds endpoint when diagnosing a stuck deploy.
- **A table's "live-computed" display can silently diverge from a "persisted" column** feeding a different page. `admin/dashboard.html`'s attendance table always recomputes small-group counts fresh from `group_attendance` on every render; `admin/attendance-dashboard.html`'s analytics charts trust the persisted `attendance.small_group_count` column, which is only refreshed by an explicit `SupaDB.adminRecomputeSmallGroupCounts()` call after a group-attendance write. Adding or editing the *weekly* attendance row itself didn't trigger that recompute, so a newly created row could show correct numbers in one place and blank charts in the other. Fixed by also calling the recompute after weekly-entry add/edit — but the general lesson is: if two UI surfaces read the "same" data through different paths (one live-joined, one persisted-and-cached), they can drift, and it's easy to verify only one of them.
- **Old/broken image assets can persist under plausible-looking filenames.** `assets/logos/logo-icon-color-dark.png` and `-white.png` turned out to both be a stale, incorrectly-cropped half of the actual brand mark — the real, correct logo lives at `assets/pwa/icon-192.png` (and siblings) from a later icon redesign. Don't assume a `logos/` file is current just because the filename sounds right; check the redesign commits (search `git log` for "PWA icon"/"logo") if a logo looks visually wrong.
- **`is_admin()` and `jwt_email()` (Postgres functions) are shared infrastructure both databases already have** — new features can assume they exist rather than re-creating them. `is_admin()` checks `user_roles.role = 'admin'` for the calling JWT's email; RLS policies across the app gate on it.

## Supabase MCP connectivity

This session's Supabase MCP connection dropped mid-session and reconnected to a **completely unrelated Supabase account/org** (a project called "PitchIt") rather than the Heritage Hill account. If `list_projects` doesn't show `ktyplbmawlaerzohkdqy`/`govvofbrhhpowtdnuzcw`, the connector needs to be reconnected to the correct Supabase account via claude.ai connector settings (or `/mcp` in an interactive session) before any database work can happen through MCP. When MCP access isn't available, the fallback that's worked reliably: give Scott the exact SQL to paste into the relevant project's SQL Editor himself.

## Admin login / testing limitation

No admin credentials for either environment are known to Claude in this repo's sessions. Every admin-only feature built here has been verified either by (a) reading the deployed HTML/JS directly via `curl` to confirm the right markup/logic shipped, (b) direct SQL queries against the live database to confirm data-layer correctness, and/or (c) asking Scott to click through the actual UI and report back. Don't claim a UI flow "works" without one of these — reading source code that *should* work is not the same as confirming it does.
