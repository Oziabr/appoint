// BOOT
// ══════════════════════════════════════════════════════════════
if (ENV === 'stage') document.getElementById('stage-ribbon').style.display = 'block'

// ── theme switch ─────────────────────────────────────────────
const THEMES  = ['dark', 'light', 'hotrod']
const THEME_ICONS = { dark: '☀', light: '☾', hotrod: '🔥' }
const applyTheme = t => {
  document.documentElement.classList.remove(...THEMES)
  if (t !== 'dark') document.documentElement.classList.add(t)
  document.documentElement.style.colorScheme = t === 'light' ? 'light' : 'dark'
  document.getElementById('theme-switch').textContent = THEME_ICONS[t]
  document.getElementById('theme-switch').title = `Theme: ${t} (click to cycle)`
}
const savedTheme = localStorage.getItem('appt_theme') || 'dark'
applyTheme(savedTheme)

document.getElementById('theme-switch').onclick = () => {
  const cur  = THEMES.find(t => document.documentElement.classList.contains(t)) || 'dark'
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length]
  localStorage.setItem('appt_theme', next)
  applyTheme(next)
}

route()

