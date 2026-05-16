// UTILS
// ══════════════════════════════════════════════════════════════
const hhmm = d => d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hour12: false })
const esc  = s => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

// ══════════════════════════════════════════════════════════════
