# Growth Track Cancellation Notice Design Spec

## Purpose

When an admin cancels a specific Growth Track occurrence that already has registrants, those registrants currently receive no notice at all — they'd simply show up to a class that isn't happening. This adds a review-before-send email flow: cancelling an occurrence with registrants immediately opens a pre-filled compose modal so the admin can send (or edit, or skip) an apology email that also encourages registering for the next available occurrence of that same part.

A related but separate deliverable: a new Mailchimp-importable HTML template (`email-templates/growth-track-cancellation.html`), matching the existing template library's conventions, for cases where the admin wants to announce a cancellation more broadly via Mailchimp rather than just to the specific registrants. This template is not wired into any app code — it's a standalone asset for the admin's Mailchimp account.

## Confirmed Decisions (from brainstorming)

- Delivery goes through the existing `send-group-email` Edge Function (Resend-backed, already used by the "Email Group" admin feature) — not a Mailchimp campaign. Growth Track registrants aren't necessarily Mailchimp audience members, and this is a targeted notice to a specific handful of people, not a broadcast.
- The admin reviews and explicitly sends the email via a pre-filled compose modal — it is never sent automatically.
- Cancelling the occurrence takes effect immediately when "Cancel" is clicked, independent of the email. The compose modal opens as an immediate follow-up step; closing it without sending leaves the cancellation in place.
- A new, standalone Mailchimp template file will also be created, matching the existing `email-templates/*.html` conventions, as a separate deliverable for the admin's broader Mailchimp use.

## Data Model

No schema changes. This feature only reads existing data (`growth_track_parts`, `growth_track_registrations`, `growth_track_cancellations`) and sends email via the existing `send-group-email` function. No new Edge Function, no new table, no new SupaDB methods beyond what Task 2 of the recurring-schedule feature already added.

## Trigger & Flow

In `admin/dashboard.html`, `toggleGtOccurrence(part, sessionDate, shouldCancel)` (added by the Growth Track recurring-schedule feature) is extended:

1. Call `SupaDB.adminCancelGrowthTrackOccurrence(part, sessionDate)` / `adminReinstateGrowthTrackOccurrence` exactly as today — this behavior is unchanged.
2. On a successful **cancel** (not reinstate), fetch that part's registrations via the already-existing `SupaDB.adminGetGrowthTrackRegistrations(part)` and filter client-side to `r.sessionDate === sessionDate` (the same filtering pattern already used by the Registrants roster).
3. If that filtered list is non-empty, open the new compose modal (`openGtCancelEmailModal(part, sessionDate, matchingRegistrants)`) pre-filled as described below.
4. If the registrants fetch fails, fail open: the cancellation has already succeeded, so simply skip opening the modal (log the error via `console.error`, matching this codebase's established fail-open pattern for secondary data). The admin can still email affected registrants manually via "Email Group"-style tools if needed.
5. `renderGrowthTrackTab()` still re-renders after the toggle exactly as it does today, regardless of whether the modal opens.

## Compose Modal

A new modal, `gtCancelEmailModal`, added to `admin/dashboard.html` near the existing `groupEmailModal`. It is a separate modal (not a reuse of `groupEmailModal`) because that modal's JS is wired to group-leader-specific sender resolution (`resolveGroupEmailFrom`-type logic keyed to a specific group's leader) that doesn't apply here — Growth Track cancellation notices always come from a fixed "Heritage Hill Church" sender.

Structure (mirrors `groupEmailModal`'s UI pattern):

- **From** — static text: `Heritage Hill Church <noreply@heritagehill.church>` (no per-send configuration; there's no natural single point of contact stored on a Growth Track part).
- **To** — a textarea (`gtCancelEmailTo`), pre-filled with the affected registrants' emails, one per line. Editable, same as the existing group-email "To" field, so the admin can add or remove someone before sending.
- **Subject** — a text input (`gtCancelEmailSubject`), pre-filled (see Content below). Editable.
- **Message** — a Quill rich-text editor (`gtCancelEmailEditor`, backed by a new `_gtCancelEmailQuill` instance), pre-filled with HTML content (see Content below). Editable.
- **Footer** — a recipient count (e.g. "2 recipients"), a "Cancel" button (`closeGtCancelEmailModal()` — closes without sending; the occurrence stays cancelled), and a "Send Email" button (`sendGtCancelEmail()`).

## Content Generation

When `openGtCancelEmailModal(part, sessionDate, registrants)` runs:

1. Look up the part's title via `_gtPartsAdmin` (fallback to `GT_LABELS[part]`, matching the existing fallback pattern used elsewhere in this file).
2. Format the cancelled date the same way occurrence dates are already formatted elsewhere in this tab: `new Date(sessionDate+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})` (short form, e.g. "Sep 6, 2026") for the subject line, and the fuller `'en-US',{month:'long',day:'numeric',year:'numeric'}` form (e.g. "September 6, 2026") for the email body, for warmer prose.
3. Compute the **next upcoming, non-cancelled** occurrence of this same part to suggest:
   - Call `computeGrowthTrackOccurrences(p.sundayOfMonth, 12)` (a wider window than the 6 shown in the admin card, to make it very unlikely no candidate is found even if several consecutive months are cancelled).
   - Filter out any date present in `_gtCancellationsAdmin` for this part (which, at this point, already includes the occurrence that was just cancelled, since `renderGrowthTrackTab`'s cancellation re-fetch happens as part of the same toggle flow — but content generation for the modal happens before that re-render completes, so explicitly exclude `sessionDate` itself in addition to checking `_gtCancellationsAdmin`, to avoid a race where the just-cancelled date hasn't hit `_gtCancellationsAdmin` yet).
   - Take the first remaining date, if any.
4. Build the subject: `` `${title} — ${shortDate} Session Cancelled` ``.
5. Build the HTML body (assigned into the Quill editor via `.root.innerHTML = ...` after initialization, matching how `groupEmailModal`'s Quill instance is populated elsewhere in this file):
   - An opening line addressed generically (no per-recipient name merge — this modal sends the same body to everyone in one edit pass, unlike Mailchimp merge tags; personalizing by name isn't necessary for a short operational notice and would add complexity for a one-off admin email that already lets the admin freely edit the text).
   - A sentence naming the part and the cancelled date, apologizing plainly.
   - If a next occurrence date was found: a sentence encouraging registration for that date, with a link to `https://heritagehill.church/growth-track.html`.
   - If no next occurrence was found: a sentence encouraging the recipient to check `https://heritagehill.church/growth-track.html` for upcoming dates.
   - A simple sign-off ("— Heritage Hill Church").
   - This body is intentionally plain HTML (paragraphs, one link) — `send-group-email` already wraps whatever HTML it's given in its own light branded shell (sender line + minimal footer), so the compose body itself should not duplicate a full header/footer/card structure the way the Mailchimp template does.

Example generated body (as HTML fed into Quill):

```html
<p>Hi there,</p>
<p>We're sorry to let you know that the <strong>About Us</strong> session on <strong>September 6, 2026</strong> has been cancelled.</p>
<p>We'd love to have you join us for the next one — <strong>November 1, 2026</strong>. You can register at <a href="https://heritagehill.church/growth-track.html">heritagehill.church/growth-track.html</a>.</p>
<p>Sorry for the inconvenience, and we hope to see you soon!</p>
<p>— Heritage Hill Church</p>
```

## Sending

`sendGtCancelEmail()`:

1. Read `subject`, the Quill editor's `.root.innerHTML` as `htmlBody`, and parse `gtCancelEmailTo`'s textarea the same way `sendGroupEmail()` already parses `groupEmailTo` (split on newlines/commas, trim, filter to strings containing `@`).
2. Validate the same way `sendGroupEmail()` does: recipients non-empty, subject non-empty, body non-empty/non-blank-Quill-output. Show the same inline error pattern (`gtCancelEmailError`) on failure.
3. POST to `SUPABASE_URL + '/functions/v1/send-group-email'` with `{ subject, htmlBody, recipients, fromName: 'Heritage Hill Church', fromEmail: 'noreply@heritagehill.church', replyTo: '' }` — the same endpoint and contract `sendGroupEmail()` already uses, so no Edge Function changes are needed.
4. On success: close the modal, show a toast (e.g. "Email sent to N registrants ✓", matching `sendGroupEmail`'s toast wording pattern).
5. On failure: show the error inline in the modal (matching `sendGroupEmail`'s error handling) so the admin can retry without having to re-open the modal or re-enter anything.

## Error Handling

- Registrants fetch failure when opening the toggle flow: fail open (cancellation stands, modal simply doesn't open, error logged to console) — consistent with this codebase's established pattern for secondary/non-critical data.
- Email send failure: surfaced inline in the modal (not a fail-open — the admin explicitly asked to send, so a failure should be visible and retryable), matching the existing `groupEmailError` UX.
- No next-occurrence found: content generation degrades gracefully to a generic "check the Growth Track page" call to action rather than blocking the modal from opening.

## Mailchimp Template Deliverable

A new file, `email-templates/growth-track-cancellation.html`, following the exact structural conventions of the existing three templates in that directory (`announcements.html`, `event-newsletter.html`, `prayer-requests.html`):

- Table-based layout for email client compatibility, `#F0EDE8` page background, `#0D0F14` dark header bar with the Heritage Hill logo image.
- `mc:edit` named regions for each editable piece of copy (e.g. `hero_heading`, `cancellation_body`, `next_date`, `cta_button`), so the admin can customize per-send in Mailchimp's template editor without touching raw HTML.
- Footer with `*|UNSUB|*` and `*|UPDATE_PROFILE|*` merge tags, matching the existing templates' footer exactly.
- Content defaults describe a generic "a class session has been cancelled, here's the next date" message, since this template is for the admin's manual/broader use, not tied to any specific part or date at authoring time.
- This file is purely a static asset for import into Mailchimp's template library. It is not referenced, generated, or read by any application code, and has no bearing on the in-app compose-modal flow described above.

## Out of Scope (YAGNI)

- No per-recipient name personalization in the compose-modal email (no `*|FNAME|*`-style merge in the Resend send path) — the admin can hand-edit the greeting if desired for a small list.
- No automatic sending — every send in the compose-modal flow is an explicit admin action.
- No wiring of the new Mailchimp template into any automated send path; it's a manual-import asset only.
- No changes to the cancel/reinstate toggle's core behavior, to `growth_track_registrations`, or to any existing Growth Track recurring-schedule functionality — this spec only adds a notification step after an existing action.
