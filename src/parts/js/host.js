// HOST DASHBOARD
// ══════════════════════════════════════════════════════════════
let hostSession = null
let hostData    = null

const initHostDash = async session => {
  hostSession = session
  showView('view-host')
  document.getElementById('host-email-label').textContent = session.user.email
  document.getElementById('signout-btn').onclick = async () => {
    await sb.auth.signOut()
    location.reload()
  }
  const bookingUrl = () => {
    const u = new URL(location.href)
    u.search = ''
    u.searchParams.set('host', session.user.id)
    if (ENV === 'stage') u.searchParams.set('env', 'stage')
    return u.toString()
  }
  document.getElementById('diag-link-btn').href = appUrl({ diag: '1' })

  const linkBtn = document.getElementById('share-link-btn')
  linkBtn.href = bookingUrl()
  linkBtn.onclick = e => {
    e.preventDefault()
    const url = bookingUrl()
    navigator.clipboard?.writeText(url).catch(() => {})
    openModal('Booking link', `<p style="font-size:13px;word-break:break-all;color:var(--accent)">${url}</p><p style="margin-top:10px;font-size:12px;color:var(--muted)">Share this URL with guests. Copied to clipboard.</p>`)
  }

  buildColorPicker()
  buildTimezoneSelect()
  await Promise.all([loadHost(), loadTypes(), loadAvailability(), loadUpcoming()])
}

// ── profile ──────────────────────────────────────────────────
let avatarSource = 'initials'

// MD5 for Gravatar (no SubtleCrypto support for MD5, use this tiny impl)
const md5 = s => {
  const RL = (n, c) => (n << c) | (n >>> (32-c))
  const A = s => s.split('').map(c => c.charCodeAt(0))
  let [a,b,c,d] = [0x67452301,0xefcdab89,0x98badcfe,0x10325476]
  const T = Array.from({length:64},(_,i) => Math.floor(Math.abs(Math.sin(i+1))*2**32)>>>0)
  const bs = A(s); bs.push(0x80)
  while (bs.length % 64 !== 56) bs.push(0)
  const l = s.length*8; bs.push(l&0xff,(l>>8)&0xff,(l>>16)&0xff,(l>>24)&0xff,0,0,0,0)
  for (let i=0;i<bs.length;i+=64) {
    const M=[]; for(let j=0;j<16;j++) M[j]=(bs[i+j*4])|(bs[i+j*4+1]<<8)|(bs[i+j*4+2]<<16)|(bs[i+j*4+3]<<24)
    let [A2,B2,C2,D2]=[a,b,c,d]
    const F=(x,y,z)=>(x&y)|(~x&z), G=(x,y,z)=>(x&z)|(y&~z), H=(x,y,z)=>x^y^z, I=(x,y,z)=>y^(x|~z)
    const R=(a,b,c,d,f,g,k,s)=>((b+RL((a+f(b,c,d)+M[g]+k)>>>0,s))>>>0)
    const ss=[[7,12,17,22],[5,9,14,20],[4,11,16,23],[6,10,15,21]]
    for(let j=0;j<16;j++){const s=ss[0][j%4];[A2,B2,C2,D2]=[D2,R(A2,B2,C2,D2,F,j,T[j],s),B2,C2]}
    for(let j=0;j<16;j++){const s=ss[1][j%4];[A2,B2,C2,D2]=[D2,R(A2,B2,C2,D2,G,(5*j+1)%16,T[j+16],s),B2,C2]}
    for(let j=0;j<16;j++){const s=ss[2][j%4];[A2,B2,C2,D2]=[D2,R(A2,B2,C2,D2,H,(3*j+5)%16,T[j+32],s),B2,C2]}
    for(let j=0;j<16;j++){const s=ss[3][j%4];[A2,B2,C2,D2]=[D2,R(A2,B2,C2,D2,I,7*j%16,T[j+48],s),B2,C2]}
    a=(a+A2)>>>0; b=(b+B2)>>>0; c=(c+C2)>>>0; d=(d+D2)>>>0
  }
  return [a,b,c,d].map(n=>(n>>>0).toString(16).padStart(8,'0').match(/../g).reverse().join('')).join('')
}

const avatarUrl = (src, name, email) => {
  if (src === 'gravatar') {
    const hash = md5((email||'').trim().toLowerCase())
    return `https://www.gravatar.com/avatar/${hash}?s=112&d=identicon`
  }
  // initials via ui-avatars
  const initials = (name||'?').split(' ').map(w=>w[0]).slice(0,2).join('+')
  return `https://ui-avatars.com/api/?name=${initials}&size=112&background=0d1020&color=00e5ff&bold=true&format=svg`
}

const renderAvatar = (src, name, email) => {
  const img = document.getElementById('pf-avatar')
  if (!img) return
  img.src = avatarUrl(src, name, email)
  document.querySelectorAll('.avatar-opt').forEach(b =>
    b.classList.toggle('active', b.dataset.src === src))
}

const loadHost = async () => {
  const { data } = await db('hosts').select('*').eq('id', hostSession.user.id).single()
  hostData = data
  if (!data) return
  document.getElementById('pf-name').value = data.name || ''
  document.getElementById('pf-bio').value  = data.bio  || ''
  const tzSel = document.getElementById('pf-tz')
  if (tzSel.querySelector(`option[value="${data.timezone}"]`))
    tzSel.value = data.timezone
  avatarSource = data.avatar_source || 'initials'
  renderAvatar(avatarSource, data.name, hostSession.user.email)
}

// avatar option buttons
document.querySelectorAll('.avatar-opt').forEach(b => b.onclick = () => {
  avatarSource = b.dataset.src
  const name  = document.getElementById('pf-name').value.trim()
  renderAvatar(avatarSource, name, hostSession.user.email)
})

// live-update avatar when name changes
document.getElementById('pf-name').addEventListener('input', e => {
  if (avatarSource === 'initials')
    renderAvatar('initials', e.target.value, hostSession.user.email)
})

document.getElementById('pf-save').onclick = async () => {
  const errEl = document.getElementById('pf-err')
  errEl.textContent = ''
  const { error } = await db('hosts').update({
    name:          document.getElementById('pf-name').value.trim(),
    bio:           document.getElementById('pf-bio').value.trim(),
    timezone:      document.getElementById('pf-tz').value,
    avatar_source: avatarSource
  }).eq('id', hostSession.user.id)
  if (error) { errEl.textContent = error.message; return }
  errEl.style.color = 'var(--accent2)'; errEl.textContent = 'Saved.'
  setTimeout(() => errEl.textContent = '', 2000)
  await loadHost()
}

const buildTimezoneSelect = () => {
  const zones = Intl.supportedValuesOf?.('timeZone') || [
    'UTC','Europe/Berlin','Europe/London','America/New_York',
    'America/Chicago','America/Denver','America/Los_Angeles',
    'Asia/Tokyo','Asia/Singapore','Australia/Sydney'
  ]
  const sel = document.getElementById('pf-tz')
  sel.innerHTML = zones.map(z => `<option value="${z}">${z}</option>`).join('')
  sel.value = Intl.DateTimeFormat().resolvedOptions().timeZone
}

// ── color picker ─────────────────────────────────────────────
const buildColorPicker = () => {
  const el = document.getElementById('color-picker')
  el.innerHTML = COLORS.map(c =>
    `<div class="color-swatch" data-c="${c}" style="width:22px;height:22px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${c === selectedColor ? '#fff' : 'transparent'};transition:border .12s"></div>`
  ).join('')
  el.querySelectorAll('.color-swatch').forEach(s => s.onclick = () => {
    selectedColor = s.dataset.c
    el.querySelectorAll('.color-swatch').forEach(x => x.style.borderColor = x.dataset.c === selectedColor ? '#fff' : 'transparent')
  })
}

// ── meeting types ─────────────────────────────────────────────
const loadTypes = async () => {
  const { data: types } = await db('types').select('*')
    .eq('host_id', hostSession.user.id).order('created_at')
  const el = document.getElementById('types-list')
  if (!types?.length) { el.innerHTML = '<span class="empty-note">No meeting types yet.</span>'; return }
  el.innerHTML = types.map(t => `
    <div class="mtype-card">
      <div class="mtype-dot" style="background:${t.color}"></div>
      <div class="mtype-info">
        <div class="mtype-name">${esc(t.name)}</div>
        <div class="mtype-dur">${t.duration_min} min${t.post_meeting_min ? ' + ' + t.post_meeting_min + 'm post' : ''} · step ${t.step_min}m${t.description ? ' · ' + esc(t.description) : ''}</div>
      </div>
      <div class="mtype-actions">
        <button class="btn btn-ghost btn-sm" data-del="${t.id}">✕</button>
      </div>
    </div>`).join('')
  el.querySelectorAll('[data-del]').forEach(b =>
    b.onclick = () => deleteType(b.dataset.del))
}

document.getElementById('add-type-btn').onclick = () => {
  document.getElementById('type-form').style.display = ''
  document.getElementById('tf-name').focus()
}
document.getElementById('tf-cancel').onclick = () => document.getElementById('type-form').style.display = 'none'

document.getElementById('tf-save').onclick = async () => {
  const errEl   = document.getElementById('tf-err')
  const name    = document.getElementById('tf-name').value.trim()
  const dur     = parseInt(document.getElementById('tf-dur').value)
  const post    = parseInt(document.getElementById('tf-post').value) || 0
  const stepRaw = document.getElementById('tf-step').value.trim()
  const step    = stepRaw ? parseInt(stepRaw) : (dur < 60 ? 10 : 30)
  const desc    = document.getElementById('tf-desc').value.trim()
  if (!name || !dur) { errEl.textContent = 'Name and duration required.'; return }
  const { error } = await db('types').insert({
    host_id: hostSession.user.id, name, duration_min: dur,
    post_meeting_min: post, step_min: step,
    description: desc || null, color: selectedColor
  })
  if (error) { errEl.textContent = error.message; return }
  document.getElementById('type-form').style.display = 'none'
  document.getElementById('tf-name').value = ''
  document.getElementById('tf-desc').value = ''
  document.getElementById('tf-post').value = '0'
  document.getElementById('tf-step').value = ''
  await loadTypes()
}

const deleteType = async id => {
  if (!confirm('Delete this meeting type?')) return
  await db('types').delete().eq('id', id)
  await loadTypes()
}

// ── availability ──────────────────────────────────────────────
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_LABELS  = ['Su','Mo','Tu','We','Th','Fr','Sa']

// three 8-hour parts cycling via one button
const PARTS = [
  { idx: 0, start: 0,  end: 8,  label: '00–08' },
  { idx: 1, start: 8,  end: 16, label: '08–16' },
  { idx: 2, start: 16, end: 24, label: '16–24' },
]

// ── availability tab switcher ─────────────────────────────────
let availTab = localStorage.getItem('appt_avail_tab') || 'grid'
const switchAvailTab = t => {
  availTab = t
  localStorage.setItem('appt_avail_tab', t)
  document.querySelectorAll('.avail-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === t))
  document.getElementById('avail-tab-grid').style.display = t === 'grid' ? '' : 'none'
  document.getElementById('avail-tab-form').style.display = t === 'form' ? '' : 'none'
}
document.querySelectorAll('.avail-tab').forEach(b =>
  b.onclick = () => switchAvailTab(b.dataset.tab))
switchAvailTab(availTab)

// ── grid state ────────────────────────────────────────────────
// gridState[day][absoluteSlotIndex] = true/false  (index relative to 00:00)
let gridState  = Array.from({length:7}, () => ({}))
let gridStep   = parseInt(localStorage.getItem('appt_avail_step') || '15')
let gridPartIdx= parseInt(localStorage.getItem('appt_avail_part') || '1')  // default 08-16
let dragValue  = null

const part         = () => PARTS[gridPartIdx]
const slotsPerHour = () => 60 / gridStep
const slotsInPart  = () => 8 * slotsPerHour()
const absSlot      = i => Math.round((part().start * 60) / gridStep) + i

// does any slot in the given part have availability for any day?
const partHasData  = pidx => {
  const p = PARTS[pidx]
  const from = Math.round((p.start * 60) / gridStep)
  const to   = Math.round((p.end   * 60) / gridStep)
  return gridState.some(row => {
    for (let i = from; i < to; i++) if (row[i]) return true
    return false
  })
}

// ── encode/decode grid ↔ availability windows ─────────────────
const gridToWindows = () => {
  const total = Math.ceil(24 * 60 / gridStep)
  const wins  = []
  for (let day = 0; day < 7; day++) {
    let start = null
    for (let i = 0; i <= total; i++) {
      const on = !!gridState[day][i]
      if (on  && start === null) start = i
      if (!on && start !== null) {
        const fromM = start * gridStep
        const toM   = i     * gridStep
        wins.push({
          day,
          start_time: `${String(Math.floor(fromM/60)).padStart(2,'0')}:${String(fromM%60).padStart(2,'0')}`,
          end_time:   `${String(Math.floor(toM/60)).padStart(2,'0')}:${String(toM%60).padStart(2,'0')}`
        })
        start = null
      }
    }
  }
  return wins
}

const windowsToGrid = rows => {
  gridState = Array.from({length:7}, () => ({}))
  rows.forEach(r => {
    const [fh,fm] = r.start_time.split(':').map(Number)
    const [th,tm] = r.end_time.split(':').map(Number)
    const from = Math.round((fh*60+fm) / gridStep)
    const to   = Math.round((th*60+tm) / gridStep)
    for (let i = from; i < to; i++) gridState[r.day][i] = true
  })
}

// ── render grid ───────────────────────────────────────────────
const renderGrid = () => {
  const p    = part()
  const sph  = slotsPerHour()
  const sip  = slotsInPart()
  const grid = document.getElementById('avail-grid')

  // prev/next part indicators
  const prevIdx = (gridPartIdx + 2) % 3
  const nextIdx = (gridPartIdx + 1) % 3
  const prevHas = partHasData(prevIdx)
  const nextHas = partHasData(nextIdx)

  // columns: indicator | day-label | slot-cols | indicator
  grid.style.gridTemplateColumns = `18px 36px repeat(${sip}, minmax(0, 1fr)) 18px`

  // ── header row
  // left indicator corner
  let html = `<div class="ag-ind-corner ag-ind-prev${prevHas?' has':''}"></div>`
  // day-label corner
  html += `<div class="ag-corner"></div>`
  // hour cells
  for (let h = 0; h < 8; h++) {
    const absH  = p.start + h
    const label = String(absH).padStart(2,'0')
    html += `<div class="ag-hour-label" data-hstart="${h}" style="grid-column:span ${sph}">${label}</div>`
  }
  // right indicator corner
  html += `<div class="ag-ind-corner ag-ind-next${nextHas?' has':''}"></div>`

  // ── day rows
  for (let day = 0; day < 7; day++) {
    // left indicator: does this day have data in prev part?
    const prevDayHas = (() => {
      const pp = PARTS[prevIdx]
      const from = Math.round((pp.start * 60) / gridStep)
      const to   = Math.round((pp.end   * 60) / gridStep)
      for (let i = from; i < to; i++) if (gridState[day][i]) return true
      return false
    })()
    const nextDayHas = (() => {
      const np = PARTS[nextIdx]
      const from = Math.round((np.start * 60) / gridStep)
      const to   = Math.round((np.end   * 60) / gridStep)
      for (let i = from; i < to; i++) if (gridState[day][i]) return true
      return false
    })()

    html += `<div class="ag-ind-cell ag-ind-prev${prevDayHas?' has':''}"></div>`
    html += `<div class="ag-day-label" data-day="${day}">${DAY_LABELS[day]}</div>`

    for (let i = 0; i < sip; i++) {
      const abs    = absSlot(i)
      const isHour = i % sph === 0 && i > 0
      const on     = !!gridState[day][abs]
      html += `<div class="ag-cell${on?' on':''}${isHour?' hour-divider':''}" data-day="${day}" data-slot="${abs}"></div>`
    }

    html += `<div class="ag-ind-cell ag-ind-next${nextDayHas?' has':''}"></div>`
  }

  grid.innerHTML = html

  // ── row toggle
  grid.querySelectorAll('.ag-day-label').forEach(lbl => {
    lbl.onclick = () => {
      const day = +lbl.dataset.day
      const any = [...Array(sip)].some((_,i) => gridState[day][absSlot(i)])
      const val = !any
      for (let i = 0; i < sip; i++) gridState[day][absSlot(i)] = val
      renderGrid()
    }
  })

  // ── col toggle
  grid.querySelectorAll('.ag-hour-label').forEach(lbl => {
    lbl.onclick = () => {
      const h0  = +lbl.dataset.hstart * sph
      const any = gridState.some(row =>
        [...Array(sph)].some((_,j) => row[absSlot(h0 + j)]))
      const val = !any
      for (let day = 0; day < 7; day++)
        for (let j = 0; j < sph; j++)
          gridState[day][absSlot(h0 + j)] = val
      renderGrid()
    }
  })

  // ── touch-safe drag painting ──────────────────────────────────
  // We track pointer events rather than mouse+touch separately.
  // pointermove fires even when pointer is captured, eliminating
  // the elementFromPoint hack and the weird-registration problem.
  let dragging = false

  const cellAt = el => {
    const c = el?.closest?.('.ag-cell')
    return c ? { day: +c.dataset.day, slot: +c.dataset.slot } : null
  }
  const applyCell = (day, slot, val) => {
    gridState[day][slot] = val
    const cell = grid.querySelector(`[data-day="${day}"][data-slot="${slot}"]`)
    if (cell) cell.classList.toggle('on', val)
  }

  grid.addEventListener('pointerdown', e => {
    const c = cellAt(e.target)
    if (!c) return
    e.preventDefault()
    grid.setPointerCapture(e.pointerId)
    dragging  = true
    dragValue = !gridState[c.day][c.slot]
    applyCell(c.day, c.slot, dragValue)
  })
  grid.addEventListener('pointermove', e => {
    if (!dragging) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const c  = cellAt(el)
    if (c) applyCell(c.day, c.slot, dragValue)
  })
  grid.addEventListener('pointerup',     () => { dragging = false })
  grid.addEventListener('pointercancel', () => { dragging = false })
}

// ── part cycle button ─────────────────────────────────────────
const updatePartBtn = () => {
  const btn = document.getElementById('part-cycle-btn')
  if (btn) btn.textContent = part().label
}
const cyclePart = () => {
  gridPartIdx = (gridPartIdx + 1) % 3
  localStorage.setItem('appt_avail_part', gridPartIdx)
  updatePartBtn()
  renderGrid()
}
document.getElementById('part-cycle-btn').onclick = cyclePart
updatePartBtn()

// ── step button controls ──────────────────────────────────────
document.querySelectorAll('.step-btn').forEach(b => {
  if (+b.dataset.step === gridStep) b.classList.add('active')
  b.onclick = () => {
    const wins = gridToWindows()
    gridStep = +b.dataset.step
    localStorage.setItem('appt_avail_step', gridStep)
    document.querySelectorAll('.step-btn').forEach(x =>
      x.classList.toggle('active', +x.dataset.step === gridStep))
    windowsToGrid(wins)
    renderGrid()
  }
})

// ── save grid ─────────────────────────────────────────────────
document.getElementById('ag-save').onclick = async () => {
  const btn = document.getElementById('ag-save')
  btn.disabled = true; btn.textContent = 'Saving…'
  // delete all existing windows then insert new ones
  const { data: existing } = await db('avail').select('id').eq('host_id', hostSession.user.id)
  if (existing?.length)
    await db('avail').delete().eq('host_id', hostSession.user.id)
  const wins = gridToWindows()
  if (wins.length) {
    await db('avail').insert(wins.map(w => ({ ...w, host_id: hostSession.user.id })))
  }
  btn.disabled = false; btn.textContent = 'Save grid'
  // refresh form tab list too
  await loadAvailability()
}

// ── load availability (shared by both tabs) ───────────────────
const loadAvailability = async () => {
  const { data: rows } = await db('avail').select('*')
    .eq('host_id', hostSession.user.id).order('day').order('start_time')

  // update grid
  windowsToGrid(rows || [])
  renderGrid()

  // update form list
  const el = document.getElementById('avail-list')
  if (!rows?.length) { el.innerHTML = '<span class="empty-note">No availability set.</span>'; return }
  el.innerHTML = rows.map(r => `
    <div class="avail-row">
      <span class="avail-day">${DAY_NAMES[r.day]}</span>
      <span class="avail-time">${r.start_time.slice(0,5)} – ${r.end_time.slice(0,5)}</span>
      <button class="btn btn-ghost btn-sm" data-del="${r.id}">✕</button>
    </div>`).join('')
  el.querySelectorAll('[data-del]').forEach(b =>
    b.onclick = async () => {
      await db('avail').delete().eq('id', b.dataset.del)
      loadAvailability()
    })
}

document.getElementById('add-avail-btn').onclick = () => {
  document.getElementById('avail-form').style.display = ''
  document.getElementById('af-day').focus()
}
document.getElementById('af-cancel').onclick = () => document.getElementById('avail-form').style.display = 'none'

document.getElementById('af-save').onclick = async () => {
  const errEl = document.getElementById('af-err')
  const day   = parseInt(document.getElementById('af-day').value)
  const from  = document.getElementById('af-from').value
  const to    = document.getElementById('af-to').value
  if (!from || !to || from >= to) { errEl.textContent = 'Invalid time range.'; return }
  const { error } = await db('avail').insert({
    host_id: hostSession.user.id, day, start_time: from, end_time: to
  })
  if (error) { errEl.textContent = error.message; return }
  document.getElementById('avail-form').style.display = 'none'
  await loadAvailability()
}

// ── upcoming bookings ─────────────────────────────────────────
const loadUpcoming = async () => {
  const { data: rows } = await db('bookings')
    .select(`*, ${TABLES.types}(name,color)`)
    .eq('host_id', hostSession.user.id)
    .eq('status', 'confirmed')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at').limit(10)
  const el = document.getElementById('bookings-list')
  if (!rows?.length) { el.innerHTML = '<span class="empty-note">No upcoming bookings.</span>'; return }
  el.innerHTML = rows.map(r => {
    const s = new Date(r.starts_at), e = new Date(r.ends_at)
    const day = s.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })
    const t   = `${hhmm(s)} – ${hhmm(e)}`
    const guestCallUrl = appUrl({ call: r.id, role: 'guest' })
    return `<div class="booking-row">
      <div class="btime">${day} · ${t}</div>
      <div class="bguest">${esc(r.guest_name)}</div>
      <div class="bmeta">${esc(r.guest_email)} · <span style="color:${r[TABLES.types]?.color}">${esc(r[TABLES.types]?.name||'')}</span></div>
      ${r.guest_notes ? `<div class="bmeta" style="margin-top:4px;font-style:italic">${esc(r.guest_notes)}</div>` : ''}
      <div class="booking-actions">
        <button class="btn btn-sm btn-primary call-start-btn" data-id="${r.id}">📹 Start call</button>
        <button class="btn btn-sm btn-ghost call-copy-btn" data-url="${esc(guestCallUrl)}" title="Copy guest call link">🔗 Guest link</button>
      </div>
    </div>`
  }).join('')
  el.querySelectorAll('.call-start-btn').forEach(b =>
    b.onclick = () => { location.href = appUrl({ call: b.dataset.id, role: 'host' }) })
  el.querySelectorAll('.call-copy-btn').forEach(b =>
    b.onclick = () => {
      navigator.clipboard?.writeText(b.dataset.url).catch(() => {})
      openModal('Guest call link',
        `<p style="font-size:12px;word-break:break-all;color:var(--accent)">${b.dataset.url}</p>
         <p style="margin-top:10px;font-size:11px;color:var(--muted)">Share this with your guest. Copied to clipboard.</p>`)
    })
}

// ══════════════════════════════════════════════════════════════
