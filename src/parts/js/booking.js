// BOOKING / GUEST VIEW
// ══════════════════════════════════════════════════════════════
let bk = {
  hostId: null, host: null,
  types: [], avail: [],
  selectedType: null,
  year: 0, month: 0,
  selectedDay: null,
  selectedSlot: null,
  bookedRanges: []
}

const initBookingView = async hostId => {
  bk.hostId = hostId
  showView('view-book')

  const [{ data: host }, { data: types }, { data: avail }] = await Promise.all([
    db('hosts').select('*').eq('id', hostId).single(),
    db('types').select('*').eq('host_id', hostId).eq('active', true).order('duration_min'),
    db('avail').select('*').eq('host_id', hostId).order('day')
  ])

  bk.host  = host
  bk.types = types || []
  bk.avail = avail || []

  document.getElementById('bk-host-name').textContent = host ? `Book with ${host.name}` : 'Book a meeting'
  document.getElementById('bk-host-bio').textContent  = host?.bio || ''

  renderTypesPicker()
}

// ── step 1: type picker ───────────────────────────────────────
const renderTypesPicker = () => {
  const el = document.getElementById('bk-types')
  if (!bk.types.length) { el.innerHTML = '<span class="empty-note">No meeting types available.</span>'; return }
  el.innerHTML = bk.types.map(t => `
    <div class="mtype-pill" data-id="${t.id}">
      <div class="pill-name">${esc(t.name)}</div>
      <div class="pill-dur">${t.duration_min} min${t.description ? ' · ' + esc(t.description) : ''}</div>
      <div class="pill-bar" style="background:${t.color}"></div>
    </div>`).join('')
  el.querySelectorAll('.mtype-pill').forEach(p =>
    p.onclick = () => selectType(p.dataset.id))
}

const selectType = id => {
  bk.selectedType  = bk.types.find(t => t.id === id)
  bk.selectedDay   = null
  bk.selectedSlot  = null
  document.querySelectorAll('.mtype-pill').forEach(p => p.classList.toggle('selected', p.dataset.id === id))
  const now = new Date()
  bk.year  = now.getFullYear()
  bk.month = now.getMonth()
  document.getElementById('bk-step-cal').style.display  = ''
  document.getElementById('bk-step-slots').style.display = 'none'
  document.getElementById('bk-step-form').style.display  = 'none'
  renderCalendar()
  document.getElementById('bk-step-cal').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── step 2: calendar ──────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const DOW    = ['Su','Mo','Tu','We','Th','Fr','Sa']

const renderCalendar = () => {
  const { year, month, avail } = bk
  document.getElementById('cal-month-label').textContent = `${MONTHS[month]} ${year}`
  const firstDow   = new Date(year, month, 1).getDay()
  const daysInMonth= new Date(year, month + 1, 0).getDate()
  const today      = new Date(); today.setHours(0,0,0,0)
  const activeDays = new Set(avail.map(a => a.day))

  const grid = document.getElementById('cal-grid')
  grid.innerHTML =
    DOW.map(d => `<div class="cal-dow">${d}</div>`).join('') +
    [...Array(firstDow)].map(() => `<div class="cal-cell empty"></div>`).join('') +
    [...Array(daysInMonth)].map((_,i) => {
      const d    = i + 1
      const date = new Date(year, month, d)
      const past = date < today
      const avl  = activeDays.has(date.getDay())
      const sel  = bk.selectedDay === d && !past
      const cls  = [
        'cal-cell',
        past ? 'past' : '',
        sel  ? 'selected' : '',
        !past && avl && !sel ? 'has-slots' : '',
        date.toDateString() === today.toDateString() && !sel ? 'today' : ''
      ].filter(Boolean).join(' ')
      return `<div class="${cls}" data-d="${d}">${d}</div>`
    }).join('')

  grid.querySelectorAll('.cal-cell:not(.empty):not(.past)').forEach(c =>
    c.onclick = () => selectDay(parseInt(c.dataset.d)))

  document.getElementById('cal-prev').onclick = () => {
    if (bk.month === 0) { bk.month = 11; bk.year-- } else bk.month--
    renderCalendar()
  }
  document.getElementById('cal-next').onclick = () => {
    if (bk.month === 11) { bk.month = 0; bk.year++ } else bk.month++
    renderCalendar()
  }
}

// ── step 2b: slots ────────────────────────────────────────────
const selectDay = async d => {
  bk.selectedDay  = d
  bk.selectedSlot = null
  renderCalendar()
  document.getElementById('bk-step-slots').style.display = ''
  document.getElementById('bk-step-form').style.display  = 'none'
  document.getElementById('slots-header').textContent    = 'LOADING SLOTS…'
  document.getElementById('slots-grid').innerHTML        = '<span class="spinner"></span>'

  const date  = new Date(bk.year, bk.month, d)
  const from  = new Date(bk.year, bk.month, d,  0,  0, 0)
  const to    = new Date(bk.year, bk.month, d, 23, 59, 59)

  const { data: booked } = await sb.rpc(TABLES.rpc, {
    p_host_id: bk.hostId,
    p_from:    from.toISOString(),
    p_to:      to.toISOString()
  })
  bk.bookedRanges = (booked || []).map(r => [new Date(r.starts_at), new Date(r.ends_at)])

  const slots = generateSlots(date, bk.selectedType, bk.avail, bk.bookedRanges)
  const label = date.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })
  document.getElementById('slots-header').textContent =
    `AVAILABLE TIMES · ${label.toUpperCase()}`

  const grid = document.getElementById('slots-grid')
  if (!slots.length) { grid.innerHTML = '<span class="empty-note">No available times on this day.</span>'; return }

  grid.innerHTML = slots.map((s,i) =>
    `<button class="slot-btn${s.taken?' taken':''}" data-iso="${s.start.toISOString()}" data-end="${s.end.toISOString()}"
       style="animation-delay:${i*18}ms" ${s.taken?'disabled':''}>${hhmm(s.start)}</button>`
  ).join('')

  grid.querySelectorAll('.slot-btn:not(.taken)').forEach(b =>
    b.onclick = () => selectSlot(b.dataset.iso, b.dataset.end))

  document.getElementById('bk-step-slots').scrollIntoView({ behavior:'smooth', block:'nearest' })
}

const generateSlots = (date, type, avail, booked) => {
  const durMin  = type.duration_min
  const postMin = type.post_meeting_min || 0
  // step_min: how far apart slot starts are; default 10 for <60, 30 for longer
  const stepMin = type.step_min || (durMin < 60 ? 10 : 30)
  const dow  = date.getDay()
  const segs = avail.filter(a => a.day === dow)
  if (!segs.length) return []
  const now  = new Date()
  const slots = []
  segs.forEach(seg => {
    const [fh, fm] = seg.start_time.split(':').map(Number)
    const [th, tm] = seg.end_time.split(':').map(Number)
    let cur = new Date(date); cur.setHours(fh, fm, 0, 0)
    const winEnd = new Date(date); winEnd.setHours(th, tm, 0, 0)
    while (true) {
      const slotEnd     = new Date(cur.getTime() + durMin  * 60000)
      const blockedEnd  = new Date(cur.getTime() + (durMin + postMin) * 60000)
      // slot must finish (including post-meeting) within the window
      if (blockedEnd > winEnd) break
      const taken = cur <= now || booked.some(([bs, be]) => cur < be && slotEnd > bs)
      slots.push({ start: new Date(cur), end: slotEnd, taken })
      cur = new Date(cur.getTime() + stepMin * 60000)
    }
  })
  return slots
}

// ── step 3: details form ──────────────────────────────────────
const selectSlot = (isoStart, isoEnd) => {
  bk.selectedSlot = { start: new Date(isoStart), end: new Date(isoEnd) }
  document.querySelectorAll('.slot-btn').forEach(b =>
    b.classList.toggle('picked', b.dataset.iso === isoStart))
  const label = `${bk.selectedType.name} · ${hhmm(bk.selectedSlot.start)} – ${hhmm(bk.selectedSlot.end)} · ${bk.selectedSlot.start.toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}`
  document.getElementById('bk-summary').textContent = label
  document.getElementById('bk-step-form').style.display = ''
  document.getElementById('bk-step-form').scrollIntoView({ behavior:'smooth', block:'start' })
}

// ── step 4: submit ────────────────────────────────────────────
document.getElementById('gf-submit').onclick = async () => {
  const errEl = document.getElementById('gf-err')
  const name  = document.getElementById('gf-name').value.trim()
  const email = document.getElementById('gf-email').value.trim()
  const notes = document.getElementById('gf-notes').value.trim()
  errEl.textContent = ''
  if (!name || !email) { errEl.textContent = 'Name and email are required.'; return }
  if (!email.includes('@')) { errEl.textContent = 'Enter a valid email.'; return }

  const btn = document.getElementById('gf-submit')
  btn.disabled = true; btn.textContent = 'Booking…'

  const { data, error } = await db('bookings').insert({
    host_id:         bk.hostId,
    meeting_type_id: bk.selectedType.id,
    guest_name:      name,
    guest_email:     email,
    guest_notes:     notes || null,
    starts_at:       bk.selectedSlot.start.toISOString(),
    ends_at:         bk.selectedSlot.end.toISOString()
  }).select().single()

  if (error) {
    errEl.textContent = error.code === '23P01'
      ? 'That slot was just taken — please pick another time.'
      : error.message
    btn.disabled = false; btn.textContent = 'Confirm booking'
    return
  }

  document.getElementById('bk-step-type').style.display  = 'none'
  document.getElementById('bk-step-cal').style.display   = 'none'
  document.getElementById('bk-step-form').style.display  = 'none'
  document.getElementById('bk-step-done').style.display  = ''

  const s = new Date(data.starts_at), e = new Date(data.ends_at)
  document.getElementById('confirm-body').innerHTML =
    `<strong>${esc(bk.selectedType.name)}</strong><br/>
     ${s.toLocaleDateString([], { weekday:'long', year:'numeric', month:'long', day:'numeric' })}<br/>
     ${hhmm(s)} – ${hhmm(e)}<br/><br/>
     A confirmation has been sent to <strong>${esc(email)}</strong>.`
  document.getElementById('confirm-id').textContent = `Booking ID: ${data.id}`

  // show guest call link
  const joinUrl  = appUrl({ call: data.id, role: 'guest' })
  const joinWrap = document.getElementById('call-join-wrap')
  const joinLink = document.getElementById('call-join-link')
  if (joinWrap && joinLink) {
    joinLink.href        = joinUrl
    joinLink.textContent = joinUrl
    joinWrap.style.display = ''
  }
}

// ══════════════════════════════════════════════════════════════
