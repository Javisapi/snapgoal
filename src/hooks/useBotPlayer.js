import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const CERVERAI_ID = 'ec21fbbe-c14f-4677-aa19-052fd54ff364'
const BARRIERS = [[20,25],[30,35],[40,45]]

function randomCentesima() {
  return Math.floor(Math.random() * 100)
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
    if (processingRef.current) return

    // Si hay una falta pendiente y el humano ya tiró (el bot pone la barrera)
    if (match.pending_type === 'FALTA' && !match.barrier_range) {
      processingRef.current = true
      const [min, max] = BARRIERS[Math.floor(Math.random() * BARRIERS.length)]
      setTimeout(async () => {
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
      const cents = randomCentesima()
      const now = new Date().toISOString()

      // Arrancar timer
      await supabase.from('matches').update({
        timer_running: true,
        timer_started_at: now,
        turn_started_at: now,
      }).eq('id', matchId)

      // Parar después de un tiempo que genere esa centésima
      // Usamos elapsed_centesimas actual + cents como total
      const { data: current } = await supabase
        .from('matches').select('elapsed_centesimas').eq('id', matchId).single()
      const base = current?.elapsed_centesimas || 0
      const total = base + cents

      // Pequeña pausa para que el timer sea visible
      await new Promise(r => setTimeout(r, 300 + Math.random() * 400))

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

  if (pending === 'FALTA') {
    const range = fresh.barrier_range ? JSON.parse(fresh.barrier_range) : null
    if (range) {
      const gol = last2 >= range.min && last2 <= range.max
      event = { emoji: gol ? '⚽' : '🧤', label: gol ? `⚽ Gol de falta de Cerverai (${last2})` : `🧤 Falta fallada por Cerverai (${last2} fuera de ${range.min}-${range.max})` }
      if (gol) { if (p1) sp1++; else sp2++ }
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

  await supabase.from('plays').insert({
    match_id: matchId,
    player_id: CERVERAI_ID,
    centesimas: total,
    result: pending || 'NORMAL',
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
    await supabase.rpc('finalize_match_stats', {
      p_match_id: matchId,
      p_player1_id: fresh.player1_id,
      p_player2_id: fresh.player2_id,
      p_score1: sp1,
      p_score2: sp2,
      p_cards_p1: fresh.cards_p1 || { yellow: 0, red: 0 },
      p_cards_p2: fresh.cards_p2 || { yellow: 0, red: 0 },
    })
  }

  processingRef.current = false
}
