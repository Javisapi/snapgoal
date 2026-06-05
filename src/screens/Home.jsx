import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function Home() {
  const { player, loading, registerPlayer } = useAuth()
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  async function handleRegister() {
    const name = username.trim()
    if (!name) { setError('Escribe tu nombre de jugador'); return }
    if (name.length < 3) { setError('Mínimo 3 caracteres'); return }
    if (name.length > 20) { setError('Máximo 20 caracteres'); return }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) { setError('Solo letras, números y guión bajo'); return }

    setSaving(true)
    setError('')
    const { player: newPlayer, error: authError } = await registerPlayer(name)
    if (authError) { setError(authError); setSaving(false); return }
    navigate('/queue')
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDeleteAccount() {
    if (!player) return
    setDeleting(true)
    await deleteAccount(player.id)
    setDeleting(false)
    setShowDeleteConfirm(false)
    navigate('/')
    window.location.reload()
  }

  async function handlePlay() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session && player) {
      sessionStorage.setItem('player_' + session.user.id, JSON.stringify(player))
      navigate('/queue')
    }
  }

  if (loading) return (
    <div style={styles.container}>
      <div style={styles.top}>
        <div style={styles.ball}>⚽</div>
        <h1 style={styles.title}>SnapGoal</h1>
      </div>
    </div>
  )

  if (player) return (
    <div style={styles.container}>
      <div style={styles.top}>
        <div style={styles.ball}>⚽</div>
        <h1 style={styles.title}>SnapGoal</h1>
        <p style={styles.subtitle}>El partido más rápido del mundo</p>
      </div>
      <div style={styles.form}>
        <div style={styles.welcomeBox}>
          <p style={styles.welcomeLabel}>Bienvenido de vuelta</p>
          <p style={styles.welcomeName}>{player.username}</p>
          <p style={styles.welcomeStats}>{player.total_points} pts · {player.matches_played} partidos</p>
        </div>
        <button style={styles.btnPrimary} onClick={handlePlay}>⚡ Buscar partido</button>
        <button style={styles.btnSecondary} onClick={() => navigate('/ranking')}>🏆 Ranking</button>
      </div>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.top}>
        <div style={styles.ball}>⚽</div>
        <h1 style={styles.title}>SnapGoal</h1>
        <p style={styles.subtitle}>El partido más rápido del mundo</p>
      </div>
      <div style={styles.form}>
        <div style={styles.registerBox}>
          <p style={styles.registerTitle}>Elige tu nombre de jugador</p>
          <p style={styles.registerSub}>Lo usarás siempre. No se puede cambiar.</p>
        </div>
        <input
          style={styles.input}
          type="text"
          placeholder="ej: javier_fc"
          value={username}
          onChange={e => setUsername(e.target.value.toLowerCase())}
          onKeyDown={e => e.key === 'Enter' && handleRegister()}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
        />
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.btnPrimary} onClick={handleRegister} disabled={saving}>
          {saving ? 'Creando cuenta...' : '⚡ Empezar a jugar'}
        </button>
        <button style={styles.btnSecondary} onClick={() => navigate('/ranking')}>🏆 Ranking</button>
      </div>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '3rem 2rem 4rem', background: '#141414', position: 'relative' },
  top: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '3rem' },
  ball: { fontSize: '5rem', lineHeight: 1 },
  title: { fontSize: '3rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-1px' },
  subtitle: { fontSize: '1rem', color: 'rgba(255,255,255,0.3)', marginTop: '0.25rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  welcomeBox: { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '16px', padding: '1.25rem', textAlign: 'center' },
  welcomeLabel: { fontSize: '0.8rem', color: '#ffb400', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.25rem' },
  welcomeName: { fontSize: '1.5rem', fontWeight: '800', color: '#ffffff', marginBottom: '0.25rem' },
  welcomeStats: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)' },
  registerBox: { textAlign: 'center', marginBottom: '0.5rem' },
  registerTitle: { fontSize: '1.1rem', fontWeight: '700', color: '#ffffff', marginBottom: '0.25rem' },
  registerSub: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.35)' },
  input: { background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1rem 1.25rem', fontSize: '1.1rem', color: '#fff', outline: 'none', width: '100%' },
  error: { color: '#ff4444', fontSize: '0.9rem', textAlign: 'center' },
  btnPrimary: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '1.1rem', fontSize: '1.1rem', fontWeight: '800', cursor: 'pointer', width: '100%' },
  btnSecondary: { background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1rem', fontSize: '1rem', cursor: 'pointer', width: '100%' },
  btnDelete: { background: 'transparent', color: 'rgba(255,80,80,0.5)', border: '1px solid rgba(255,80,80,0.15)', borderRadius: '12px', padding: '0.75rem', fontSize: '0.9rem', cursor: 'pointer', width: '100%' },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', zIndex: 100 },
  modal: { background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' },
  modalTitle: { fontSize: '1.2rem', fontWeight: '800', color: '#fff', textAlign: 'center', margin: 0 },
  modalText: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.6, margin: 0 },
  btnConfirmDelete: { background: '#ff4444', color: '#fff', border: 'none', borderRadius: '12px', padding: '1rem', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', width: '100%' },
  btnCancelDelete: { background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.9rem', fontSize: '0.95rem', cursor: 'pointer', width: '100%' },
}
