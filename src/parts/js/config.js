// ── CONFIG — replace these ─────────────────────────────────────
const SUPABASE_URL  = '__SUPABASE_URL__'
const SUPABASE_ANON = '__SUPABASE_ANON__'
// ──────────────────────────────────────────────────────────────

const sb  = supabase.createClient(SUPABASE_URL, SUPABASE_ANON)

// ?env=stage rewires all table and function names to appt_stage_*
const ENV    = new URLSearchParams(location.search).get('env') === 'stage' ? 'stage' : 'prod'
const TABLES = {
  hosts:    ENV === 'stage' ? 'appt_stage_hosts'                : 'appt_hosts',
  types:    ENV === 'stage' ? 'appt_stage_meeting_types'        : 'appt_meeting_types',
  avail:    ENV === 'stage' ? 'appt_stage_availability_windows' : 'appt_availability_windows',
  bookings: ENV === 'stage' ? 'appt_stage_bookings'             : 'appt_bookings',
  rpc:      ENV === 'stage' ? 'appt_stage_booked_ranges'        : 'appt_booked_ranges',
}
const db = t => sb.from(TABLES[t])

// ══════════════════════════════════════════════════════════════
