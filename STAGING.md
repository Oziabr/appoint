# appoint — Staging Strategy

## The problem with "just test in production"

Supabase free tier gives you one project. The temptation is to test there
directly. Don't — the `appt_on_auth_user_created` trigger fires on every
real signup, the double-booking exclusion constraint is unforgiving, and
you can't safely truncate tables that share auth with other projects.

---

## Recommended setup: two Supabase projects, one codebase

```
supabase project: my-apps-prod   (auth shared by all your tools)
  └─ appt_* tables               (production data)

supabase project: my-apps-staging  (mirror, separate DB, same auth config)
  └─ appt_* tables               (throwaway test data)
```

Both projects share the same `auth.users` schema in isolation — users you
create in staging stay in staging. Prod auth is never touched during tests.

---

## Environment wiring

`index.html` reads two constants at the top of the script block:

```js
const SUPABASE_URL  = 'YOUR_SUPABASE_URL'
const SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY'
```

Replace the manual swap with a build-time or deploy-time substitution so
you never accidentally ship staging keys:

### Option A — Netlify (recommended for static deploys)

Set environment variables in the Netlify dashboard per site:

```
Site: appoint-staging → SUPABASE_URL=https://xxx.supabase.co
                         SUPABASE_ANON=eyJ...staging...
Site: appoint-prod    → SUPABASE_URL=https://yyy.supabase.co
                         SUPABASE_ANON=eyJ...prod...
```

Add a one-line build step (`netlify.toml`):

```toml
[build]
  command = "sed -i \"s|YOUR_SUPABASE_URL|$SUPABASE_URL|g; s|YOUR_SUPABASE_ANON_KEY|$SUPABASE_ANON|g\" index.html"
  publish = "."
```

### Option B — two HTML files, no build step

Keep `index.staging.html` and `index.html` as siblings; only the two
constants differ. Git-ignore the prod file or use `.env`-style comments
as markers. Crude but zero infrastructure.

### Option C — query-param override (dev convenience only)

Add at the top of the script block:

```js
const p = new URLSearchParams(location.search)
const SUPABASE_URL  = p.get('sburl')  || 'YOUR_SUPABASE_URL'
const SUPABASE_ANON = p.get('sbanon') || 'YOUR_SUPABASE_ANON_KEY'
```

Then `?sburl=https://xxx.supabase.co&sbanon=eyJ...` in the URL switches
environments without touching the file. Never expose prod keys in a URL.

---

## Migration workflow

Run `migration.sql` against each environment independently. The migration
is idempotent (`create if not exists`, `drop policy if exists`) so it's safe
to re-run after any schema change:

```
staging  → test the migration → verify data model
prod     → run only after staging passes
```

For future changes, add numbered files rather than editing `migration.sql`:

```
migration.sql          ← baseline, never edit after first run on prod
migration_002_xyz.sql  ← additive changes only
migration_003_abc.sql
```

Apply them in order. Supabase has no built-in migration runner for the SQL
editor, so keep a `CHANGELOG.md` noting which files have been run on prod.

---

## Test checklist (run on staging before every prod deploy)

### Host flow
- [ ] Sign up with a new email → `appt_hosts` row created automatically
- [ ] Add a meeting type with duration, post-meeting buffer, step
- [ ] Add availability windows for at least two weekdays
- [ ] Booking link generates correct `?host=<uuid>` URL
- [ ] Sign out and back in works

### Guest flow
- [ ] Open booking link → host name and bio shown
- [ ] Meeting type pills render, each selectable
- [ ] Calendar shows dots only on days with availability
- [ ] Past days and past times within today are unselectable
- [ ] Slot grid respects step_min (e.g. 10-min gaps for a 30-min meeting)
- [ ] post_meeting_min: last slot of the day ends `duration + post` before window close
- [ ] Fill in details and confirm → booking appears in host dashboard
- [ ] Attempt to book the same slot twice → second attempt shows conflict message

### Double-booking protection
Run two browser tabs simultaneously, both on the same slot, submit at the
same time. Only one should confirm; the other gets the "slot just taken" error.
This tests the `tstzrange` exclusion constraint at the DB level.

### Cross-project isolation
- [ ] Signing up in staging does NOT create a row in prod `appt_hosts`
- [ ] RLS: query `appt_bookings` as anon in the Supabase table editor →
      confirm no host-private rows leak (all selects are filtered by app logic)

---

## Seed data script (staging only)

Run after `migration.sql` to populate a test host and meeting types. Paste
your staging auth user UUID where indicated.

```sql
-- replace with your staging user UUID
do $$
declare v_host uuid := 'YOUR-STAGING-USER-UUID';
begin
  update appt_hosts
  set name = 'Test Host', bio = 'Staging account', timezone = 'Europe/Berlin'
  where id = v_host;

  insert into appt_meeting_types
    (host_id, name, description, duration_min, post_meeting_min, step_min, color)
  values
    (v_host, 'Quick sync',    '15-min check-in',      15,  5, 10, '#5b8fa8'),
    (v_host, 'Deep dive',     '60-min strategy call',  60, 15, 30, '#a8705b'),
    (v_host, 'Long workshop', '3-hour session',        180, 30, 30, '#8fb89a');

  insert into appt_availability_windows (host_id, day, start_time, end_time)
  values
    (v_host, 1, '09:00', '17:00'),  -- Monday
    (v_host, 2, '09:00', '17:00'),  -- Tuesday
    (v_host, 3, '09:00', '17:00'),  -- Wednesday
    (v_host, 4, '09:00', '17:00'),  -- Thursday
    (v_host, 5, '10:00', '14:00');  -- Friday
end $$;
```

---

## Teardown (staging reset between test runs)

```sql
truncate appt_bookings, appt_availability_windows,
         appt_meeting_types, appt_hosts restart identity cascade;
-- auth.users rows are NOT touched; re-use your staging login
```
