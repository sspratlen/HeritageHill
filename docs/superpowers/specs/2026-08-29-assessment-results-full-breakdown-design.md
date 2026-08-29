# Assessment Results Full Breakdown Design Spec

## Purpose

DISC and Spiritual Gifts assessment results currently only surface the person's top result: DISC shows the 2-letter blend (e.g. "DI") with its own description, and Spiritual Gifts shows only the top 3 (or more, on a tie) gift names with descriptions. Everything else — the other 2 DISC letters, the other ~21 spiritual gifts — is invisible, even though full descriptive content for all of it already exists in `assessment_content`. This adds a way to see every letter/gift and read what it means, without losing the "here's your actual result" framing. It's available both to church staff viewing a member (`admin/member-dashboard.html`) and to the person who took the test themselves (`admin/my-profile.html`).

## Confirmed Decisions (from brainstorming)

- Interaction pattern: inline accordion. Clicking a DISC letter or a spiritual gift expands its description directly beneath it, in place — no popups/modals.
- The letter(s)/gift(s) that make up the person's actual result start pre-expanded when the page loads; everything else starts collapsed but still visible and clickable.
- One shared rendering implementation, used identically by both `admin/member-dashboard.html` (staff view) and `admin/my-profile.html` (self view) — not two separate implementations that can drift.
- No backend or content changes: `assessment_content` already has full text for all 4 DISC letters, all 12 two-letter blends, and all 24 spiritual gifts (`supabase/assessments-content-template.sql` confirms every code already has a row).

## Where This Lives

`js/member-dashboard.js` already holds the `MemberDashboard` object — the shared rendering module both `admin/member-dashboard.html` and `admin/my-profile.html` already load and use for Growth Track progress and group history. Two new methods are added there:

```
MemberDashboard.renderDiscResult(containerEl, attempt, discBlends)
MemberDashboard.renderGiftsResult(containerEl, attempt, gifts)
```

- `attempt` is the latest assessment attempt for that person (`{ result, scores, completedAt }`, as already returned by `SupaDB.getMyAttempts()` / already available via `_allAttempts` in the admin view) — or `null`/`undefined` if they haven't taken it.
- `discBlends` is `_content.discBlends` (all 16 `disc_blend` rows: 4 single-letter + 12 two-letter, from `Assessments.splitContent`) — already loaded by both pages today.
- `gifts` is `_content.gifts` (all 24 `gift` rows) — already loaded by both pages today.

Both existing call sites are updated to call these instead of building their own markup:

- `admin/my-profile.html`'s `renderResult('disc', ...)` / `renderResult('gifts', ...)` branches (currently building the top-result-only markup directly) call the new shared methods instead.
- `admin/member-dashboard.html`'s `loadCurrentMember()` (currently setting `mdDisc.innerHTML` / `mdGifts.innerHTML` to a plain scores list with no descriptions at all) calls the new shared methods instead.

No other part of either page changes — the "not taken yet" empty state, the CTA links, the Growth Track/group history sections, and (on the admin page) the `mdMinistries` recommended-ministries badges are untouched.

## Rendering Behavior

### DISC (`renderDiscResult`)

If `attempt` is falsy, render the existing "Not taken yet." / no-op behavior (matching each page's current empty state — see Integration below for the small per-page difference here).

Otherwise:

1. Show the result badge and score bars exactly as today (`attempt.result`, e.g. "DI"; a bar per D/I/S/C from `attempt.scores`).
2. Show the person's blend-specific description: look up `discBlends` by `attempt.result` (the full 2-letter code, e.g. "DI"); if not found, fall back to the single first letter (matching today's existing fallback behavior in `my-profile.html`). This paragraph captures the nuance of the specific combination and is display-only — it is not one of the accordion rows.
3. Render 4 accordion rows, one per letter in a fixed `D, I, S, C` order (not sorted by score — DISC always shows all 4 in the same book-standard order regardless of result). Each row:
   - Shows the letter and its score bar (reusing the existing bar visual).
   - Is marked as the person's result if that letter appears in `attempt.result` (e.g. both D and I are marked when the result is "DI").
   - Starts expanded if marked as the person's result; collapsed otherwise.
   - When expanded, shows that single letter's `discBlends` entry (`code === 'D'`, etc.) — its own dedicated description, distinct from the combined blend paragraph in step 2.
4. `Taken <date>` / attempt-count footer, unchanged from today.

### Spiritual Gifts (`renderGiftsResult`)

If `attempt` is falsy, render the existing "Not taken yet." / no-op behavior.

Otherwise:

1. Parse `attempt.result` (JSON array of gift names) the same way both pages already do today, with the same try/catch fallback to "Could not display this result." on malformed data.
2. Render all 24 `gifts` rows, sorted by that person's score for each gift's `code` (`attempt.scores[g.code]`, descending) — so the highest-scoring gifts (which includes, but isn't limited to, the official top result) surface near the top even before anything is expanded. Ties keep `assessment_content`'s existing `sort` order as a stable tiebreak.
3. Each row:
   - Shows the gift's name (`g.extra.name`).
   - Is marked as the person's result if `g.extra.name` appears in the parsed `attempt.result` array.
   - Starts expanded if marked as the person's result; collapsed otherwise.
   - When expanded, shows `g.text` (description), `g.extra.scriptures`, and `g.extra.ministries` (joined list, only if non-empty) — the same three pieces of information already shown for top gifts today, just now available for every gift.
4. `Taken <date>` / attempt-count footer, unchanged from today.

## Accordion Implementation

Each row/detail pair is self-contained — no global toggle function, no per-row IDs, no shared state to manage. The row's `onclick` directly toggles its own next sibling's visibility and flips a chevron character, entirely inline:

```html
<div onclick="const d=this.nextElementSibling; const open=d.style.display==='none'; d.style.display=open?'':'none'; this.querySelector('.acc-chevron').textContent=open?'▲':'▼';">
  ...row content... <span class="acc-chevron">▼</span>
</div>
<div style="display:none;">...description...</div>
```

This matches the codebase's existing convention of inline `onclick` handlers (used throughout `admin/dashboard.html`) rather than introducing a new event-delegation or component pattern. Rows pre-expanded on load are rendered with the detail's initial `display` and the chevron's initial character already set to the open state, rather than expanded via a follow-up script pass.

All structural styling (borders, spacing, background highlight for the marked/result rows) is inline `style=`, using the CSS custom properties already defined identically in both `css/portal.css` and `admin/dashboard.html`'s own `<style>` block (`--primary`, `--text-muted`, `--border`, `--radius`) — confirmed present in both files, so no new CSS file changes are needed and the accordion renders consistently on both pages.

## Integration Notes

- `admin/my-profile.html`: the existing `renderResult(type, attempts)` function currently has both the "no attempts yet" early return and the markup-building logic inline together. The markup-building parts (once `latest` is known) are replaced with calls to the new `MemberDashboard.renderDiscResult` / `renderGiftsResult`, passing `_content.discBlends` / `_content.gifts` (already loaded there via `Assessments.splitContent`). The "no attempts yet" early return and the `cta.textContent = 'Retake'` line are unchanged.
- `admin/member-dashboard.html`: `loadCurrentMember()`'s `mdDisc.innerHTML = ...` / `mdGifts.innerHTML = ...` ternaries are replaced with calls to the same two shared methods (passing `_content.discBlends` / `_content.gifts`, already loaded there today), keeping the existing `'<p style="color:var(--text-muted);">Not taken yet.</p>'` fallback for the `!d` / `!g` case exactly as today (the shared method is simply not called in that case, matching the existing early-return-style branching already used at each call site).
- `mdMinistries` (admin-only recommended-ministries badges, derived from the gifts result) is unrelated to this display change and is left exactly as-is.

## Error Handling

- Malformed/non-array `attempt.result` JSON for gifts: identical fallback to today (`Could not display this result.`), now living inside the shared function instead of being duplicated in both pages.
- A `discBlends`/`gifts` content row missing for some code (e.g. content not yet fully authored): that row's expand still works structurally, showing an empty description area rather than throwing — matches this codebase's general tolerance for missing/blank content over hard failures.

## Out of Scope (YAGNI)

- No changes to `js/assessments.js` scoring logic (`scoreDisc`, `scoreGifts`) — this only changes how already-computed results are displayed.
- No changes to `assessment_content` data or schema — all needed text already exists.
- No new admin UI for managing/editing assessment content.
- No changes to the assessment-taking flow itself (`test-personality.html`, `test-gifts.html`).
- No changes to `mdMinistries`' recommended-ministries feature on the admin page.
