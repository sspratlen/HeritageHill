# Admin-Entered Assessment Results Design Spec

## Purpose

Let an admin record a DISC or Spiritual Gifts assessment result on behalf of someone else — the concrete case being a stack of paper test copies from an event, for people who already have a website account. The recorded result must behave identically everywhere a self-taken result already does (the person's own profile, admin analytics, journey milestones) — an admin-entered attempt is not a second-class or separately-tracked kind of record.

## Scope

- A new "Record Assessment" flow in the admin dashboard's Analytics tab, for admins only.
- Two entry modes, since paper copies vary in what they show: full per-question answers (auto-scored identically to the online quiz), or just a final result (no per-question breakdown).
- The target person must already have a website account (an `auth.users` row, findable via the existing `member_profiles` list) — no new-person creation flow is in scope here.

**Out of scope:**
- Recording a result for someone with no account. If this comes up later, the design would need to extend to the `people`/`person_id` backbone pattern used by newer features (Connect, chair-tag milestones); today's `assessment_attempts` table is `user_id`-only and this spec deliberately doesn't change that.
- Bulk/CSV import of many results at once — the "enter one, immediately ready for the next" flow covers a stack of paper copies without needing a file-upload pipeline.
- Any UI change to the self-serve quiz pages (`admin/test-personality.html`, `admin/test-gifts.html`) — those are untouched.
- Flagging/labeling an attempt as "admin-entered" vs. self-taken. Not requested; can be added later as a nullable column if it turns out to matter.

## Backend

### No schema or RLS changes

`assessment_attempts` already has an `"admin all attempts"` RLS policy (`for all ... using (is_admin()) with check (is_admin())`) with no constraint tying the row's `user_id` to the caller — an admin can already insert a row for any `user_id`. Nothing currently exercises that path; this spec adds the first caller that does.

### `SupaDB.adminAddAssessmentAttempt({ userId, assessmentType, answers, scores, result })`

Mirrors the existing self-serve `addAssessmentAttempt` almost exactly, with one difference: it takes an explicit `userId` (the target person) instead of reading `db().auth.getUser()` (the admin's own session).

```
insert into assessment_attempts (user_id, assessment_type, answers, scores, result)
values (userId, assessmentType, answers, scores, result)
```

Then, exactly like the self-serve path: look up that user's `people` row by `user_id` and call `recordMilestone(person.id, assessmentType === 'disc' ? 'assessment_disc_completed' : 'assessment_gifts_completed')` — so the admin-entered result is indistinguishable from a self-taken one anywhere the app already surfaces these milestones.

### Data shape per entry mode

- **Enter Answers mode**: `answers` and `scores` are real (the same `{questionId: value}` / `{D:.., I:.., S:.., C:..}` or per-gift-code totals shape the self-serve quiz already produces), computed via the existing `Assessments.scoreDisc`/`Assessments.scoreGifts` pure functions — no new scoring logic. `result` is the same shape those functions already return (a `"DI"`-style string for DISC, a `JSON.stringify`'d array of gift names for Gifts — matching `test-gifts.html`'s existing convention exactly).
- **Enter Result Directly mode**: `answers: {}` and `scores: {}` (valid empty JSONB, satisfying the `not null` constraint with no fabricated breakdown data). `result` is set directly from the admin's picks: the chosen `disc_blend` content row's `code` for DISC, or `JSON.stringify([...chosen gift names])` for Gifts — same on-disk shape as Enter Answers mode, so every downstream reader (profile view, analytics, journey pipeline) needs no mode-awareness at all.

### Person lookup

Reuses the existing `SupaDB.adminGetAllMemberProfiles()` (already fetched by the Analytics tab today) — no new query. The admin UI filters that in-memory list by name/email substring match; there is no server-side search endpoint to add.

## Admin UI

New "Record Assessment" button in the Analytics tab's action bar, matching the existing "Record Baptism" button's style, opening a `.modal.modal-full` (the same near-full-screen modal pattern used elsewhere in this file, e.g. the group/event details modals).

**Modal flow, top to bottom:**

1. **Person search** — a text input filtering the already-loaded member profile list by name or email as the admin types; matches render as a clickable list below the input. Selecting one shows a small "Recording for: {Name} ({email})" chip with a "Change" link that clears the selection and re-shows the search input.
2. **Assessment type** — two toggle buttons, DISC / Gifts, mutually exclusive.
3. **Entry mode** — two toggle buttons, "Enter Answers" / "Enter Result Directly", mutually exclusive, switching which form renders in step 4.
4. **Mode-specific form**:
   - *Enter Answers*: renders the full question list for the selected assessment type (from the already-loaded `assessment_content`, split via the existing `Assessments.splitContent` helper), same 1–5 (DISC) / 1–3 (Gifts) scale UI as the live quiz pages, with a running "X of Y answered" label. The Save button is disabled until every question has an answer.
   - *Enter Result Directly*: for DISC, a `<select>` populated from the `disc_blend` content rows (`code` + `extra.name`, e.g. "DI — Dominant/Influential"), one required choice. For Gifts, a checklist of all `gift` content rows (`code` + `extra.name`); at least one must be checked to enable Save.
5. **Save button** — disabled until a person is selected and the current mode's form is complete. On click, computes `answers`/`scores`/`result` per the rules above and calls `adminAddAssessmentAttempt`. On success: toast confirmation, then the modal resets to step 1 (person search cleared, type/mode selection kept as-is) so the admin can immediately enter the next paper copy without closing and reopening the modal. The Analytics tab's existing data (tables/charts) is refetched after each save so counts reflect the new attempt immediately.

**Error handling:**
- `adminAddAssessmentAttempt` failure (e.g. RLS/network issue): toast with the error, form stays populated so the admin can retry without re-entering everything.
- If the admin closes the modal mid-entry, nothing is saved — no draft/autosave, matching the fact this is a fast, supervised, one-sitting data-entry task rather than something done over multiple sessions.

## Testing Plan

- Manual: open Record Assessment, search and select a real member, enter DISC answers matching a known paper result, save, confirm the result matches what `Assessments.scoreDisc` would compute by hand for those answers.
- Manual: repeat for Gifts, confirming ties-at-third-place are preserved in the stored result exactly as the self-serve scoring function would produce.
- Manual: use Enter Result Directly for both types, confirm the saved `result` matches the picked blend/gifts and that `answers`/`scores` are empty objects, not null (would violate the `not null` DB constraint if mishandled).
- Manual: after saving, confirm the target person's own `my-profile.html` Growth Track / assessment card shows the new result exactly as it would for a self-taken one, and that the `assessment_disc_completed`/`assessment_gifts_completed` milestone is recorded for their `people` row.
- Manual: confirm the modal resets correctly after save and a second entry can be made immediately without reopening.
- Manual: confirm a non-admin staff role never sees the "Record Assessment" button (client-side `ROLE_TABS` gating already restricts the Analytics tab to admins) and that `adminAddAssessmentAttempt` is rejected server-side by RLS for a non-admin session.

## Out of Scope (YAGNI)

- No editing or deleting of an already-saved admin-entered attempt from this flow (the existing admin attempt-management, if any, is unaffected).
- No bulk/CSV import.
- No "who entered this" audit trail beyond what Postgres/Supabase logs already capture.
- No support for a person without an existing account.
