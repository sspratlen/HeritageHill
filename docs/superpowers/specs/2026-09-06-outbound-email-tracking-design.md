# Outbound Email Delivery Tracking Design Spec

## Purpose

"Email Group" and "Email All Leaders" currently send and forget — there's no record of who a send went to, whether it was delivered, or whether anyone opened it. This showed up as a real problem: an admin's email to all leaders was actually delivered, but landed in one leader's Gmail Promotions tab, and there was no way to confirm delivery without asking around. This adds delivery/open tracking (via Resend, which already sends these emails) plus a persisted send history, so admins and leaders can check "did this actually reach people" themselves.

## Confirmed Decisions (from brainstorming)

- Scope: only the leader-communication emails sent via `send-group-email` ("Email Group" and "Email All Leaders"). Congregation-wide broadcast email (prayer requests, announcements, events) stays on Mailchimp — that's already the right tool for that and is out of scope here.
- Tracking goes through **Resend's** existing delivery/open webhooks — not Mailchimp. Mailchimp campaigns would require duplicating the whole membership into a Mailchimp audience and are inherently more "mailing-list-shaped," which cuts against the Promotions-tab fix already shipped.
- The data model uses a generic `context` field (`small_group` for now) rather than being hardcoded to groups, so if Staff or Impact Team leader communication gets built later, it can reuse the same tracking tables and admin view instead of a rebuild. Building tracking for Staff/Impact Teams themselves is explicitly out of scope — those features don't exist yet.
- Visibility: admins see every send, across every group and leader. A leader sees only sends made for the group(s) they lead. (Leaders never send "Email All Leaders" — that's already admin-only — so a leader's visibility is simply "sends where `group_id` is one of my groups.")
- "Delivered" and "bounced/complained" are reliable, Resend-confirmed facts. "Opened" is a directional signal only (tracking-pixel limitations apply industry-wide, not specific to this setup) — the UI will label it as such, not overstate certainty.
- One manual step required: creating a webhook endpoint in the Resend dashboard pointing at the new receiver function, and adding the `RESEND_WEBHOOK_SECRET` it generates to Supabase. This spec cannot do that step — talked through separately when we get to it.

## Data Model

Two new tables, named generically per the `context` decision above:

### `outbound_email_sends` — one row per "Email Group" / "Email All Leaders" click

```
id            bigint identity primary key
created_at    timestamptz not null default now()
sent_by       text not null        -- sender's email
context       text not null        -- 'small_group' today; future values reuse this table
group_id      bigint null          -- references groups.id; null for "Email All Leaders"
subject       text not null
```

### `outbound_email_recipients` — one row per recipient of a send

```
id                bigint identity primary key
send_id           bigint not null references outbound_email_sends(id) on delete cascade
email             text not null
resend_email_id   text null        -- Resend's id for this specific message, set right after sending
status            text not null default 'pending'  -- pending | delivered | opened | bounced | complained
status_updated_at timestamptz null
```

No separate event-log table — a recipient's `status` is just the single most-informative status seen so far (see "Status Ranking" below), not a full history of every event. That's simpler and matches what the UI actually needs to show ("did they get it," not a timeline).

### RLS

Reuses the `public.is_admin()` and `public.jwt_email()` helper functions already defined in `supabase/assessments-schema.sql` (the same pattern `assessment_attempts`' "leader shared attempts" policy already uses) rather than inventing a new role-check mechanism:

- `outbound_email_sends` — `select` allowed when `is_admin()`, or `group_id` is one of the groups where `lower(leader_email) = jwt_email()`. `insert` allowed for any authenticated user (matches this codebase's broad-authenticated-insert convention for other admin-adjacent write tables); there's no `update`/`delete` policy — sends are immutable history.
- `outbound_email_recipients` — `select` allowed when the parent `outbound_email_sends` row (matched by `send_id`) satisfies the same visibility rule above. `insert` allowed for any authenticated user (the client creates `pending` rows right after sending). No `update`/`delete` policy for authenticated users — recipient status is only ever changed by the webhook receiver, which runs with the Supabase **service role key** (bypasses RLS entirely, since Resend's webhook call has no user session to authenticate as). This is the first Edge Function in this codebase to use the service-role key rather than the anon key + user JWT pattern every other function uses — necessary here because there is no logged-in user on a server-to-server webhook call.

## Send Flow (client + `send-group-email`)

`send-group-email` already returns `{ok: true, sent}` on success. It's extended to also return each recipient's Resend message id, since Resend's batch API returns one `id` per message **in the same order as the request array** (confirmed via Resend's API docs) — so the function zips its `valid` recipients array with the batch response's `data[]` array, per chunk, and returns:

```json
{ "ok": true, "sent": 3, "results": [
  { "email": "a@example.com", "resendId": "ae2014de-..." },
  { "email": "b@example.com", "resendId": "faccb7a5-..." }
] }
```

The client (`sendGroupEmail()` in `admin/dashboard.html`, used by both the per-group "Email Group" modal and the admin-only "Email All Leaders" modal) already knows `_groupEmailGroupId` (the specific group's id, or `null` for "Email All Leaders") and the sender's email. After a successful send, it calls a new `SupaDB.adminSaveOutboundEmailSend({ subject, context: 'small_group', groupId, sentBy, results })`, which inserts one `outbound_email_sends` row and one `outbound_email_recipients` row per result (`resendId` from the response, `status: 'pending'`).

If this save fails, the send itself has already succeeded (the email is already gone) — the failure is surfaced as a toast ("Email sent, but couldn't save to history") rather than treated as a send failure, since retrying the whole send would double-email everyone.

## Webhook Receiver (`resend-webhook` Edge Function)

A new, small Edge Function that Resend calls automatically whenever any tracked email's status changes:

1. Reads the raw request body (required — signature verification needs the exact bytes, not a re-serialized parse).
2. Verifies the `svix-id`/`svix-timestamp`/`svix-signature` headers against `RESEND_WEBHOOK_SECRET` using the `svix` npm package (imported via `esm.sh`, the same import style this codebase already uses for `@supabase/supabase-js`). Rejects with 400 on a bad signature.
3. Reads `event.type` and `event.data.email_id`.
4. Because this webhook endpoint is account-wide in Resend (not scoped to just group emails — every Resend send in this project, including retreat confirmations and contact-form notifications, will trigger it), the handler looks up `outbound_email_recipients` by `resend_email_id`. If no row matches, it's an event for an email type this feature doesn't track — return 200 and do nothing, not an error.
5. If a row matches, update its `status` — but only "upward," using a fixed rank, so a late-arriving lower-rank event (e.g. a delayed `delivered` webhook arriving after `opened` already came in) never downgrades what's shown:

   | Event type | Rank | Maps to status |
   |---|---|---|
   | `email.bounced` | 3 | `bounced` |
   | `email.complained` | 3 | `complained` |
   | `email.opened` | 2 | `opened` |
   | `email.delivered` | 1 | `delivered` |
   | (initial row state) | 0 | `pending` |

   Event types not in this table (`email.sent`, `email.clicked`, etc.) are ignored — they don't change what's shown to the admin.
6. Uses the Supabase service-role client to perform the update (see RLS section above for why).

## Admin/Leader UI: Email History

A new "Email History" button in the Small Groups tab's action bar (`admin/dashboard.html`, next to the existing "Email All Leaders"/"Add Group" buttons) — visible to **both** admins and leaders, unlike "Email All Leaders" which stays admin-only. Opens a modal listing past sends (newest first), each row showing subject, date, sender, and recipient count, expandable (same self-toggling inline-accordion pattern already used elsewhere in this file, e.g. the Growth Track cancellation history and the Assessment Analytics report history) to show a per-recipient table: email address and a status pill (Pending / Delivered / Opened / Bounced / Complained), color-coded (bounced/complained in red, opened in green, delivered in neutral, pending in grey).

Data comes from a new `SupaDB.getVisibleOutboundEmailSends()` — a single query against `outbound_email_sends` with an embedded `outbound_email_recipients(*)` select (Supabase's nested-resource syntax), relying entirely on RLS to scope results correctly per the caller's role — no client-side role branching needed, matching how other RLS-scoped list views in this app already work.

A small note near the "Opened" column header in the UI: "Opens are tracked but not guaranteed — some email apps block the tracking image" — so nobody mistakes a blank "Opened" for proof nobody read it.

## Error Handling

- Webhook signature verification failure: reject with 400, log server-side, do not touch the database. (Prevents a forged webhook from marking arbitrary emails as delivered/opened.)
- Webhook event for an untracked email (`resend_email_id` not found): no-op, 200 response — expected and frequent, since this webhook endpoint will also receive events for every other Resend-sent email type in this project.
- `send-group-email` itself: unchanged from today — a Resend batch failure still aborts and surfaces an error to the sender before any history row is written (nothing to mark as "sent" if the send actually failed).
- History-save failure after a successful send: toast-only warning, does not imply the email wasn't sent (see Send Flow above).
- Recipient list showing all-`pending` for a while after sending: expected — webhook events arrive asynchronously, typically within seconds to a couple of minutes, not instantly.

## Out of Scope (YAGNI)

- No tracking for the other Resend-sent email types (retreat confirmations, leader-approval notices, contact form) — scoped decision, see Confirmed Decisions.
- No tracking/UI for Staff or Impact Team communications — those features don't exist yet; the `context` field just avoids a schema rebuild when they do.
- No full event-history/timeline per recipient (e.g. "opened 3 times") — only the single highest-rank status, per the Data Model section.
- No retry/resend-to-bounced-addresses feature — the admin can already re-open "Email Group" and manually adjust the To field if needed.
- No changes to Mailchimp-based congregation email (prayer requests, announcements, events).
