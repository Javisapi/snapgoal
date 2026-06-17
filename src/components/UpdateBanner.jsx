import { useEffect, useState } from 'react'

export default function UpdateBanner() {
  const [show, setShow] = useState(false)
  const [waitingWorker, setWaitingWorker] = useState(null)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return

      if (reg.waiting) {
        setWaitingWorker(reg.waiting)
        setShow(true)
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker)
            setShow(true)
          }
        })
      })
    })
  }, [])

  function handleAccept() {
    if (!waitingWorker) {
      window.location.reload()
      return
    }
    waitingWorker.postMessage('skipWaiting')
  }

  if (!show) return null

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <span style={styles.icon}>🔄</span>
        <h3 style={styles.title}>Actualización disponible</h3>
        <p style={styles.desc}>Hay una nueva versión de SnapGoal lista. Actualiza para ver las últimas mejoras.</p>
        <button style={styles.btn} onClick={handleAccept}>Aceptar</button>
      </div>
    </div>
  )
}

const styles = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1.5rem' },
  card: { background: '#1c1c1c', border: '1px solid rgba(255,180,0,0.25)', borderRadius: '18px', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', maxWidth: '320px', textAlign: 'center' },
  icon: { fontSize: '2.5rem', lineHeight: 1 },
  title: { fontSize: '1.1rem', fontWeight: '900', color: '#ffb400', margin: 0 },
  desc: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 },
  btn: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '0.9rem 2rem', fontSize: '0.95rem', fontWeight: '900', cursor: 'pointer', width: '100%', marginTop: '0.5rem' },
}
