import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LatencyIndicator from '../components/LatencyIndicator'

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
  @keyframes shootoutIn { from{opacity:0;transform:scale(0.95)} to{opacity:1;transform:scale(1)} }
  @keyframes tensionPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes goalFlash { 0%{opacity:0;transform:scale(0.5)} 20%{opacity:1;transform:scale(1.1)} 70%{opacity:1;transform:scale(1)} 100%{opacity:0} }
`

export default function Shootout() {
  const { matchId } = useParams()
  const navigate = useNavigate()

  const [player, setPlayer] = useState(null)
  const [match, setMatch] = useState(null)
  const [opponent, setOpponent] = useState(null)
  const [centesimas, setCentesimas] = useState(0)
  const [running, setRunning] = useState(false)
  const [shootoutState, setShootoutState] = useState(null)
  const [shootoutScore, setShootoutScore] = useState({ a: 0, b: 0 })
  const [penaltyChoice, setPenaltyChoice] = useState(null)
  const [showChoicePopup, setShowChoicePopup] = useState(false)
  const [lastMsg, setLastMsg] = useState(null)
  const [flash, setFlash] = useState(null)

  const intervalRef = useRef(null)
  const startPerfRef = useRef(null)
  const offsetRef = useRef(0)
  const runningRef = useRef(false)
  const processingRef = useRef(false)
  const iAmShooterRef = useRef(false)
  const timerVersionRef = useRef(0)
  const matchRef = useRef(null)
  const playerRef = useRef(null)
  const channelRef = useRef(null)
  const lastTapRef = useRef(0)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)
    init()
    return () => {
      clearInterval(intervalRef.current)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    playerRef.current = p
    setPlayer(p)

    const { data: m } = await supabase.from('matches').select('*').eq('id', matchId).single()
    if (!m) { navigate('/'); return }
    matchRef.current = m
    setMatch(m)

    const state = parseJ(m.shootout_state, {round:1,a_scored:null,b_scored:null,a_choice:null,b_choice:null})
    const score = parseJ(m.shootout_score, {a:0,b:0})
    setShootoutState(state)
    setShootoutScore(score)

    const oppId = m.player1_id === p.id ? m.player2_id : m.player1_id
    const { data: opp } = await supabase.from('players').select('*').eq('id', oppId).single()
    setOpponent(opp)

    // Soy jugador A (player1) o B (player2)?
    const isP1 = m.player1_id === p.id
    const myTurn = isP1
      ? state.a_scored === null
      : state.a_scored !== null && state.b_scored === null

    if (myTurn && !state[isP1 ? 'a_choice' : 'b_choice']) {
      setShowChoicePopup(true)
    }

    const channel = supabase.channel('shootout-' + matchId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'matches', filter: `id=eq.${matchId}`,
      }, (payload) => {
        const updated = payload.new
        matchRef.current = updated
        setMatch({ ...updated })

        const state = parseJ(updated.shootout_state, {})
        const score = parseJ(updated.shootout_score, {a:0,b:0})
        setShootoutState(state)
        setShootoutScore(score)

        const isP1 = updated.player1_id === playerRef.current?.id
        const myTurnNow = isP1
          ? state.a_scored === null
          : state.a_scored !== null && state.b_scored === null

        if (myTurnNow && !state[isP1 ? 'a_choice' : 'b_choice'] && !showChoicePopup) {
          setShowChoicePopup(true)
          offsetRef.current = updated.elapsed_centesimas || 0
          setCentesimas(updated.elapsed_centesimas || 0)
        }

        if (updated.status === 'finished') {
          navigate('/result/' + matchId)
          return
        }

        if (updated.timer_running && updated.timer_started_at) {
          if (!iAmShooterRef.current && !runningRef.current) {
            startObserverTimer(updated.elapsed_centesimas || 0, new Date(updated.timer_started_at).getTime())
          }
        } else if (!updated.timer_running) {
          if (!iAmShooterRef.current) {
            timerVersionRef.current += 1
            clearInterval(intervalRef.current)
            const val = updated.elapsed_centesimas || 0
            offsetRef.current = val
            setCentesimas(val)
            setRunning(false)
          }
        }

        if (updated.status === 'finished') {
          navigate('/result/' + matchId)
        }
      })
      .subscribe()
    channelRef.current = channel
  }

  function startObserverTimer(base, startedAtMs) {
    if (iAmShooterRef.current) return
    clearInterval(intervalRef.current)
    offsetRef.current = base
    timerVersionRef.current += 1
    const v = timerVersionRef.current
    intervalRef.current = setInterval(() => {
      if (timerVersionRef.current !== v) return
      setCentesimas(base + Math.floor((Date.now() - startedAtMs) / 10))
    }, 10)
    setRunning(true)
  }

  async function selectChoice(choice) {
    if (!player || !match) return
    const isP1 = match.player1_id === player.id
    setPenaltyChoice(choice)
    setShowChoicePopup(false)

    const state = parseJ(match.shootout_state, {})
    const newState = { ...state }
    if (isP1) newState.a_choice = choice
    else newState.b_choice = choice

    // Actualizar estado local inmediatamente para que canShoot sea true
    setShootoutState(newState)
    setLastMsg(`Elegiste ${choice.toUpperCase()} — tira ahora`)

    await supabase.from('matches').update({
      shootout_state: JSON.stringify(newState),
      last_event: JSON.stringify({ label: `${player.username} eligió ${choice.toUpperCase()}` }),
    }).eq('id', matchId)
  }

  function handleTap(e) {
    if (e) e.preventDefault()
    if (processingRef.current) return
    const now = Date.now()
    if (now - lastTapRef.current < 30) return
    lastTapRef.current = now
    if (runningRef.current) stopTimer()
    else startTimer()
  }

  async function startTimer() {
    if (runningRef.current || processingRef.current) return
    const base = offsetRef.current
    const startedAtMs = Date.now()
    const startedAtPerf = performance.now()
    startPerfRef.current = startedAtPerf
    iAmShooterRef.current = true
    runningRef.current = true
    timerVersionRef.current += 1
    const v = timerVersionRef.current
    const shooterBase = base
    setRunning(true)

    intervalRef.current = setInterval(() => {
      if (timerVersionRef.current !== v) return
      setCentesimas(shooterBase + Math.floor((performance.now() - startedAtPerf) / 10))
    }, 10)

    await supabase.from('matches').update({
      timer_running: true,
      timer_started_at: new Date(startedAtMs).toISOString(),
    }).eq('id', matchId)
  }

  async function stopTimer() {
    if (processingRef.current || !runningRef.current) return
    processingRef.current = true
    runningRef.current = false
    iAmShooterRef.current = false
    timerVersionRef.current += 1

    clearInterval(intervalRef.current)
    const elapsed = Math.max(1, Math.floor((performance.now() - startPerfRef.current) / 10))
    const total = offsetRef.current + elapsed
    offsetRef.current = total
    setCentesimas(total)
    setRunning(false)

    await resolveShootoutPenalty(total)
    processingRef.current = false
  }

  async function resolveShootoutPenalty(total) {
    const m = matchRef.current
    const p = playerRef.current
    const isP1 = m.player1_id === p.id
    const state = parseJ(m.shootout_state, {})
    const score = parseJ(m.shootout_score, {a:0,b:0})
    const choice = isP1 ? state.a_choice : state.b_choice

    if (!choice) return

    const last1 = total % 10
    const gol = choice === 'par' ? last1 % 2 === 0 : last1 % 2 !== 0
    const msg = gol
      ? `⚽ Gol de ${p.username} (eligió ${choice}, centésima ${last1})`
      : `🥅 Fallo de ${p.username} (eligió ${choice}, centésima ${last1})`

    setLastMsg(msg)
    if (gol) {
      setFlash('GOL')
      setTimeout(() => setFlash(null), 1500)
    }

    const newState = { ...state }
    const newScore = { ...score }
    if (isP1) {
      newState.a_scored = gol
      if (gol) newScore.a = (newScore.a || 0) + 1
    } else {
      newState.b_scored = gol
      if (gol) newScore.b = (newScore.b || 0) + 1
    }

    // Actualizar estado local inmediatamente
    setShootoutState(newState)
    setShootoutScore(newScore)

    const aScored = isP1 ? gol : state.a_scored
    const bScored = isP1 ? state.b_scored : gol
    const aDone = isP1 ? true : state.a_scored !== null
    const bDone = isP1 ? state.b_scored !== null : true

    let updates = {
      elapsed_centesimas: total,
      timer_running: false,
      shootout_state: JSON.stringify(newState),
      shootout_score: JSON.stringify(newScore),
      last_event: JSON.stringify({ label: msg }),
      current_turn: isP1 ? m.player2_id : m.player1_id,
    }

    if (aDone && bDone) {
      const round = state.round || 1
      if (aScored && !bScored) { await finishShootout(m, m.player1_id, newScore, updates); return }
      if (!aScored && bScored) { await finishShootout(m, m.player2_id, newScore, updates); return }
      if (round >= 3) { await finishShootout(m, null, newScore, updates); return }
      updates.shootout_round = round + 1
      updates.shootout_state = JSON.stringify({ round: round + 1, a_scored: null, b_scored: null, a_choice: null, b_choice: null })
      updates.current_turn = m.player1_id
    }

    await supabase.from('matches').update(updates).eq('id', matchId)
  }

  async function finishShootout(m, winnerId, score, baseUpdates) {
    const isP1 = m.player1_id === player.id
    const sp1 = m.score_p1 + (winnerId === m.player1_id ? 1 : 0)
    const sp2 = m.score_p2 + (winnerId === m.player2_id ? 1 : 0)

    await supabase.from('matches').update({
      ...baseUpdates,
      score_p1: sp1, score_p2: sp2,
      status: 'finished',
      winner_id: winnerId,
      pending_type: null,
      ended_at: new Date().toISOString(),
    }).eq('id', matchId)

    await supabase.rpc('finalize_match_stats', {
      p_match_id: matchId,
      p_player1_id: m.player1_id,
      p_player2_id: m.player2_id,
      p_score1: sp1, p_score2: sp2,
      p_cards_p1: m.cards_p1 || { yellow: 0, red: 0 },
      p_cards_p2: m.cards_p2 || { yellow: 0, red: 0 },
    })

    navigate('/result/' + matchId)
  }

  if (!match || !opponent || !player || !shootoutState) return (
    <div style={styles.container}>
      <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Cargando...</p>
    </div>
  )

  const isP1 = match.player1_id === player.id
  const myScore = isP1 ? shootoutScore.a : shootoutScore.b
  const oppScore = isP1 ? shootoutScore.b : shootoutScore.a
  const myChoice = isP1 ? shootoutState.a_choice : shootoutState.b_choice
  const myScored = isP1 ? shootoutState.a_scored : shootoutState.b_scored
  const isMyTurn = isP1
    ? shootoutState.a_scored === null
    : shootoutState.a_scored !== null && shootoutState.b_scored === null
  const canShoot = isMyTurn && myChoice !== null && myScored === null
  console.log('SHOOTOUT STATE:', { isMyTurn, myChoice, myScored, canShoot, shootoutState })
  const secs = Math.floor(centesimas / 100)
  const cents = centesimas % 100

  return (
    <div style={styles.container}>
      {/* Flash gol */}
      {flash && (
        <div style={styles.flashOverlay}>
          <span style={styles.flashText}>{flash}</span>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem' }}>
          <LatencyIndicator />
        </div>
        <p style={styles.roundLabel}>Tanda {shootoutState.round || 1} de 3</p>
        <h1 style={{ ...styles.title, animation: 'tensionPulse 1.5s ease-in-out infinite' }}>PENALTIS</h1>
        <div style={styles.titleLine} />
      </div>

      {/* Marcador */}
      <div style={styles.scoreRow}>
        <div style={styles.scoreBlock}>
          <span style={styles.scoreName}>{player.username}</span>
          <span style={styles.scoreNum}>{myScore}</span>
          {myChoice && <span style={styles.choiceBadge}>{myChoice.toUpperCase()}</span>}
        </div>
        <span style={styles.scoreSep}>—</span>
        <div style={styles.scoreBlock}>
          <span style={styles.scoreName}>{opponent.username}</span>
          <span style={styles.scoreNum}>{oppScore}</span>
        </div>
      </div>

      {/* Mensaje */}
      {lastMsg && (
        <div style={styles.msgBox}>
          <span style={styles.msgText}>{lastMsg}</span>
        </div>
      )}

      {/* Cronómetro */}
      <div style={styles.timerArea}>
        <div style={styles.timerDisplay}>
          {String(secs).padStart(2, '0')}
          <span style={styles.timerSep}>:</span>
          {String(cents).padStart(2, '0')}
        </div>
        <div style={styles.timerLabel}>SEG : CEN</div>
      </div>

      {/* Popup elección */}
      {showChoicePopup && (
        <div style={styles.choiceBox}>
          <p style={styles.choiceTitle}>Tu penalty — elige</p>
          <p style={styles.choiceSub}>Si paras en una centésima de ese tipo → GOL</p>
          <div style={styles.choiceRow}>
            <button style={styles.choiceBtn} onTouchEnd={e => { e.preventDefault(); selectChoice('par') }} onClick={() => selectChoice('par')}>PAR</button>
            <button style={styles.choiceBtn} onTouchEnd={e => { e.preventDefault(); selectChoice('impar') }} onClick={() => selectChoice('impar')}>IMPAR</button>
          </div>
        </div>
      )}

      {/* Botón */}
      <div style={styles.btnArea}>
        {canShoot ? (
          <div style={{ position: 'relative', width: '150px', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <button
              style={{
                ...styles.btnStop,
                background: running ? '#ff4444' : '#ffb400',
                boxShadow: running
                  ? '0 0 0 8px rgba(255,68,68,0.1),0 0 0 16px rgba(255,68,68,0.05)'
                  : '0 0 0 8px rgba(255,180,0,0.1),0 0 0 16px rgba(255,180,0,0.05)',
              }}
              onTouchEnd={handleTap}
              onClick={handleTap}
            >
              <div style={{ width: running ? '22px' : '16px', height: running ? '22px' : '16px', background: '#141414', borderRadius: running ? '4px' : '50%' }} />
              <span style={styles.btnText}>{running ? 'PARAR' : 'START'}</span>
            </button>
          </div>
        ) : (
          <div style={styles.btnWaiting}>
            <span style={{ fontSize: '2rem' }}>⏳</span>
          </div>
        )}
      </div>

      {/* Turn indicator */}
      <div style={styles.turnBox}>
        <span style={{
          ...styles.turnBadge,
          background: isMyTurn ? 'rgba(255,180,0,0.15)' : 'rgba(255,255,255,0.05)',
          color: isMyTurn ? '#ffb400' : 'rgba(255,255,255,0.3)',
        }}>
          {isMyTurn ? 'TU TURNO' : `TURNO DE ${opponent.username.toUpperCase()}`}
        </span>
      </div>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2rem 1.75rem 2.5rem', background: '#141414', position: 'relative', overflow: 'hidden', animation: 'shootoutIn 0.4s ease forwards' },
  flashOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 50 },
  flashText: { fontSize: '4rem', fontWeight: '900', color: '#ffb400', animation: 'goalFlash 1.5s ease forwards' },
  header: { display: 'flex', flexDirection: 'column', gap: '0.25rem', position: 'relative' },
  roundLabel: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 },
  title: { fontSize: '3rem', fontWeight: '900', color: '#ffb400', letterSpacing: '-2px', margin: 0, lineHeight: 1 },
  titleLine: { height: '3px', width: '48px', background: '#ffb400', borderRadius: '2px' },
  scoreRow: { display: 'flex', alignItems: 'center', gap: '1.5rem' },
  scoreBlock: { display: 'flex', flexDirection: 'column', gap: '2px' },
  scoreName: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase' },
  scoreNum: { fontSize: '3.5rem', fontWeight: '900', color: '#fff', lineHeight: 1 },
  choiceBadge: { fontSize: '0.7rem', color: '#ffb400', fontWeight: '800', letterSpacing: '1px' },
  scoreSep: { fontSize: '1.5rem', color: 'rgba(255,255,255,0.2)', fontWeight: '600' },
  msgBox: { background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '0.75rem 1rem' },
  msgText: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  timerArea: { textAlign: 'center' },
  timerDisplay: { fontSize: '5rem', fontWeight: '900', color: '#ffb400', letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums', lineHeight: 1 },
  timerSep: { fontSize: '4rem', opacity: 0.5, margin: '0 2px' },
  timerLabel: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '2px', marginTop: '4px' },
  choiceBox: { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  choiceTitle: { fontSize: '1rem', fontWeight: '800', color: '#ffb400', textAlign: 'center', margin: 0 },
  choiceSub: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0 },
  choiceRow: { display: 'flex', gap: '0.75rem' },
  choiceBtn: { flex: 1, padding: '0.9rem', background: '#ffb400', color: '#141414', border: 'none', borderRadius: '10px', fontWeight: '900', fontSize: '1rem', letterSpacing: '1px', cursor: 'pointer' },
  btnArea: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
  btnStop: { width: '130px', height: '130px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '6px', WebkitTapHighlightColor: 'transparent' },
  btnText: { fontSize: '0.8rem', fontWeight: '900', color: '#141414', letterSpacing: '1px' },
  btnWaiting: { width: '130px', height: '130px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '2px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  turnBox: { textAlign: 'center' },
  turnBadge: { display: 'inline-block', fontSize: '0.75rem', fontWeight: '700', padding: '5px 14px', borderRadius: '20px', letterSpacing: '0.5px' },
}
