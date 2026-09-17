# Branded NFC Tap Redirect Design Spec

## Purpose

Tapping a chair-tag NFC tag currently sends the phone's browser straight to `https://<project-ref>.supabase.co/functions/v1/tap-redirect?section=<slug>`, which itself immediately 302s to the real destination. For a split second (and in the tag's own encoded URL, which some NFC apps display before opening), the visitor sees raw Supabase infrastructure instead of anything Heritage Hill. This spec replaces the NFC tag's target with a branded landing page on the church's own domain, so nothing Supabase-related is ever visible to a guest.

## Scope

- A new clean-URL landing page, `tap/index.html`, matching the site's existing `connect/`/`mensretreat/` directory-style precedent.
- A small addition to the existing `tap-redirect` Edge Function: an opt-in JSON response mode, used only by the new landing page. The function's default behavior (a direct 302, used by anyone hitting the raw URL) is unchanged.
- Updating `admin/tap-control.html`'s "tag URL" display and "Copy tag URL" button to show the new branded URL instead of the raw Supabase one.

**Out of scope:**
- Changing `tap_sections`/`tap_current`/`tap_links`/`tap_events` schema or RLS — untouched.
- Any change to the section add/rename/delete UI built earlier this session.
- Re-flashing the one physical NFC tag that already exists — that's a manual action the admin will do themselves once this ships.

## Current State

`supabase/functions/tap-redirect/index.ts` resolves `?section=<slug>` against `tap_sections`/`tap_current`/`tap_links` (or a custom URL), logs a `tap_events` row, and returns `Response.redirect(destUrl, 302)` — falling back to the homepage on any missing/unknown/unconfigured case. This logic is correct and stays exactly as-is; only its *response format* gains a second option.

## Backend: `tap-redirect` opt-in JSON mode

Add an early check: if `url.searchParams.get('format') === 'json'`, every path that currently calls `fallback()` or `Response.redirect(destUrl, 302)` instead returns a JSON response — `Response.json({ url: <the same URL that would have been the redirect target> })`, status 200, with `Access-Control-Allow-Origin: *` (already set for the whole function). The tap-event logging and all resolution logic are identical between the two modes; only the final `return` differs. No `format` param (or any value other than `json`) preserves today's exact behavior — every existing direct-URL caller (including the browser hitting the URL directly with no JS) is unaffected.

## New page: `tap/index.html`

A minimal, fast-loading branded page — not a full site page with nav/announcement bar, since it's meant to be on screen for a fraction of a second:

- Heritage Hill logo, a short "Taking you there…" message, and a small CSS spinner, styled with the site's existing `--primary`/`--bg` tokens via `../css/style.css` (same pattern every other page already uses).
- On load, reads `?section=` from its own URL. If missing, immediately `location.replace('../')` (site root, one level up — correct under both the GitHub Pages subpath on staging and the domain root on production, since this page's location is always exactly one directory deep by design, so no path-prefix computation is needed).
- Otherwise, loads `../js/supabase-client.js` for the `SUPABASE_URL` constant (same constant every other page already uses, already environment-aware for staging vs. production) and does:
  ```js
  fetch(`${SUPABASE_URL}/functions/v1/tap-redirect?section=${encodeURIComponent(section)}&format=json`)
    .then(r => r.json())
    .then(data => location.replace(data.url || '../'))
    .catch(() => location.replace('../'));
  ```
- This is a same-origin-safe cross-origin `fetch` (the Edge Function already sends `Access-Control-Allow-Origin: *`), and because the JSON body directly carries the final destination, the browser's address bar goes straight from `heritagehill.church/tap/?section=…` to the real destination — the Supabase URL is never requested as a top-level navigation, so it never appears in the address bar or browser history at all.

## Admin UI (`admin/tap-control.html`)

The "tag URL" box (`#tagUrlBox`, currently set from `init()`/`selectSection()`) and the "Copy tag URL" button change to use the new branded URL instead of the raw function URL:

```js
document.getElementById('tagUrlBox').textContent =
  `${location.origin}${location.pathname.replace(/admin\/tap-control\.html$/, 'tap/')}?section=${_section.slug}`;
```

This mirrors the path-prefix-preserving fix already applied elsewhere this session (the invite-link `redirectTo` bug) rather than the broken `location.origin`-only approach — it correctly includes the GitHub Pages `/HeritageHill-staging/` subpath on staging and resolves to the plain domain root on production, with no separate per-environment logic needed.

## Error Handling

- Missing/unknown `section` on the landing page: immediate redirect to site root, no error flash (matches the Edge Function's own existing "never show a guest a raw error" philosophy).
- `fetch` failure (network error, non-JSON response, etc.): same fallback, via `.catch()`.
- The Edge Function's own fallback paths (unknown section, no current destination, etc.) are unchanged in JSON mode — they just return `{ url: FALLBACK_URL }` instead of redirecting to it directly, so the landing page's own `location.replace` still ends up at the same homepage fallback either way.

## Testing Plan

- Manual: visit `tap/?section=<a real slug>` directly in a browser, confirm it briefly shows the branded "Taking you there…" page, then lands on the correct final destination with the Supabase URL never appearing in the address bar or history (check via browser back button — should skip straight from `tap/?section=…` to the real destination, no Supabase entry in between).
- Manual: visit `tap/` with no `section` param, confirm immediate redirect to the site homepage.
- Manual: visit `tap/?section=not-a-real-slug`, confirm fallback to homepage, no error shown.
- Manual: confirm the raw `tap-redirect` Edge Function URL (no `format=json`) still works exactly as before — a direct 302, for backward compatibility with anything (or anyone) that might still call it that way.
- Manual: in `admin/tap-control.html`, confirm the tag URL box and "Copy tag URL" now show/copy `https://<site>/tap/?section=<slug>` instead of the Supabase URL, correct on both staging (with its subpath) and after this ships to production.
- Manual (admin's own action, not part of this implementation): re-flash the one existing physical NFC tag to the new URL.

## Out of Scope (YAGNI)

- No custom domain/DNS mapping for the Supabase project itself — the branded landing-page approach avoids needing that entirely.
- No change to the raw Edge Function's default (non-JSON) behavior.
- No visual/animation polish beyond a simple spinner — this page is on screen for well under a second in the normal case.
