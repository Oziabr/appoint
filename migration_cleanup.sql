-- ══════════════════════════════════════════════════════════════
--  appoint — cleanup migration
--  Drops the original unprefixed deployment.
--
--  Run AFTER migration.sql (appt_ prefixed) is live and verified.
--  Safe to run once; all drops are conditional.
-- ══════════════════════════════════════════════════════════════

-- ── triggers first (reference the functions) ──────────────────
drop trigger if exists on_auth_user_created on auth.users;

-- ── functions ─────────────────────────────────────────────────
drop function if exists _on_new_user();
drop function if exists booked_ranges(uuid, timestamptz, timestamptz);

-- ── tables (cascade drops their policies and indexes) ─────────
drop table if exists bookings             cascade;
drop table if exists availability_windows cascade;
drop table if exists meeting_types        cascade;
drop table if exists hosts                cascade;
