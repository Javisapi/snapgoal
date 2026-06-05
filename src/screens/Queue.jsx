import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

async function getPlayer() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { console.log('NO SESSION'); return null }
  const key = 'player_' + session.user.id
  const cached = sessionStorage.getItem(key)
  if (cached) { console.log('PLAYER FROM CACHE', JSON.parse(cached).username); return JSON.parse(cached) }
  const { data } = await supabase.from('players').select('*').eq('auth_id', session.user.id).single()
  if (data) sessionStorage.setItem(key, JSON.stringify(data))
  console.log('PLAYER FROM DB', data?.username)
  return data
}

export default function Queue() {
  const navigate = useNavigate()
  const [dots, setDots] = useState('')
  const stateRef = useRef({ cancelled: false, queueId: null, channels: [] })

  useEffect(() => {
    console.log('QUEUE MOUNTED')
    const interval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 500)
    init()
    return () => {
      console.log('QUEUE UNMOUNTED')
      stateRef.current.cancelled = true
      clearInterval(interval)
      stateRef.current.channels.forEach(c => supabase.removeChannel(c))
      if (stateRef.current.queueId) {
        supabase.from('matchmaking_queue').delete().eq('id', stateRef.current.queueId)
      }
    }
  }, [])

  async function init() {
    console.log('INIT STARTED')
    const p = await getPlayer()
    console.log('PLAYER:', p?.username, 'CANCELLED:', stateRef.current.cancelled)
    if (!p) { console.log('NO PLAYER, NAVIGATING HOME'); navigate('/'); return }
    if (stateRef.current.cancelled) { console.log('CANCELLED EARLY'); return }

    await supabase.from('matchmaking_queue').delete().eq('player_id', p.id)
    await new Promise(r => setTimeout(r, 300))
    if (stateRef.current.cancelled) return

    console.log('INSERTING INTO QUEUE')
    const { data: entry, error } = await supabase
      .from('matchmaking_queue')
      .insert({ player_id: p.id, status: 'waiting' })
      .select().single()

    console.log('QUEUE ENTRY:', entry?.id, 'ERROR:', error)
    if (error || stateRef.current.cancelled) return
    stateRef.current.queueId = entry.id

    const ch1 = supabase
      .channel('queue-changes-' + p.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matchmaking_queue' },
        () => tryMatch(p, entry.id))
      .subscribe()
    stateRef.current.channels.push(ch1)

    const ch2 = supabase
      .channel('my-entry-' + entry.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'matchmaking_queue',
        filter: `id=eq.${entry.id}`,
      }, async (payload) => {
        console.log('MY ENTRY UPDATED:', payload.new.status)
        if (payload.new.status === 'matched') {
          const { data: match } = await supabase
            .from('matches').select('id')
            .or(`player1_id.eq.${p.id},player2_id.eq.${p.id}`)
            .eq('status', 'playing')
            .order('started_at', { ascending: false })
            .limit(1).single()
          console.log('MATCH FOUND:', match?.id)
          if (match && !stateRef.current.cancelled) navigate('/game/' + match.id)
        }
      })
      .subscribe()
    stateRef.current.channels.push(ch2)

    await tryMatch(p, entry.id)
  }

  async function tryMatch(p, myQueueId) {
    console.log('TRY MATCH called')
    if (stateRef.current.cancelled) return

    const { data: myEntry } = await supabase
      .from('matchmaking_queue').select('status, joined_at')
      .eq('id', myQueueId).single()
    if (!myEntry || myEntry.status !== 'waiting') return

    const { data: rivals } = await supabase
      .from('matchmaking_queue').select('*')
      .eq('status', 'waiting').neq('player_id', p.id)
      .order('joined_at', { ascending: true }).limit(1)

    console.log('RIVALS:', rivals?.length)
    if (!rivals || rivals.length === 0) return
    const rival = rivals[0]

    const myTime = new Date(myEntry.joined_at).getTime()
    const rivalTime = new Date(rival.joined_at).getTime()
    console.log('MY TIME:', myTime, 'RIVAL TIME:', rivalTime, 'I GO FIRST:', myTime <= rivalTime)
    if (myTime > rivalTime) return

    console.log('CREATING MATCH')
    const { data: match, error } = await supabase
      .from('matches')
      .insert({ player1_id: p.id, player2_id: rival.player_id, current_turn: p.id, status: 'playing' })
      .select().single()

    console.log('MATCH CREATED:', match?.id, 'ERROR:', error)
    if (error || !match) return

    await supabase.from('matchmaking_queue')
      .update({ status: 'matched' })
      .in('id', [myQueueId, rival.id])

    if (!stateRef.current.cancelled) navigate('/game/' + match.id)
  }

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
}
