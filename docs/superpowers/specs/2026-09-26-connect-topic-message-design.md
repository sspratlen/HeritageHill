# Connect Card: Topic + Message — Design

## Motivation

The "Let's Connect" card on `connect/index.html` currently captures only Name, Email, and Phone. Scott wants to also capture what the visitor is reaching out about and any free-form context, so staff can triage submissions without a follow-up phone call just to find out why someone connected.

## Scope

Add two optional fields — **Topic** (dropdown) and **Message** (free text) — to the existing Connect card form, and surface them in the admin Connect submissions view. No new form, no new page.

Explicitly out of scope:
- No routing of any topic to another table (e.g. `prayer_requests`). All submissions stay in `connect_submissions` regardless of topic — confirmed with Scott that "Pastoral Care" is just a triage label here, not a trigger for the prayer-request notification flow.
- No changes to the visitor-facing success/account-creation flow that follows a submission.
- No changes to the `contact_form` edge-function path used by `about.html`/`small-groups.html` — unrelated feature.

## Data model

Add two nullable columns to `public.connect_submissions`:

```sql
alter table public.connect_submissions
  add column if not exists topic   text,
  add column if not exists message text;
```

- `topic`: stores the selected option's exact label text (one of the three strings below), or `null`/empty when left blank. Stored as plain text rather than an enum/lookup table — there are only three values, they're staff-facing labels rather than a stable taxonomy other code depends on, and every other free-text-ish field in this table (`name`, `phone`) follows the same plain-text convention.
- `message`: free-form text, nullable.

This is an additive, backward-compatible change — existing rows get `null` in both columns, and nothing reads these columns yet, so no backfill is needed.

Per this repo's schema-change rule (see `CLAUDE.md`), the migration SQL is applied via MCP `execute_sql` (or the SQL Editor, if MCP access isn't available) against the **staging** project first, verified, and the tracked `.sql` file below is committed in the same work session — not applied to production until Scott explicitly approves promoting this change.

New file: `supabase/connect-submissions-topic-message-schema.sql` (idempotent, safe to re-run).

## Visitor-facing form (`connect/index.html`)

Two new fields inserted between the existing Phone field and the Connect submit button, matching the existing field markup/style exactly (same label styling, same input border/radius/font):

1. **Topic** — a `<select id="ccTopic">`, optional, with a blank default option and exactly these three choices (verbatim label text, per Scott's screenshot, minus the "Campus" option which doesn't apply to this church):
   - *(blank)* — "Select a topic (optional)"
   - `General Church Question/Comment`
   - `Pastoral Care`
   - `App/Web/Login Question/Comment`

2. **Message** — a `<textarea id="ccMessage" rows="3">`, optional, placeholder text `"Let us know how we can help"` (echoing the screenshot's "Let us know below how we can help you!" prompt, shortened to fit as a placeholder rather than a separate heading, consistent with this form's existing terse single-line labels).

Neither field is marked `required`. No client-side validation beyond what already exists (honeypot + time-based bot check on the form as a whole, unchanged).

## Submission flow

- `handleConnectSubmit()` in `connect/index.html` reads `ccTopic.value` and `ccMessage.value.trim()` alongside the existing three fields, and passes them into `SupaDB.submitConnectCard({ name, email, phone, topic, message })`.
- `SupaDB.submitConnectCard` (in `js/db.js`) adds `topic: topic || ''` and `message: message || ''` to the `connect_submissions` insert payload. No other logic in that function changes (person upsert + milestone recording stay as-is).

## Admin display (`admin/dashboard.html`)

In `renderConnectPanel()`:
- **Topic**: rendered as a small badge using the existing `.badge.badge-gray` class (neutral, visually distinct from the green/amber Status badge) placed next to the existing Status badge. Omitted entirely (no empty badge) when topic is blank.
- **Message**: rendered as a truncated, italic snippet appended under the email/phone in the first cell — same visual pattern already used for the optional phone number. Truncated via CSS (`text-overflow: ellipsis`, single line, constrained max-width) with the full text available via the `title` attribute on hover. Omitted entirely when message is blank.

No new columns are added to the table structure — both new pieces of info are folded into existing cells to avoid widening an already-dense table, per the approved Option A.

## Testing / rollout

1. Apply the schema migration to the **staging** Supabase project (`govvofbrhhpowtdnuzcw`) via MCP or manual SQL Editor paste, and commit `supabase/connect-submissions-topic-message-schema.sql` in the same session.
2. Implement the three code changes above, verify locally by reading the deployed staging HTML/JS (per this repo's testing-limitation note — no admin credentials available to Claude) and by inserting a test row via SQL if needed to confirm the admin view renders topic/message correctly.
3. Push to `staging` remote, spot-check the live staging Connect page and admin dashboard.
4. Do not apply to production (schema or code) until Scott explicitly approves, per the standing deployment rule.
