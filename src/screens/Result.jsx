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
  @keyframes victoryFlash { 0%{opacity:0;transform:scale(2)} 20%{opacity:1;transform:scale(1)} 100%{opacity:1;transform:scale(1)} }
  @keyframes victoryLine { 0%{width:0} 100%{width:100%} }
  @keyframes defeatDrop { 0%{opacity:0;transform:translateY(-40px)} 100%{opacity:1;transform:translateY(0)} }
  @keyframes defeatFade { 0%{opacity:0} 100%{opacity:0.15} }
  @keyframes slideUp { 0%{transform:translateY(24px);opacity:0} 100%{transform:translateY(0);opacity:1} }
  @keyframes particleFloat { 0%{transform:translateY(0) rotate(0deg);opacity:1} 100%{transform:translateY(-120px) rotate(180deg);opacity:0} }
`

function VictoryBg() {
  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
      {[...Array(6)].map((_,i) => (
        <div key={i} style={{ position:'absolute', width: i%2===0 ? '2px' : '1px', height: `${40+i*15}px`, background: '#ffb400', left: `${10+i*16}%`, bottom: '-10px', opacity: 0, animation: `particleFloat ${1.2+i*0.3}s ease-out ${i*0.15}s forwards`, borderRadius: '1px' }}/>
      ))}
      {[...Array(6)].map((_,i) => (
        <div key={i+6} style={{ position:'absolute', width: `${4+i*2}px`, height: `${4+i*2}px`, background: i%3===0 ? '#ffb400' : 'rgba(255,180,0,0.4)', left: `${15+i*14}%`, bottom: '-10px', opacity: 0, animation: `particleFloat ${1+i*0.25}s ease-out ${0.1+i*0.12}s forwards`, borderRadius: i%2===0 ? '50%' : '2px' }}/>
      ))}
    </div>
  )
}

function DefeatBg() {
  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
      <div style={{ position:'absolute', inset:0, background: 'repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(255,68,68,0.03) 40px, rgba(255,68,68,0.03) 80px)', animation: 'defeatFade 0.8s ease forwards', opacity: 0 }}/>
    </div>
  )
}

export default function Result() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [match, setMatch] = useState(null)
  const [opponent, setOpponent] = useState(null)
  const [updatedPlayer, setUpdatedPlayer] = useState(null)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [rematchStatus, setRematchStatus] = useState(null)
  const [xpDelta, setXpDelta] = useState(null)
  const [rematchRequest, setRematchRequest] = useState(null)
  const channelRef = useRef(null)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)

    // Si este partido ya fue visto, volver a home
    const seenMatches = JSON.parse(sessionStorage.getItem('seen_matches') || '[]')
    if (seenMatches.includes(matchId)) { navigate('/'); return }

    init()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)

    const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single()
    if (!m) { navigate('/'); return }
    if (m?.xp_result) {
      setXpDelta(m.player1_id === p.id ? m.xp_result.p1_delta : m.xp_result.p2_delta)
    } else {
      // xp_result puede no estar listo aún — reintentar hasta 3 veces
      let attempts = 0
      const pollXp = setInterval(async () => {
        attempts++
        const { data: mRetry } = await supabase.from('matches').select('xp_result,player1_id').eq('id', matchId).single()
        if (mRetry?.xp_result) {
          setXpDelta(mRetry.player1_id === p.id ? mRetry.xp_result.p1_delta : mRetry.xp_result.p2_delta)
          clearInterval(pollXp)
        }
        if (attempts >= 5) clearInterval(pollXp)
      }, 1000)
    }

    // Si el partido tiene penaltis pendientes, redirigir a shootout
    if (m.pending_type === 'SHOOTOUT' && m.status !== 'finished') {
      navigate('/shootout/' + matchId)
      return
    }

    setMatch(m)

    const oppId = m.player1_id === p.id ? m.player2_id : m.player1_id
    const { data: opp } = await supabase.from('players').select('*').eq('id', oppId).single()
    setOpponent(opp)

    const { data: updP } = await supabase.from('players').select('*').eq('id', p.id).single()
    setUpdatedPlayer(updP)

    const isP1 = m.player1_id === p.id
    const myScore = isP1 ? m.score_p1 : m.score_p2
    const oppScore = isP1 ? m.score_p2 : m.score_p1
    setPointsEarned(myScore > oppScore ? 3 : myScore === oppScore ? 1 : 0)

    // Marcar como visto
    const seenMatches = JSON.parse(sessionStorage.getItem('seen_matches') || '[]')
    if (!seenMatches.includes(matchId)) {
      seenMatches.push(matchId)
      if (seenMatches.length > 10) seenMatches.shift()
      sessionStorage.setItem('seen_matches', JSON.stringify(seenMatches))
    }

    // Escuchar invitaciones de revancha
    const ch = supabase.channel('rematch-incoming-' + p.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'rematch_requests',
        filter: `opponent_id=eq.${p.id}`,
      }, (payload) => {
        const req = payload.new
        if (req.match_id === matchId && req.status === 'pending') {
          setRematchRequest(req)
          setRematchStatus('received')
        }
      })
      .subscribe()
    channelRef.current = ch
  }

  async function sendRematch() {
    if (!match || !player || !opponent) return
    setRematchStatus('sent')

    const { data: req } = await supabase.from('rematch_requests').insert({
      match_id: matchId,
      requester_id: player.id,
      opponent_id: opponent.id,
      league_id: match.league_id || null,
      expires_at: new Date(Date.now() + 20000).toISOString(),
    }).select().single()

    setRematchRequest(req)

    const ch = supabase.channel('rematch-sent-' + req.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'rematch_requests',
        filter: `id=eq.${req.id}`,
      }, async (payload) => {
        if (payload.new.status === 'accepted') {
          supabase.removeChannel(ch)
          // Soy el requester — creo el partido y guardo el ID en la solicitud
          const newMatch = await createRematch(match)
          if (newMatch) {
            await supabase.from('rematch_requests').update({ new_match_id: newMatch.id }).eq('id', req.id)
            navigate('/announce/' + newMatch.id)
          }
        } else if (payload.new.status === 'rejected' || payload.new.status === 'expired') {
          supabase.removeChannel(ch)
          setRematchStatus('rejected')
        }
      })
      .subscribe()

    setTimeout(async () => {
      const { data: current } = await supabase.from('rematch_requests').select('status').eq('id', req.id).single()
      if (current?.status === 'pending') {
        await supabase.from('rematch_requests').update({ status: 'expired' }).eq('id', req.id)
        supabase.removeChannel(ch)
        setRematchStatus('rejected')
      }
    }, 20000)
  }

  async function acceptRematch() {
    if (!rematchRequest || !match) return
    // Solo marcar como aceptado — el requester creará el partido y nos notificará
    await supabase.from('rematch_requests').update({ status: 'accepted' }).eq('id', rematchRequest.id)
    setRematchStatus('sent') // Mostrar "esperando..." mientras el requester crea el partido

    // Escuchar cuando el requester crea el partido
    const ch = supabase.channel('rematch-accepted-' + rematchRequest.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'rematch_requests',
        filter: `id=eq.${rematchRequest.id}`,
      }, async (payload) => {
        if (payload.new.new_match_id) {
          supabase.removeChannel(ch)
          navigate('/announce/' + payload.new.new_match_id)
        }
      })
      .subscribe()
  }

  async function rejectRematch() {
    if (!rematchRequest) return
    await supabase.from('rematch_requests').update({ status: 'rejected' }).eq('id', rematchRequest.id)
    setRematchStatus(null)
    setRematchRequest(null)
  }

  async function createRematch(m) {
    const { data: newMatch } = await supabase.from('matches').insert({
      player1_id: m.player1_id,
      player2_id: m.player2_id,
      current_turn: m.player1_id,
      status: 'announcing',
      league_id: m.league_id || null,
    }).select().single()
    return newMatch
  }

  if (!match || !opponent || !player || !updatedPlayer) return (
    <div style={styles.container}>
      <p style={{ color:'rgba(255,255,255,0.3)', textAlign:'center', fontSize:'0.9rem' }}>Cargando...</p>
    </div>
  )

  const isP1 = match.player1_id === player.id
  const myScore = isP1 ? match.score_p1 : match.score_p2
  const oppScore = isP1 ? match.score_p2 : match.score_p1
  const won = myScore > oppScore
  const drew = myScore === oppScore

  return (
    <div style={styles.container}>
      {won && <VictoryBg />}
      {!won && !drew && <DefeatBg />}

      <div style={styles.heroArea}>
        {won && (
          <>
            <div style={styles.victoryLabel}>VICTORIA</div>
            <div style={{ ...styles.victoryLine, animation: 'victoryLine 0.6s ease 0.3s both' }} />
          </>
        )}
        {!won && !drew && (
          <div style={{ ...styles.defeatLabel, animation: 'defeatDrop 0.5s ease forwards' }}>DERROTA</div>
        )}
        {drew && (
          <div style={styles.drawLabel}>PENALTIS</div>
        )}

        <div style={{ ...styles.scoreRow, animation: 'slideUp 0.4s ease 0.2s both' }}>
          <div style={styles.scoreBlock}>
            <span style={{ ...styles.scoreName, color: won ? '#ffb400' : 'rgba(255,255,255,0.5)' }}>{player.username}</span>
            <span style={{ ...styles.scoreNum, color: won ? '#fff' : 'rgba(255,255,255,0.4)' }}>{myScore}</span>
          </div>
          <div style={styles.scoreDivider} />
          <div style={styles.scoreBlock}>
            <span style={{ ...styles.scoreName, color: !won && !drew ? '#ff4444' : 'rgba(255,255,255,0.5)' }}>{opponent.username}</span>
            <span style={{ ...styles.scoreNum, color: !won && !drew ? 'rgba(255,100,100,0.8)' : 'rgba(255,255,255,0.4)' }}>{oppScore}</span>
          </div>
        </div>
      </div>

      <div style={{ ...styles.statsBox, animation: 'slideUp 0.4s ease 0.4s both' }}>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>puntos ganados</span>
          <span style={{ ...styles.statVal, color: '#ffb400' }}>+{pointsEarned}</span>
        </div>
        <div style={styles.statDivider} />
        {xpDelta !== null && (
          <>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>XP</span>
              <span style={{ ...styles.statVal, color: xpDelta >= 0 ? '#22c55e' : '#ff4444' }}>{xpDelta >= 0 ? '+' : ''}{xpDelta} XP</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.statRow}>
              <span style={styles.statLabel}>XP total</span>
              <span style={styles.statVal}>{updatedPlayer.xp_rating} XP</span>
            </div>
            <div style={styles.statDivider} />
          </>
        )}
        <div style={styles.statRow}>
          <span style={styles.statLabel}>total de puntos</span>
          <span style={styles.statVal}>{updatedPlayer.total_points}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statRow}>
          <span style={styles.statLabel}>partidos</span>
          <span style={styles.statVal}>{updatedPlayer.matches_played}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statRow}>
          <span style={styles.statLabel}>V / E / D</span>
          <span style={styles.statVal}>{updatedPlayer.matches_won}V / {updatedPlayer.matches_lost}D</span>
        </div>
      </div>

      <div style={{ ...styles.btnGroup, animation: 'slideUp 0.4s ease 0.6s both' }}>
        {rematchStatus === 'received' && rematchRequest && (
          <div style={styles.rematchBox}>
            <p style={styles.rematchTitle}>⚔️ {opponent.username} quiere la revancha</p>
            <div style={styles.rematchBtns}>
              <button style={styles.btnRematchAccept} onClick={acceptRematch}>Aceptar</button>
              <button style={styles.btnRematchReject} onClick={rejectRematch}>Rechazar</button>
            </div>
          </div>
        )}
        {rematchStatus === 'sent' && (
          <div style={styles.rematchBox}>
            <p style={styles.rematchTitle}>⏳ Esperando respuesta...</p>
          </div>
        )}
        {rematchStatus === 'rejected' && (
          <div style={styles.rematchBox}>
            <p style={styles.rematchTitle}>❌ Revancha rechazada</p>
          </div>
        )}
        {!rematchStatus && (
          <button style={styles.btnRematch} onClick={sendRematch}>⚔️ Revancha</button>
        )}
        <button style={styles.btnPrimary} onClick={() => {
          if (match?.league_id) navigate('/queue?league=' + match.league_id)
          else navigate('/queue')
        }}>
          Buscar otro partido
        </button>
        <button style={styles.btnSecondary} onClick={() => navigate('/')}>Inicio</button>
      </div>
    </div>
  )
}

const styles = {
  container: { height:'100%', display:'flex', flexDirection:'column', justifyContent:'space-between', padding:'2.5rem 1.75rem 3.5rem', background:'#141414', position:'relative', overflow:'hidden' },
  heroArea: { display:'flex', flexDirection:'column', gap:'1rem', marginTop:'1rem' },
  victoryLabel: { fontSize:'3.5rem', fontWeight:'900', color:'#ffb400', letterSpacing:'-2px', lineHeight:1, animation:'victoryFlash 0.7s ease forwards' },
  victoryLine: { height:'3px', background:'#ffb400', borderRadius:'2px', width:0 },
  defeatLabel: { fontSize:'3.5rem', fontWeight:'900', color:'rgba(255,68,68,0.7)', letterSpacing:'-2px', lineHeight:1 },
  drawLabel: { fontSize:'3rem', fontWeight:'900', color:'rgba(255,255,255,0.5)', letterSpacing:'-2px', lineHeight:1, animation:'slideUp 0.5s ease forwards' },
  scoreRow: { display:'flex', alignItems:'center', gap:'1.5rem' },
  scoreBlock: { display:'flex', flexDirection:'column', gap:'2px' },
  scoreName: { fontSize:'0.7rem', fontWeight:'600', letterSpacing:'1px', textTransform:'uppercase' },
  scoreNum: { fontSize:'4rem', fontWeight:'900', lineHeight:1, letterSpacing:'-2px' },
  scoreDivider: { width:'1px', height:'60px', background:'rgba(255,255,255,0.1)' },
  statsBox: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'16px', padding:'1.25rem' },
  statRow: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.5rem 0' },
  statLabel: { fontSize:'0.8rem', color:'rgba(255,255,255,0.3)', letterSpacing:'0.5px' },
  statVal: { fontSize:'0.9rem', fontWeight:'700', color:'#fff' },
  statDivider: { height:'1px', background:'rgba(255,255,255,0.05)' },
  btnGroup: { display:'flex', flexDirection:'column', gap:'0.75rem' },
  btnPrimary: { background:'#ffb400', color:'#141414', border:'none', borderRadius:'12px', padding:'1.1rem', fontSize:'1rem', fontWeight:'800', cursor:'pointer', width:'100%', letterSpacing:'0.5px' },
  btnSecondary: { background:'transparent', color:'rgba(255,255,255,0.25)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'12px', padding:'0.9rem', fontSize:'0.9rem', cursor:'pointer', width:'100%' },
  btnRematch: { background:'rgba(255,180,0,0.1)', border:'1px solid rgba(255,180,0,0.3)', borderRadius:'12px', padding:'1rem', fontSize:'1rem', fontWeight:'800', color:'#ffb400', cursor:'pointer', width:'100%' },
  rematchBox: { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'14px', padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem' },
  rematchTitle: { fontSize:'0.9rem', fontWeight:'700', color:'rgba(255,255,255,0.7)', textAlign:'center', margin:0 },
  rematchBtns: { display:'flex', gap:'0.75rem' },
  btnRematchAccept: { flex:1, background:'#ffb400', color:'#141414', border:'none', borderRadius:'10px', padding:'0.85rem', fontSize:'0.95rem', fontWeight:'800', cursor:'pointer' },
  btnRematchReject: { flex:1, background:'transparent', color:'rgba(255,255,255,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', padding:'0.85rem', fontSize:'0.9rem', cursor:'pointer' },
}
