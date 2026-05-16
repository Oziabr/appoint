// AUTH
// ══════════════════════════════════════════════════════════════
let authMode = 'signin'

const initAuth = () => {
  document.getElementById('auth-toggle-link').onclick = e => {
    e.preventDefault()
    authMode = authMode === 'signin' ? 'signup' : 'signin'
    const isUp = authMode === 'signup'
    document.getElementById('auth-sub').textContent = isUp ? 'Create a host account' : 'Host sign in'
    document.getElementById('auth-btn').textContent  = isUp ? 'Create account' : 'Sign in'
    document.getElementById('auth-toggle-link').textContent = isUp ? '← Back to sign in' : 'Create a host account →'
    document.getElementById('name-field').style.display = isUp ? '' : 'none'
    document.getElementById('auth-pw').autocomplete = isUp ? 'new-password' : 'current-password'
    document.getElementById('auth-err').textContent = ''
  }

  document.getElementById('auth-form').onsubmit = async e => {
    e.preventDefault()
    const email = document.getElementById('auth-email').value.trim()
    const pw    = document.getElementById('auth-pw').value
    const name  = document.getElementById('auth-name').value.trim()
    const errEl = document.getElementById('auth-err')
    errEl.textContent = ''

    if (!email || !pw) { errEl.textContent = 'Email and password required.'; return }

    const btn = document.getElementById('auth-btn')
    btn.disabled = true; btn.textContent = '…'

    let err
    if (authMode === 'signup') {
      const r = await sb.auth.signUp({ email, password: pw, options: { data: { name } } })
      err = r.error
      if (!err) {
        errEl.style.color = 'var(--accent2)'
        errEl.textContent = 'Check your email to confirm your account, then sign in.'
        btn.disabled = false; btn.textContent = 'Create account'
        return
      }
    } else {
      const r = await sb.auth.signInWithPassword({ email, password: pw })
      err = r.error
      if (!err) { initHostDash(r.data.session); return }
    }
    errEl.style.color = 'var(--danger)'
    errEl.textContent = err.message
    btn.disabled = false
    btn.textContent = authMode === 'signup' ? 'Create account' : 'Sign in'
  }

  // Enter key handled natively by form submit
}

// ══════════════════════════════════════════════════════════════
