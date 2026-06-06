import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

async function getPlayer() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const key = 'player_' + session.user.id
  const cached = sessionStorage.getItem(key)
  if (cached) return JSON.parse(cached)
  const { data } = await supabase.from('players').select('*').eq('auth_id', session.user.id).single()
  if (data) sessionStorage.setItem(key, JSON.stringify(data))
  return data
}

const CSS = `
  @keyframes announceIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
  @keyframes vsFlash { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes countdownShrink { from{width:100%} to{width:0%} }
`

export default function Announce() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [opponent, setOpponent] = useState(null)
  const [match, setMatch] = useState(null)
  const [iReady, setIReady] = useState(false)
  const [opponentReady, setOpponentReady] = useState(false)
  const [countdown, setCountdown] = useState(10)
  const [cancelled, setCancelled] = useState(false)
  const channelRef = useRef(null)
  const countdownRef = useRef(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)
    init()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      clearInterval(countdownRef.current)
    }
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)

    const { data: m } = await supabase
      .from('matches').select('*').eq('id', matchId).single()
    if (!m) { navigate('/'); return }
    setMatch(m)

    const oppId = m.player1_id === p.id ? m.player2_id : m.player1_id
    const { data: opp } = await supabase
      .from('players').select('*').eq('id', oppId).single()
    setOpponent(opp)

    // Si ya está en playing navegar directo
    if (m.status === 'playing') { navigate('/game/' + matchId); return }

    // Escuchar cambios
    const channel = supabase
      .channel('announce-' + matchId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'matches', filter: `id=eq.${matchId}`,
      }, (payload) => {
        const updated = payload.new
        setMatch({ ...updated })
        const isP1 = m.player1_id === p.id
        setOpponentReady(isP1 ? updated.player2_ready : updated.player1_ready)
        if (updated.status === 'playing') {
          clearInterval(countdownRef.current)
          navigate('/game/' + matchId)
        }
        if (updated.status === 'cancelled') {
          clearInterval(countdownRef.current)
          cancelledRef.current = true
          setCancelled(true)
        }
      })
      .subscribe()
    channelRef.current = channel

    // Countdown de 10 segundos
    countdownRef.current = setInterval(async () => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current)
          if (!cancelledRef.current) {
            // Cancelar partido
            supabase.from('matches').update({ status: 'cancelled' }).eq('id', matchId)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  async function handleReady() {
    if (!player || !match || iReady) return
    setIReady(true)
    const isP1 = match.player1_id === player.id
    const update = isP1 ? { player1_ready: true } : { player2_ready: true }

    // Verificar si el rival ya está listo
    const { data: current } = await supabase
      .from('matches').select('*').eq('id', matchId).single()

    const bothReady = isP1
      ? (current.player2_ready === true)
      : (current.player1_ready === true)

    if (bothReady) {
      clearInterval(countdownRef.current)
      await supabase.from('matches').update({
        ...update,
        status: 'playing',
        turn_started_at: new Date().toISOString(),
      }).eq('id', matchId)
      navigate('/game/' + matchId)
    } else {
      await supabase.from('matches').update(update).eq('id', matchId)
    }
  }

  if (cancelled) return (
    <div style={styles.container}>
      <div style={styles.cancelBox}>
        <p style={styles.cancelTitle}>Partido cancelado</p>
        <p style={styles.cancelText}>Ningún jugador confirmó a tiempo.</p>
        <button style={styles.btnPrimary} onClick={() => navigate('/')}>Volver al inicio</button>
      </div>
    </div>
  )

  if (!player || !opponent || !match) return (
    <div style={styles.container}>
      <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Cargando...</p>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <p style={styles.foundLabel}>¡Rival encontrado!</p>

        <div style={styles.playersRow}>
          <div style={styles.playerCard}>
            <p style={styles.playerName}>{player.username}</p>
            <div style={styles.statsRow}>
              <span style={styles.statItem}>{player.matches_won}<span style={styles.statLabel}>V</span></span>
              <span style={styles.statItem}>{player.matches_drawn}<span style={styles.statLabel}>E</span></span>
              <span style={styles.statItem}>{player.matches_lost}<span style={styles.statLabel}>D</span></span>
            </div>
            <p style={styles.pts}>{player.total_points} pts</p>
            <div style={styles.readyStatus}>
              {iReady
                ? <span style={styles.readyYes}>Listo ✓</span>
                : <span style={styles.readyNo}>Esperando...</span>
              }
            </div>
          </div>

          <div style={styles.vsCol}>
            <span style={styles.vs}>VS</span>
          </div>

          <div style={styles.playerCard}>
            <p style={styles.playerName}>{opponent.username}</p>
            <div style={styles.statsRow}>
              <span style={styles.statItem}>{opponent.matches_won}<span style={styles.statLabel}>V</span></span>
              <span style={styles.statItem}>{opponent.matches_drawn}<span style={styles.statLabel}>E</span></span>
              <span style={styles.statItem}>{opponent.matches_lost}<span style={styles.statLabel}>D</span></span>
            </div>
            <p style={styles.pts}>{opponent.total_points} pts</p>
            <div style={styles.readyStatus}>
              {opponentReady
                ? <span style={styles.readyYes}>Listo ✓</span>
                : <span style={styles.readyNo}>Esperando...</span>
              }
            </div>
          </div>
        </div>

        <div style={styles.countdownBar}>
          <div style={{
            ...styles.countdownFill,
            width: `${countdown * 10}%`,
            background: countdown > 5 ? '#ffb400' : '#ff4444',
            transition: 'width 1s linear, background 0.3s ease',
          }} />
        </div>
        <p style={styles.countdownText}>El partido se cancela en {countdown}s</p>
      </div>

      <button
        style={{ ...styles.btnPrimary, opacity: iReady ? 0.5 : 1 }}
        onClick={handleReady}
        disabled={iReady}
      >
        {iReady ? '✓ Confirmado — esperando rival' : 'JUGAR'}
      </button>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '3rem 1.75rem 4rem', background: '#141414', animation: 'announceIn 0.4s ease forwards' },
  content: { display: 'flex', flexDirection: 'column', gap: '2rem' },
  foundLabel: { fontSize: '0.8rem', color: '#ffb400', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', textAlign: 'center', margin: 0 },
  playersRow: { display: 'flex', alignItems: 'center', gap: '1rem' },
  playerCard: { flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', alignItems: 'center' },
  playerName: { fontSize: '1rem', fontWeight: '800', color: '#fff', margin: 0, textAlign: 'center', wordBreak: 'break-all' },
  statsRow: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  statItem: { fontSize: '0.9rem', fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', marginLeft: '1px' },
  pts: { fontSize: '0.75rem', color: '#ffb400', fontWeight: '700', margin: 0 },
  readyStatus: { marginTop: '0.25rem' },
  readyYes: { fontSize: '0.75rem', color: '#00dc64', fontWeight: '700' },
  readyNo: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' },
  vsCol: { display: 'flex', flexDirection: 'column', alignItems: 'center' },
  vs: { fontSize: '1rem', fontWeight: '900', color: 'rgba(255,255,255,0.2)', animation: 'vsFlash 2s ease-in-out infinite' },
  countdownBar: { height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' },
  countdownFill: { height: '100%', borderRadius: '2px' },
  countdownText: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', margin: 0 },
  btnPrimary: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '1.25rem', fontSize: '1.1rem', fontWeight: '900', cursor: 'pointer', width: '100%', letterSpacing: '1px' },
  cancelBox: { display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', justifyContent: 'center', height: '100%' },
  cancelTitle: { fontSize: '1.5rem', fontWeight: '800', color: '#fff', margin: 0 },
  cancelText: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)', margin: 0 },
}
