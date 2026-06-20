// ══════════════════════════════════════════════════════════════
// DIAGNOSTICS
// ══════════════════════════════════════════════════════════════
const STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const diagState = (id, state, detail = '') => {
  const card   = document.getElementById(id)
  const status = card.querySelector('.dtest-status')
  const det    = card.querySelector('.dtest-detail')
  card.className   = 'diag-card ' + state
  status.className = 'dtest-status ' + state
  const labels = { pending:'Waiting…', running:'Testing…', pass:'Pass', fail:'Fail', warn:'Warning' }
  status.textContent = labels[state] || state
  if (detail) det.innerHTML = detail
}

const runDiagnostics = async () => {
  const btn = document.getElementById('diag-run-btn')
  btn.disabled = true; btn.textContent = 'Running…'
  const verdict = document.getElementById('diag-verdict')
  verdict.className = 'diag-verdict'; verdict.textContent = ''

  // reset all
  ;['dtest-media','dtest-stun','dtest-p2p','dtest-codec','dtest-bw','dtest-latency']
    .forEach(id => diagState(id, 'pending'))

  const results = {}

  // ── 1. MEDIA DEVICES ───────────────────────────────────────
  diagState('dtest-media', 'running')
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    const tracks = stream.getTracks()
    const vt = tracks.find(t => t.kind === 'video')
    const at = tracks.find(t => t.kind === 'audio')
    const settings = vt?.getSettings() || {}
    diagState('dtest-media', 'pass',
      `Video: ${settings.width||'?'}×${settings.height||'?'} ${settings.frameRate||'?'}fps<br>` +
      `Mic: ${at ? at.label || 'detected' : 'none'}`)
    results.media = { ok: true, stream }
  } catch (e) {
    diagState('dtest-media', 'fail', e.name === 'NotAllowedError'
      ? 'Permission denied — allow camera/mic access'
      : e.message)
    results.media = { ok: false }
  }

  // ── 2. STUN / PUBLIC IP ─────────────────────────────────────
  diagState('dtest-stun', 'running')
  await new Promise(resolve => {
    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS })
    pc.createDataChannel('probe')
    const ips = new Set()
    const timeout = setTimeout(() => {
      pc.close()
      if (ips.size) {
        diagState('dtest-stun', 'pass', `Public IP: ${[...ips].join(', ')}`)
        results.stun = { ok: true, ips: [...ips] }
      } else {
        diagState('dtest-stun', 'fail', 'No STUN candidates — firewall may block UDP')
        results.stun = { ok: false }
      }
      resolve()
    }, 4000)
    pc.onicecandidate = e => {
      if (!e.candidate) return
      const m = e.candidate.candidate.match(/(\d+\.\d+\.\d+\.\d+)/)
      if (m && !m[1].startsWith('192.') && !m[1].startsWith('10.') && !m[1].startsWith('172.'))
        ips.add(m[1])
    }
    pc.createOffer().then(o => pc.setLocalDescription(o))
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout)
        pc.close()
        if (ips.size) {
          diagState('dtest-stun', 'pass', `Public IP: ${[...ips].join(', ')}`)
          results.stun = { ok: true, ips: [...ips] }
        } else {
          diagState('dtest-stun', 'warn', 'Only local candidates — may need TURN for some peers')
          results.stun = { ok: 'warn' }
        }
        resolve()
      }
    }
  })

  // ── 3. P2P LOOPBACK (the key test) ─────────────────────────
  diagState('dtest-p2p', 'running')
  await new Promise(resolve => {
    const pc1 = new RTCPeerConnection({ iceServers: STUN_SERVERS })
    const pc2 = new RTCPeerConnection({ iceServers: STUN_SERVERS })
    const ch  = pc1.createDataChannel('loopback')
    let connected = false
    const t0 = Date.now()
    const timeout = setTimeout(() => {
      pc1.close(); pc2.close()
      if (!connected) {
        diagState('dtest-p2p', 'fail', 'P2P loopback failed — direct connection not available')
        results.p2p = { ok: false }
      }
      resolve()
    }, 8000)

    pc1.onicecandidate = e => e.candidate && pc2.addIceCandidate(e.candidate).catch(() => {})
    pc2.onicecandidate = e => e.candidate && pc1.addIceCandidate(e.candidate).catch(() => {})

    pc2.ondatachannel = e => {
      e.channel.onopen = () => {
        connected = true
        const rtt = Date.now() - t0
        clearTimeout(timeout)
        diagState('dtest-p2p', 'pass',
          `P2P established in ${rtt}ms<br>ICE: ${pc1.iceConnectionState}`)
        results.p2p = { ok: true, rtt }
        // send a ping for latency test later
        results.p2pPair = { pc1, pc2, ch: e.channel }
        pc1.close(); pc2.close()
        resolve()
      }
    }

    pc1.createOffer()
      .then(o => pc1.setLocalDescription(o))
      .then(() => pc2.setRemoteDescription(pc1.localDescription))
      .then(() => pc2.createAnswer())
      .then(a => pc2.setLocalDescription(a))
      .then(() => pc1.setRemoteDescription(pc2.localDescription))
      .catch(() => { diagState('dtest-p2p', 'fail', 'SDP exchange failed'); resolve() })
  })

  // ── 4. CODECS ───────────────────────────────────────────────
  diagState('dtest-codec', 'running')
  try {
    const caps = RTCRtpSender.getCapabilities?.('video')
    const codecs = caps?.codecs?.map(c => c.mimeType.split('/')[1]) || []
    const want  = ['VP8','VP9','H264','AV1']
    const have  = want.filter(c => codecs.some(x => x.toUpperCase() === c))
    const miss  = want.filter(c => !have.includes(c))
    if (have.length >= 2) {
      diagState('dtest-codec', 'pass',
        `Video: ${have.join(', ')}<br>${miss.length ? 'Missing: ' + miss.join(', ') : 'Full support'}`)
      results.codecs = { ok: true, have }
    } else {
      diagState('dtest-codec', 'warn', `Limited: ${have.join(', ') || 'none detected'}`)
      results.codecs = { ok: 'warn' }
    }
  } catch {
    diagState('dtest-codec', 'warn', 'Cannot query codec capabilities')
    results.codecs = { ok: 'warn' }
  }

  // ── 5. BANDWIDTH ESTIMATE ───────────────────────────────────
  diagState('dtest-bw', 'running')
  if (results.media.ok && results.p2p?.ok) {
    await new Promise(resolve => {
      const stream = results.media.stream
      const pc1 = new RTCPeerConnection({ iceServers: STUN_SERVERS })
      const pc2 = new RTCPeerConnection({ iceServers: STUN_SERVERS })
      stream.getTracks().forEach(t => pc1.addTrack(t, stream))
      pc1.onicecandidate = e => e.candidate && pc2.addIceCandidate(e.candidate).catch(() => {})
      pc2.onicecandidate = e => e.candidate && pc1.addIceCandidate(e.candidate).catch(() => {})

      let prev = null
      const poll = setInterval(async () => {
        const stats = await pc1.getStats()
        let bytesSent = 0, ts = 0
        stats.forEach(s => { if (s.type === 'outbound-rtp' && s.kind === 'video') { bytesSent = s.bytesSent; ts = s.timestamp } })
        if (prev && bytesSent > prev.bytes) {
          const kbps = Math.round(((bytesSent - prev.bytes) * 8) / ((ts - prev.ts)) )
          const quality = kbps > 500 ? 'pass' : kbps > 150 ? 'warn' : 'fail'
          diagState('dtest-bw', quality, `~${kbps} kbps outbound`)
          results.bw = { ok: quality === 'pass' || quality === 'warn', kbps }
          clearInterval(poll); clearTimeout(timeout)
          pc1.close(); pc2.close()
          resolve()
        }
        prev = { bytes: bytesSent, ts }
      }, 500)
      const timeout = setTimeout(() => {
        clearInterval(poll); pc1.close(); pc2.close()
        diagState('dtest-bw', 'warn', 'Could not estimate — no video track data')
        results.bw = { ok: 'warn' }
        resolve()
      }, 5000)

      pc1.createOffer()
        .then(o => pc1.setLocalDescription(o))
        .then(() => pc2.setRemoteDescription(pc1.localDescription))
        .then(() => pc2.createAnswer())
        .then(a => pc2.setLocalDescription(a))
        .then(() => pc1.setRemoteDescription(pc2.localDescription))
        .catch(() => { clearInterval(poll); clearTimeout(timeout); diagState('dtest-bw','warn','SDP failed'); results.bw={ok:'warn'}; resolve() })
    })
  } else {
    diagState('dtest-bw', 'warn', 'Skipped — media or P2P unavailable')
    results.bw = { ok: 'warn' }
  }

  // ── 6. ROUND-TRIP LATENCY ───────────────────────────────────
  diagState('dtest-latency', 'running')
  if (results.p2p?.ok) {
    // loopback was already closed; do a quick fresh pair
    await new Promise(resolve => {
      const pc1 = new RTCPeerConnection({ iceServers: STUN_SERVERS })
      const pc2 = new RTCPeerConnection({ iceServers: STUN_SERVERS })
      const ch1 = pc1.createDataChannel('ping')
      const rtts = []

      pc1.onicecandidate = e => e.candidate && pc2.addIceCandidate(e.candidate).catch(() => {})
      pc2.onicecandidate = e => e.candidate && pc1.addIceCandidate(e.candidate).catch(() => {})

      pc2.ondatachannel = e => {
        e.channel.onmessage = ev => e.channel.send(ev.data)  // echo
      }
      ch1.onopen = () => {
        let count = 0
        const ping = () => {
          if (count >= 5) {
            const avg = Math.round(rtts.reduce((a,b)=>a+b,0)/rtts.length)
            const min = Math.min(...rtts), max = Math.max(...rtts)
            const quality = avg < 80 ? 'pass' : avg < 200 ? 'warn' : 'fail'
            diagState('dtest-latency', quality, `RTT avg ${avg}ms (min ${min} / max ${max})`)
            results.latency = { ok: quality !== 'fail', avg, min, max }
            pc1.close(); pc2.close()
            resolve(); return
          }
          const t = Date.now()
          ch1.send(String(t))
          count++
        }
        ch1.onmessage = () => { rtts.push(Date.now() - parseInt(ch1._t||Date.now())); ping() }
        // patch: store send time
        const origSend = ch1.send.bind(ch1)
        ch1.send = m => { ch1._t = m; origSend(m) }
        setTimeout(ping, 100)
      }

      const timeout = setTimeout(() => {
        pc1.close(); pc2.close()
        diagState('dtest-latency', 'warn', 'Latency test timed out')
        results.latency = { ok: 'warn' }
        resolve()
      }, 6000)

      pc1.createOffer()
        .then(o => pc1.setLocalDescription(o))
        .then(() => pc2.setRemoteDescription(pc1.localDescription))
        .then(() => pc2.createAnswer())
        .then(a => pc2.setLocalDescription(a))
        .then(() => pc1.setRemoteDescription(pc2.localDescription))
        .catch(() => { clearTimeout(timeout); diagState('dtest-latency','warn','SDP failed'); results.latency={ok:'warn'}; resolve() })
    })
  } else {
    diagState('dtest-latency', 'warn', 'Skipped — P2P not available')
    results.latency = { ok: 'warn' }
  }

  // cleanup media stream
  results.media?.stream?.getTracks().forEach(t => t.stop())

  // ── VERDICT ──────────────────────────────────────────────────
  const p2pOk = results.p2p?.ok === true
  verdict.classList.add('show')
  if (!p2pOk) {
    verdict.className = 'diag-verdict show bad'
    verdict.innerHTML = '✗ P2P connection not available — calls will not work from this network. ' +
      'A TURN relay server would be needed, or try from a different network.'
  } else if (!results.media.ok) {
    verdict.className = 'diag-verdict show bad'
    verdict.innerHTML = '✗ Camera/mic access denied — grant permissions and re-run.'
  } else if ([results.stun, results.bw, results.latency].some(r => r?.ok === 'warn')) {
    verdict.className = 'diag-verdict show warn'
    verdict.innerHTML = '⚠ P2P is available but some conditions are suboptimal — call may have reduced quality.'
  } else {
    verdict.className = 'diag-verdict show good'
    verdict.innerHTML = '✓ All checks passed — P2P call should work reliably from this network.'
  }

  btn.disabled = false; btn.textContent = 'Run again'
}

const initDiagView = () => {
  showView('view-diag')
  document.getElementById('diag-run-btn').onclick  = runDiagnostics
  document.getElementById('diag-back-btn').onclick = () => history.back()
}
