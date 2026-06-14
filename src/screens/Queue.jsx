import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CERVERAI_ID = 'ec21fbbe-c14f-4677-aa19-052fd54ff364'

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

const QUEUE_TIMEOUT_MS = 10000

export default function Queue() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const leagueId = searchParams.get('league')
  const [dots, setDots] = useState('')
  const [noMatch, setNoMatch] = useState(false)
  const stateRef = useRef({
    cancelled: false,
    queueId: null,
    channel: null,
    intervals: [],
    timeoutId: null,
  })
  const initDoneRef = useRef(false)

  useEffect(() => {
    const dotsInterval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)
    stateRef.current.intervals.push(dotsInterval)
    init()
    return () => { cleanup() }
  }, [])

  function cleanup() {
    stateRef.current.cancelled = true
    stateRef.current.intervals.forEach(i => clearInterval(i))
    clearTimeout(stateRef.current.timeoutId)
    if (stateRef.current.channel) supabase.removeChannel(stateRef.current.channel)
    if (stateRef.current.queueId) {
      supabase.from('matchmaking_queue').delete().eq('id', stateRef.current.queueId)
    }
  }

  async function createBotMatch(player, leagueId = null) {
    const { data: match, error } = await supabase
      .from('matches')
      .insert({
        player1_id: player.id,
        player2_id: CERVERAI_ID,
        current_turn: player.id,
        status: 'announcing',
        is_bot_match: true,
        bot_name: 'Cerverai',
        player2_ready: true,
        ...(leagueId ? { league_id: leagueId } : {}),
      })
      .select()
      .single()
    if (error || !match) return null
    return match.id
  }

  async function init() {
    if (initDoneRef.current) return
    initDoneRef.current = true
    stateRef.current.cancelled = false
    const p = await getPlayer()
    if (!p || stateRef.current.cancelled) { navigate('/'); return }

    await supabase.from('matchmaking_queue').delete().eq('player_id', p.id)

    const expiresAt = new Date(Date.now() + QUEUE_TIMEOUT_MS).toISOString()
    const { data: entry, error } = await supabase
      .from('matchmaking_queue')
      .insert({ player_id: p.id, status: 'waiting', expires_at: expiresAt })
      .select().single()

    if (error || stateRef.current.cancelled) return
    stateRef.current.queueId = entry.id

    // Timeout: si no hay rival, crear partido contra el bot
    stateRef.current.timeoutId = setTimeout(async () => {
      if (stateRef.current.cancelled) return
      stateRef.current.cancelled = true
      await supabase.from('matchmaking_queue').delete().eq('id', entry.id)
      stateRef.current.queueId = null
      if (stateRef.current.channel) supabase.removeChannel(stateRef.current.channel)
      stateRef.current.intervals.forEach(i => clearInterval(i))

      const matchId = await createBotMatch(p, leagueId || null)
      if (matchId) {
        navigate('/announce/' + matchId)
        return
      }
      setNoMatch(true)
    }, QUEUE_TIMEOUT_MS)

    // Intentar emparejar inmediatamente
    const matchId = await tryMatchOnServer(p.id)
    console.log("CANCELLED:", stateRef.current.cancelled)
        if (matchId && !stateRef.current.cancelled) {
      clearTimeout(stateRef.current.timeoutId)
      navigate('/announce/' + matchId)
      return
    }

    const channel = supabase
      .channel('my-queue-' + entry.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'matchmaking_queue',
        filter: `id=eq.${entry.id}`,
      }, async (payload) => {
        if (payload.new.status === 'matched' && !stateRef.current.cancelled) {
          clearTimeout(stateRef.current.timeoutId)
          let found = false
          for (let i = 0; i < 10; i++) {
            if (stateRef.current.cancelled) break
            const { data: match } = await supabase
              .from('matches')
              .select('id')
              .or(`player1_id.eq.${p.id},player2_id.eq.${p.id}`)
              .in('status', ['announcing', 'playing'])
              .order('started_at', { ascending: false })
              .limit(1)
              .single()
            if (match) {
              navigate('/announce/' + match.id)
              found = true
              break
            }
            await new Promise(r => setTimeout(r, 500))
          }
        }
      })
      .subscribe()
    stateRef.current.channel = channel

    function scheduleNextPoll() {
      if (stateRef.current.cancelled) return
      const jitter = 1000 + Math.random() * 3000
      const t = setTimeout(async () => {
        if (stateRef.current.cancelled) return
        const matchId = await tryMatchOnServer(p.id)
        if (matchId && !stateRef.current.cancelled) {
          clearTimeout(stateRef.current.timeoutId)
          navigate('/announce/' + matchId)
        } else {
          scheduleNextPoll()
        }
      }, jitter)
      stateRef.current.intervals.push(t)
    }
    scheduleNextPoll()
  }

  async function tryMatchOnServer(playerId) {
    if (leagueId) {
      const { data, error } = await supabase.rpc('do_league_matchmaking', {
        p_player_id: playerId,
        p_league_id: leagueId,
      })
      if (error || !data) return null
      return data
    }
    const { data, error } = await supabase.rpc('do_matchmaking', { p_player_id: playerId })
    if (error || !data) return null
    return data
  }

  const styleTag = document.createElement('style')
  styleTag.textContent = `
    @keyframes pulse1 { 0%,100%{transform:scale(1);opacity:.6} 50%{transform:scale(1.15);opacity:.2} }
    @keyframes pulse2 { 0%,100%{transform:scale(1);opacity:.4} 50%{transform:scale(1.15);opacity:.1} }
    @keyframes pulse3 { 0%,100%{transform:scale(1);opacity:.2} 50%{transform:scale(1.15);opacity:.05} }
  `
  if (!document.getElementById('queue-styles')) {
    styleTag.id = 'queue-styles'
    document.head.appendChild(styleTag)
  }

  if (noMatch) return (
    <div style={styles.container}>
      <div style={styles.content}>
        <div style={styles.noMatchIcon}>✕</div>
        <h2 style={styles.noMatchTitle}>Sin oponente</h2>
        <p style={styles.noMatchText}>No hemos encontrado rival en 10 segundos.</p>
      </div>
      <div style={styles.noMatchBtns}>
        {leagueId && (
          <button style={styles.btnPrimary} onClick={() => { window.location.href = "/queue?league=" + leagueId }}>Volver a buscar en la Liga</button>
        )}
        {leagueId && (
          <button style={styles.btnSecondary} onClick={() => navigate("/league/" + leagueId)}>Volver a la Liga</button>
        )}
        <button style={leagueId ? styles.btnGhost : styles.btnPrimary} onClick={() => navigate("/")}>Volver al inicio</button>
      </div>
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
        <p style={styles.subtitle}>{leagueId ? 'Buscando rival en tu liga' : 'Tienes 10 segundos para encontrar partido'}</p>
      </div>
      <button style={styles.btnCancel} onClick={() => { cleanup(); navigate('/') }}>Cancelar</button>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'center', padding: '4rem 2rem', background: '#141414' },
  content: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem', marginTop: '4rem' },
  radar: { position: 'relative', width: '160px', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  radarRing1: { position: 'absolute', width: '160px', height: '160px', borderRadius: '50%', border: '2px solid #ffb400', animation: 'pulse1 2s ease-in-out infinite' },
  radarRing2: { position: 'absolute', width: '110px', height: '110px', borderRadius: '50%', border: '2px solid #ffb400', animation: 'pulse2 2s ease-in-out infinite 0.3s' },
  radarRing3: { position: 'absolute', width: '60px', height: '60px', borderRadius: '50%', border: '2px solid #ffb400', animation: 'pulse3 2s ease-in-out infinite 0.6s' },
  radarEmoji: { fontSize: '2rem', position: 'relative', zIndex: 1 },
  title: { fontSize: '1.5rem', fontWeight: '700', color: '#fff', textAlign: 'center', minWidth: '240px' },
  subtitle: { color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', textAlign: 'center' },
  btnCancel: { background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1rem 2rem', fontSize: '1rem', cursor: 'pointer', width: '100%' },
  btnPrimary: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '1.1rem', fontSize: '1rem', fontWeight: '800', cursor: 'pointer', width: '100%' },
  noMatchIcon: { fontSize: '3rem', color: 'rgba(255,255,255,0.2)', fontWeight: '900', lineHeight: 1, marginBottom: '1rem' },
  noMatchTitle: { fontSize: '1.5rem', fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: '0.5rem' },
  noMatchText: { fontSize: '0.95rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.5 },
  noMatchBtns: { display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' },
  btnSecondary: { background: 'transparent', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1rem', fontSize: '0.95rem', cursor: 'pointer', width: '100%' },
  btnGhost: { background: 'transparent', color: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '12px', padding: '0.75rem', fontSize: '0.85rem', cursor: 'pointer', width: '100%' },
}
