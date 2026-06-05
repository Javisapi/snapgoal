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

export default function Result() {
  const { matchId } = useParams()
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [match, setMatch] = useState(null)
  const [opponent, setOpponent] = useState(null)
  const [updatedPlayer, setUpdatedPlayer] = useState(null)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [animDone, setAnimDone] = useState(false)
  const styleRef = useRef(false)

  useEffect(() => {
    if (!styleRef.current) {
      styleRef.current = true
      const s = document.createElement('style')
      s.textContent = `
        @keyframes popIn { 0%{transform:scale(0.5);opacity:0} 70%{transform:scale(1.1)} 100%{transform:scale(1);opacity:1} }
        @keyframes slideUp { 0%{transform:translateY(30px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        @keyframes countUp { 0%{opacity:0} 100%{opacity:1} }
      `
      document.head.appendChild(s)
    }
    init()
  }, [])

  const [shootout, setShootout] = useState(null)
  const [shootoutScore, setShootoutScore] = useState({ a: 0, b: 0 })
  const [myShootoutChoice, setMyShootoutChoice] = useState(null)
  const [shootoutMsg, setShootoutMsg] = useState(null)
  const channelRef = useRef(null)

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)

    const { data: m } = await supabase
      .from('matches').select('*').eq('id', matchId).single()
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
    const pts = myScore > oppScore ? 3 : myScore === oppScore ? 1 : 0
    setPointsEarned(pts)

    // Penaltis pendientes
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
            if (updated.status === 'finished') {
              setShootout(null)
              const updState = JSON.parse(updated.shootout_state || '{}')
              setShootoutScore(JSON.parse(updated.shootout_score || '{"a":0,"b":0}'))
              return
            }
            const state = JSON.parse(updated.shootout_state || '{}')
            const score = JSON.parse(updated.shootout_score || '{"a":0,"b":0}')
            setShootout(state)
            setShootoutScore(score)
            setMyShootoutChoice(null)
          })
        .subscribe()
      channelRef.current = ch
    }

    setTimeout(() => setAnimDone(true), 800)
  }

  async function takeShootoutPenalty(choice) {
    if (!match || !player) return
    const m = match
    const isP1 = m.player1_id === player.id
    const state = JSON.parse(m.shootout_state || '{}')
    const score = JSON.parse(m.shootout_score || '{"a":0,"b":0}')

    setMyShootoutChoice(choice)

    // Simular tirada: par o impar con centésima aleatoria
    const cent = Math.floor(Math.random() * 99) + 1
    const gol = choice === 'par' ? cent % 2 === 0 : cent % 2 !== 0
    const myKey = isP1 ? 'a' : 'b'
    const oppKey = isP1 ? 'b' : 'a'

    const msg = gol
      ? `⚽ ${player.username} eligió ${choice} — centésima ${cent} — GOL`
      : `🥅 ${player.username} eligió ${choice} — centésima ${cent} — FALLO`
    setShootoutMsg(msg)

    const newState = { ...state }
    if (isP1) { newState.a_scored = gol; newState.a_choice = choice }
    else { newState.b_scored = gol; newState.b_choice = choice }

    const newScore = { ...score }
    if (gol) newScore[myKey] = (newScore[myKey] || 0) + 1

    // Comprobar si la tanda está completa
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
      // Tanda completa — comprobar ganador
      const round = state.round || 1

      // A marcó y B no
      if (aScored && !bScored) {
        await finishShootout(m, m.player1_id, newScore, updates)
        return
      }
      // B marcó y A no
      if (!aScored && bScored) {
        await finishShootout(m, m.player2_id, newScore, updates)
        return
      }
      // Ambos igual — siguiente tanda o empate definitivo
      if (round >= 3) {
        // Empate definitivo tras 3 tandas
        await finishShootout(m, null, newScore, updates)
        return
      }
      // Siguiente tanda
      updates.shootout_round = round + 1
      updates.shootout_state = JSON.stringify({ round: round + 1, turn: 'a', a_scored: null, b_scored: null, a_choice: null, b_choice: null })
      updates.current_turn = m.player1_id
    }

    await supabase.from('matches').update(updates).eq('id', matchId)
  }

  async function finishShootout(m, winnerId, score, baseUpdates) {
    const sp1 = m.score_p1 + (winnerId === m.player1_id ? 1 : 0)
    const sp2 = m.score_p2 + (winnerId === m.player2_id ? 1 : 0)
    const isP1 = m.player1_id === player.id
    const myScore = isP1 ? sp1 : sp2
    const oppScore = isP1 ? sp2 : sp1
    const myPts = myScore > oppScore ? 3 : 1
    const oppPts = myScore > oppScore ? 0 : 1
    const oppId = isP1 ? m.player2_id : m.player1_id

    await supabase.from('matches').update({
      ...baseUpdates,
      score_p1: sp1, score_p2: sp2,
      status: 'finished',
      winner_id: winnerId,
      pending_type: null,
      ended_at: new Date().toISOString(),
    }).eq('id', matchId)

    await supabase.rpc('update_player_stats', { p_player_id: player.id, p_points: myPts, p_won: myScore > oppScore ? 1 : 0, p_drawn: myScore === oppScore ? 1 : 0, p_lost: myScore < oppScore ? 1 : 0 })
    await supabase.rpc('update_player_stats', { p_player_id: oppId, p_points: oppPts, p_won: oppScore > myScore ? 1 : 0, p_drawn: myScore === oppScore ? 1 : 0, p_lost: oppScore < myScore ? 1 : 0 })

    const { data: updP } = await supabase.from('players').select('*').eq('id', player.id).single()
    setUpdatedPlayer(updP)
    setMatch(prev => ({ ...prev, score_p1: sp1, score_p2: sp2, status: 'finished', winner_id: winnerId }))
    setShootout(null)
    setPointsEarned(myPts)
  }

  if (!match || !opponent || !player || !updatedPlayer) return (
    <div style={styles.container}>
      <p style={{ color: '#fff', textAlign: 'center' }}>Cargando resultado...</p>
    </div>
  )

  const isP1 = match.player1_id === player.id
  const myScore = isP1 ? match.score_p1 : match.score_p2
  const oppScore = isP1 ? match.score_p2 : match.score_p1
  const won = myScore > oppScore
  const drew = myScore === oppScore

  const resultEmoji = won ? '🏆' : drew ? '🤝' : '😔'
  const resultText = won ? '¡VICTORIA!' : drew ? 'EMPATE' : 'DERROTA'
  const resultColor = won ? '#ffb400' : drew ? '#888' : '#ff4444'

  return (
    <div style={styles.container}>
      <div style={{ ...styles.resultHero, animation: 'popIn 0.6s ease forwards' }}>
        <div style={styles.resultEmoji}>{resultEmoji}</div>
        <h1 style={{ ...styles.resultText, color: resultColor }}>{resultText}</h1>
      </div>

      <div style={{ ...styles.scoreBox, animation: 'slideUp 0.5s ease 0.3s both' }}>
        <div style={styles.scorePlayer}>
          <span style={styles.scoreName}>{player.username}</span>
          <span style={styles.scoreNum}>{myScore}</span>
        </div>
        <span style={styles.scoreSep}>—</span>
        <div style={styles.scorePlayer}>
          <span style={styles.scoreNum}>{oppScore}</span>
          <span style={styles.scoreName}>{opponent.username}</span>
        </div>
      </div>

      <div style={{ ...styles.statsBox, animation: 'slideUp 0.5s ease 0.5s both' }}>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Puntos ganados</span>
          <span style={{ ...styles.statVal, color: '#ffb400' }}>+{pointsEarned}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Total de puntos</span>
          <span style={styles.statVal}>{updatedPlayer.total_points}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Partidos jugados</span>
          <span style={styles.statVal}>{updatedPlayer.matches_played}</span>
        </div>
        <div style={styles.statDivider} />
        <div style={styles.statRow}>
          <span style={styles.statLabel}>V / E / D</span>
          <span style={styles.statVal}>
            {updatedPlayer.matches_won} / {updatedPlayer.matches_drawn} / {updatedPlayer.matches_lost}
          </span>
        </div>
      </div>

      <div style={{ ...styles.btnGroup, animation: 'slideUp 0.5s ease 0.7s both' }}>
        <button style={styles.btnPrimary} onClick={() => navigate('/queue')}>
          ⚡ Buscar otro partido
        </button>
        <button style={styles.btnSecondary} onClick={() => navigate('/')}>
          Volver al inicio
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '3rem 2rem 4rem', background: '#141414' },
  shootoutRound: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.25rem' },
  shootoutScoreBadge: { fontSize: '0.8rem', color: '#ffb400', fontWeight: '700' },
  shootoutBox: { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  shootoutMsg: { background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '0.75rem', textAlign: 'center' },
  shootoutMsgText: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  shootoutPrompt: { fontSize: '1rem', fontWeight: '700', color: '#ffb400', textAlign: 'center' },
  shootoutWaiting: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  barrierBtns: { display: 'flex', gap: '0.5rem' },
  barrierBtn: { flex: 1, padding: '0.75rem 0', background: '#ffb400', color: '#141414', border: 'none', borderRadius: '10px', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer' },
  resultHero: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' },
  resultEmoji: { fontSize: '5rem', lineHeight: 1 },
  resultText: { fontSize: '2.5rem', fontWeight: '900', letterSpacing: '-1px' },
  scoreBox: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '1.5rem' },
  scorePlayer: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' },
  scoreName: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', fontWeight: '600', letterSpacing: '0.5px' },
  scoreNum: { fontSize: '3.5rem', fontWeight: '900', color: '#fff', lineHeight: 1 },
  scoreSep: { fontSize: '1.5rem', color: 'rgba(255,255,255,0.2)', fontWeight: '600' },
  statsBox: { background: 'rgba(255,255,255,0.04)', borderRadius: '16px', padding: '1.25rem' },
  statRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0' },
  statLabel: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.4)' },
  statVal: { fontSize: '0.9rem', fontWeight: '700', color: '#fff' },
  statDivider: { height: '1px', background: 'rgba(255,255,255,0.06)' },
  btnGroup: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  btnPrimary: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '1.1rem', fontSize: '1.1rem', fontWeight: '800', cursor: 'pointer', width: '100%' },
  btnSecondary: { background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '1rem', fontSize: '1rem', cursor: 'pointer', width: '100%' },
}
