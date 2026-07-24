# Bulk Member Registration (Leaders & Attendees) — Design

**Date:** 2026-07-23
**Status:** Approved by Scott (pending final spec review)

## Purpose

Auto-register existing small group leaders and attendees as site members
(auth account + `member_profiles` row), auto-filling name/email/phone/group
from data already on file — both as a one-time bulk action for people who
exist today, and going forward whenever a leader or roster member is added.

## Decisions Made (with user)

- **Scope:** both — a one-time bulk pass over current data, plus ongoing
  auto-provisioning wired into the group-editing and roster-add flows.
- **Approval status:** created accounts start `status = 'approved'`
  immediately (not the pending queue used for public self-registration) —
  these are known people the church already has a relationship with.
- **Notification:** none. No email is sent. Accounts get the standard
  `HHTemp!` temp password (same convention as staff accounts); Scott will
  communicate access separately.
- **No RLS changes needed:** `member_profiles` already has an "admin all
  profiles" policy (`is_admin()`, covers insert) — an admin session can
  insert a profile row for any `user_id` directly. Only auth-account
  creation needs the existing `admin-create-user` edge function; it is not
  modified.

## Critical Safety Rule: Dedup Before Any Account Action

`admin-create-user`'s existing behavior is "create OR reset password" —
calling it for an email that already has an auth account resets that
person's password to `HHTemp!`, silently, with no notification (per the
decision above). For staff-initiated single resets this is intentional and
fine. For a bulk operation touching many people, it would be destructive if
applied to someone who already self-registered and set their own password.

**Mitigation:** before calling the edge function for anyone, check whether
their (lowercased) email already matches a row in `member_profiles` or
`user_roles`. If it does, skip them entirely — they already have an
account, no action taken, existing profile/password untouched. The edge
function is only ever called for emails confirmed to have neither.

## Candidate Sourcing & Dedup

Two sources, combined into one candidate list before any processing:

- **Leaders:** `groups.leader` / `groups.leader_email`, one candidate per
  group with a non-blank `leader_email`.
- **Attendees:** current `group_memberships` rows (`left_at is null`).

Combined list is deduped by lowercased email. If the same email appears as
both a leader and an attendee (or leads multiple groups), one account is
created; the assigned `group_id` prefers a led group over an attended one,
and the first match (by group id) when there's more than one of the same
kind. This is a reasonable default since `group_id` is just the member's
editable "current group" quick-pick field on their own profile — not a
permanent record.

## Flow

**One-time bulk action:** a "Register Leaders & Attendees" button (Members
tab) builds the candidate list, dedupes against existing `member_profiles`/
`user_roles`, then for each remaining candidate: calls `admin-create-user`
to get-or-create their auth account, then inserts their `member_profiles`
row (`status: 'approved'`, name/email/phone/group_id from the source
record) via the existing admin RLS policy. Reports a summary: created /
already had accounts / failed (with per-person reason on failure), and
continues past individual failures rather than aborting the batch.

**Ongoing (going forward):** the same create-if-new logic (dedup check →
edge function → profile insert) is called from:
- `saveGroup`, when the group's `leader_email` is set or changed.
- `adminAddGroupMember`, the existing Groups tab roster Add Member flow.

Both call sites already run in an admin session, so the same RLS path
applies without any changes.

## Edge Cases

- A group with a blank `leader_email` contributes no leader candidate.
- Someone already covered by an existing `member_profiles` or `user_roles`
  row is always skipped, in both the bulk run and the ongoing hooks —
  running the bulk action twice is safe and idempotent (second run reports
  everyone as "already had accounts").
- Per-person failures (e.g. a transient edge-function error) don't abort
  the batch; the summary lists them separately.

## Testing

Manual checklist: bulk run creates approved accounts for current leaders/
attendees with correct name/email/phone/group; re-running immediately
creates nothing new; a person who self-registered before the bulk run is
skipped, profile/password untouched; adding a new person to a group roster
afterward auto-creates their account; changing a group's leader to a new
email auto-creates that account too.

## Rollout

Staging first; Scott runs the bulk action once on staging data, reviews
the summary and a few resulting profiles, then staging → production per
the standard flow.
