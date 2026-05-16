# appoint

A Calendly-style appointment booking system. Host sets up meeting types and availability windows; guests browse free slots and book with their details.

## Stack

- **Backend** — Supabase (Postgres + Auth + RLS)
- **Frontend** — single static `index.html`, no build step
- **Deploy** — EdgeOne Pages via GitHub Actions

## Features

- Host dashboard: meeting types (duration, post-meeting buffer, step interval), weekly availability, upcoming bookings, profile with avatar
- Guest booking: meeting type picker → calendar → time slots → confirmation
- Three themes: dark (default), light (sunlight-readable), hot rod (JARVIS/Stark HUD)
- Staging environment via `?env=stage` — separate `appt_stage_*` tables, same Supabase project
- Booking link is ENV-aware: staging links carry `?env=stage` automatically

## Setup

### 1. Supabase

Run `migration.sql` in the Supabase SQL Editor. It is idempotent — safe to re-run.

Add three GitHub Actions secrets:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_ANON` | your Supabase anon key |
| `EDGEONE_TOKEN` | your EdgeOne Pages API token |

### 2. Deploy

Push to `master` — GitHub Actions injects secrets and deploys to EdgeOne Pages automatically.

### 3. First run

Sign up at your EdgeOne URL → you land on the host dashboard → set your name, bio, timezone → add meeting types and availability → share your booking link.

## Files

| File | Purpose |
|---|---|
| `index.html` | Full frontend — host dashboard + guest booking, all themes |
| `migration.sql` | Supabase schema — prod and staging tables, RLS, functions, trigger |
| `migration_cleanup.sql` | Drops the original unprefixed tables from pre-v1 deployments |
| `STAGING.md` | Staging strategy and test checklist |
| `.github/workflows/deploy.yml` | CI/CD — injects secrets, deploys to EdgeOne |

## Staging

Add `?env=stage` to any URL to switch to staging tables. The host dashboard booking link button includes it automatically when you're in stage mode. A yellow corner ribbon appears as a reminder.

Reset staging data between test runs:

```sql
select appt_stage_reset();
```

See `STAGING.md` for the full test checklist.
