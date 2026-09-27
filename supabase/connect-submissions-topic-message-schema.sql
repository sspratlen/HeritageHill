-- ============================================================
-- Add Topic + Message fields to Connect card submissions.
-- See docs/superpowers/specs/2026-09-26-connect-topic-message-design.md
-- Safe to re-run (idempotent). Apply to staging (govvofbrhhpowtdnuzcw)
-- first; do not apply to production (ktyplbmawlaerzohkdqy) until
-- explicitly approved.
-- ============================================================

alter table public.connect_submissions
  add column if not exists topic   text,
  add column if not exists message text;
