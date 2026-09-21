# Moving This Project to a Different Claude Account

The code, commit history, and design docs are all already portable — they live in git, and both GitHub remotes are ordinary repos any account with access can clone and push to. What does **not** travel automatically between Claude accounts is: this account's memory files, this session's conversation history, and any MCP/tool connections that are authorized per-account. This checklist covers exactly that gap.

**Read `CLAUDE.md` first** (repo root) — it's the durable operating manual (environments, deployment rules, gotchas) and is loaded automatically once the new account opens this repo. This file is just the one-time "get set up" steps.

## 1. Get the code

```bash
git clone https://github.com/sspratlen/HeritageHill.git
cd HeritageHill
git remote add staging https://github.com/sspratlen/HeritageHill-staging.git
git fetch staging
```

Confirm both remotes are reachable and, if picking up mid-branch, check out the working branch this session used: `claude/loving-darwin-e8d5ea` (or whatever branch the repo's default/active branch is by the time you're reading this — check `git branch -a` and `git log --all --oneline -5` on each remote to see what's current).

Confirm you have push access to both `sspratlen/HeritageHill` and `sspratlen/HeritageHill-staging` under the new account's GitHub credentials (`gh auth status`, or `git push --dry-run <remote> HEAD:main`).

## 2. Connect Supabase

Two separate Supabase projects, both under Scott's Supabase org:

- **Production**: project ref `ktyplbmawlaerzohkdqy` ("HHCWebsite")
- **Staging**: project ref `govvofbrhhpowtdnuzcw` ("HeritageHill Staging")

If using the Supabase MCP connector, authorize it against Scott's Supabase account and confirm `list_projects` returns both of the above. If it returns anything else (this session at one point got silently reconnected to an unrelated personal Supabase account), it needs to be re-authorized — there's no in-band fix, it has to be done via the connector's own settings/`/mcp`.

The project refs and public anon keys are already hardcoded in `js/supabase-client.js` (they're meant to be public/client-side, not secrets) — no local `.env` setup is needed for the site itself to run. MCP access is only needed for schema changes, running migrations, deploying Edge Functions, and querying data directly.

## 3. Confirm GitHub Pages / Actions access

Both sites deploy automatically via GitHub Pages on push to `main` (Actions-based, not the legacy branch-based Pages build). Confirm `gh auth status` is logged in as an account with admin/write access to both repos, since deploy troubleshooting sometimes requires `gh run rerun <id>` (see `CLAUDE.md`'s Gotchas section).

## 4. Re-establish anything that only lived in memory/conversation

This account's Claude memory (if any exists) and this specific conversation's history do not transfer. Before assuming the new account/session "knows" something from this session that isn't written into the repo:

- **Everything substantive already is in the repo** — every feature has a spec+plan pair under `docs/superpowers/`, and `CLAUDE.md` captures the operational rules and gotchas. That should cover the vast majority of what matters.
- **What's genuinely session-local and worth re-stating to a new session if it matters going forward**: any standing preference Scott has that he hasn't yet said explicitly to the new account (tone, how much to ask before acting, etc.) — those aren't written down anywhere by design, since they're supposed to be learned per-account through actual interaction, not copy-pasted.

## 5. Sanity-check parity before doing anything else

```bash
git fetch origin && git fetch staging
git log HEAD..origin/main --oneline
git log HEAD..staging/main --oneline
```

If either shows unexpected commits, read them (`git show <sha>`) before pushing anything — someone may have changed something outside this workflow since this handoff doc was written.

## 6. First things to verify are actually working

A short smoke-test list, since this repo has no automated test suite:

- `heritagehill.church` and the staging URL both load and match.
- `admin/login.html` sign-in still works for both a staff account and a regular member account (redirect destinations differ — see `CLAUDE.md`).
- The Supabase Edge Functions list matches between environments where expected (`list_edge_functions` via MCP, or the Supabase dashboard) — production and staging should have the same function *names* even if a couple of functions (`send-contact-email`, `mailchimp`) have historically had environment-specific content differences; check `CLAUDE.md`'s deployment section and recent git log for context before assuming a mismatch is a bug.

---

*This document was generated on 2026-09-21 at the end of a session that took the project from a long staging-only phase through a full production promotion. If you're reading this much later, treat the specifics above (project refs, branch names, function lists) as a snapshot, and verify against the live systems — not as guaranteed-current fact.*
