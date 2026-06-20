// ROUTER
// ══════════════════════════════════════════════════════════════
const showView = id => {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
  document.getElementById(id).classList.add('active')
}

const COLORS = ['#c8a96e','#8fb89a','#7a9eba','#b89a7a','#a87ab8','#b87a7a','#7ab8b0']
let selectedColor = COLORS[0]

const route = async () => {
  const params  = new URLSearchParams(location.search)
  const hostId  = params.get('host')
  const callId  = params.get('call')
  const role    = params.get('role')
  const diag    = params.has('diag')

  if (diag)   return initDiagView()
  if (callId) return initCallView(callId, role || 'guest')
  if (hostId) return initBookingView(hostId)

  const { data: { session } } = await sb.auth.getSession()
  if (session) return initHostDash(session)
  showView('view-auth')
  initAuth()
}

// build a URL preserving current env param
const appUrl = params => {
  const u = new URL(location.href)
  u.search = ''
  const env = new URLSearchParams(location.search).get('env')
  if (env) u.searchParams.set('env', env)
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, v))
  return u.toString()
}

// ══════════════════════════════════════════════════════════════
