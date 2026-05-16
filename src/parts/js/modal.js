// MODAL
// ══════════════════════════════════════════════════════════════
const openModal = (title, body) => {
  document.getElementById('modal-title').textContent = title
  document.getElementById('modal-body').innerHTML    = body
  document.getElementById('modal-bg').style.display  = 'grid'
}
document.getElementById('modal-cancel').onclick = () =>
  document.getElementById('modal-bg').style.display = 'none'
document.getElementById('modal-bg').onclick = e => {
  if (e.target === document.getElementById('modal-bg'))
    document.getElementById('modal-bg').style.display = 'none'
}

// ══════════════════════════════════════════════════════════════
