# Chair Tag Dynamic Redirect Design Spec

## Purpose

24 NFC chair tags (NTAG215) have been purchased for the sanctuary chairs. Each tag is written once with a single static URL and never rewritten physically again. What changes is where that URL sends people — staff switch the destination live during a service (Welcome during the welcome, Give during the offering, Message Notes during the sermon, a specific sign-up page during an announcement) from an admin panel, and every tap immediately reflects the new destination.

This spec covers the redirect infrastructure and the admin control panel. It does **not** cover building the actual destination pages (Message Notes, Welcome/Connect) — those are separate future projects. The redirect system treats every destination as an opaque URL; existing pages (`give.html`, `prayer.html`, `small-groups.html`, `events.html`) and not-yet-built pages are handled identically.

## Scope

- A Supabase Edge Function that resolves a section's current destination and issues a true HTTP 302.
- Four new Supabase tables backing sections, saved links, current-destination state, and a tap log.
- A new standalone admin page, `admin/tap-control.html`, for switching the live destination and managing saved links.
- Guidance for physically writing the 24 tags (manual/physical step, not code).
- Built for one section now ("Main Auditorium"), architected so additional sections (Overflow, Youth Room, etc.) can be added later by adding a database row and writing a new batch of tags — no code changes required to add a section.

## Architecture & Data Flow

1. Each of the 24 tags is written with the identical URL:
   `https://<supabase-project>.functions.supabase.co/tap-redirect?section=main-auditorium`
2. A phone tapped against a tag opens that URL in the phone's browser.
3. The `tap-redirect` Edge Function:
   - Reads `section` from the query string.
   - Looks up the section in `tap_sections` by slug. If missing/unknown, redirects to the site homepage (`https://heritagehill.church/`).
   - Looks up that section's row in `tap_current`. If no destination is configured yet, redirects to the homepage.
   - Otherwise resolves the destination URL (from the linked `tap_links` row, or the `custom_url` override) and returns `302 Found` with that `Location`.
   - Fire-and-forget inserts a row into `tap_events` for analytics (a logging failure must never block or delay the redirect itself).
4. The redirect is a real HTTP 302 from the Edge Function — no intermediate HTML page, no client-side JS redirect delay.

## Data Model

All four tables live in the existing Supabase project (staging: `govvofbrhhpowtdnuzcw`). Admin-only RLS on the three staff-facing tables (`select`/`insert`/`update`/`delete` gated the same way other admin-only tables in this app are — checked against the `user_roles` admin role); `tap_events` inserts happen from the Edge Function using the service-role key, not the browser client.

### `tap_sections`
| column | type | notes |
|---|---|---|
| `id` | uuid, pk | |
| `slug` | text, unique | e.g. `main-auditorium`; this is the value tags are written with |
| `name` | text | display name, e.g. "Main Auditorium" |
| `created_at` | timestamptz | |

Seeded with one row (`main-auditorium` / "Main Auditorium") as part of the migration. Adding a section later is a manual insert, no deploy needed.

### `tap_links`
The manageable saved-presets list, shared across all sections.

| column | type | notes |
|---|---|---|
| `id` | uuid, pk | |
| `label` | text | e.g. "Give" |
| `url` | text | full destination URL |
| `sort_order` | integer | controls button order in the admin panel |
| `created_at` | timestamptz | |

Seeded with 4 rows: Welcome/Connect, Give, Message Notes, Prayer. (Welcome/Connect and Message Notes point at placeholder URLs — e.g. the homepage — until those pages exist; editing a saved link's URL later is a normal admin-panel edit, not a migration.)

### `tap_current`
One row per section — literally "what a tap to this section resolves to right now."

| column | type | notes |
|---|---|---|
| `section_id` | uuid, pk, fk -> `tap_sections.id` | |
| `link_id` | uuid, nullable, fk -> `tap_links.id` | set when destination is a saved preset |
| `custom_url` | text, nullable | set when destination is a one-off URL not saved as a preset |
| `updated_at` | timestamptz | |
| `updated_by` | text | email of the admin who last changed it |

Exactly one of `link_id` / `custom_url` is non-null at a time; writing one clears the other. No row for a section means "not configured yet" — the Edge Function's homepage-fallback case.

### `tap_events`
Append-only analytics log.

| column | type | notes |
|---|---|---|
| `id` | uuid, pk | |
| `section_id` | uuid, fk -> `tap_sections.id` | |
| `resolved_url` | text | the URL actually redirected to |
| `resolved_label` | text, nullable | denormalized label at time of tap (so history reads correctly even if a link is later renamed/deleted) |
| `tapped_at` | timestamptz, default now() | |

## Edge Function: `tap-redirect`

- New Supabase Edge Function, same deployment pattern as the existing `send-group-email` function.
- Public (no auth required) — it's hit directly by a phone's browser from an NFC tap, there's no logged-in user.
- Request: `GET /tap-redirect?section=<slug>`
- Response: `302` with `Location` header set to the resolved destination, or to `https://heritagehill.church/` as fallback in every error/missing-data case (missing `section` param, unknown slug, no `tap_current` row, or a lookup/DB error). A guest scanning a chair tag should never see a raw error page.
- Analytics insert into `tap_events` is wrapped so any failure there is logged/swallowed and never delays or blocks the redirect response.

## Admin Panel: `admin/tap-control.html`

A new standalone page (separate from `admin/dashboard.html`, for fast one-handed use during a live service), gated by the existing Supabase Auth + admin-role check pattern used elsewhere (e.g. `admin/dashboard.html`'s auth guard). Mobile-first responsive layout.

- **Section picker** — a single fixed label for now ("Main Auditorium"); becomes a dropdown once more sections exist in `tap_sections`.
- **Current destination** — shown large: resolved label + URL, so it's readable at a glance from across a room.
- **Preset buttons** — one per row in `tap_links` (ordered by `sort_order`), laid out as a grid of large tap targets. Tapping one writes `tap_current.link_id` (clearing `custom_url`) immediately — no confirmation dialog, since speed during a live service matters more than protecting against a mis-tap here.
- **Custom URL box** — a text input + "Set" button for a one-off URL not saved as a preset; writes `tap_current.custom_url` (clearing `link_id`).
- **Manage saved links** — collapsed by default; expands to a simple add/edit/delete list for `tap_links` rows (label, URL, reorder). This is where a week's specific announcement sign-up link gets added before service, after which it appears as a one-tap preset for the rest of the team.
- **Tap count** — small stat area: total taps for the current section today, and taps since the destination was last changed. Pulled from `tap_events`; not a full analytics dashboard.
- All writes are optimistic-UI with a toast on failure, matching existing admin-panel conventions in this app.

## Physical Tag Setup (manual, not code)

- Write all 24 tags with the identical URL (`.../tap-redirect?section=main-auditorium`) as a URI/URL NDEF record, using a free NFC-writing Android app such as "NFC Tools" (not TagMo — despite the product listing mentioning it, TagMo is built for Amiibo/game-console emulation; a plain NFC-writing app is the correct tool for writing a URL record to an NTAG215).
- Optionally lock tags read-only after writing, to prevent accidental overwrites later. Not required for initial rollout.
- Affix tags to the back of chairs per normal physical installation — outside the scope of this spec.

## Error Handling

- Edge Function: every failure path (missing param, unknown section, unconfigured section, DB error) falls back to the homepage redirect — never a dead end or visible error for a guest.
- Admin panel: failed writes show a toast and leave the previous state displayed (no optimistic flip that silently reverts) so the operator isn't misled about what's currently live.
- Analytics logging failures are silent/non-blocking from the guest's perspective.

## Testing Plan

- Manual: tap a written tag with a phone, confirm landing page matches the panel's "Current destination."
- Manual: switch the destination in the panel, tap again within a few seconds, confirm the new destination is reflected (no caching lag from the Edge Function or database).
- Manual: tap with an invalid/missing `section` param (e.g. hit the function URL directly without the query string) and confirm homepage fallback.
- Manual: verify tap count increments in the panel after a real tag tap.

## Out of Scope (YAGNI)

- Building the Message Notes or Welcome/Connect destination pages themselves.
- Multi-section UI beyond a single-item picker (the dropdown/tab UI for 2+ sections is deferred until a second section is actually needed).
- A "Service Operator" limited staff role — admin-only access for now.
- Rich analytics (charts, per-link history over time, export) — just a simple current-day tap count.
- Any handling for non-NFC-capable phones or unsupported browsers — tapping an NFC tag inherently requires a compatible device; no fallback UX is designed for incompatible hardware.
