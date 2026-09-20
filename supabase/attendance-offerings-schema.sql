-- Adds a weekly offerings (giving) total alongside the existing worship
-- and small-group attendance figures on the attendance table.
-- See docs/superpowers/specs/2026-09-20-attendance-offerings-design.md
-- Run in the Supabase SQL editor (or via MCP apply_migration). Not
-- idempotent -- run once per environment (staging, then production).

alter table public.attendance add column offerings numeric;
