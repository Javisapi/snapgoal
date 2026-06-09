import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

async function getPlayer() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data } = await supabase.from('players').select('*').eq('auth_id', session.user.id).single()
  if (data) sessionStorage.setItem('player_' + session.user.id, JSON.stringify(data))
  return data
}

const CSS = `
  @keyframes victoryFlash { 0%{opacity:0;transform:scale(2)} 20%{opacity:1;transform:scale(1)} 100%{opacity:1;transform:scale(1)} }
  @keyframes victoryLine { 0%{width:0} 100%{width:100%} }
  @keyframes defeatDrop { 0%{opacity:0;transform:translateY(-40px)} 100%{opacity:1;transform:translateY(0)} }
  @keyframes defeatFade { 0%{opacity:0} 100%{opacity:0.15} }
  @keyframes slideUp { 0%{transform:translateY(24px);opacity:0} 100%{transform:translateY(0);opacity:1} }
  @keyframes pulseRing { 0%{transform:scale(1);opacity:0.6} 50%{transform:scale(1.08);opacity:0.2} 100%{transform:scale(1);opacity:0.6} }
  @keyframes tensionBlink { 0%,100%{opacity:1} 50%{opacity:0.3} }
  @keyframes drawSlide { 0%{transform:scaleX(0)} 100%{transform:scaleX(1)} }
  @keyframes particleFloat { 0%{transform:translateY(0) rotate(0deg);opacity:1} 100%{transform:translateY(-120px) rotate(180deg);opacity:0} }
`

function VictoryBg() {
  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
      {[...Array(6)].map((_,i) => (
        <div key={i} style={{
          position:'absolute',
          width: i%2===0 ? '2px' : '1px',
          height: `${40+i*15}px`,
          background: '#ffb400',
          left: `${10+i*16}%`,
          bottom: '-10px',
          opacity: 0,
          animation: `particleFloat ${1.2+i*0.3}s ease-out ${i*0.15}s forwards`,
          borderRadius: '1px',
        }}/>
      ))}
      {[...Array(6)].map((_,i) => (
        <div key={i+6} style={{
          position:'absolute',
          width: `${4+i*2}px`,
          height: `${4+i*2}px`,
          background: i%3===0 ? '#ffb400' : 'rgba(255,180,0,0.4)',
          left: `${15+i*14}%`,
          bottom: '-10px',
          opacity: 0,
          animation: `particleFloat ${1+i*0.25}s ease-out ${0.1+i*0.12}s forwards`,
          borderRadius: i%2===0 ? '50%' : '2px',
        }}/>
      ))}
    </div>
  )
}

function DefeatBg() {
  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
      <div style={{
        position:'absolute', inset:0,
        background: 'repeating-linear-gradient(135deg, transparent, transparent 40px, rgba(255,68,68,0.03) 40px, rgba(255,68,68,0.03) 80px)',
        animation: 'defeatFade 0.8s ease forwards',
        opacity: 0,
      }}/>
    </div>
  )
}

function ShootoutBg() {
  return (
    <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
      {[...Array(3)].map((_,i) => (
        <div key={i} style={{
          position:'absolute',
          top:'50%', left:'50%',
          width: `${120+i*80}px`,
          height: `${120+i*80}px`,
          marginTop: `-${60+i*40}px`,
          marginLeft: `-${60+i*40}px`,
          borderRadius:'50%',
          border: '1px solid rgba(255,180,0,0.15)',
          animation: `pulseRing ${2+i*0.5}s ease-in-out ${i*0.3}s infinite`,
        }}/>
      ))}
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
  const [shootout, setShootout] = useState(null)
  const [shootoutScore, setShootoutScore] = useState({ a: 0, b: 0 })
  const [myShootoutChoice, setMyShootoutChoice] = useState(null)
  const [shootoutMsg, setShootoutMsg] = useState(null)
  const channelRef = useRef(null)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)

    // Si este partido ya fue visto, volver a home
    const seenMatches = JSON.parse(sessionStorage.getItem('seen_matches') || '[]')
    if (seenMatches.includes(matchId)) {
      navigate('/')
      return
    }

    init()
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)

    const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single()
    if (!m) { navigate('/'); return }
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

    // Marcar este partido como visto para no mostrarlo de nuevo
    const seenMatches = JSON.parse(sessionStorage.getItem('seen_matches') || '[]')
    if (!seenMatches.includes(matchId)) {
      seenMatches.push(matchId)
      // Guardar solo los últimos 10 partidos
      if (seenMatches.length > 10) seenMatches.shift()
      sessionStorage.setItem('seen_matches', JSON.stringify(seenMatches))
    }

    if (m.pending_type === 'SHOOTOUT' && m.status !== 'finished') {
      const state = JSON.parse(m.shootout_state || '{}')
      const score = JSON.parse(m.shootout_score || '{"a":0,"b":0}')
      setShootout(state)
      setShootoutScore(score)

      const ch = supabase.channel('result-' + matchId)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` },
          (payload) => {
            const updated = payload.new
            setMatch({ ...updated })
            if (updated.status === 'finished') { setShootout(null); return }
            setShootout(JSON.parse(updated.shootout_state || '{}'))
            setShootoutScore(JSON.parse(updated.shootout_score || '{"a":0,"b":0}'))
            setMyShootoutChoice(null)
          })
        .subscribe()
      channelRef.current = ch
    }
  }

  async function takeShootoutPenalty(choice) {
    if (!match || !player) return
    const m = match
    const isP1 = m.player1_id === player.id
    const state = JSON.parse(m.shootout_state || '{}')
    const score = JSON.parse(m.shootout_score || '{"a":0,"b":0}')
    setMyShootoutChoice(choice)

    const cent = Math.floor(Math.random() * 99) + 1
    const gol = choice === 'par' ? cent % 2 === 0 : cent % 2 !== 0
    const msg = gol ? `Gol — ${choice}, centésima ${cent}` : `Fallo — ${choice}, centésima ${cent}`
    setShootoutMsg(msg)

    const newState = { ...state }
    if (isP1) { newState.a_scored = gol; newState.a_choice = choice }
    else { newState.b_scored = gol; newState.b_choice = choice }

    const newScore = { ...score }
    if (gol) newScore[isP1 ? 'a' : 'b'] = (newScore[isP1 ? 'a' : 'b'] || 0) + 1

    const aScored = isP1 ? gol : state.a_scored
    const bScored = isP1 ? state.b_scored : gol
    const aDone = isP1 ? true : state.a_scored !== null
    const bDone = isP1 ? state.b_scored !== null : true

    let updates = {
      shootout_state: JSON.stringify(newState),
      shootout_score: JSON.stringify(newScore),
      last_event: JSON.stringify({ emoji: '🥅', label: msg }),
      current_turn: isP1 ? m.player2_id : m.player1_id,
    }

    if (aDone && bDone) {
      const round = state.round || 1
      if (aScored && !bScored) { await finishShootout(m, m.player1_id, newScore, updates); return }
      if (!aScored && bScored) { await finishShootout(m, m.player2_id, newScore, updates); return }
      if (round >= 3) { await finishShootout(m, null, newScore, updates); return }
      updates.shootout_round = round + 1
      updates.shootout_state = JSON.stringify({ round: round + 1, turn: 'a', a_scored: null, b_scored: null, a_choice: null, b_choice: null })
      updates.current_turn = m.player1_id
    }

    await supabase.from('matches').update(updates).eq('id', matchId)
  }

  async function finishShootout(m, winnerId, score, baseUpdates) {
    const isP1 = m.player1_id === player.id
    const sp1 = m.score_p1 + (winnerId === m.player1_id ? 1 : 0)
    const sp2 = m.score_p2 + (winnerId === m.player2_id ? 1 : 0)
    const myScore = isP1 ? sp1 : sp2
    const oppScore = isP1 ? sp2 : sp1
    const myPts = myScore > oppScore ? 3 : 1
    const oppPts = myScore > oppScore ? 0 : 1
    const oppId = isP1 ? m.player2_id : m.player1_id

    await supabase.from('matches').update({
      ...baseUpdates, score_p1: sp1, score_p2: sp2,
      status: 'finished', winner_id: winnerId,
      pending_type: null, ended_at: new Date().toISOString(),
    }).eq('id', matchId)

    await supabase.rpc('finalize_match_stats', {
      p_match_id: matchId,
      p_player1_id: m.player1_id,
      p_player2_id: m.player2_id,
      p_score1: sp1,
      p_score2: sp2,
      p_cards_p1: m.cards_p1 || { yellow: 0, red: 0 },
      p_cards_p2: m.cards_p2 || { yellow: 0, red: 0 },
    })

    const { data: updP } = await supabase.from('players').select('*').eq('id', player.id).single()
    setUpdatedPlayer(updP)
    setMatch(prev => ({ ...prev, score_p1: sp1, score_p2: sp2, status: 'finished', winner_id: winnerId }))
    setShootout(null)
    setPointsEarned(myPts)
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
  const drew = myScore === oppScore && match.status === 'finished'
  const inShootout = shootout && match.status !== 'finished'

  const shootoutState = shootout || {}
  const myTurnShootout = inShootout && (
    (isP1 && shootoutState.a_scored === null && !myShootoutChoice) ||
    (!isP1 && shootoutState.a_scored !== null && shootoutState.b_scored === null && !myShootoutChoice)
  )
  const waitingShootout = inShootout && !myTurnShootout && !myShootoutChoice

  return (
    <div style={styles.container}>
      {won && <VictoryBg />}
      {!won && !drew && !inShootout && <DefeatBg />}
      {inShootout && <ShootoutBg />}

      {/* Resultado */}
      <div style={styles.heroArea}>
        {won && (
          <>
            <div style={styles.victoryLabel}>VICTORIA</div>
            <div style={{ ...styles.victoryLine, animation: 'victoryLine 0.6s ease 0.3s both' }} />
          </>
        )}
        {!won && !drew && !inShootout && (
          <div style={{ ...styles.defeatLabel, animation: 'defeatDrop 0.5s ease forwards' }}>
            DERROTA
          </div>
        )}
        {drew && (
          <div style={styles.drawLabel}>EMPATE</div>
        )}
        {inShootout && (
          <div style={styles.shootoutLabel}>
            <span style={{ animation: 'tensionBlink 1.2s ease-in-out infinite' }}>PENALTIS</span>
            <span style={styles.shootoutRound}>tanda {shootoutState.round || 1} / 3</span>
          </div>
        )}

        {/* Marcador */}
        <div style={{ ...styles.scoreRow, animation: 'slideUp 0.4s ease 0.2s both' }}>
          <div style={styles.scoreBlock}>
            <span style={{ ...styles.scoreName, color: won ? '#ffb400' : 'rgba(255,255,255,0.5)' }}>{player.username}</span>
            <span style={{ ...styles.scoreNum, color: won ? '#fff' : 'rgba(255,255,255,0.4)' }}>{myScore}</span>
            {inShootout && <span style={styles.shootoutPts}>{isP1 ? shootoutScore.a : shootoutScore.b}</span>}
          </div>
          <div style={styles.scoreDivider} />
          <div style={styles.scoreBlock}>
            <span style={{ ...styles.scoreName, color: !won && !drew ? '#ff4444' : 'rgba(255,255,255,0.5)' }}>{opponent.username}</span>
            <span style={{ ...styles.scoreNum, color: !won && !drew ? 'rgba(255,100,100,0.8)' : 'rgba(255,255,255,0.4)' }}>{oppScore}</span>
            {inShootout && <span style={styles.shootoutPts}>{isP1 ? shootoutScore.b : shootoutScore.a}</span>}
          </div>
        </div>
      </div>

      {/* Penaltis */}
      {inShootout && (
        <div style={{ ...styles.shootoutBox, animation: 'slideUp 0.4s ease 0.3s both' }}>
          {shootoutMsg && <p style={styles.shootoutMsg}>{shootoutMsg}</p>}
          {myTurnShootout && (
            <>
              <p style={styles.shootoutPrompt}>Tu turno — elige</p>
              <div style={styles.choiceRow}>
                <button style={styles.choiceBtn} onClick={() => takeShootoutPenalty('par')}>PAR</button>
                <button style={styles.choiceBtn} onClick={() => takeShootoutPenalty('impar')}>IMPAR</button>
              </div>
            </>
          )}
          {(waitingShootout || myShootoutChoice) && (
            <p style={styles.waitingText}>
              {myShootoutChoice ? `Elegiste ${myShootoutChoice.toUpperCase()}` : 'Esperando al rival...'}
            </p>
          )}
        </div>
      )}

      {/* Stats */}
      {!inShootout && (
        <div style={{ ...styles.statsBox, animation: 'slideUp 0.4s ease 0.4s both' }}>
          <div style={styles.statRow}>
            <span style={styles.statLabel}>puntos ganados</span>
            <span style={{ ...styles.statVal, color: '#ffb400' }}>+{pointsEarned}</span>
          </div>
          <div style={styles.statDivider} />
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
            <span style={styles.statVal}>{updatedPlayer.matches_won} / {updatedPlayer.matches_drawn} / {updatedPlayer.matches_lost}</span>
          </div>
        </div>
      )}

      {/* Botones */}
      {!inShootout && (
        <div style={{ ...styles.btnGroup, animation: 'slideUp 0.4s ease 0.6s both' }}>
          <button style={styles.btnPrimary} onClick={() => navigate('/queue')}>
            Buscar otro partido
          </button>
          <button style={styles.btnSecondary} onClick={() => navigate('/')}>
            Inicio
          </button>
        </div>
      )}
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
  shootoutLabel: { display:'flex', flexDirection:'column', gap:'4px' },
  shootoutRound: { fontSize:'0.8rem', color:'rgba(255,255,255,0.3)', letterSpacing:'2px', textTransform:'uppercase' },
  scoreRow: { display:'flex', alignItems:'center', gap:'1.5rem' },
  scoreBlock: { display:'flex', flexDirection:'column', gap:'2px' },
  scoreName: { fontSize:'0.7rem', fontWeight:'600', letterSpacing:'1px', textTransform:'uppercase' },
  scoreNum: { fontSize:'4rem', fontWeight:'900', lineHeight:1, letterSpacing:'-2px' },
  scoreDivider: { width:'1px', height:'60px', background:'rgba(255,255,255,0.1)' },
  shootoutPts: { fontSize:'0.75rem', color:'#ffb400', fontWeight:'700' },
  shootoutBox: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'16px', padding:'1.25rem', display:'flex', flexDirection:'column', gap:'0.75rem' },
  shootoutMsg: { fontSize:'0.9rem', color:'rgba(255,255,255,0.6)', textAlign:'center', margin:0 },
  shootoutPrompt: { fontSize:'1rem', fontWeight:'700', color:'#ffb400', textAlign:'center', margin:0, animation:'tensionBlink 1.5s ease-in-out infinite' },
  choiceRow: { display:'flex', gap:'0.75rem' },
  choiceBtn: { flex:1, padding:'0.9rem', background:'#ffb400', color:'#141414', border:'none', borderRadius:'10px', fontWeight:'900', fontSize:'1rem', letterSpacing:'1px', cursor:'pointer' },
  waitingText: { fontSize:'0.85rem', color:'rgba(255,255,255,0.3)', textAlign:'center' },
  statsBox: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'16px', padding:'1.25rem' },
  statRow: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.5rem 0' },
  statLabel: { fontSize:'0.8rem', color:'rgba(255,255,255,0.3)', letterSpacing:'0.5px' },
  statVal: { fontSize:'0.9rem', fontWeight:'700', color:'#fff' },
  statDivider: { height:'1px', background:'rgba(255,255,255,0.05)' },
  btnGroup: { display:'flex', flexDirection:'column', gap:'0.75rem' },
  btnPrimary: { background:'#ffb400', color:'#141414', border:'none', borderRadius:'12px', padding:'1.1rem', fontSize:'1rem', fontWeight:'800', cursor:'pointer', width:'100%', letterSpacing:'0.5px' },
  btnSecondary: { background:'transparent', color:'rgba(255,255,255,0.25)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'12px', padding:'0.9rem', fontSize:'0.9rem', cursor:'pointer', width:'100%' },
}
