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
  @keyframes replayIn { 0%{opacity:0;transform:scale(1.05)} 100%{opacity:1;transform:scale(1)} }
  @keyframes replayCentFlash { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes replayGoalPop { 0%{opacity:0;transform:scale(0.5)} 60%{transform:scale(1.15)} 100%{opacity:1;transform:scale(1)} }
  @keyframes replayRing { 0%{transform:scale(0.8);opacity:0.8} 100%{transform:scale(2.5);opacity:0} }
  @keyframes recBlink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes missionBannerIn { 0%{opacity:0;transform:translateY(30px) scale(0.95)} 100%{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes missionBannerOut { 0%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(0.95)} }
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
  const [completedMissions, setCompletedMissions] = useState([])
  const [showMissionBanner, setShowMissionBanner] = useState(false)
  const [currentMissionIdx, setCurrentMissionIdx] = useState(0)
  const [showReplay, setShowReplay] = useState(true)
  const [replayCents, setReplayCents] = useState(null)
  const [replayResult, setReplayResult] = useState(null)
  const [replayGoalCents, setReplayGoalCents] = useState(null)
  const replayIntervalRef = useRef(null)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)

    // Si este partido ya fue visto, volver a home
    const seenMatches = JSON.parse(sessionStorage.getItem('seen_matches') || '[]')
    if (seenMatches.includes(matchId)) { navigate('/'); return }

    init()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current); clearInterval(replayIntervalRef.current) }
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

    // Misiones completadas en este partido
    const completedMissionsData = m.missions_result?.completed_missions || []
    if (completedMissionsData.length > 0) {
      setCompletedMissions(completedMissionsData)
    }

    // Replay del último gol — obtener todas las jugadas ordenadas globalmente
    const { data: allPlays } = await supabase
      .from('plays')
      .select('centesimas, result, player_id')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true })

    const finalCents = m.elapsed_centesimas || 0
    const GOL_RESULTS = ['GOL_DIRECTO', 'FALTA', 'PENALTY', 'CORNER', 'GOL_PROPIO']

    // Encontrar el índice global de la última jugada GOL del ganador
    let lastGoalIdx = -1
    if (allPlays) {
      for (let i = allPlays.length - 1; i >= 0; i--) {
        if (allPlays[i].player_id === m.winner_id && GOL_RESULTS.includes(allPlays[i].result)) {
          lastGoalIdx = i
          break
        }
      }
    }
    const lastPlay = lastGoalIdx >= 0 ? allPlays[lastGoalIdx] : null
    // La jugada anterior en el orden global (puede ser del rival)
    const prevPlay = lastGoalIdx > 0 ? allPlays[lastGoalIdx - 1] : null
    const startCents = prevPlay ? prevPlay.centesimas : Math.max(0, finalCents - 25)
    const goalCents = lastPlay ? lastPlay.centesimas : finalCents
    const lastPlayResult = lastPlay?.result || 'GOL_DIRECTO'

    setReplayResult(lastPlayResult)
    setReplayGoalCents(goalCents)

    // Si no hay replay válido (no se encontró gol del ganador), saltar replay y mostrar banner
    if (lastGoalIdx < 0 || !lastPlay) {
      setShowReplay(false)
      if (completedMissionsData.length > 0) setShowMissionBanner(true)
      return
    }

    setReplayCents(startCents)
    let current = startCents
    const totalFrames = Math.max(goalCents - startCents, 1)
    const frameDuration = Math.min(Math.max(Math.floor(2400 / totalFrames), 20), 120)
    replayIntervalRef.current = setInterval(() => {
      current += 1
      setReplayCents(current)
      if (current >= goalCents) {
        clearInterval(replayIntervalRef.current)
        setTimeout(() => {
          setShowReplay(false)
          setShowMissionBanner(true)
        }, 1000)
      }
    }, frameDuration)

    const oppId = m.player1_id === p.id ? m.player2_id : m.player1_id
    const { data: opp } = await supabase.from('players').select('*').eq('id', oppId).single()
    setOpponent(opp)

    const { data: updP } = await supabase.from('players').select('*').eq('id', p.id).single()
    setUpdatedPlayer(updP)
    // Actualizar caché para que Announce muestre stats correctas
    if (updP) sessionStorage.setItem('player_' + p.auth_id, JSON.stringify(updP))

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
  const iWon = match.winner_id === player.id
  const winnerName = match.winner_id === match.player1_id
    ? (isP1 ? player.username : opponent?.username)
    : (isP1 ? opponent?.username : player.username)

  const lastEvent = match.last_event ? (() => { try { return JSON.parse(match.last_event) } catch(e) { return null } })() : null
  const goalEmoji = lastEvent?.emoji || '⚽'
  const goalLabel = lastEvent?.label || 'Último gol'

  const replaySecs = replayCents !== null ? Math.floor(replayCents / 100) : 0
  const replayCentsDisplay = replayCents !== null ? replayCents % 100 : 0
  const isLastFrame = replayCents !== null && replayGoalCents !== null && replayCents >= replayGoalCents

  const goalTypeLabel = {
    'GOL_DIRECTO': 'Gol directo',
    'FALTA': 'Gol de falta',
    'PENALTY': 'Gol de penalty',
    'CORNER': 'Gol de córner',
    'GOL_PROPIO': 'Gol en propia',
    'NORMAL': 'Gol',
  }[replayResult] || 'Gol'

  // Banner de misión completada — pantalla intermedia entre replay y resultado
  function handleClaimMission() {
    if (currentMissionIdx + 1 < completedMissions.length) {
      setCurrentMissionIdx(i => i + 1)
    } else {
      setShowMissionBanner(false)
    }
  }

  if (showMissionBanner && completedMissions.length > 0) {
    const mission = completedMissions[currentMissionIdx]
    const missionNames = {
      win_streak_3: 'Hat-Trick de Victorias',
      goals_20: 'Beast Mode',
      clean_sheet_win: 'Muralla Infranqueable',
      falta_goals_10: 'Sniper de Élite',
      play_10: 'Maratoniano',
      secret: (() => {
        const doy = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000)
        const types = ['¡Accidente Histórico!', '¡Velocidad de Vértigo!', '¡Primer Tiro, Primer Gol!', '¡Goleada Perfecta!']
        return types[doy % 4]
      })(),
    }
    const missionIcons = {
      win_streak_3: '🏆', goals_20: '💥', clean_sheet_win: '🛡️',
      falta_goals_10: '⚡', play_10: '🎮', secret: (() => { const doy = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000); return ['💥','⚡','🎯','🔥'][doy % 4] })(),
    }
    return (
      <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'space-between', background:'#141414', padding:'3rem 2rem 4rem', animation:'missionBannerIn 0.4s ease forwards' }}>
        <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.25)', letterSpacing:'3px', textTransform:'uppercase', margin:0 }}>MISIÓN COMPLETADA</p>

        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'2rem' }}>
          <span style={{ fontSize:'5rem', lineHeight:1 }}>{missionIcons[mission.mission] || '⚡'}</span>
          <h2 style={{ fontSize:'2.2rem', fontWeight:'900', color:'#ffb400', margin:0, textAlign:'center', letterSpacing:'-0.5px', textShadow:'0 0 30px rgba(255,180,0,0.4)', lineHeight:1.1 }}>
            {missionNames[mission.mission] || mission.mission}
          </h2>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.75rem', width:'100%' }}>
            <p style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.3)', margin:0, letterSpacing:'1px' }}>RECOMPENSA</p>
            <div style={{ display:'flex', gap:'1rem', width:'100%' }}>
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', background:'rgba(255,180,0,0.1)', border:'1px solid rgba(255,180,0,0.25)', borderRadius:'14px', padding:'1.25rem 1rem' }}>
                <span style={{ fontSize:'2rem' }}>🎯</span>
                <span style={{ fontSize:'1.5rem', fontWeight:'900', color:'#ffb400' }}>+{mission.snipers}</span>
                <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.3)' }}>Sniper</span>
              </div>
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'6px', background:'rgba(255,180,0,0.1)', border:'1px solid rgba(255,180,0,0.25)', borderRadius:'14px', padding:'1.25rem 1rem' }}>
                <span style={{ fontSize:'2rem' }}>🧤</span>
                <span style={{ fontSize:'1.5rem', fontWeight:'900', color:'#ffb400' }}>+{mission.gloves}</span>
                <span style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.3)' }}>Iron Fist</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          {completedMissions.length > 1 && (
            <p style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.2)', margin:0, textAlign:'center' }}>
              {currentMissionIdx + 1} de {completedMissions.length}
            </p>
          )}
          <button
            style={{ background:'#ffb400', color:'#141414', border:'none', borderRadius:'12px', padding:'1.25rem', fontSize:'1.1rem', fontWeight:'900', cursor:'pointer', width:'100%', letterSpacing:'0.5px' }}
            onClick={handleClaimMission}
          >
            🎁 Recoger Skills
          </button>
        </div>
      </div>
    )
  }

  if (showReplay && replayCents !== null) return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'space-between', background:'#141414', position:'relative', animation:'replayIn 0.3s ease forwards', padding:'3rem 2rem 2.5rem' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
        <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:'#ff4444', animation:'recBlink 1s ease-in-out infinite' }}/>
        <p style={{ fontSize:'0.7rem', color:'rgba(255,255,255,0.5)', letterSpacing:'3px', textTransform:'uppercase', margin:0, fontWeight:'700' }}>REPLAY</p>
      </div>

      {/* Nombre del ganador en grande */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem' }}>
        <p style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.3)', letterSpacing:'2px', textTransform:'uppercase', margin:0, fontWeight:'600' }}>GANADOR</p>
        <h1 style={{ fontSize:'2.8rem', fontWeight:'900', color:'#ffb400', margin:0, letterSpacing:'-1px', textAlign:'center', textShadow:'0 0 30px rgba(255,180,0,0.4)', lineHeight:1 }}>
          {winnerName?.toUpperCase()}
        </h1>
        <div style={{ background:'rgba(255,180,0,0.15)', border:'1px solid rgba(255,180,0,0.3)', borderRadius:'20px', padding:'4px 14px' }}>
          <span style={{ fontSize:'0.8rem', fontWeight:'700', color:'#ffb400' }}>{goalTypeLabel}</span>
        </div>
      </div>

      {/* Cronómetro a cámara lenta */}
      <div style={{ position:'relative', display:'flex', flexDirection:'column', alignItems:'center' }}>
        {isLastFrame && (
          <div style={{ position:'absolute', width:'180px', height:'180px', borderRadius:'50%', border:'3px solid #ffb400', animation:'replayRing 0.8s ease-out forwards', top:'50%', left:'50%', transform:'translate(-50%,-50%)' }}/>
        )}
        <div style={{ fontSize:'6rem', fontWeight:'900', color: isLastFrame ? '#ffb400' : 'rgba(255,255,255,0.85)', letterSpacing:'-3px', fontVariantNumeric:'tabular-nums', lineHeight:1, transition:'color 0.15s ease', textShadow: isLastFrame ? '0 0 50px rgba(255,180,0,0.7)' : 'none' }}>
          {String(replaySecs).padStart(2,'0')}
          <span style={{ fontSize:'4.5rem', opacity:0.5, margin:'0 3px' }}>:</span>
          {String(replayCentsDisplay).padStart(2,'0')}
        </div>
        <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.2)', letterSpacing:'2px', marginTop:'8px' }}>SEG : CEN</p>
      </div>

      {/* Marcador final */}
      <div style={{ display:'flex', alignItems:'center', gap:'1.5rem', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'1rem 2rem' }}>
        <div style={{ textAlign:'center' }}>
          <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.3)', margin:'0 0 4px', fontWeight:'700' }}>{isP1 ? player.username.toUpperCase() : opponent?.username.toUpperCase()}</p>
          <span style={{ fontSize:'2.5rem', fontWeight:'900', color: match.winner_id === match.player1_id ? '#ffb400' : 'rgba(255,255,255,0.5)' }}>{match.score_p1}</span>
        </div>
        <span style={{ fontSize:'0.9rem', color:'rgba(255,255,255,0.2)', fontWeight:'700' }}>—</span>
        <div style={{ textAlign:'center' }}>
          <p style={{ fontSize:'0.65rem', color:'rgba(255,255,255,0.3)', margin:'0 0 4px', fontWeight:'700' }}>{isP1 ? opponent?.username.toUpperCase() : player.username.toUpperCase()}</p>
          <span style={{ fontSize:'2.5rem', fontWeight:'900', color: match.winner_id === match.player2_id ? '#ffb400' : 'rgba(255,255,255,0.5)' }}>{match.score_p2}</span>
        </div>
      </div>

      {isLastFrame && (
        <div style={{ position:'absolute', inset:0, pointerEvents:'none', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ fontSize:'8rem', lineHeight:1, animation:'replayGoalPop 0.4s ease forwards', opacity:0 }}>{goalEmoji}</div>
        </div>
      )}
    </div>
  )
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
        {match?.league_id && (
          <>
            <div style={styles.statRow}>
              <span style={styles.statLabel}>puntos de liga</span>
              <span style={{ ...styles.statVal, color: '#ffb400' }}>+{pointsEarned}</span>
            </div>
            <div style={styles.statDivider} />
          </>
        )}
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
        {rematchStatus === 'received' && rematchRequest && !match?.is_bot_match && (
          <div style={styles.rematchBox}>
            <p style={styles.rematchTitle}>⚔️ {opponent.username} quiere la revancha</p>
            <div style={styles.rematchBtns}>
              <button style={styles.btnRematchAccept} onClick={acceptRematch}>Aceptar</button>
              <button style={styles.btnRematchReject} onClick={rejectRematch}>Rechazar</button>
            </div>
          </div>
        )}
        {rematchStatus === 'sent' && !match?.is_bot_match && (
          <div style={styles.rematchBox}>
            <p style={styles.rematchTitle}>⏳ Esperando respuesta...</p>
          </div>
        )}
        {rematchStatus === 'rejected' && !match?.is_bot_match && (
          <div style={styles.rematchBox}>
            <p style={styles.rematchTitle}>❌ Revancha rechazada</p>
          </div>
        )}
        {!rematchStatus && !match?.is_bot_match && (
          <button style={styles.btnRematch} onClick={sendRematch}>⚔️ Revancha</button>
        )}
        {iWon && replayGoalCents && replayResult && replayResult !== 'NORMAL' && (() => {
          const goalTypeMap = { 'GOL_DIRECTO':'Gol directo', 'FALTA':'Gol de falta', 'PENALTY':'Gol de penalty', 'CORNER':'Gol de córner', 'GOL_PROPIO':'Gol en propia' }
          const goalType = goalTypeMap[replayResult] || 'Gol'
          const secs = Math.floor(replayGoalCents / 100)
          const cents = replayGoalCents % 100
          const text = `⚽ ${player?.username} ganó en SnapGoal — ${goalType} en ${String(secs).padStart(2,'0')}:${String(cents).padStart(2,'0')} (${myScore}-${oppScore}). ¡Juega conmigo! ${window.location.origin}/result/${matchId}`
          console.log('SHARE URL:', `${window.location.origin}/result/${matchId}`, 'matchId:', matchId)
          const url = `https://wa.me/?text=${encodeURIComponent(text)}`
          return (
            <a href={url} target="_blank" rel="noopener noreferrer" style={styles.btnShare}>
              📲 Compartir en WhatsApp
            </a>
          )
        })()}
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
  btnShare: { display:'block', textAlign:'center', background:'rgba(37,211,102,0.1)', border:'1px solid rgba(37,211,102,0.3)', borderRadius:'12px', padding:'1rem', fontSize:'1rem', fontWeight:'800', color:'#25d366', cursor:'pointer', width:'100%', textDecoration:'none', boxSizing:'border-box' },
  rematchBox: { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'14px', padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem' },
  rematchTitle: { fontSize:'0.9rem', fontWeight:'700', color:'rgba(255,255,255,0.7)', textAlign:'center', margin:0 },
  rematchBtns: { display:'flex', gap:'0.75rem' },
  btnRematchAccept: { flex:1, background:'#ffb400', color:'#141414', border:'none', borderRadius:'10px', padding:'0.85rem', fontSize:'0.95rem', fontWeight:'800', cursor:'pointer' },
  btnRematchReject: { flex:1, background:'transparent', color:'rgba(255,255,255,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', padding:'0.85rem', fontSize:'0.9rem', cursor:'pointer' },
}
