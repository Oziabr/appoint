# CLAUDE.md

Context for Claude when working on this repo.

## What this is

`appoint` is a single-host appointment booking system — think personal Calendly. One `index.html` file, Supabase backend, deployed to EdgeOne Pages. Built iteratively via Claude conversations.

## Architecture

```
index.html          — everything: host dashboard + guest booking UI
                      two views, routed by URL params
                      ?host=<uuid>  → guest booking
                      (no params)   → host dashboard (auth required)
                      ?env=stage    → switches to appt_stage_* tables

migration.sql       — single idempotent migration
                      appt_* tables = prod
                      appt_stage_* tables = staging (same project)
                      avatar_source column added at bottom

migration_cleanup.sql — drops old unprefixed tables (pre-prefix era)
```

## Supabase

- Project URL and anon key live in GitHub Actions secrets, injected at deploy time via `sed`
- Tables prefixed `appt_` to share a single Supabase project with other apps
- RLS on all tables; host mutations via `auth.uid()`, guest insert is open
- `appt_booked_ranges()` and `appt_stage_booked_ranges()` — RPC functions for slot availability
- `appt_stage_reset()` — wipes staging tables without touching auth or prod

## Frontend conventions

- No framework, no build step — vanilla JS ES2020
- `db('key')` helper wraps `sb.from(TABLES[key])` — routes to prod or stage table by ENV
- `TABLES.rpc` used for the booked_ranges RPC name
- Theme system: CSS variables on `:root`, overridden by `html.light` and `html.hotrod`
- Theme persisted in `localStorage` key `appt_theme`, cycles dark → light → hotrod
- Canvas-free — hotrod theme uses CSS border + bracket pseudoelements

## Secrets

Never hardcode secrets in `index.html`. Use placeholders:
- `__SUPABASE_URL__` → replaced by GitHub Actions from `secrets.SUPABASE_URL`
- `__SUPABASE_ANON__` → replaced by GitHub Actions from `secrets.SUPABASE_ANON`

The Gitea token and old Supabase keys were leaked in early commits. History was squashed to a single orphan commit to remove them. Rotate any key that touched a commit before the squash.

## Deploy pipeline

GitHub Actions (`.github/workflows/deploy.yml`):
1. Checkout
2. `sed` injects `SUPABASE_URL` and `SUPABASE_ANON` into `index.html`
3. `edgeone pages deploy` pushes to EdgeOne Pages project `apponi`

n8n workflow `Appoint Deploy` (id: `0WfrmvbF2IRFBJZf`) on `n8n.lafdb.com`:
- Webhook at `/appoint-deploy` accepts `{ files: [{path, content}], message }`
- Pushes files to Gitea via Gitea Contents API
- Works for files under ~5KB; larger files exceed MCP test payload limits

## Known constraints

- EdgeOne Pages deploy from Claude's environment hits an IP allowlist — must be triggered from a machine with an allowed IP or via GitHub Actions
- Gitea direct push also hits the proxy; use GitHub or the n8n webhook instead
- n8n Code node sandbox blocks `child_process`, `fetch`, and `$http` — only `Buffer` and n8n helpers available; HTTP calls must go through HTTP Request nodes

## Patterns to follow

- All table refs go through `db('key')` — never `sb.from('appt_*')` directly
- All RPC calls use `TABLES.rpc` — never the literal function name
- CSS changes to hotrod theme: add under `html.hotrod` selector block, reuse existing CSS variables, avoid new mechanisms
- Schema changes: append to `migration.sql` with `if not exists` / `if exists` guards
- Keep `index.html` as one file — no splitting, no bundling
