import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const CERVERAI_ID = 'ec21fbbe-c14f-4677-aa19-052fd54ff364'
const BARRIERS = [[20,25],[30,35],[40,45]]

function humanError(dist) {
  // Error proporcional a la distancia (A) con zonas definidas (B)
  // Cuanto más lejos del objetivo, mayor margen de error
  let maxErr
  if (dist <= 20)      maxErr = Math.max(1, Math.round(dist / 20))  // zona caliente: ±1
  else if (dist <= 45) maxErr = Math.max(2, Math.round(dist / 15))  // zona media: ±2-3
  else                 maxErr = Math.max(3, Math.round(dist / 12))  // zona fría: ±3-8

  // Error aleatorio entre -maxErr y +maxErr, sesgado hacia 0
  const range = maxErr * 2 + 1
  const raw = Math.floor(Math.random() * range) - maxErr
  // Sesgo hacia 0: promediar con otro random
  return Math.round((raw + (Math.floor(Math.random() * range) - maxErr)) / 2)
}

function randomCentesima(base, pending, barrierRange) {
  const pos = base % 100

  // Falta: apuntar al centro de la barrera ±4 centésimas
  if (pending === 'FALTA' && barrierRange) {
    const { min, max } = barrierRange
    const center = Math.round((min + max) / 2)
    if (Math.random() < 0.93) {
      // 93%: apuntar al centro con error mínimo
      const target = center - pos
      const distToCenter = target <= 0 ? target + 100 : target
      const raw = distToCenter + humanError(distToCenter)
      return Math.max(7, raw)
    }
    // 10%: error mayor — puede fallar
    const r = Math.random()
    if (r < 0.60) return min + Math.floor(Math.random() * (max - min + 1))
    if (r < 0.80) return Math.max(0, min - 1 - Math.floor(Math.random() * 7))
    return Math.min(99, max + 1 + Math.floor(Math.random() * 7))
  }

  // Corner: apuntar al próximo múltiplo de 10 ±4 centésimas
  if (pending === 'CORNER') {
    const nextMultiple = pos === 0 ? 10 : Math.ceil((pos + 1) / 10) * 10
    const dist = nextMultiple - pos
    return Math.max(7, dist + humanError(dist))
  }

  // Tirada normal: 93% apunta a :00 con error mínimo, 7% distribución aleatoria
  if (Math.random() < 0.93) {
    const distToNext00 = pos === 0 ? 100 : 100 - pos
    return Math.max(7, distToNext00 + humanError(distToNext00))
  }

  // 10% — distribución imprecisa (error humano mayor)
  if (pos >= 83 && pos <= 93) {
    return 7 + Math.floor(Math.random() * 9)
  }
  const r = Math.random()
  if (r < 0.50) {
    const v = 85 + Math.floor(Math.random() * 22)
    return v > 99 ? v - 100 : v
  }
  if (r < 0.80) return 70 + Math.floor(Math.random() * 15)
  return Math.floor(Math.random() * 70)
}

function randomDelay() {
  return 800 + Math.random() * 1700
}

export function useBotPlayer({ match, matchId, isBotMatch, myTurn }) {
  const processingRef = useRef(false)

  useEffect(() => {
    if (!isBotMatch) return
    if (!match) return
    if (myTurn) return           // es el turno del humano
    if (match.status !== 'playing') return
    processingRef.current = false
    if (processingRef.current) return

    // Si hay una falta pendiente, el bot pone la barrera SOLO si fue el humano quien tiró
    // Si fue Cerverai quien cayó en 98, el current_turn sigue en Cerverai — no poner barrera
    const botIsCurrentTurn = match.current_turn === CERVERAI_ID
    if (match.pending_type === 'FALTA' && !match.barrier_range && !botIsCurrentTurn) {
      processingRef.current = true
      const [min, max] = BARRIERS[Math.floor(Math.random() * BARRIERS.length)]
      setTimeout(async () => {
        // Verificar que la barrera sigue sin estar puesta (el humano no la puso ya)
        const { data: check } = await supabase.from('matches').select('barrier_range').eq('id', matchId).single()
        if (check?.barrier_range) { processingRef.current = false; return }
        const event = { emoji: '🧤', label: `🧤 Barrera: el tirador debe parar entre ${min} y ${max}` }
        await supabase.from('matches').update({
          barrier_range: JSON.stringify({ min, max }),
          last_event: JSON.stringify(event),
          turn_started_at: new Date().toISOString(),
          turn_sequence: (match.turn_sequence || 0) + 1,
        }).eq('id', matchId)
        processingRef.current = false
      }, randomDelay())
      return
    }

    // Si hay penalty pendiente y es turno del bot (el bot elige par/impar)
    if (match.pending_type === 'PENALTY' && !match.penalty_choice) {
      processingRef.current = true
      const choice = Math.random() < 0.5 ? 'par' : 'impar'
      setTimeout(async () => {
        const event = { emoji: '🥅', label: `🥅 Cerverai eligió ${choice.toUpperCase()} — tira de nuevo` }
        await supabase.from('matches').update({
          penalty_choice: choice,
          last_event: JSON.stringify(event),
          golden_glove_state: { waiting: false, choice: null, used: false },
        }).eq('id', matchId)
        processingRef.current = false
      }, randomDelay())
      return
    }

    // Si hay pending que requiere tirar (corner, falta con barrera ya puesta, penalty con elección)
    const needsShot = (
      !match.pending_type ||
      match.pending_type === 'CORNER' ||
      (match.pending_type === 'FALTA' && match.barrier_range) ||
      (match.pending_type === 'PENALTY' && match.penalty_choice)
    )

    if (!needsShot) return
    if (match.timer_running) return

    processingRef.current = true

    setTimeout(async () => {
      const now = new Date().toISOString()

      // Arrancar timer
      await supabase.from('matches').update({
        timer_running: true,
        timer_started_at: now,
        turn_started_at: now,
      }).eq('id', matchId)

      const { data: current } = await supabase
        .from('matches').select('elapsed_centesimas').eq('id', matchId).single()
      const base = current?.elapsed_centesimas || 0
      const barrierRange = match.barrier_range ? JSON.parse(match.barrier_range) : null
      const rawCents = randomCentesima(base, match.pending_type, barrierRange)
      // Garantizar mínimo 6 centésimas de avance (nadie puede tirar más rápido)
      const cents = Math.max(rawCents, 7)
      const total = base + cents

      // Esperar el tiempo equivalente a las centésimas que avanza
      // para que el observador humano vea el cronómetro correr
      // 1 centésima = 10ms reales, añadir 200ms de margen para latencia de red
      const visualDelay = cents * 10 + 200
      await new Promise(r => setTimeout(r, visualDelay))

      await botProcessPlay(total, matchId, match, processingRef)
    }, randomDelay())
  }, [match?.current_turn, match?.pending_type, match?.barrier_range, match?.penalty_choice, match?.timer_running, match?.turn_sequence])
}

async function botProcessPlay(total, matchId, match, processingRef) {
  const { data: fresh } = await supabase
    .from('matches').select('*').eq('id', matchId).single()
  if (!fresh || fresh.status !== 'playing') { processingRef.current = false; return }

  const p1 = fresh.player1_id === CERVERAI_ID
  let sp1 = fresh.score_p1
  let sp2 = fresh.score_p2
  const last2 = total % 100

  let event = null
  let changeTurn = true

  const pending = fresh.pending_type
  let botResultType = pending || 'NORMAL'

  if (pending === 'FALTA') {
    const range = fresh.barrier_range ? JSON.parse(fresh.barrier_range) : null
    if (range) {
      const gol = last2 >= range.min && last2 <= range.max
      event = { emoji: gol ? '⚽' : '🧤', label: gol ? `⚽ Gol de falta de Cerverai (${last2})` : `🧤 Falta fallada por Cerverai (${last2} fuera de ${range.min}-${range.max})` }
      if (gol) { if (p1) sp1++; else sp2++ }
      botResultType = gol ? 'GOL_FALTA' : 'FALTA_FALLO'
    }
  } else if (pending === 'CORNER') {
    const gol = last2 % 10 === 0
    event = { emoji: gol ? '⚽' : '🚩', label: gol ? `⚽ Gol de córner de Cerverai (${last2})` : `🚩 Córner fallado por Cerverai (${last2})` }
    if (gol) { if (p1) sp1++; else sp2++ }
  } else if (pending === 'PENALTY') {
    const last1 = total % 10
    const choice = fresh.penalty_choice
    const gol = choice === 'par' ? last1 % 2 === 0 : last1 % 2 !== 0
    event = { emoji: gol ? '⚽' : '🥅', label: gol ? `⚽ Gol de penalty de Cerverai (${choice}, ${last1})` : `🥅 Penalty fallado por Cerverai (${choice}, ${last1})` }
    if (gol) { if (p1) sp1++; else sp2++ }
  } else {
    // Tirada normal
    if (last2 === 0)  { event = { emoji: '⚽', label: '⚽ GOL de Cerverai' }; if (p1) sp1++; else sp2++ }
    else if (last2 === 99) {
      // Penalty — Cerverai siempre elige impar
      const choice = 'impar'
      const ev = { emoji: '🥅', label: `🥅 PENALTY de Cerverai — eligió ${choice.toUpperCase()}` }
      await supabase.from('matches').update({
        elapsed_centesimas: total,
        timer_running: false,
        pending_type: 'PENALTY',
        penalty_choice: choice,
        last_event: JSON.stringify(ev),
        turn_started_at: new Date().toISOString(),
        turn_sequence: (fresh.turn_sequence || 0) + 1,
      }).eq('id', matchId)
      processingRef.current = false
      return
    }
    else if (last2 === 98) {
      // Falta — el humano pone la barrera
      event = { emoji: '🧤', label: '🧤 FALTA de Cerverai — tú eliges la barrera' }
      await supabase.from('matches').update({
        elapsed_centesimas: total,
        timer_running: false,
        pending_type: 'FALTA',
        barrier_range: null,
        last_event: JSON.stringify(event),
        turn_started_at: new Date().toISOString(),
        turn_sequence: (fresh.turn_sequence || 0) + 1,
      }).eq('id', matchId)
      processingRef.current = false
      return
    }
    else if (last2 === 97) {
      // Corner
      event = { emoji: '🚩', label: '🚩 CÓRNER de Cerverai — para en múltiplo de 10 para GOL' }
      await supabase.from('plays').insert({
        match_id: matchId,
        player_id: CERVERAI_ID,
        centesimas: total,
        result: 'CORNER',
        points_scored: 0,
      })
      await supabase.from('matches').update({
        elapsed_centesimas: total,
        timer_running: false,
        pending_type: 'CORNER',
        last_event: JSON.stringify(event),
        turn_started_at: new Date().toISOString(),
        turn_sequence: (fresh.turn_sequence || 0) + 1,
      }).eq('id', matchId)
      processingRef.current = false
      return
    }
    else if (last2 === 13) {
      event = { emoji: '💥', label: `💥 GOL EN PROPIA de Cerverai` }
      if (p1) sp2++; else sp1++
    }
    else {
      event = { emoji: '▪️', label: `Cerverai tira — sin gol (${last2})` }
    }
  }

  // Commit
  const diff = Math.abs(sp1 - sp2)
  const secs = Math.floor(total / 100)
  const finished = diff >= 5 || secs >= 30
  const nextTurn = finished ? fresh.current_turn : (fresh.current_turn === fresh.player1_id ? fresh.player2_id : fresh.player1_id)

  let winnerId = null
  if (finished) {
    if (sp1 > sp2) winnerId = fresh.player1_id
    else if (sp2 > sp1) winnerId = fresh.player2_id
  }

  // Empate al tiempo — shootout
  if (secs >= 30 && sp1 === sp2) {
    await supabase.from('matches').update({
      score_p1: sp1, score_p2: sp2,
      elapsed_centesimas: total,
      timer_running: false,
      status: 'shootout',
      shootout_round: 1,
      shootout_state: { round: 1, a_scored: null, b_scored: null, a_choice: null, b_choice: null },
      shootout_score: { a: 0, b: 0 },
      last_event: JSON.stringify({ emoji: '🥅', label: 'Penaltis a muerte súbita' }),
      current_turn: fresh.player1_id,
    }).eq('id', matchId)
    processingRef.current = false
    return
  }

  const resultType = pending || (
    last2 === 0 ? 'GOL_DIRECTO' :
    last2 === 13 ? 'GOL_PROPIO' :
    'NORMAL'
  )
  await supabase.from('plays').insert({
    match_id: matchId,
    player_id: CERVERAI_ID,
    centesimas: total,
    result: resultType,
    points_scored: 0,
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
    turn_started_at: finished ? null : new Date().toISOString(),
    turn_sequence: (fresh.turn_sequence || 0) + 1,
    golden_glove_state: null,
    pro_shooter_active: false,
  }).eq('id', matchId)

  if (finished) {
    const xpRes = await supabase.rpc('finalize_match_stats', {
      p_match_id: matchId,
      p_player1_id: fresh.player1_id,
      p_player2_id: fresh.player2_id,
      p_score1: sp1,
      p_score2: sp2,
      p_cards_p1: fresh.cards_p1 || { yellow: 0, red: 0 },
      p_cards_p2: fresh.cards_p2 || { yellow: 0, red: 0 },
    })
    if (xpRes.data) {
      await supabase.from('matches').update({ xp_result: xpRes.data }).eq('id', matchId)
    }

    // Racha y misiones del jugador humano (player1 siempre es el humano en partidas bot)
    const humanId = fresh.player1_id
    const humanWon = fresh.winner_id === humanId
    const humanScore = fresh.score_p1
    const oppScore = fresh.score_p2
    const cleanSheet = humanWon && oppScore === 0

    const { data: humanPlays } = await supabase
      .from('plays').select('result').eq('match_id', matchId).eq('player_id', humanId)
    const goalsScored = humanPlays?.filter(pl => ['GOL_DIRECTO','GOL_FALTA','GOL_PENALTY','GOL_CORNER'].includes(pl.result)).length || 0
    const goalsFalta = humanPlays?.filter(pl => pl.result === 'GOL_FALTA').length || 0

    await supabase.rpc('update_daily_streak', { p_player_id: humanId })
    const missionsRes = await supabase.rpc('update_daily_missions', {
      p_player_id: humanId,
      p_match_id: matchId,
      p_won: humanWon,
      p_goals_scored: goalsScored,
      p_goals_falta: goalsFalta,
      p_clean_sheet: cleanSheet,
    })
    if (missionsRes.data?.completed_missions?.length > 0) {
      await supabase.from('matches').update({ missions_result: missionsRes.data }).eq('id', matchId)
    }
  }

  processingRef.current = false
}
