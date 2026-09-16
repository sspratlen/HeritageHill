# Connect Page Design Spec

## Purpose

Give the church a digital equivalent of its physical "Scan to Connect" card: a page at `heritagehill.church/connect` where a visitor (already in the building, having just scanned a QR code or tapped an NFC tag) can submit their name/email/phone, optionally create a full website account on the spot, and read a "What to Expect" section written for someone who's already there. Staff get a simple follow-up list of who submitted the card, with a way to mark them as contacted.

## Scope

- New public page `connect/index.html`, reachable at the clean URL `heritagehill.church/connect` (directory-style, matching the existing `mensretreat/` precedent — no query params or redirect layer, so it's a stable target for a static NFC tag or printed QR code).
- New `connect_submissions` table for staff follow-up tracking (with a "contacted" flag), plus reuse of the existing `people` and `person_milestones` backbone for the actual identity record and journey tracking.
- New "Connect" tab under the **Found** stage in `admin/dashboard.html`, admin-only, listing submissions with a mark-contacted toggle.
- Account creation reuses the existing `signUpMember` / lazy `createMyProfile` flow already used by `admin/register.html` and `admin/my-profile.html` — no new auth logic.

**Out of scope:**
- Building a general "browse all people" admin screen — this is `connect_submissions`-scoped only.
- Changing `about.html`'s existing "What to Expect" section — it keeps its own copy, unchanged, written for someone researching the church before a visit. The Connect page's version is separate copy, reframed for someone already there.
- Adding "Connect" to the site's main nav — discovery is via NFC tag / QR code, not nav browsing. (Can be added later with a one-line nav edit if wanted.)
- MIDI/ProPresenter-triggered switching of NFC destinations (parked, unrelated to this page).

## Data Model

### `people` / `person_milestones` (existing, no schema changes)

The connect-card submit calls the existing `upsert_person` RPC (via `SupaDB.upsertPerson`) to find-or-create the canonical `people` row by email — identical to how every other form on the site (growth track, small group signup, event RSVP, etc.) already creates people records. It also calls the existing `record_milestone` RPC (via `SupaDB.recordMilestone`) with milestone `connect_card_submitted`, so a person's journey view picks up "connected via card" the same way it already surfaces baptism, growth-track, and membership milestones — no new milestone-recording mechanism needed, just a new milestone string using the existing generic system.

### `connect_submissions` (new table)

The staff-facing follow-up record. Deliberately separate from `people`/`person_milestones` (which are generic identity/journey backbones) because this table carries workflow-specific state — the contacted flag — the same way the existing `signups` table (group sign-up requests) carries its own `contacted` flag alongside a `person_id` link, rather than that state living on `people` itself.

| column | type | notes |
|---|---|---|
| `id` | bigint generated always as identity, pk | matches this codebase's `signups`/`applications` convention |
| `person_id` | uuid, references `people(id)` on delete set null | links to the canonical person record |
| `name` | text, not null | snapshot at submission time |
| `email` | text, not null | snapshot at submission time |
| `phone` | text | snapshot at submission time |
| `contacted` | boolean, not null, default false | |
| `contacted_at` | timestamptz, nullable | set when `contacted` flips to true |
| `contacted_by` | text, nullable | email of the admin who marked it |
| `created_at` | timestamptz, not null, default now() | |

RLS:
- `insert`: public (`with check (true)`) — this is a public-facing form with no logged-in user, same as `signups`.
- `select`/`update`: `is_admin()` only. This carries visitor contact info, so it's gated tighter than the site's older tables (which use a blanket `authenticated`-role check) — matching the same admin-only convention the chair-tag redirect tables just established.

## Backend Methods (`js/db.js`)

- `submitConnectCard({ name, email, phone })` — public method, no auth required. Calls `upsertPerson`, then inserts a `connect_submissions` row (including the resolved `person_id`), then fires `recordMilestone(personId, 'connect_card_submitted')` (fire-and-forget, matches the existing pattern — never blocks or fails the caller on a milestone-recording error). Returns `{ success: true }` or `{ error }`.
- `adminGetConnectSubmissions()` — admin-only (enforced by RLS), returns all `connect_submissions` rows ordered newest-first, camelCase-mapped.
- `adminMarkConnectContacted(id, contacted)` — admin-only, updates `contacted` (and `contacted_at`/`contacted_by` when flipping to true) for one row.

Account creation on the page itself calls the **existing, unmodified** `SupaDB.signUpMember(email, password, meta)`.

## Page: `connect/index.html`

Single continuous-scroll public page, using the site's existing `css/style.css`, standard nav/footer (paths adjusted for the one-level-deep `connect/` directory, same as `mensretreat/index.html` already does).

1. **Hero** — short, in-the-moment headline ("Glad You're Here" or similar), not a cold marketing pitch, since the reader is already in the building.
2. **Connect card form** — Name / Email / Phone (matching the physical card's three fields exactly), single "Connect" submit button, honeypot + timestamp anti-bot fields matching the existing pattern used by `about.html`'s `visitContactForm`. On submit, calls `submitConnectCard`; on success, the form area is replaced **in place** (no page navigation) with:
   - A short thank-you message.
   - A clearly-secondary, optional account-creation prompt: "Want full access to your journey, groups, and giving? Set a password to create your account." — just a password field (name/email already captured), submit calls `signUpMember(email, password, { name, phone })`. If a session comes back immediately, redirect to `my-profile.html` (which lazily finishes provisioning via `createMyProfile`, as it already does for `register.html` signups). If email confirmation is required (no session), show a "check your email" message, matching `register.html`'s existing confirm-card pattern exactly.
3. **What to Expect** — same 4-point numbered structure as `about.html`'s `#visit` section, but its own copy reframed for someone already at the building (e.g. present/near-past tense — "You've been welcomed," "Kids are taken care of right now" — rather than future-tense "You'll be welcomed"). This is new copy, not a shared component; `about.html`'s section is untouched.
4. **Service times & location** — same info-card style as `about.html`'s version (address, phone, "Get Directions" link), for a visitor who wants to confirm they're in the right place or plan a return visit.

## Admin: Connect tab (`admin/dashboard.html`)

New tab under the **Found** stage sidebar section, alongside Members/Baptism/Events (`sideConnect`, `panelConnect`), admin-role-only (added to `ROLE_TABS.admin` and `ALL_TABS`, titled "Connect Submissions"). Table columns: Name, Email, Phone, Submitted (formatted date), and a toggle/checkbox per row calling `adminMarkConnectContacted`, newest-first. Follows the existing Sign-Up Requests panel's table markup/styling for visual consistency rather than introducing a new table style.

## Error Handling

- `submitConnectCard`: if the `connect_submissions` insert fails after `upsertPerson` already succeeded, the person record still exists (consistent with this app's existing "never let a secondary write block the primary action" pattern) — the form shows an error and lets the visitor retry the submit, which is idempotent (`upsertPerson` and a fresh `connect_submissions` insert are both safe to repeat).
- `recordMilestone` failure is silent/non-blocking, per its existing established behavior elsewhere in the codebase.
- Account creation errors (e.g. "email already registered") are shown inline in the account-creation sub-form, matching `register.html`'s existing error-message handling — the connect-card submission itself has already succeeded by this point regardless.
- Honeypot/timing-based spam rejection matches `about.html`'s existing `visitContactForm` pattern (silently drop bot submissions rather than showing an error).

## Testing Plan

- Manual: submit the connect form with valid data, confirm a `people` row and a `connect_submissions` row are created, and a `connect_card_submitted` milestone is recorded.
- Manual: submit again with the same email, confirm `people` is updated (not duplicated) and a second `connect_submissions` row is created (each submission is its own follow-up record, even from a repeat visitor).
- Manual: use the account-creation sub-form after a successful connect submission, confirm either a redirect to `my-profile.html` with a fully provisioned profile, or a "check your email" state, matching `register.html`'s behavior.
- Manual: log into `admin/dashboard.html` as admin, confirm the Connect tab lists the test submissions and the contacted toggle persists.
- Manual: confirm a non-admin staff role does not see the Connect tab (client-side `ROLE_TABS` gating) and that `adminGetConnectSubmissions`/`adminMarkConnectContacted` are blocked server-side by RLS for a non-admin session.

## Out of Scope (YAGNI)

- No editing/deleting of `connect_submissions` rows from the admin UI — just view + mark contacted.
- No CSV export for this tab (unlike some older admin tables) — can be added later if requested.
- No rate-limiting beyond the existing honeypot/timing anti-bot pattern.
- No changes to the physical card or its QR code — this spec only covers the destination page.
