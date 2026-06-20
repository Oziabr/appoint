// ══════════════════════════════════════════════════════════════
// CALL
// ══════════════════════════════════════════════════════════════
let callPc        = null
let callStream    = null
let callChannel   = null  // Supabase Realtime channel
let callTimerInt  = null
let callStartTime = null
let callRole      = null  // 'host' | 'guest'

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

// ── call timer ──────────────────────────────────────────────
const startCallTimer = () => {
  callStartTime = Date.now()
  callTimerInt  = setInterval(() => {
    const s = Math.floor((Date.now() - callStartTime) / 1000)
    const m = Math.floor(s / 60)
    document.getElementById('call-timer').textContent =
      `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  }, 1000)
}

const stopCallTimer = () => {
  clearInterval(callTimerInt)
  callTimerInt = null
}

// ── update call status bar ───────────────────────────────────
const setCallStatus = (msg, hidden = false) => {
  const el = document.getElementById('call-status')
  el.textContent = msg
  el.classList.toggle('hidden', hidden)
}

const updateCallStats = async () => {
  if (!callPc) return
  const stats = await callPc.getStats()
  const parts = []
  stats.forEach(s => {
    if (s.type === 'inbound-rtp' && s.kind === 'video' && s.framesPerSecond)
      parts.push(`↓ ${Math.round(s.bytesReceived/1024)}KB ${s.framesPerSecond}fps`)
    if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.currentRoundTripTime)
      parts.push(`RTT ${Math.round(s.currentRoundTripTime*1000)}ms`)
  })
  if (parts.length) document.getElementById('call-stats').textContent = parts.join(' · ')
}

// ── signaling via Supabase Realtime ─────────────────────────
const sendSignal = (type, payload) =>
  callChannel.send({ type: 'broadcast', event: 'signal', payload: { type, payload, from: callRole } })

const setupPeerConnection = stream => {
  callPc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  stream.getTracks().forEach(t => callPc.addTrack(t, stream))

  callPc.ontrack = e => {
    const remote = document.getElementById('call-remote')
    remote.srcObject = e.streams[0]
    setCallStatus('', true)
    document.getElementById('call-label') &&
      (document.querySelector('.call-label').textContent = 'CONNECTED')
    startCallTimer()
    // stats polling
    setInterval(updateCallStats, 2000)
  }

  callPc.onicecandidate = e => {
    if (e.candidate) sendSignal('ice', e.candidate.toJSON())
  }

  callPc.onconnectionstatechange = () => {
    const state = callPc.connectionState
    if (state === 'disconnected' || state === 'failed') {
      setCallStatus('Peer disconnected')
      stopCallTimer()
    }
  }

  return callPc
}

// ── init call view ───────────────────────────────────────────
const initCallView = async (bookingId, role) => {
  callRole = role
  showView('view-call')
  setCallStatus('Getting camera and microphone…')

  try {
    callStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  } catch (e) {
    setCallStatus('Camera/mic access denied — cannot start call')
    return
  }

  document.getElementById('call-local').srcObject = callStream

  // Supabase Realtime channel keyed by booking ID
  callChannel = sb.channel(`call:${bookingId}`, { config: { broadcast: { self: false } } })

  callChannel.on('broadcast', { event: 'signal' }, async ({ payload: msg }) => {
    if (!callPc) return

    if (msg.type === 'offer' && role === 'guest') {
      await callPc.setRemoteDescription(new RTCSessionDescription(msg.payload))
      const answer = await callPc.createAnswer()
      await callPc.setLocalDescription(answer)
      sendSignal('answer', answer)
      setCallStatus('Connecting…')
    }
    if (msg.type === 'answer' && role === 'host') {
      await callPc.setRemoteDescription(new RTCSessionDescription(msg.payload))
    }
    if (msg.type === 'ice') {
      try { await callPc.addIceCandidate(new RTCIceCandidate(msg.payload)) } catch {}
    }
    if (msg.type === 'bye') {
      endCall(false)
    }
  })

  await callChannel.subscribe(async status => {
    if (status !== 'SUBSCRIBED') return
    setCallStatus('Waiting for peer…')
    setupPeerConnection(callStream)

    if (role === 'host') {
      // host creates the offer
      setCallStatus('Starting call — share the link with your guest')
      const offer = await callPc.createOffer()
      await callPc.setLocalDescription(offer)
      sendSignal('offer', offer)
    }
  })

  // controls
  document.getElementById('call-btn-mic').onclick = () => {
    const track = callStream.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    document.getElementById('call-btn-mic').classList.toggle('muted', !track.enabled)
  }
  document.getElementById('call-btn-cam').onclick = () => {
    const track = callStream.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    document.getElementById('call-btn-cam').classList.toggle('muted', !track.enabled)
  }
  document.getElementById('call-btn-end').onclick = () => endCall(true)
}

const endCall = (sendBye = true) => {
  if (sendBye && callChannel) sendSignal('bye', {})
  stopCallTimer()
  callStream?.getTracks().forEach(t => t.stop())
  callPc?.close()
  callChannel && sb.removeChannel(callChannel)
  callPc = callStream = callChannel = null
  // return to previous view
  const params = new URLSearchParams(location.search)
  params.has('host') ? initBookingView(params.get('host')) : history.back()
}
