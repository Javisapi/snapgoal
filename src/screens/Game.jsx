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

function evaluatePlay(c) {
  const last2 = c % 100
  if (last2 === 0)  return { result: 'GOL_DIRECTO', changeTurn: true, scoreSelf: 1 }
  if (last2 === 99) return { result: 'PENALTY', changeTurn: false, pending: true }
  if (last2 === 98) return { result: 'FALTA', changeTurn: false, pending: true }
  if (last2 === 97) return { result: 'CORNER', changeTurn: false, pending: true }
  if (last2 === 13) return { result: 'GOL_PROPIO', changeTurn: true, scoreOpp: 1 }
  return { result: 'NADA', changeTurn: true }
}

export default function Game() {
  const { matchId } = useParams()
  const navigate = useNavigate()

  const [player, setPlayer] = useState(null)
  const [match, setMatch] = useState(null)
  const [opponent, setOpponent] = useState(null)
  const [centesimas, setCentesimas] = useState(0)
  const [running, setRunning] = useState(false)
  const [lastPlay, setLastPlay] = useState(null)
  const [pendingType, setPendingType] = useState(null)
  const [barrierOptions, setBarrierOptions] = useState(null)
  const [warning, setWarning] = useState(null)
  const [myTurn, setMyTurn] = useState(false)
  const [cards, setCards] = useState({ p1: { yellow: 0, red: 0 }, p2: { yellow: 0, red: 0 } })
  const [penaltyChoice, setPenaltyChoice] = useState(null)
  const [showPenaltyPopup, setShowPenaltyPopup] = useState(false)

  const intervalRef = useRef(null)
  const startTimeRef = useRef(null)
  const offsetRef = useRef(0)
  const timeoutWarnRef = useRef(null)
  const timeoutRedRef = useRef(null)
  const matchRef = useRef(null)
  const playerRef = useRef(null)
  const opponentRef = useRef(null)
  const channelRef = useRef(null)
  const runningRef = useRef(false)
  const preShootOffsetRef = useRef(0)

  useEffect(() => {
    init()
    return () => {
      clearInterval(intervalRef.current)
      clearTimeout(timeoutWarnRef.current)
      clearTimeout(timeoutRedRef.current)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
    }
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    playerRef.current = p
    setPlayer(p)

    const { data: m } = await supabase
      .from('matches').select('*').eq('id', matchId).single()
    if (!m) { navigate('/'); return }

    matchRef.current = m
    setMatch(m)
    setMyTurn(m.current_turn === p.id)

    const base = m.elapsed_centesimas || 0
    offsetRef.current = base
    setCentesimas(base)

    if (m.timer_running && m.timer_started_at) {
      startLocalTimer(base, new Date(m.timer_started_at).getTime())
    }

    if (m.pending_type) setPendingType(m.pending_type)
    if (m.cards_p1 && m.cards_p2) setCards({ p1: m.cards_p1, p2: m.cards_p2 })
    if (m.penalty_choice) setPenaltyChoice(m.penalty_choice)
    if (m.barrier_range && m.pending_type === 'FALTA' && m.current_turn === p.id) {
      setBarrierOptions(null)
    }
    if (m.last_event) {
      try { setLastPlay(JSON.parse(m.last_event)) } catch(e) {}
    }

    const oppId = m.player1_id === p.id ? m.player2_id : m.player1_id
    const { data: opp } = await supabase
      .from('players').select('*').eq('id', oppId).single()
    setOpponent(opp)
    opponentRef.current = opp

    const channel = supabase
      .channel('match-' + matchId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'matches', filter: `id=eq.${matchId}`,
      }, (payload) => {
        const updated = payload.new
        matchRef.current = updated
        setMatch({ ...updated })
        const isMyTurn = updated.current_turn === playerRef.current?.id
        if (updated.cards_p1 && updated.cards_p2) setCards({ p1: updated.cards_p1, p2: updated.cards_p2 })
        if (updated.penalty_choice) setPenaltyChoice(updated.penalty_choice)
        else setPenaltyChoice(null)
        setMyTurn(isMyTurn)

        // Cronómetro
        if (updated.timer_running && updated.timer_started_at) {
          startLocalTimer(updated.elapsed_centesimas || 0, new Date(updated.timer_started_at).getTime())
        } else {
          clearInterval(intervalRef.current)
          runningRef.current = false
          setRunning(false)
          const val = updated.elapsed_centesimas || 0
          offsetRef.current = val
          setCentesimas(val)
        }

        // Pending
        if (updated.pending_type) {
          setPendingType(updated.pending_type)
          // Si hay falta y soy el rival (el que pone la barrera)
          if (updated.pending_type === 'FALTA' && !isMyTurn && !updated.barrier_range) {
            setBarrierOptions(true)
          } else {
            setBarrierOptions(null)
          }
        } else {
          setPendingType(null)
          setBarrierOptions(null)
        }

        if (updated.last_event) {
          try { setLastPlay(JSON.parse(updated.last_event)) } catch(e) {}
        }

        if (updated.status === 'finished') navigate('/result/' + matchId)
      })

    channelRef.current = channel
    channel.subscribe()

    // Si hay falta pendiente y soy el rival sin barrera aún
    if (m.pending_type === 'FALTA' && m.current_turn !== p.id && !m.barrier_range) {
      setBarrierOptions(true)
    }
  }

  function startLocalTimer(base, startedAtMs) {
    clearInterval(intervalRef.current)
    runningRef.current = true
    setRunning(true)
    offsetRef.current = base
    intervalRef.current = setInterval(() => {
      setCentesimas(base + Math.floor((Date.now() - startedAtMs) / 10))
    }, 10)
  }

  async function startTimer() {
    preShootOffsetRef.current = offsetRef.current
    if (runningRef.current) return
    const base = offsetRef.current
    const now = new Date().toISOString()
    const startedAtMs = Date.now()
    startTimeRef.current = startedAtMs
    runningRef.current = true
    setRunning(true)

    intervalRef.current = setInterval(() => {
      setCentesimas(base + Math.floor((Date.now() - startedAtMs) / 10))
    }, 10)

    timeoutWarnRef.current = setTimeout(async () => {
      const p = playerRef.current
      const m = matchRef.current
      const isP1 = m.player1_id === p.id
      const currentCards = isP1 ? (m.cards_p1 || { yellow: 0, red: 0 }) : (m.cards_p2 || { yellow: 0, red: 0 })
      const newYellow = currentCards.yellow + 1
      const newCards = { ...currentCards, yellow: newYellow }
      const update = isP1 ? { cards_p1: newCards } : { cards_p2: newCards }
      await supabase.from('matches').update(update).eq('id', matchId)
      if (newYellow >= 2) {
        setWarning({ type: 'red', text: `🟥 2 amarillas = Roja a ${p.username} — gol para el rival` })
        stopTimer(true)
      } else {
        setWarning({ type: 'yellow', text: `🟨 Tarjeta amarilla a ${p.username} — para antes de 5s` })
      }
    }, 2000)
    timeoutRedRef.current = setTimeout(() => {
      const p = playerRef.current
      setWarning({ type: 'red', text: `🟥 Tarjeta roja a ${p.username} — gol para el rival` })
      stopTimer(true)
    }, 5000)

    await supabase.from('matches').update({
      timer_running: true,
      timer_started_at: now,
    }).eq('id', matchId)
  }

  async function stopTimer(forced = false) {
    clearInterval(intervalRef.current)
    clearTimeout(timeoutWarnRef.current)
    clearTimeout(timeoutRedRef.current)
    const elapsed = Math.floor((Date.now() - startTimeRef.current) / 10)
    const total = offsetRef.current + elapsed
    offsetRef.current = total
    setCentesimas(total)
    runningRef.current = false
    setRunning(false)
    setWarning(null)
    processPlay(total, forced)
  }

  async function processPlay(total, redCard) {
    const m = matchRef.current
    const p = playerRef.current
    const opp = opponentRef.current
    const p1 = m.player1_id === p.id
    let sp1 = m.score_p1, sp2 = m.score_p2

    if (redCard) {
      const isP1 = m.player1_id === p.id
      const currentCards = isP1 ? (m.cards_p1 || { yellow: 0, red: 0 }) : (m.cards_p2 || { yellow: 0, red: 0 })
      const newRed = currentCards.red + 1
      const newCards = { yellow: currentCards.yellow, red: newRed }
      const cardUpdate = isP1 ? { cards_p1: newCards } : { cards_p2: newCards }
      await supabase.from('matches').update(cardUpdate).eq('id', matchId)
      if (p1) sp2 += 1; else sp1 += 1
      // Volver al tiempo pre-tirada
      offsetRef.current = preShootOffsetRef.current
      setCentesimas(preShootOffsetRef.current)
      const event = { emoji: '🟥', label: `🟥 Roja a ${p.username} — gol para ${opp.username}` }
      setLastPlay(event)
      setPendingType(null)
      // 2 rojas = partido terminado 5-0
      if (newRed >= 2) {
        const winnerId = p1 ? m.player2_id : m.player1_id
        const finalSp1 = p1 ? 0 : 5
        const finalSp2 = p1 ? 5 : 0
        await supabase.from('matches').update({
          score_p1: finalSp1, score_p2: finalSp2,
          status: 'finished', winner_id: winnerId,
          elapsed_centesimas: preShootOffsetRef.current,
          timer_running: false,
          last_event: JSON.stringify({ emoji: '🟥', label: `🟥 2 rojas a ${p.username} — partido terminado 5-0` }),
          ended_at: new Date().toISOString(),
        }).eq('id', matchId)
        await updateStats(finalSp1, finalSp2, m, p)
        navigate('/result/' + matchId)
        return
      }
      await commitPlay(preShootOffsetRef.current, 'ROJA', sp1, sp2, true, m, p, event)
      return
    }

    const ev = evaluatePlay(total)

    if (ev.result === 'FALTA') {
      // Guardar pending y esperar que el rival elija la barrera
      const event = { emoji: '🧤', label: `🧤 FALTA de ${p.username} — el rival elige la barrera` }
      setLastPlay(event)
      setPendingType('FALTA')
      await supabase.from('matches').update({
        elapsed_centesimas: total,
        timer_running: false,
        pending_type: 'FALTA',
        barrier_range: null,
        last_event: JSON.stringify(event),
      }).eq('id', matchId)
      return
    }

    if (ev.result === 'CORNER') {
      const event = { emoji: '🚩', label: `🚩 CÓRNER de ${p.username} — para en múltiplo de 10 para GOL` }
      setLastPlay(event)
      setPendingType('CORNER')
      await supabase.from('matches').update({
        elapsed_centesimas: total,
        timer_running: false,
        pending_type: 'CORNER',
        last_event: JSON.stringify(event),
      }).eq('id', matchId)
      return
    }

    if (ev.result === 'PENALTY') {
      const event = { emoji: '🥅', label: `🥅 PENALTY de ${p.username} — elige par o impar` }
      setLastPlay(event)
      setPendingType('PENALTY')
      setShowPenaltyPopup(true)
      await supabase.from('matches').update({
        elapsed_centesimas: total,
        timer_running: false,
        pending_type: 'PENALTY',
        penalty_choice: null,
        last_event: JSON.stringify(event),
      }).eq('id', matchId)
      return
    }

    // Tirada normal o tirada de penalty/corner resueltos
    const pending = m.pending_type
    let gol = false
    let label = null
    let emoji = '⚽'

    if (pending === 'PENALTY') {
      const last1 = total % 10
      const choice = m.penalty_choice
      gol = choice === 'par' ? last1 % 2 === 0 : last1 % 2 !== 0
      label = gol
        ? `⚽ Gol de penalty de ${p.username} (eligió ${choice}, centésima: ${last1})`
        : `🥅 Penalty fallado por ${p.username} (eligió ${choice}, centésima: ${last1})`
      emoji = gol ? '⚽' : '🥅'
      if (gol) { if (p1) sp1 += 1; else sp2 += 1 }
    } else if (pending === 'CORNER') {
      const last2 = total % 100
      gol = last2 % 10 === 0
      label = gol
        ? `⚽ Gol de córner de ${p.username} (${last2})`
        : `🚩 Córner fallado por ${p.username} (${last2})`
      emoji = gol ? '⚽' : '🚩'
      if (gol) { if (p1) sp1 += 1; else sp2 += 1 }
    } else if (pending === 'FALTA') {
      const last2 = total % 100
      const range = m.barrier_range ? JSON.parse(m.barrier_range) : null
      if (range) {
        gol = last2 >= range.min && last2 < range.max
        label = gol
          ? `⚽ Gol de falta de ${p.username} (${last2} en ${range.min}-${range.max})`
          : `🧤 Falta fallada por ${p.username} (${last2} fuera de ${range.min}-${range.max})`
        emoji = gol ? '⚽' : '🧤'
        if (gol) { if (p1) sp1 += 1; else sp2 += 1 }
      }
    } else if (ev.result === 'GOL_DIRECTO') {
      gol = true
      label = `⚽ GOL de ${p.username}`
      if (p1) sp1 += 1; else sp2 += 1
    } else if (ev.result === 'GOL_PROPIO') {
      label = `💥 GOL EN PROPIA de ${p.username} — punto para ${opp.username}`
      emoji = '💥'
      if (p1) sp2 += 1; else sp1 += 1
    }

    const event = label ? { emoji, label } : null
    if (event) setLastPlay(event)
    else setLastPlay(null)
    setPendingType(null)

    await commitPlay(total, ev.result, sp1, sp2, true, m, p, event)
  }

  async function selectBarrier(min, max) {
    const m = matchRef.current
    const p = playerRef.current
    const range = JSON.stringify({ min, max })
    setBarrierOptions(null)

    const event = { emoji: '🧤', label: `🧤 Barrera: el tirador debe parar entre ${min} y ${max}` }
    setLastPlay(event)

    await supabase.from('matches').update({
      barrier_range: range,
      last_event: JSON.stringify(event),
    }).eq('id', matchId)
  }

  async function selectPenaltyChoice(choice) {
    const m = matchRef.current
    const p = playerRef.current
    const opp = opponentRef.current
    setShowPenaltyPopup(false)
    setPenaltyChoice(choice)
    const event = { emoji: '🥅', label: `🥅 ${p.username} eligió ${choice.toUpperCase()} — tira de nuevo` }
    setLastPlay(event)
    await supabase.from('matches').update({
      penalty_choice: choice,
      last_event: JSON.stringify(event),
    }).eq('id', matchId)
  }

  async function commitPlay(total, resultType, sp1, sp2, changeTurn, m, p, event) {
    const diff = Math.abs(sp1 - sp2)
    const secs = Math.floor(total / 100)
    const timeUp = secs >= 45
    const finished = diff >= 5 || timeUp

    const nextTurn = changeTurn
      ? (m.current_turn === m.player1_id ? m.player2_id : m.player1_id)
      : m.current_turn

    // Empate al tiempo — iniciar penaltis
    if (timeUp && sp1 === sp2) {
      await supabase.from('matches').update({
        score_p1: sp1, score_p2: sp2,
        elapsed_centesimas: total,
        timer_running: false,
        pending_type: 'SHOOTOUT',
        shootout_round: 1,
        shootout_state: JSON.stringify({ round: 1, turn: 'a', a_scored: null, b_scored: null, a_choice: null, b_choice: null }),
        shootout_score: JSON.stringify({ a: 0, b: 0 }),
        last_event: JSON.stringify({ emoji: '🥅', label: 'Empate — penaltis a muerte súbita' }),
        current_turn: m.player1_id,
      }).eq('id', matchId)
      navigate('/result/' + matchId)
      return
    }

    let winnerId = null
    if (finished) {
      if (sp1 > sp2) winnerId = m.player1_id
      else if (sp2 > sp1) winnerId = m.player2_id
    }

    await supabase.from('plays').insert({
      match_id: matchId, player_id: p.id,
      centesimas: total, result: resultType, points_scored: 0,
    })

    await supabase.from('matches').update({
      score_p1: sp1, score_p2: sp2,
      current_turn: nextTurn,
      elapsed_centesimas: total,
      timer_running: false,
      pending_type: null,
      barrier_range: null,
      penalty_choice: null,
      last_event: event ? JSON.stringify(event) : null,
      status: finished ? 'finished' : 'playing',
      winner_id: winnerId,
      ended_at: finished ? new Date().toISOString() : null,
    }).eq('id', matchId)

    if (finished) {
      await updateStats(sp1, sp2, m, p)
      navigate('/result/' + matchId)
    }
  }

  async function updateStats(sp1, sp2, m, p) {
    const p1 = m.player1_id === p.id
    const myScore = p1 ? sp1 : sp2
    const oppScore = p1 ? sp2 : sp1
    const myPts = myScore > oppScore ? 3 : myScore === oppScore ? 1 : 0
    const oppPts = oppScore > myScore ? 3 : myScore === oppScore ? 1 : 0
    const oppId = p1 ? m.player2_id : m.player1_id

    const myCards = p1 ? (m.cards_p1 || { yellow: 0, red: 0 }) : (m.cards_p2 || { yellow: 0, red: 0 })
    const oppCards = p1 ? (m.cards_p2 || { yellow: 0, red: 0 }) : (m.cards_p1 || { yellow: 0, red: 0 })

    await supabase.rpc('update_player_stats', {
      p_player_id: p.id,
      p_points: myPts,
      p_won: myScore > oppScore ? 1 : 0,
      p_drawn: myScore === oppScore ? 1 : 0,
      p_lost: myScore < oppScore ? 1 : 0,
    })
    await supabase.rpc('update_player_stats', {
      p_player_id: oppId,
      p_points: oppPts,
      p_won: oppScore > myScore ? 1 : 0,
      p_drawn: myScore === oppScore ? 1 : 0,
      p_lost: oppScore < myScore ? 1 : 0,
    })

    // Actualizar goles y tarjetas
    await supabase.from('players').update({
      goals_scored: supabase.rpc ? undefined : 0,
    }).eq('id', p.id)

    await supabase.rpc('update_player_goals_cards', {
      p_player_id: p.id,
      p_goals_scored: myScore,
      p_goals_conceded: oppScore,
      p_yellow: myCards.yellow || 0,
      p_red: myCards.red || 0,
    })
    await supabase.rpc('update_player_goals_cards', {
      p_player_id: oppId,
      p_goals_scored: oppScore,
      p_goals_conceded: myScore,
      p_yellow: oppCards.yellow || 0,
      p_red: oppCards.red || 0,
    })
  }

  const isP1 = match ? match.player1_id === player?.id : false
  const scoreMe = match ? (isP1 ? match.score_p1 : match.score_p2) : 0
  const scoreOpp = match ? (isP1 ? match.score_p2 : match.score_p1) : 0
  const secs = Math.floor(centesimas / 100)
  const cents = centesimas % 100
  const barrierRange = match?.barrier_range ? JSON.parse(match.barrier_range) : null
  const canShoot = myTurn && !barrierOptions && (!pendingType || (pendingType === 'FALTA' && barrierRange) || pendingType === 'CORNER' || pendingType === 'PENALTY')

  if (!match || !opponent || !player) return (
    <div style={styles.container}>
      <p style={{ color: '#fff', textAlign: 'center' }}>Cargando partido...</p>
    </div>
  )

  return (
    <div style={styles.container}>

      <div style={styles.topBar}>
        <div style={styles.playerChip}>
          <span style={styles.playerName}>
            {player.username.toUpperCase()}
            {(isP1 ? cards.p1 : cards.p2).yellow > 0 && ' 🟨'.repeat((isP1 ? cards.p1 : cards.p2).yellow)}
            {(isP1 ? cards.p1 : cards.p2).red > 0 && ' 🟥'.repeat((isP1 ? cards.p1 : cards.p2).red)}
          </span>
          <span style={styles.playerScore}>{scoreMe}</span>
        </div>
        <span style={styles.vs}>VS</span>
        <div style={styles.playerChip}>
          <span style={styles.playerName}>
            {opponent.username.toUpperCase()}
            {(isP1 ? cards.p2 : cards.p1).yellow > 0 && ' 🟨'.repeat((isP1 ? cards.p2 : cards.p1).yellow)}
            {(isP1 ? cards.p2 : cards.p1).red > 0 && ' 🟥'.repeat((isP1 ? cards.p2 : cards.p1).red)}
          </span>
          <span style={styles.playerScore}>{scoreOpp}</span>
        </div>
      </div>

      {/* Popup penalty — solo el tirador */}
      {showPenaltyPopup && myTurn && (
        <div style={styles.barrierBox}>
          <p style={styles.barrierTitle}>🥅 Penalty — elige par o impar</p>
          <p style={styles.barrierSub}>Si paras en una centésima de ese tipo, GOL</p>
          <div style={styles.barrierBtns}>
            <button style={styles.barrierBtn} onClick={() => selectPenaltyChoice('par')}>PAR</button>
            <button style={styles.barrierBtn} onClick={() => selectPenaltyChoice('impar')}>IMPAR</button>
          </div>
        </div>
      )}

      <div style={styles.turnIndicator}>
        <span style={{
          ...styles.turnBadge,
          background: myTurn ? 'rgba(255,180,0,0.15)' : 'rgba(255,255,255,0.05)',
          color: myTurn ? '#ffb400' : 'rgba(255,255,255,0.3)',
        }}>
          {myTurn ? 'TU TURNO' : `TURNO DE ${opponent.username.toUpperCase()}`}
        </span>
      </div>

      {warning && (
        <div style={{
          ...styles.warningBox,
          background: warning.type === 'yellow' ? 'rgba(255,200,0,0.1)' : 'rgba(255,68,68,0.1)',
          border: warning.type === 'yellow' ? '1px solid rgba(255,200,0,0.4)' : '1px solid rgba(255,68,68,0.4)',
        }}>
          <span style={{ ...styles.warningText, color: warning.type === 'yellow' ? '#ffc800' : '#ff4444' }}>
            {warning.text}
          </span>
        </div>
      )}

      <div style={styles.timerArea}>
        <div style={styles.timerDisplay}>
          {String(secs).padStart(2, '0')}
          <span style={styles.timerSep}>:</span>
          {String(cents).padStart(2, '0')}
        </div>
        <div style={styles.timerLabel}>SEG : CEN</div>
      </div>

      {lastPlay?.label && !barrierOptions && (
        <div style={styles.lastPlayBox}>
          <span style={styles.lastPlayLabel}>{lastPlay.label}</span>
        </div>
      )}

      {/* Popup barrera — rival elige */}
      {barrierOptions && !myTurn && (
        <div style={styles.barrierBox}>
          <p style={styles.barrierTitle}>🧱 Colocando la barrera</p>
          <p style={styles.barrierSub}>Elige entre qué valores debe parar el rival para marcar</p>
          <div style={styles.barrierBtns}>
            {[[20,30],[30,40],[40,50]].map(([min,max]) => (
              <button key={min} style={styles.barrierBtn} onClick={() => selectBarrier(min, max)}>
                {min} — {max}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Esperando que rival elija barrera */}
      {pendingType === 'FALTA' && myTurn && !barrierRange && (
        <div style={styles.waitingBarrier}>
          <span style={styles.waitingBarrierText}>🧱 El rival está colocando la barrera...</span>
        </div>
      )}

      {/* Instrucción de falta con barrera lista */}
      {pendingType === 'FALTA' && myTurn && barrierRange && (
        <div style={styles.faltaInstructions}>
          <span style={styles.faltaInstructionsText}>
            Para entre {barrierRange.min} y {barrierRange.max} para marcar
          </span>
        </div>
      )}

      <div style={styles.btnArea}>
        {canShoot ? (
          <button
            style={{
              ...styles.btnStop,
              background: running ? '#ff4444' : '#ffb400',
              boxShadow: running
                ? '0 0 0 8px rgba(255,68,68,0.1),0 0 0 16px rgba(255,68,68,0.05)'
                : '0 0 0 8px rgba(255,180,0,0.1),0 0 0 16px rgba(255,180,0,0.05)',
            }}
            onTouchStart={() => running ? stopTimer() : startTimer()}
            onClick={() => running ? stopTimer() : startTimer()}
          >
            <div style={{ width: running ? '22px' : '16px', height: running ? '22px' : '16px', background: '#141414', borderRadius: running ? '4px' : '50%' }} />
            <span style={styles.btnStopText}>{running ? 'PARAR' : 'START'}</span>
          </button>
        ) : (
          <div style={styles.btnWaiting}>
            <span style={{ fontSize: '2rem' }}>⏳</span>
          </div>
        )}
      </div>

      <div style={styles.bottomBar}>
        <div style={styles.bottomItem}>
          <span style={styles.bottomLabel}>TIEMPO</span>
          <span style={styles.bottomVal}>{Math.max(0, 45 - secs)}s</span>
        </div>
        <div style={styles.bottomItem}>
          <span style={styles.bottomLabel}>DIFERENCIA</span>
          <span style={styles.bottomVal}>{Math.abs(scoreMe - scoreOpp)} goles</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2rem 1.5rem 2.5rem', background: '#141414' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  playerChip: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  playerName: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', fontWeight: '600', letterSpacing: '0.5px' },
  playerScore: { fontSize: '2.5rem', fontWeight: '900', color: '#fff', lineHeight: 1 },
  vs: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)', fontWeight: '600' },
  turnIndicator: { textAlign: 'center' },
  turnBadge: { display: 'inline-block', fontSize: '0.75rem', fontWeight: '700', padding: '5px 14px', borderRadius: '20px', letterSpacing: '0.5px' },
  warningBox: { borderRadius: '10px', padding: '0.6rem 1rem', textAlign: 'center' },
  warningText: { fontSize: '0.95rem', fontWeight: '700' },
  timerArea: { textAlign: 'center' },
  timerDisplay: { fontSize: '5rem', fontWeight: '900', color: '#ffb400', letterSpacing: '-2px', fontVariantNumeric: 'tabular-nums', lineHeight: 1 },
  timerSep: { fontSize: '4rem', opacity: 0.5, margin: '0 2px' },
  timerLabel: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', letterSpacing: '2px', marginTop: '4px' },
  lastPlayBox: { background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '0.75rem 1rem' },
  lastPlayLabel: { fontSize: '0.95rem', color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  barrierBox: { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.25)', borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  barrierTitle: { fontSize: '1rem', fontWeight: '800', color: '#ffb400', textAlign: 'center' },
  barrierSub: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  barrierBtns: { display: 'flex', gap: '0.5rem' },
  barrierBtn: { flex: 1, padding: '0.75rem 0', background: '#ffb400', color: '#141414', border: 'none', borderRadius: '10px', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' },
  waitingBarrier: { background: 'rgba(255,255,255,0.04)', borderRadius: '12px', padding: '0.75rem 1rem', textAlign: 'center' },
  waitingBarrierText: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  faltaInstructions: { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.25)', borderRadius: '12px', padding: '0.75rem 1rem', textAlign: 'center' },
  faltaInstructionsText: { fontSize: '0.95rem', color: '#ffb400', fontWeight: '700' },
  btnArea: { display: 'flex', justifyContent: 'center', alignItems: 'center' },
  btnStop: { width: '130px', height: '130px', borderRadius: '50%', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '6px', WebkitTapHighlightColor: 'transparent' },
  btnStopText: { fontSize: '0.8rem', fontWeight: '900', color: '#141414', letterSpacing: '1px' },
  btnWaiting: { width: '130px', height: '130px', borderRadius: '50%', background: 'rgba(255,255,255,0.04)', border: '2px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  bottomBar: { display: 'flex', justifyContent: 'space-around', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' },
  bottomItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  bottomLabel: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '1px' },
  bottomVal: { fontSize: '1rem', fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
}
