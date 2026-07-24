# Profile Avatar — Design

**Date:** 2026-07-24
**Status:** Approved by Scott (pending final spec review)

## Purpose

Add a profile picture to member accounts, shown as an avatar (photo or
initials) in place of the current login/profile controls — on the public
site nav and in the admin dashboard topbar — matching the pattern shown in
a reference screenshot of another church's site (avatar replaces "Sign In"
once logged in). Along the way, fix a real discoverability problem: admins
currently have two separate, half-working profile entry points in the
dashboard topbar (a password-only modal, and a small text link), neither
of which makes it obvious that `my-profile.html` is where they'd retake
the spiritual gifts / personality assessments.

## Decisions Made (with user)

- **Scope:** avatar replaces login/profile controls on *both* the public
  site (all 8 marketing pages) and the admin dashboard topbar.
- **Admin dashboard consolidation:** the existing circular icon button
  (opens a password-only modal) and the separate "My Profile" text link
  are both removed, replaced by one avatar linking to `my-profile.html`.
  The old password-only modal (`profileModal`/`openProfileModal`/
  `closeProfileModal`/`saveProfilePassword`) is deleted — `my-profile.html`
  already has an equivalent "Change Password" card, so nothing is lost.
- **Image storage:** no Supabase Storage bucket — follows the codebase's
  existing pattern (group/event photos) of client-side resize + JPEG
  compression into a data URL stored directly in a text column. Avatars
  are deliberately smaller (160×160) than group photos since they load on
  every public page for a logged-in user.
- **Upload UX:** file upload only (no AI-generate or paste-URL tabs, since
  this is a personal photo) with automatic center-crop to a square — no
  interactive cropping tool, to avoid a new library dependency.
- **Routing:** clicking the avatar goes to `my-profile.html` for members,
  or `admin/dashboard.html` for staff — reusing the existing staff/member
  distinction already used elsewhere (a `user_roles` row means staff).

## Data Model

`member_profiles` gains one nullable column: `avatar_url` (text — holds a
data URL, or null). No RLS changes — the existing "own profile update"
policy already covers a member changing their own `avatar_url`, and
"admin all profiles" already covers admin access.

## Avatar Component

A shared rendering helper: given a profile (or nothing, for a not-yet-
provisioned staff account) it renders either the photo (if `avatar_url`
is set) or a solid brand-gold circle with 1–2 initials derived from the
person's name (falling back to the first letter of their email's local
part if no `member_profiles` row exists yet). If neither name nor email
is available, falls back to the existing generic person-icon glyph
already used in the admin dashboard today.

## Where It Appears

- **All 8 public pages** (`index.html`, `about.html`, `events.html`,
  `small-groups.html`, `prayer.html`, `sermons.html`, `give.html`,
  `lead-a-group.html`): the existing "Login" button/link in both desktop
  and mobile nav is replaced with the avatar once a session is detected.
  Not logged in → completely unchanged (plain "Login" link as today).
  `give.html` does not currently load `js/supabase-client.js`/`js/db.js`
  (the other 7 pages do) — those two script tags are added to it as part
  of this work.
- **Admin dashboard topbar**: the existing icon button + "My Profile" text
  link are replaced by one avatar linking to `my-profile.html`.
- **`my-profile.html`**: gains a "Profile Photo" card — file picker,
  live preview after auto-crop/resize/compress, "Save Photo" button,
  "Remove Photo" link (clears `avatar_url` back to null).

## Upload Flow

Selecting a file: read it client-side, center-crop to a square (matching
the shorter dimension), resize to 160×160px, compress to JPEG (~80%
quality, same `canvas.toDataURL` technique already used for group
images) — shown as a live preview before saving. "Save Photo" writes the
resulting data URL to `member_profiles.avatar_url`. "Remove Photo" sets
it back to null. No separate file-size validation needed — the fixed
160×160 output size caps the result regardless of input size.

## Edge Cases

- No session → public nav's plain Login link, unchanged.
- Session exists but no `member_profiles` row yet (staff who's never
  visited `my-profile.html`) → initials avatar falls back to the first
  letter of the auth email's local part; the profile row is still created
  lazily on first `my-profile.html` visit, same as today.
- Neither name nor email resolvable → generic person-icon glyph.

## Testing

Manual checklist: upload a photo on `my-profile.html`, confirm it appears
on a public page's nav after reload and (if staff) in the admin topbar;
remove the photo, confirm reversion to initials everywhere; log out,
confirm all 8 public pages show the plain Login link again; specifically
verify `give.html` still works correctly after gaining the two new script
tags; confirm the admin dashboard's old password-only modal is fully gone
and password change still works via `my-profile.html`.

## Rollout

Staging first, manual walkthrough across a few public pages plus the
admin dashboard, then staging → production per the standard flow.
