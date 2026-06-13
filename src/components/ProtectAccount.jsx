import { useState } from 'react'
import { supabase } from '../lib/supabase'

function shouldShowBanner(matchesPlayed) {
  if (!matchesPlayed) return false
  const triggers = [5, 20, 50, 100]
  if (matchesPlayed < 5) return false
  if (triggers.includes(matchesPlayed)) return true
  if (matchesPlayed >= 150 && matchesPlayed % 50 === 0) return true
  return false
}

export function useShouldShowProtect(player) {
  if (!player) return false
  if (player.email_verified) return false
  return shouldShowBanner(player.matches_played)
}

export default function ProtectAccount({ player, onDone, onDismiss, inline = false }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Introduce un email válido')
      return
    }
    setLoading(true)
    setError('')

    console.log("EMAIL BEING SENT:", JSON.stringify(trimmed))
    const { error: updateError } = await supabase.auth.signInWithOtp({ email: trimmed, options: { shouldCreateUser: true } })
    if (updateError) {
      setError('Error al vincular el email. Inténtalo de nuevo.')
      setLoading(false)
      return
    }

    await supabase.from('players').update({ email: trimmed }).eq('id', player.id)

    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const key = 'player_' + session.user.id
      const cached = JSON.parse(sessionStorage.getItem(key) || '{}')
      sessionStorage.setItem(key, JSON.stringify({ ...cached, email: trimmed }))
    }

    setSent(true)
    setLoading(false)
    if (onDone) setTimeout(onDone, 3000)
  }

  if (sent) return (
    <div style={styles.wrap(inline)}>
      <p style={styles.title}>✅ ¡Listo! Revisa tu email</p>
      <p style={styles.sub}>Te hemos enviado un enlace de verificación a <strong>{email}</strong>. Haz clic en él para activar la protección de tu cuenta.</p>
    </div>
  )

  return (
    <div style={styles.wrap(inline)}>
      <div style={styles.header}>
        <span style={styles.icon}>🏆</span>
        <div>
          <p style={styles.title}>
            ¡Llevas {player?.matches_played} partidos! No pierdas tu progreso
          </p>
          <p style={styles.sub}>Vincula tu email en un minuto y tu cuenta, puntos y victorias estarán seguros para siempre.</p>
        </div>
      </div>
      <input
        style={styles.input}
        type="email"
        placeholder="tu@email.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        autoCapitalize="none"
        autoCorrect="off"
      />
      {error && <p style={styles.error}>{error}</p>}
      <div style={styles.btns}>
        <button style={styles.btnPrimary} onClick={handleSubmit} disabled={loading}>
          {loading ? 'Enviando...' : 'Proteger mi cuenta'}
        </button>
        {onDismiss && (
          <button style={styles.btnGhost} onClick={onDismiss}>Ahora no</button>
        )}
      </div>
    </div>
  )
}

export function ProtectedBadge({ size = 18 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(0,200,80,0.15)', border: '1.5px solid #00c850', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: size * 0.6 + 'px', color: '#00c850', fontWeight: '900', lineHeight: 1 }}>✓</span>
    </div>
  )
}

const styles = {
  wrap: (inline) => ({
    background: inline ? 'transparent' : 'rgba(255,180,0,0.06)',
    border: inline ? 'none' : '1px solid rgba(255,180,0,0.2)',
    borderRadius: '16px',
    padding: inline ? '0' : '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  }),
  header: { display: 'flex', gap: '0.75rem', alignItems: 'flex-start' },
  icon: { fontSize: '1.5rem', flexShrink: 0, marginTop: '2px' },
  title: { fontSize: '0.9rem', fontWeight: '800', color: '#fff', margin: 0, lineHeight: 1.3 },
  sub: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', margin: '4px 0 0', lineHeight: 1.5 },
  input: { background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', borderRadius: 0, padding: '0.6rem 0', fontSize: '1rem', fontWeight: '600', color: '#fff', outline: 'none', width: '100%' },
  error: { fontSize: '0.8rem', color: '#ff4444', margin: 0 },
  btns: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  btnPrimary: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '10px', padding: '0.85rem', fontSize: '0.9rem', fontWeight: '800', cursor: 'pointer', width: '100%' },
  btnGhost: { background: 'transparent', color: 'rgba(255,255,255,0.25)', border: 'none', padding: '0.4rem', fontSize: '0.8rem', cursor: 'pointer', width: '100%' },
  badge: { display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,200,80,0.08)', border: '1px solid rgba(0,200,80,0.25)', borderRadius: '20px', padding: '5px 12px', width: 'fit-content' },
  badgeDot: { fontSize: '0.75rem', color: '#00c850', fontWeight: '900' },
  badgeText: { fontSize: '0.72rem', fontWeight: '700', color: '#00c850', letterSpacing: '0.3px' },
}
