import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

async function getPlayer() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data } = await supabase.from('players').select('*').eq('auth_id', session.user.id).single()
  if (data) sessionStorage.setItem('player_' + session.user.id, JSON.stringify(data))
  return data
}

export default function Queue() {
  const navigate = useNavigate()
  const [dots, setDots] = useState('')
  const [noMatch, setNoMatch] = useState(false)
  const stateRef = useRef({ cancelled: false, queueId: null, channel: null, intervals: [] })

  useEffect(() => {
    const dotsInterval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)

    // Timeout de 10 segundos
    const timeoutId = setTimeout(() => {
      if (!stateRef.current.cancelled) {
        stateRef.current.cancelled = true
        setNoMatch(true)
        if (stateRef.current.queueId) {
          supabase.from('matchmaking_queue').delete().eq('id', stateRef.current.queueId)
        }
      }
    }, 10000)

    init()
    return () => {
      clearTimeout(timeoutId)
      stateRef.current.cancelled = true
      clearInterval(dotsInterval)
      stateRef.current.intervals.forEach(i => clearInterval(i))
      if (stateRef.current.channel) supabase.removeChannel(stateRef.current.channel)
      if (stateRef.current.queueId) {
        supabase.from('matchmaking_queue').delete().eq('id', stateRef.current.queueId)
      }
    }
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p || stateRef.current.cancelled) { navigate('/'); return }

    // Limpiar entradas anteriores
    await supabase.from('matchmaking_queue').delete().eq('player_id', p.id)

    // Entrar en cola
    const { data: entry, error } = await supabase
      .from('matchmaking_queue')
      .insert({ player_id: p.id, status: 'waiting' })
      .select().single()

    if (error || stateRef.current.cancelled) return
    stateRef.current.queueId = entry.id

    // Intentar emparejar inmediatamente
    const matchId = await tryMatchOnServer(p.id)
    if (matchId) { navigate('/game/' + matchId); return }

    // Polling para detectar partido activo aunque falle Realtime
    const activeCheckInterval = setInterval(async () => {
      if (stateRef.current.cancelled) return
      const { data: activeMatch } = await supabase
        .from('matches')
        .select('id')
        .or(`player1_id.eq.${p.id},player2_id.eq.${p.id}`)
        .eq('status', 'playing')
        .order('started_at', { ascending: false })
        .limit(1)
        .single()
      if (activeMatch && !stateRef.current.cancelled) {
        navigate('/game/' + activeMatch.id)
      }
    }, 2000)
    stateRef.current.intervals.push(activeCheckInterval)

    // Escuchar cuando me empareja el servidor
    const channel = supabase
      .channel('my-queue-' + entry.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'matchmaking_queue',
        filter: `id=eq.${entry.id}`,
      }, async (payload) => {
        if (payload.new.status === 'matched' && !stateRef.current.cancelled) {
          // Buscar el partido creado
          const { data: match } = await supabase
            .from('matches')
            .select('id')
            .or(`player1_id.eq.${p.id},player2_id.eq.${p.id}`)
            .eq('status', 'playing')
            .order('started_at', { ascending: false })
            .limit(1)
            .single()
          if (match) navigate('/game/' + match.id)
        }
      })
      .subscribe()

    stateRef.current.channel = channel

    // Polling cada 2 segundos — cada jugador intenta emparejar
    const pollInterval = setInterval(async () => {
      if (stateRef.current.cancelled) return
      const matchId = await tryMatchOnServer(p.id)
      if (matchId && !stateRef.current.cancelled) {
        navigate('/game/' + matchId)
      }
    }, 2000)

    stateRef.current.intervals.push(pollInterval)
  }

  async function tryMatchOnServer(playerId) {
    const { data, error } = await supabase.rpc('do_matchmaking', { p_player_id: playerId })
    if (error || !data) return null
    return data
  }

  if (noMatch) return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.noMatchIcon}>✕</div>
        <h2 style={styles.noMatchTitle}>Sin oponente</h2>
        <p style={styles.noMatchText}>Lo siento. No hemos encontrado oponente. ¡Vuelve a intentarlo!</p>
      </div>
      <button style={styles.btnPrimary} onClick={() => navigate('/')}>Volver al inicio</button>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.radar}>
          <div style={styles.radarRing1} />
          <div style={styles.radarRing2} />
          <div style={styles.radarRing3} />
          <span style={styles.radarEmoji}>⚽</span>
        </div>
        <h2 style={styles.title}>Buscando rival{dots}</h2>
        <p style={styles.subtitle}>Conectando con otro jugador</p>
      </div>
      <button style={styles.btnCancel} onClick={() => navigate('/')}>Cancelar</button>
    </div>
  )
}

const styleTag = document.createElement('style')
styleTag.textContent = `
  @keyframes pulse1 { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.15);opacity:.2} }
  @keyframes pulse2 { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.15);opacity:.1} }
  @keyframes pulse3 { 0%,100%{transform:scale(1);opacity:.2} 50%{transform:scale(1.15);opacity:.05} }
`
document.head.appendChild(styleTag)

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', padding: '4rem 2rem', background: '#141414' },
  content: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', marginTop: '4rem' },
  radar: { position: 'relative', width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  radarRing1: { position: 'absolute', width: '160px', height: '160px', borderRadius: '50%', border: '2px solid #ffb400', animation: 'pulse1 2s ease-in-out infinite' },
  radarRing2: { position: 'absolute', width: '110px', height: '110px', borderRadius: '50%', border: '2px solid #ffb400', animation: 'pulse2 2s ease-in-out infinite 0.3s' },
  radarRing3: { position: 'absolute', width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #ffb400', animation: 'pulse3 2s ease-in-out infinite 0.6s' },
  radarEmoji: { fontSize: '2rem', position: 'relative', zIndex: 1 },
  title: { fontSize: '1.5rem', fontWeight: '700', color: '#fff', textAlign: 'center', minWidth: '240px' },
  subtitle: { color: 'rgba(255,255,255,0.3)', fontSize: '1rem', textAlign: 'center' },
  btnCancel: { background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1rem 2rem', fontSize: '1rem', cursor: 'pointer', width: '100%' },
  btnPrimary: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '1.1rem', fontSize: '1rem', fontWeight: '800', cursor: 'pointer', width: '100%' },
  noMatchIcon: { fontSize: '3rem', color: 'rgba(255,255,255,0.2)', fontWeight: '900', lineHeight: 1, marginBottom: '1rem' },
  noMatchTitle: { fontSize: '1.5rem', fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: '0.5rem' },
  noMatchText: { fontSize: '0.95rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.5 },
}
