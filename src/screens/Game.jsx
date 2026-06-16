import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import LatencyIndicator from '../components/LatencyIndicator'
import { useTrackPresence } from '../hooks/usePresence'
import { useBotPlayer } from '../hooks/useBotPlayer'

const GAME_CSS = `
  @keyframes eventFlash { 0%{opacity:0;transform:scale(0.8)} 30%{opacity:1;transform:scale(1.05)} 60%{opacity:1;transform:scale(1)} 100%{opacity:0;transform:scale(0.95)} }
  @keyframes goalRing { 0%{transform:scale(0.8);opacity:0.8} 100%{transform:scale(2.5);opacity:0} }
  @keyframes cardShake { 0%,100%{transform:translateX(0) rotate(0deg)} 20%{transform:translateX(-10px) rotate(-3deg)} 40%{transform:translateX(10px) rotate(3deg)} 60%{transform:translateX(-6px) rotate(-2deg)} 80%{transform:translateX(6px) rotate(2deg)} }
  @keyframes flashOverlayGold { 0%{opacity:0} 20%{opacity:1} 100%{opacity:0} }
  @keyframes flashOverlayRed { 0%{opacity:0} 15%{opacity:1} 100%{opacity:0} }
`

async function getPlayer() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data } = await supabase.from('players').select('*').eq('auth_id', session.user.id).single()
  if (data) sessionStorage.setItem('player_' + session.user.id, JSON.stringify(data))
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

const GloveIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 8V6a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v1h1V5a2 2 0 0 1 2-2h1a1 1 0 0 1 1 1v4l1-1a1.5 1.5 0 0 1 2 2l-3 4v3a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-5L4 10a1.5 1.5 0 0 1 2-2l0 0z" fill="#ffb400" stroke="#cc8800" strokeWidth="0.5"/>
  </svg>
)


const ProShooterIcon = () => (
  <svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="11" stroke="#ffb400" strokeWidth="1.5" fill="none"/>
    <circle cx="16" cy="16" r="6" stroke="#ffb400" strokeWidth="1" fill="none"/>
    <circle cx="16" cy="16" r="2" fill="#ffb400"/>
    <line x1="16" y1="2" x2="16" y2="6" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="16" y1="26" x2="16" y2="30" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="2" y1="16" x2="6" y2="16" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="26" y1="16" x2="30" y2="16" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
)

const ProShooterStock = ({ stock }) => (
  <span style={{display:'flex',alignItems:'center',gap:'2px',fontSize:'0.65rem',color:'#ffb400',fontWeight:'700'}}>
    <ProShooterIcon />
    {stock > 1 && <span>×{stock}</span>}
  </span>
)

const GloveStock = ({ stock }) => (
  <span style={{display:'flex',alignItems:'center',gap:'2px',fontSize:'0.65rem',color:'#ffb400',fontWeight:'700'}}>
    <GloveIcon />
    {stock > 1 && <span>×{stock}</span>}
  </span>
)

export default function Game() {
  const { matchId } = useParams()
  const navigate = useNavigate()

  const [player, setPlayer] = useState(null)
  useTrackPresence(player?.id, 'playing')
  const [match, setMatch] = useState(null)
  const [opponent, setOpponent] = useState(null)
  const [centesimas, setCentesimas] = useState(0)
  const [running, setRunning] = useState(false)
  const [lastPlay, setLastPlay] = useState(null)
  const [pendingType, setPendingType] = useState(null)
  const [barrierOptions, setBarrierOptions] = useState(null)
  const [warning, setWarning] = useState(null)
  const [myTurn, setMyTurn] = useState(false)
  const [showAbandon, setShowAbandon] = useState(false)
  const [opponentGone, setOpponentGone] = useState(false)
  const [disconnectCountdown, setDisconnectCountdown] = useState(15)
  const disconnectCountdownRef = useRef(null)
  const [flashEvent, setFlashEvent] = useState(null)
  const [chatMsg, setChatMsg] = useState(null)
  const [showChat, setShowChat] = useState(false)
  const [leagueId, setLeagueId] = useState(null)
  const isBotMatch = match?.is_bot_match || false

  useBotPlayer({ match, matchId, isBotMatch, myTurn })
  const [inactivityProgress, setInactivityProgress] = useState(0)
  const [inactivityWarning, setInactivityWarning] = useState(false)
  const [cards, setCards] = useState({ p1: { yellow: 0, red: 0 }, p2: { yellow: 0, red: 0 } })
  const [penaltyChoice, setPenaltyChoice] = useState(null)
  const [goldenGloveStock, setGoldenGloveStock] = useState(0)
  const [oppGoldenGloveStock, setOppGoldenGloveStock] = useState(0)
  const [showGlovePopup, setShowGlovePopup] = useState(false)
  const [gloveUsed, setGloveUsed] = useState(false)
  const [waitingForGlove, setWaitingForGlove] = useState(false)
  const gloveTimerRef = useRef(null)
  const [proShooterStock, setProShooterStock] = useState(0)
  const [oppProShooterStock, setOppProShooterStock] = useState(0)
  const proShooterStockRef = useRef(0)
  const [proShooterActive, setProShooterActive] = useState(false)
  const [showProShooterPopup, setShowProShooterPopup] = useState(false)
  const proShooterPopupShownRef = useRef(false)
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
  const processingRef = useRef(false)
  const mountedRef = useRef(true)
  const heartbeatRef = useRef(null)
  const disconnectRef = useRef(null)
  const warnRef = useRef(null)
  const inactivityIntervalRef = useRef(null)
  const inactivityStartRef = useRef(null)
  const startPerfRef = useRef(null)
  const iAmTheShooterRef = useRef(false)
  const timerVersionRef = useRef(0)
  const lastTapRef = useRef(0)
  const preShootOffsetRef = useRef(0)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = GAME_CSS
    document.head.appendChild(s)
    init()
    return () => {
      // Bloquear TODOS los callbacks pendientes inmediatamente
      mountedRef.current = false
      processingRef.current = true

      clearInterval(intervalRef.current)
      clearInterval(heartbeatRef.current)
      clearInterval(inactivityIntervalRef.current)
      clearTimeout(timeoutWarnRef.current)
      clearTimeout(timeoutRedRef.current)
      clearTimeout(disconnectRef.current)
      clearTimeout(warnRef.current)

      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    playerRef.current = p
    setPlayer(p)

    // Cerrar partidos abandonados antes de cargar el nuevo
    await supabase.rpc('close_abandoned_matches', { p_player_id: p.id })

    const { data: m } = await supabase
      .from('matches').select('*').eq('id', matchId).single()
    if (!m) { navigate('/'); return }

    // Si el partido está en announcing, redirigir a la pantalla de anuncio
    if (m.status === 'announcing') { navigate('/announce/' + matchId); return }
    if (m.status === 'cancelled') { navigate('/'); return }

    // Verificar si el turno lleva más de 30 segundos sin actividad al cargar
    if (m.status === 'playing' && m.turn_started_at) {
      const turnAge = (Date.now() - new Date(m.turn_started_at).getTime()) / 1000
      if (turnAge > 45) {
        const inactivePlayer = m.current_turn
        const isInactiveMe = inactivePlayer === p.id
        const sp1 = m.player1_id === inactivePlayer ? 0 : 5
        const sp2 = m.player2_id === inactivePlayer ? 0 : 5
        const winnerId = m.player1_id === inactivePlayer ? m.player2_id : m.player1_id
        await supabase.from('matches').update({
          status: 'finished',
          winner_id: winnerId,
          score_p1: sp1, score_p2: sp2,
          ended_at: new Date().toISOString(),
          last_event: JSON.stringify({ emoji: '⏱', label: 'Partido terminado por inactividad' }),
        }).eq('id', matchId)
        await updateStats(sp1, sp2, { ...m, score_p1: sp1, score_p2: sp2 }, p)
        navigate('/result/' + matchId)
        return
      }
    }

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

    // Cargar stock de items de ambos jugadores
    const oppPlayerId = m.player1_id === p.id ? m.player2_id : m.player1_id
    const { data: myItems } = await supabase.from('player_items').select('item_type,stock').eq('player_id', p.id)
    const { data: oppItems } = await supabase.from('player_items').select('item_type,stock').eq('player_id', oppPlayerId)
    if (myItems) {
      const gg = myItems.find(i => i.item_type === 'golden_glove')
      setGoldenGloveStock(gg?.stock || 0)
      const ps = myItems.find(i => i.item_type === 'pro_shooter')
      setProShooterStock(ps?.stock || 0)
      proShooterStockRef.current = ps?.stock || 0
    }
    if (oppItems) {
      const gg = oppItems.find(i => i.item_type === 'golden_glove')
      setOppGoldenGloveStock(gg?.stock || 0)
      const ps = oppItems.find(i => i.item_type === 'pro_shooter')
      setOppProShooterStock(ps?.stock || 0)
    }
    if (m.barrier_range && m.pending_type === 'FALTA' && m.current_turn === p.id) {
      // Mostrar popup pro shooter si el tirador tiene stock
      const { data: psItem } = await supabase.from('player_items').select('stock').eq('player_id', p.id).eq('item_type', 'pro_shooter').single().catch(() => ({ data: null }))
      if (psItem && psItem.stock > 0 && !proShooterPopupShownRef.current) { setProShooterStock(psItem.stock); proShooterStockRef.current = psItem.stock; setShowProShooterPopup(true); proShooterPopupShownRef.current = true }
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
        // Ignorar eventos de otros partidos
        if (updated.id !== matchId) return
        const prevMatch = matchRef.current ? { ...matchRef.current } : null
        matchRef.current = updated
        setMatch({ ...updated })
        const isMyTurn = updated.current_turn === playerRef.current?.id
        if (updated.cards_p1 && updated.cards_p2) setCards({ p1: updated.cards_p1, p2: updated.cards_p2 })
        if (updated.penalty_choice) setPenaltyChoice(updated.penalty_choice)

        // Detectar estado del Iron Fist
        const gg = updated.golden_glove_state
        if (gg) {
          const isMyTurnNow = updated.current_turn === playerRef.current?.id
          if (gg.waiting && !isMyTurnNow && !showGlovePopup) {
            // Soy el defensor — mostrar popup del guante
            setShowGlovePopup(true)
            clearTimeout(gloveTimerRef.current)
            gloveTimerRef.current = setTimeout(() => {
              setShowGlovePopup(false)
              activateGloveDecision(false)
            }, 5000)
          }
          if (!gg.waiting) {
            setWaitingForGlove(false)
            setShowGlovePopup(false)
            // Reiniciar timer de inactividad para el tirador desde cero
            if (updated.current_turn === playerRef.current?.id) {
              startInactivityTimer(playerRef.current, updated)
            }
          }
        }

        else setPenaltyChoice(null)
        setMyTurn(isMyTurn)

        // Actualizar stock del rival
        const oppId = updated.player1_id === playerRef.current?.id ? updated.player2_id : updated.player1_id
        supabase.from('player_items').select('item_type,stock').eq('player_id', oppId).then(({ data }) => {
          if (data) {
            const gg = data.find(i => i.item_type === 'golden_glove')
            const ps = data.find(i => i.item_type === 'pro_shooter')
            if (gg) setOppGoldenGloveStock(gg.stock)
            if (ps) setOppProShooterStock(ps.stock)
          }
        })

        // Cronómetro
        if (updated.timer_running && updated.timer_started_at) {
          // Solo el OBSERVADOR arranca timer local
          // Ignorar si: soy el tirador, ya estoy corriendo, o procesando una jugada
          if (!iAmTheShooterRef.current && !runningRef.current && !processingRef.current) {
            startLocalTimer(updated.elapsed_centesimas || 0, new Date(updated.timer_started_at).getTime())
          }
        } else if (!updated.timer_running) {
          if (iAmTheShooterRef.current || processingRef.current) {
            // Soy el tirador o estoy procesando — display ya congelado, ignorar
          } else {
            // Soy el observador — mostrar valor exacto del servidor
            timerVersionRef.current += 1
            clearInterval(intervalRef.current)
            intervalRef.current = null
            runningRef.current = false
            const val = updated.elapsed_centesimas || 0
            offsetRef.current = val
            setCentesimas(val)
            setRunning(false)
          }
        }

        // Pending
        if (updated.pending_type) {
          setPendingType(updated.pending_type)
          // Si hay falta y soy el rival (el que pone la barrera)
          if (updated.pending_type === 'FALTA' && isMyTurn && updated.barrier_range && !proShooterActive && !updated.timer_running && !proShooterPopupShownRef.current) {
            supabase.from('player_items').select('stock').eq('player_id', playerRef.current.id).eq('item_type', 'pro_shooter').single().then(({ data }) => {
              if (data && data.stock > 0 && !proShooterPopupShownRef.current) {
                proShooterStockRef.current = data.stock
                setProShooterStock(data.stock)
                setShowProShooterPopup(true)
                proShooterPopupShownRef.current = true
              }
            })
          }
          if (updated.pending_type === 'FALTA' && !isMyTurn && !updated.barrier_range) {
            setBarrierOptions(true)
          } else {
            setBarrierOptions(null)
          }
        } else {
          setPendingType(null)
    setProShooterActive(false)
    setShowProShooterPopup(false)
    proShooterPopupShownRef.current = false
          setBarrierOptions(null)
        }

        if (updated.last_event) {
          try {
            const ev = JSON.parse(updated.last_event)
            setLastPlay(ev)
            if (updated.last_event !== lastFlashedEventRef.current) {
              lastFlashedEventRef.current = updated.last_event
              if (ev.emoji === '⚽') triggerFlash('goal', 'GOL')
              else if (ev.emoji === '💥') triggerFlash('owngoal', 'GOL PROPIO')
            }
          } catch(e) {}
        }

        // El rival sigue vivo — reiniciar watcher
        setOpponentGone(false)
        startDisconnectWatcher(updated, playerRef.current)

        // Reiniciar timer cuando turn_sequence cambia y es mi turno
        const sequenceChanged = (updated.turn_sequence || 0) !== (prevMatch?.turn_sequence || 0)
        const gloveJustResolved = prevMatch?.golden_glove_state?.waiting === true && !updated.golden_glove_state?.waiting
        if (isMyTurn && !updated.timer_running && (sequenceChanged || gloveJustResolved)) {
          startInactivityTimer(playerRef.current, updated)
        } else if (!isMyTurn || updated.timer_running) {
          stopInactivityTimer()
        }

        if (updated.status === 'shootout') {
          if (mountedRef.current && !navigatedToShootoutRef.current) {
            navigatedToShootoutRef.current = true
            setTimeout(() => navigate('/shootout/' + matchId), 2000)
          }
          return
        }
        if (updated.status === 'finished') {
          stopInactivityTimer()
          clearInterval(heartbeatRef.current)
          clearInterval(intervalRef.current)
          if (mountedRef.current) navigate('/result/' + matchId)
          return
        }
      })

    channelRef.current = channel
    channel.subscribe()

    // Heartbeat — avisar cada 5s que seguimos conectados
    const isP1 = m.player1_id === p.id
    heartbeatRef.current = setInterval(async () => {
      const field = isP1 ? 'player1_last_seen' : 'player2_last_seen'
      await supabase.from('matches').update({ [field]: new Date().toISOString() }).eq('id', matchId)
      // Limpiar partidos zombie globalmente
      supabase.rpc('close_zombie_matches').then(() => {})

      // Ambos jugadores verifican inactividad del jugador con el turno
      const { data: current } = await supabase
        .from('matches').select('*').eq('id', matchId).single()
      if (!current || current.status === 'finished') return
      if (current.turn_started_at && !current.timer_running && !runningRef.current) {
        const turnAge = (Date.now() - new Date(current.turn_started_at).getTime()) / 1000
        if (turnAge > 15) {
          const inactivePlayer = current.current_turn
          const sp1 = current.player1_id === inactivePlayer ? 0 : 5
          const sp2 = current.player2_id === inactivePlayer ? 0 : 5
          const winnerId = current.player1_id === inactivePlayer ? current.player2_id : current.player1_id
          await supabase.from('matches').update({
            status: 'finished',
            winner_id: winnerId,
            score_p1: sp1, score_p2: sp2,
            ended_at: new Date().toISOString(),
            last_event: JSON.stringify({ emoji: '⏱', label: 'Partido terminado por inactividad' }),
          }).eq('id', matchId)
          await updateStats(sp1, sp2, { ...current, score_p1: sp1, score_p2: sp2 }, p)
          if (mountedRef.current) navigate('/result/' + matchId)
        }
      }
    }, 5000)

    startDisconnectWatcher(m, p)

    // Si hay falta pendiente y soy el rival sin barrera aún
    if (m.pending_type === 'FALTA' && m.current_turn !== p.id && !m.barrier_range) {
      setBarrierOptions(true)
    }

    // Arrancar timer de inactividad si es mi turno al cargar
    if (m.current_turn === p.id && m.status === 'playing') {
      startInactivityTimer(p, m)
    }

    // Guardar league_id si el partido es de liga
    if (m.league_id) setLeagueId(m.league_id)
    // Escuchar mensajes de chat (todos los partidos)
    supabase.channel('chat-' + matchId)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public',
          table: 'league_messages',
          filter: `match_id=eq.${matchId}`,
        }, async (payload) => {
          const { data: sender } = await supabase
            .from('players').select('username').eq('id', payload.new.player_id).single()
          setChatMsg({ text: payload.new.message, from: sender?.username || '?' })
          setTimeout(() => setChatMsg(null), 3000)
        })
        .subscribe()
  }

  function startLocalTimer(base, startedAtMs) {
    // Si somos el tirador, nunca tocar nuestro intervalo
    if (iAmTheShooterRef.current) return
    // Limpiar cualquier intervalo existente antes de arrancar uno nuevo
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    // Calcular cuánto tiempo ha pasado ya desde que arrancó (compensar latencia)
    const alreadyElapsed = Math.floor((Date.now() - startedAtMs) / 10)
    offsetRef.current = base
    setCentesimas(base + alreadyElapsed)
    timerVersionRef.current += 1
    const localVersion = timerVersionRef.current
    const observerBase = base      // Constante para este intervalo
    const observerStart = startedAtMs  // Constante para este intervalo
    intervalRef.current = setInterval(() => {
      if (timerVersionRef.current !== localVersion) return
      setCentesimas(observerBase + Math.floor((Date.now() - observerStart) / 10))
    }, 10)
  }
  function startDisconnectWatcher(m, p) {
    if (m.is_bot_match) return
    clearTimeout(warnRef.current)
    clearTimeout(disconnectRef.current)
    warnRef.current = setTimeout(() => {
      setOpponentGone('warning')
      setDisconnectCountdown(9)
      clearInterval(disconnectCountdownRef.current)
      disconnectCountdownRef.current = setInterval(() => {
        setDisconnectCountdown(n => {
          if (n <= 1) { clearInterval(disconnectCountdownRef.current); return 0 }
          return n - 1
        })
      }, 1000)
    }, 6000)
    disconnectRef.current = setTimeout(async () => {
      setOpponentGone('gone')
      const isP1 = m.player1_id === p.id
      const sp1 = isP1 ? 5 : 0
      const sp2 = isP1 ? 0 : 5
      await supabase.from('matches').update({
        status: 'finished',
        winner_id: p.id,
        score_p1: sp1, score_p2: sp2,
        ended_at: new Date().toISOString(),
        last_event: JSON.stringify({ emoji: '🔌', label: 'Rival desconectado — victoria 5-0' }),
      }).eq('id', matchId)
      await updateStats(sp1, sp2, matchRef.current, p)
      if (mountedRef.current) navigate('/result/' + matchId)
    }, 15000)
  }

  async function sendChatMessage(message) {
    setShowChat(false)
    await supabase.from('league_messages').insert({
      league_id: leagueId || null,
      match_id: matchId,
      player_id: playerRef.current.id,
      message,
    })
  }

  async function handleAbandon() {
    const m = matchRef.current
    const p = playerRef.current
    const isP1 = m.player1_id === p.id
    const winnerId = isP1 ? m.player2_id : m.player1_id
    const sp1 = isP1 ? 0 : 5
    const sp2 = isP1 ? 5 : 0
    await supabase.from('matches').update({
      status: 'finished',
      winner_id: winnerId,
      score_p1: sp1,
      score_p2: sp2,
      ended_at: new Date().toISOString(),
      last_event: JSON.stringify({ emoji: '🏳️', label: `${p.username} abandonó — derrota 0-5` }),
    }).eq('id', matchId)
    await updateStats(sp1, sp2, m, p)
    // Esperar a que Supabase propague el cambio al rival
    setTimeout(() => navigate('/result/' + matchId), 500)
  }

  function startInactivityTimer(p, m) {
    clearInterval(inactivityIntervalRef.current)
    setInactivityProgress(0)
    setInactivityWarning(false)
    inactivityStartRef.current = Date.now()

    inactivityIntervalRef.current = setInterval(async () => {
      const elapsed = (Date.now() - inactivityStartRef.current) / 1000
      const progress = Math.min(elapsed / 15, 1)
      setInactivityProgress(progress)

      if (elapsed >= 8 && elapsed < 15) {
        setInactivityWarning(true)
      }

      if (elapsed >= 15) {
        clearInterval(inactivityIntervalRef.current)
        setInactivityWarning(false)
        // Usar matchRef.current para tener el estado más reciente
        const currentMatch = matchRef.current
        if (!currentMatch || currentMatch.status === 'finished') return
        const isP1 = currentMatch.player1_id === p.id
        const sp1 = isP1 ? 0 : 5
        const sp2 = isP1 ? 5 : 0
        const winnerId = isP1 ? currentMatch.player2_id : currentMatch.player1_id
        await supabase.from('matches').update({
          status: 'finished',
          winner_id: winnerId,
          score_p1: sp1,
          score_p2: sp2,
          ended_at: new Date().toISOString(),
          last_event: JSON.stringify({ emoji: '⏱', label: `${p.username} no tiró — derrota por inactividad` }),
        }).eq('id', matchId)
        // Pasar scores correctos directamente, no desde matchRef que puede estar desactualizado
        await updateStats(sp1, sp2, { ...currentMatch, score_p1: sp1, score_p2: sp2 }, p)
        if (mountedRef.current) navigate('/result/' + matchId)
      }
    }, 50)
  }

  function stopInactivityTimer() {
    clearInterval(inactivityIntervalRef.current)
    setInactivityProgress(0)
    setInactivityWarning(false)
  }

  function triggerFlash(type, text) {
    setFlashEvent({ type, text, key: Date.now() })
    setTimeout(() => setFlashEvent(null), 600)
  }

  const lastFlashedEventRef = useRef(null)
  const navigatedToShootoutRef = useRef(false)
  const touchFiredRef = useRef(false)

  function handleTouch(e) {
    e.preventDefault()
    touchFiredRef.current = true
    handleAction()
  }

  function handleClick() {
    if (touchFiredRef.current) {
      touchFiredRef.current = false
      return
    }
    handleAction()
  }

  function handleAction() {
    if (processingRef.current) return
    const now = Date.now()
    if (now - lastTapRef.current < 30) return
    lastTapRef.current = now
    if (runningRef.current) {
      const elapsed = Date.now() - startTimeRef.current
      if (elapsed < 10) return
      stopTimer()
    } else {
      startTimer()
    }
  }

  async function startTimer() {
    if (runningRef.current) return
    if (processingRef.current) return
    preShootOffsetRef.current = offsetRef.current
    const base = offsetRef.current  // Capturado al inicio, no cambia durante la tirada
    const now = new Date().toISOString()
    const startedAtMs = Date.now()
    const startedAtPerf = performance.now()
    startTimeRef.current = startedAtMs
    startPerfRef.current = startedAtPerf
    iAmTheShooterRef.current = true
    runningRef.current = true
    timerVersionRef.current += 1
    setRunning(true)

    stopInactivityTimer()

    const myVersion = timerVersionRef.current
    const shooterBase = base  // Constante — no cambia aunque offsetRef cambie
    intervalRef.current = setInterval(() => {
      if (timerVersionRef.current !== myVersion) return
      if (!startPerfRef.current) return
      const elapsed = Math.floor((performance.now() - startPerfRef.current) / 10)
      setCentesimas(shooterBase + elapsed)
    }, 10)

    timeoutWarnRef.current = setTimeout(async () => {
      if (!runningRef.current || processingRef.current) return
      const p = playerRef.current
      const m = matchRef.current
      const isP1 = m.player1_id === p.id
      const currentCards = isP1 ? (m.cards_p1 || { yellow: 0, red: 0 }) : (m.cards_p2 || { yellow: 0, red: 0 })
      const newYellow = currentCards.yellow + 1
      const newCards = { ...currentCards, yellow: newYellow }
      const update = isP1 ? { cards_p1: newCards } : { cards_p2: newCards }
      await supabase.from('matches').update(update).eq('id', matchId)
      if (!runningRef.current || processingRef.current) return
      if (newYellow >= 2) {
        setWarning({ type: 'red', text: `🟥 2 amarillas = Roja a ${p.username} — gol para el rival` })
        triggerFlash('red', 'ROJA')
        stopTimer(true)
      } else {
        triggerFlash('yellow', 'AMARILLA')
        setWarning({ type: 'yellow', text: `🟨 Tarjeta amarilla a ${p.username} — para antes de 5s` })
      }
    }, 2000)

    timeoutRedRef.current = setTimeout(() => {
      if (!runningRef.current || processingRef.current) return
      const p = playerRef.current
      triggerFlash('red', 'ROJA')
      setWarning({ type: 'red', text: `🟥 Tarjeta roja a ${p.username} — gol para el rival` })
      stopTimer(true)
    }, 5000)

    // Guardar timestamp de inicio — si STOP llega muy rápido,
    // processPlay ya habrá calculado el tiempo correcto localmente
    await supabase.from('matches').update({
      timer_running: true,
      timer_started_at: now,
      turn_started_at: now,
    }).eq('id', matchId)
  }

  async function stopTimer(forced = false) {
    // Si ya está procesando, ignorar siempre — incluso forzado
    if (processingRef.current) return
    // Si no está corriendo y no es forzado, ignorar
    if (!forced && !runningRef.current) return
    // Si es forzado pero no está corriendo, ignorar también
    if (forced && !runningRef.current) return

    // Bloquear inmediatamente cualquier evento posterior
    processingRef.current = true
    runningRef.current = false
    iAmTheShooterRef.current = false
    timerVersionRef.current += 1  // Invalida ticks pendientes

    // Limpiar intervalo INMEDIATAMENTE para congelar el display
    clearInterval(intervalRef.current)
    intervalRef.current = null
    clearTimeout(timeoutWarnRef.current)
    clearTimeout(timeoutRedRef.current)

    // Calcular elapsed con performance.now() — mismo método que el display
    // Usar preShootOffsetRef que fue capturado al inicio de startTimer
    // para evitar que un update de Supabase haya modificado offsetRef
    const elapsed = Math.max(1, Math.floor((performance.now() - startPerfRef.current) / 10))
    const total = preShootOffsetRef.current + elapsed
    offsetRef.current = total

    // Actualizar display inmediatamente y de forma definitiva
    setCentesimas(total)
    setRunning(false)
    setWarning(null)

    try {
      await processPlay(total, forced)
    } catch(e) {
      console.error('processPlay error:', e)
    } finally {
      processingRef.current = false
      runningRef.current = false
      iAmTheShooterRef.current = false
    }
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
    setProShooterActive(false)
    setShowProShooterPopup(false)
    proShooterPopupShownRef.current = false
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

    // Si hay empate al tiempo, ignorar eventos especiales e ir a shootout
    const secsNow = Math.floor(total / 100)
    const isEmpateAlTiempo = secsNow >= 30 && sp1 === sp2

    if (ev.result === 'FALTA' && !isEmpateAlTiempo) {
      // Guardar pending y esperar que el rival elija la barrera
      const isBotGame = matchRef.current?.is_bot_match || false
      const autoBarrier = isBotGame ? JSON.stringify({ min: 30, max: 35 }) : null
      const event = isBotGame
        ? { emoji: '🧤', label: `🧤 FALTA de ${p.username} — barrera en 30-35` }
        : { emoji: '🧤', label: `🧤 FALTA de ${p.username} — el rival elige la barrera` }
      setLastPlay(event)
      setPendingType('FALTA')
      if (isBotGame) setBarrierOptions(null)
      await supabase.from('matches').update({
        elapsed_centesimas: total,
        timer_running: false,
        pending_type: 'FALTA',
        barrier_range: autoBarrier,
        last_event: JSON.stringify(event),
        turn_started_at: new Date().toISOString(),
        turn_sequence: (matchRef.current?.turn_sequence || 0) + 1,
      }).eq('id', matchId)
      if (matchRef.current) matchRef.current.turn_sequence = (matchRef.current.turn_sequence || 0) + 1
      return
    }

    if (ev.result === 'CORNER' && !isEmpateAlTiempo) {
      const event = { emoji: '🚩', label: `🚩 CÓRNER de ${p.username} — para en múltiplo de 10 para GOL` }
      setLastPlay(event)
      setPendingType('CORNER')
      await supabase.from('matches').update({
        elapsed_centesimas: total,
        timer_running: false,
        pending_type: 'CORNER',
        last_event: JSON.stringify(event),
        turn_started_at: new Date().toISOString(),
        turn_sequence: (matchRef.current?.turn_sequence || 0) + 1,
      }).eq('id', matchId)
      return
    }

    if (ev.result === 'PENALTY' && !isEmpateAlTiempo) {
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
        turn_started_at: new Date().toISOString(),
        turn_sequence: (matchRef.current?.turn_sequence || 0) + 1,
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
      const last2 = total % 100
      const choice = m.penalty_choice
      const gg = m.golden_glove_state
      const parImparOk = choice === 'par' ? last1 % 2 === 0 : last1 % 2 !== 0

      let gloveBlocked = false
      if (gg?.used && gg?.choice) {
        // derecha = 50-99 bloqueado, izquierda = 00-49 bloqueado
        if (gg.choice === 'derecha') gloveBlocked = last2 >= 50
        else gloveBlocked = last2 < 50
      }

      gol = parImparOk && !gloveBlocked

      if (gg?.used) {
        if (gloveBlocked) {
          label = `🧤 IRON FIST — Penalty parado por ${opp.username} (${p.username} eligió ${choice}, centésima: ${last2})`
          emoji = '🧤'
        } else {
          label = gol
            ? `⚽ Gol de penalty de ${p.username} — el Iron Fist no llegó (${choice}, centésima: ${last2})`
            : `🥅 Penalty fallado por ${p.username} (${choice}, centésima: ${last2})`
          emoji = gol ? '⚽' : '🥅'
        }
      } else {
        label = gol
          ? `⚽ Gol de penalty de ${p.username} (eligió ${choice}, centésima: ${last1})`
          : `🥅 Penalty fallado por ${p.username} (eligió ${choice}, centésima: ${last1})`
        emoji = gol ? '⚽' : '🥅'
      }
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
        const effectiveMax = m.pro_shooter_active ? range.min + 10 : range.max
        gol = last2 >= range.min && last2 <= effectiveMax
        const rangeLabel = m.pro_shooter_active ? `${range.min}-${effectiveMax} 🎯` : `${range.min}-${range.max}`
        label = gol
          ? `⚽ Gol de falta de ${p.username} (${last2} en ${rangeLabel})`
          : `🧤 Falta fallada por ${p.username} (${last2} fuera de ${rangeLabel})`
        emoji = gol ? '⚽' : '🧤'
        if (gol) { if (p1) sp1 += 1; else sp2 += 1 }
      }
    } else if (ev.result === 'GOL_DIRECTO') {
      gol = true
      label = `⚽ GOL de ${p.username}`
      if (p1) sp1 += 1; else sp2 += 1
    } else if (ev.result === 'GOL_PROPIO' && !pending) {
      label = `💥 GOL EN PROPIA de ${p.username} — punto para ${opp.username}`
      emoji = '💥'
      if (p1) sp2 += 1; else sp1 += 1
    }

    if (gol) triggerFlash('goal', 'GOL')
    if (ev.result === 'GOL_PROPIO') triggerFlash('owngoal', 'GOL PROPIO')
    const ggState = m.golden_glove_state
    if (ggState?.used && !gol && pending === 'PENALTY') triggerFlash('glove', '🧤 IRON FIST')

    const event = label ? { emoji, label } : null
    if (event) setLastPlay(event)
    else setLastPlay(null)
    setPendingType(null)
    setProShooterActive(false)
    setShowProShooterPopup(false)
    proShooterPopupShownRef.current = false

    // Determinar resultType para plays — refleja si hubo gol y de qué tipo
    const finalResultType = ev.result === 'GOL_PROPIO' ? 'GOL_PROPIO' :
      !gol ? (pending ? pending + '_FALLO' : 'NADA') :
      pending === 'FALTA' ? 'GOL_FALTA' :
      pending === 'PENALTY' ? 'GOL_PENALTY' :
      pending === 'CORNER' ? 'GOL_CORNER' :
      'GOL_DIRECTO'

    await commitPlay(total, finalResultType, sp1, sp2, true, m, p, event)
  }

  async function activateProShooter(use) {
    setShowProShooterPopup(false)
    if (!use) return
    const p = playerRef.current
    await supabase.from('player_items').update({ stock: proShooterStock - 1 }).eq('player_id', p.id).eq('item_type', 'pro_shooter')
    setProShooterStock(s => { proShooterStockRef.current = s - 1; return s - 1 })
    setProShooterActive(true)
    // Notificar al rival
    const m = matchRef.current
    const event = { emoji: '🎯', label: `🎯 ${p.username} usa el Sniper — ventana ampliada` }
    setLastPlay(event)
    await supabase.from('matches').update({
      last_event: JSON.stringify(event),
      pro_shooter_active: true,
    }).eq('id', matchId)
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
      turn_started_at: new Date().toISOString(),
      turn_sequence: (matchRef.current?.turn_sequence || 0) + 1,
    }).eq('id', matchId)
    if (matchRef.current) matchRef.current.turn_sequence = (matchRef.current.turn_sequence || 0) + 1
  }

  async function selectPenaltyChoice(choice) {
    const m = matchRef.current
    const p = playerRef.current
    setShowPenaltyPopup(false)
    setPenaltyChoice(choice)
    const event = { emoji: '🥅', label: `🥅 ${p.username} eligió ${choice.toUpperCase()} — tira de nuevo` }
    setLastPlay(event)

    // Verificar si el rival tiene Iron Fist
    const oppId = m.player1_id === p.id ? m.player2_id : m.player1_id
    const { data: oppItem } = await supabase.from('player_items').select('stock').eq('player_id', oppId).eq('item_type', 'golden_glove').single()
    const oppHasGlove = oppItem && oppItem.stock > 0

    await supabase.from('matches').update({
      penalty_choice: choice,
      last_event: JSON.stringify(event),
      golden_glove_state: oppHasGlove ? { waiting: true, choice: null, used: false } : { waiting: false, choice: null, used: false },
    }).eq('id', matchId)

    if (oppHasGlove) {
      setWaitingForGlove(true)
      stopInactivityTimer()
      // Timeout de seguridad: si en 6s no hay respuesta, continuar
      gloveTimerRef.current = setTimeout(() => {
        setWaitingForGlove(false)
        startInactivityTimer(playerRef.current, matchRef.current)
      }, 6000)
    }
  }

  async function activateGloveDecision(use, direction = null) {
    const m = matchRef.current
    const p = playerRef.current
    setShowGlovePopup(false)
    clearTimeout(gloveTimerRef.current)

    // Resetear turn_started_at para que el timer de A empiece desde cero
    await supabase.from('matches').update({
      turn_started_at: new Date().toISOString(),
    }).eq('id', matchId)

    if (use && direction) {
      // Descontar stock
      await supabase.from('player_items').update({ stock: goldenGloveStock - 1 }).eq('player_id', p.id).eq('item_type', 'golden_glove')
      setGoldenGloveStock(g => g - 1)
      await supabase.from('matches').update({
        golden_glove_state: { waiting: false, choice: direction, used: true },
      }).eq('id', matchId)
    } else {
      await supabase.from('matches').update({
        golden_glove_state: { waiting: false, choice: null, used: false },
      }).eq('id', matchId)
    }
  }

  async function commitPlay(total, resultType, sp1, sp2, changeTurn, m, p, event) {
    const diff = Math.abs(sp1 - sp2)
    const secs = Math.floor(total / 100)
    const timeUp = secs >= 30
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
        status: 'shootout',
        pending_type: null,
        barrier_range: null,
        penalty_choice: null,
        golden_glove_state: null,
        pro_shooter_active: false,
        shootout_round: 1,
        shootout_state: { round: 1, a_scored: null, b_scored: null, a_choice: null, b_choice: null },
        shootout_score: { a: 0, b: 0 },
        last_event: JSON.stringify({ emoji: '🥅', label: 'Penaltis a muerte súbita' }),
        current_turn: m.player1_id,
      }).eq('id', matchId)
      if (mountedRef.current && !navigatedToShootoutRef.current) {
        navigatedToShootoutRef.current = true
        setTimeout(() => navigate('/shootout/' + matchId), 2000)
      }
      return
    }

    let winnerId = null
    if (finished) {
      if (sp1 > sp2) winnerId = m.player1_id
      else if (sp2 > sp1) winnerId = m.player2_id
    }

    stopInactivityTimer()

    // Limpiar pending_type localmente para que la siguiente tirada no lo use
    if (matchRef.current) {
      matchRef.current.pending_type = null
      matchRef.current.barrier_range = null
      matchRef.current.penalty_choice = null
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
      turn_started_at: finished ? null : new Date().toISOString(),
      turn_sequence: (matchRef.current?.turn_sequence || 0) + 1,
    }).eq('id', matchId)
    if (matchRef.current) matchRef.current.turn_sequence = (matchRef.current.turn_sequence || 0) + 1

    if (finished) {
      // Solo el jugador que hizo la última jugada actualiza stats
      await updateStats(sp1, sp2, m, p)
      if (mountedRef.current) setTimeout(() => navigate('/result/' + matchId), 2000)
    }
  }

  async function updateStats(sp1, sp2, m, p) {
    const currentMatch = await supabase
      .from('matches').select('*').eq('id', matchId).single()
    if (!currentMatch.data) return

    const match = currentMatch.data
    const xpRes = await supabase.rpc('finalize_match_stats', {
      p_match_id: matchId,
      p_player1_id: match.player1_id,
      p_player2_id: match.player2_id,
      p_score1: match.score_p1,
      p_score2: match.score_p2,
      p_cards_p1: match.cards_p1 || { yellow: 0, red: 0 },
      p_cards_p2: match.cards_p2 || { yellow: 0, red: 0 },
    })
    if (xpRes.data) {
      await supabase.from('matches').update({ xp_result: xpRes.data }).eq('id', matchId)
    }

    // Racha diaria y misiones — solo partidos completados normalmente
    const lastEv = match.last_event ? JSON.parse(match.last_event) : null
    const isAbandon = lastEv?.label?.includes('abandonó') || lastEv?.label?.includes('inactividad') || lastEv?.label?.includes('desconectado')
    if (!isAbandon) {
      const isP1 = match.player1_id === p.id
      const myScore = isP1 ? match.score_p1 : match.score_p2
      const oppScore = isP1 ? match.score_p2 : match.score_p1
      const won = match.winner_id === p.id

      // Contar goles de falta del jugador en este partido
      const { data: myPlays } = await supabase
        .from('plays').select('result').eq('match_id', matchId).eq('player_id', p.id)
      const goalsScored = myPlays?.filter(pl => ['GOL_DIRECTO','GOL_FALTA','GOL_PENALTY','GOL_CORNER'].includes(pl.result)).length || 0
      const goalsFalta = myPlays?.filter(pl => pl.result === 'GOL_FALTA').length || 0
      const cleanSheet = won && oppScore === 0

      await supabase.rpc('update_daily_streak', { p_player_id: p.id })
      const missionsRes = await supabase.rpc('update_daily_missions', {
        p_player_id: p.id,
        p_match_id: matchId,
        p_won: won,
        p_goals_scored: goalsScored,
        p_goals_falta: goalsFalta,
        p_clean_sheet: cleanSheet,
      })
      if (missionsRes.data?.completed_missions?.length > 0) {
        await supabase.from('matches').update({ missions_result: missionsRes.data }).eq('id', matchId)
      }
    }
  }

  const isP1 = match ? match.player1_id === player?.id : false
  const scoreMe = match ? (isP1 ? match.score_p1 : match.score_p2) : 0
  const scoreOpp = match ? (isP1 ? match.score_p2 : match.score_p1) : 0
  const secs = Math.floor(centesimas / 100)
  const cents = centesimas % 100
  const barrierRange = match?.barrier_range ? JSON.parse(match.barrier_range) : null
  const canShoot = myTurn && !barrierOptions && !waitingForGlove && (!pendingType || (pendingType === 'FALTA' && barrierRange) || pendingType === 'CORNER' || pendingType === 'PENALTY')

  if (!match || !opponent || !player) return (
    <div style={styles.container}>
      <p style={{ color: '#fff', textAlign: 'center' }}>Cargando partido...</p>
    </div>
  )

  return (
    <div style={styles.container}>

      {/* Flash de evento */}
      {flashEvent && (
        <div key={flashEvent.key} style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:50, display:'flex', alignItems:'center', justifyContent:'center' }}>
          {/* Overlay de color */}
          <div style={{
            position:'absolute', inset:0,
            background: flashEvent.type === 'goal' || flashEvent.type === 'owngoal' ? 'rgba(255,180,0,0.12)' : flashEvent.type === 'red' ? 'rgba(255,68,68,0.15)' : 'rgba(255,200,0,0.1)',
            animation: 'flashOverlayGold 0.5s ease forwards',
          }}/>
          {/* Anillo expansivo para gol */}
          {(flashEvent.type === 'goal') && (
            <div style={{
              position:'absolute',
              width:'120px', height:'120px',
              borderRadius:'50%',
              border: '3px solid #ffb400',
              animation: 'goalRing 0.8s ease-out forwards',
            }}/>
          )}
          {/* Texto del evento */}
          <div style={{
            fontSize: flashEvent.type === 'goal' ? '3.5rem' : '2.5rem',
            fontWeight:'900',
            letterSpacing:'-1px',
            color: flashEvent.type === 'goal' ? '#ffb400' : flashEvent.type === 'owngoal' ? '#ff8800' : flashEvent.type === 'red' ? '#ff4444' : '#ffc800',
            animation: flashEvent.type === 'red' || flashEvent.type === 'yellow' ? 'cardShake 0.4s ease, eventFlash 0.5s ease forwards' : 'eventFlash 0.5s ease forwards',
            textShadow: flashEvent.type === 'goal' ? '0 0 40px rgba(255,180,0,0.5)' : 'none',
            textAlign:'center',
            lineHeight:1,
          }}>
            {flashEvent.text}
          </div>
        </div>
      )}

      {/* Chat message floating */}
      {chatMsg && (
        <div style={styles.chatFloat}>
          <span style={styles.chatFloatFrom}>{chatMsg.from}</span>
          <span style={styles.chatFloatText}>{chatMsg.text}</span>
        </div>
      )}

      {/* Chat popup */}
      {showChat && (
        <div style={styles.chatOverlay} onClick={() => setShowChat(false)}>
          <div style={styles.chatBox} onClick={e => e.stopPropagation()}>
            {['⚽ GOOOL', '💥 BOOOM', '😂 AHAHAH', '🚩 VAR!!!', '🤨 REF?', '🤝 GG'].map(msg => (
              <button key={msg} style={styles.chatMsgBtn} onClick={() => sendChatMessage(msg)}>
                {msg}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal abandono */}
      {showAbandon && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>🏳️ Abandonar partido</p>
            <p style={styles.modalText}>Si abandonas, perderás el partido 0-5 y se sumarán puntos al rival.</p>
            <button style={styles.btnConfirmAbandon} onClick={handleAbandon}>Sí, abandonar</button>
            <button style={styles.btnCancelAbandon} onClick={() => setShowAbandon(false)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Banner inactividad */}
      {inactivityWarning && myTurn && !running && (
        <div style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.3)', borderRadius: '10px', padding: '0.6rem 1rem', textAlign: 'center', animation: 'inactivityBannerIn 0.3s ease forwards' }}>
          <span style={{ color: '#ff4444', fontSize: '0.85rem', fontWeight: '700' }}>⚠️ ¡Tira ya! — 5 segundos para perder el partido</span>
        </div>
      )}

      {/* Banner desconexión */}
      {opponentGone === 'warning' && (
        <div style={styles.disconnectBanner}>
          <span style={styles.disconnectBannerText}>⚽ Rival desaparecido — victoria en {disconnectCountdown}s</span>
        </div>
      )}

      <div style={styles.topBar}>
        <div style={{ position: 'absolute', top: '1.25rem', right: '1.5rem' }}>
          <LatencyIndicator />
        </div>
        <div style={styles.playerChip}>
          <span style={styles.playerName}>
            {player.username.toUpperCase()}
            {(isP1 ? cards.p1 : cards.p2).yellow > 0 && ' 🟨'.repeat((isP1 ? cards.p1 : cards.p2).yellow)}
            {(isP1 ? cards.p1 : cards.p2).red > 0 && ' 🟥'.repeat((isP1 ? cards.p1 : cards.p2).red)}
          </span>
          <span style={styles.playerScore}>{scoreMe}</span>
          {goldenGloveStock > 0 && <GloveStock stock={goldenGloveStock} />}
          {proShooterStock > 0 && <ProShooterStock stock={proShooterStock} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <button style={styles.abandonBtn} onClick={() => setShowAbandon(true)}>✕</button>
          <span style={styles.vs}>VS</span>
        </div>
        <div style={styles.playerChip}>
          <span style={styles.playerName}>
            {opponent.username.toUpperCase()}
            {(isP1 ? cards.p2 : cards.p1).yellow > 0 && ' 🟨'.repeat((isP1 ? cards.p2 : cards.p1).yellow)}
            {(isP1 ? cards.p2 : cards.p1).red > 0 && ' 🟥'.repeat((isP1 ? cards.p2 : cards.p1).red)}
          </span>
          <span style={styles.playerScore}>{scoreOpp}</span>
          {oppGoldenGloveStock > 0 && <GloveStock stock={oppGoldenGloveStock} />}
          {oppProShooterStock > 0 && <ProShooterStock stock={oppProShooterStock} />}
        </div>
      </div>

      {/* Popup Sniper — solo el tirador */}
      {showProShooterPopup && (
        <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.93)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60,flexDirection:'column',gap:'14px',padding:'24px 18px'}}>
          <span style={{fontSize:'4rem',lineHeight:1}}>🎯</span>
          <p style={{color:'#fff',fontWeight:'900',fontSize:'1.7rem',letterSpacing:'-0.5px',margin:0}}>Sniper</p>
          <p style={{color:'rgba(255,255,255,0.5)',fontSize:'0.95rem',textAlign:'center',lineHeight:1.5,margin:0}}>Tu rival eligió la barrera {barrierRange?.min}–{barrierRange?.max}.<br/>El Sniper la amplía a {barrierRange?.min}–{barrierRange ? barrierRange.min+10 : ''}.</p>
          <div style={{fontSize:'0.95rem',fontWeight:'800',color:'#ffb400',background:'rgba(255,180,0,0.15)',borderRadius:'20px',padding:'6px 16px',border:'1px solid rgba(255,180,0,0.4)'}}>🎯 Te quedan {proShooterStock}</div>
          <div style={{width:'100%',background:'rgba(255,255,255,0.04)',borderRadius:'12px',padding:'14px'}}>
            <p style={{fontSize:'0.7rem',color:'rgba(255,255,255,0.3)',textAlign:'center',margin:'0 0 8px',letterSpacing:'0.5px'}}>SIN SNIPER</p>
            <div style={{position:'relative',height:'36px',background:'rgba(255,255,255,0.06)',borderRadius:'8px',overflow:'hidden',marginBottom:'4px'}}>
              <div style={{position:'absolute',left:`${barrierRange?.min || 30}%`,width:'15%',height:'100%',background:'rgba(255,180,0,0.3)',borderLeft:'2px solid #ffb400',borderRight:'2px solid #ffb400',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:'0.65rem',fontWeight:'800',color:'#ffb400'}}>{barrierRange?.min}–{barrierRange?.max}</span>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'10px'}}><span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.25)'}}>00</span><span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.25)'}}>50</span><span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.25)'}}>99</span></div>
            <p style={{fontSize:'0.7rem',color:'#ffb400',textAlign:'center',margin:'0 0 8px',fontWeight:'800',letterSpacing:'0.5px'}}>CON SNIPER ↓</p>
            <div style={{position:'relative',height:'36px',background:'rgba(255,255,255,0.06)',borderRadius:'8px',overflow:'hidden',marginBottom:'4px'}}>
              <div style={{position:'absolute',left:`${barrierRange?.min || 30}%`,width:'30%',height:'100%',background:'rgba(255,180,0,0.2)',borderLeft:'2px solid #ffb400',borderRight:'2px dashed rgba(255,180,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:'0.65rem',fontWeight:'800',color:'#ffb400'}}>{barrierRange?.min}–{barrierRange ? barrierRange.min+10 : ''}</span>
              </div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.25)'}}>00</span><span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.25)'}}>50</span><span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.25)'}}>99</span></div>
          </div>
          <button style={{width:'100%',background:'rgba(34,197,94,0.2)',border:'2px solid #22c55e',borderRadius:'14px',padding:'18px',fontSize:'1.1rem',fontWeight:'900',color:'#22c55e',cursor:'pointer',boxShadow:'0 0 16px rgba(34,197,94,0.5),0 0 32px rgba(34,197,94,0.25)'}} onClick={() => activateProShooter(true)}>🎯 Activar Sniper</button>
          <button style={{width:'100%',background:'rgba(255,40,40,0.2)',border:'2px solid #ff4444',borderRadius:'14px',padding:'16px',color:'#ff4444',fontSize:'1rem',fontWeight:'900',cursor:'pointer',boxShadow:'0 0 12px rgba(255,60,60,0.5),0 0 24px rgba(255,60,60,0.25)'}} onClick={() => activateProShooter(false)}>✕ No usar el Sniper</button>
        </div>
      )}

      {/* Popup Iron Fist — solo el defensor */}
      {showGlovePopup && (
        <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.93)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60,flexDirection:'column',gap:'14px',padding:'24px 18px'}}>
          <svg width='64' height='64' viewBox='0 0 24 24' fill='none'><path d='M6 8V6a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v1h1V5a2 2 0 0 1 2-2h1a1 1 0 0 1 1 1v4l1-1a1.5 1.5 0 0 1 2 2l-3 4v3a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-5L4 10a1.5 1.5 0 0 1 2-2l0 0z' fill='#ffb400' stroke='#cc8800' strokeWidth='0.5'/></svg>
          <p style={{color:'#fff',fontWeight:'900',fontSize:'1.7rem',letterSpacing:'-0.5px',margin:0}}>Iron Fist</p>
          <p style={{color:'rgba(255,255,255,0.5)',fontSize:'0.95rem',textAlign:'center',lineHeight:1.5,margin:0}}>Bloquea la mitad del cronómetro.<br/>Tu rival no sabrá qué lado elegiste.</p>
          <div style={{fontSize:'0.95rem',fontWeight:'800',color:'#ffb400',background:'rgba(255,180,0,0.15)',borderRadius:'20px',padding:'6px 16px',border:'1px solid rgba(255,180,0,0.4)'}}>🧤 Te quedan {goldenGloveStock}</div>
          <div style={{display:'flex',gap:'12px',width:'100%'}}>
            <button style={{flex:1,background:'rgba(255,180,0,0.1)',border:'1.5px solid rgba(255,180,0,0.4)',borderRadius:'18px',padding:'20px 8px',display:'flex',flexDirection:'column',alignItems:'center',gap:'8px',cursor:'pointer'}} onClick={() => activateGloveDecision(true, 'izquierda')}>
              <span style={{fontSize:'2.2rem',color:'#ffb400',lineHeight:1}}>←</span>
              <span style={{fontSize:'1.1rem',fontWeight:'900',color:'#ffb400',letterSpacing:'0.5px'}}>IZQUIERDA</span>
              <span style={{fontSize:'0.78rem',color:'rgba(255,255,255,0.4)',textAlign:'center',lineHeight:1.4}}>bloquear<br/>00–49</span>
            </button>
            <button style={{flex:1,background:'rgba(255,180,0,0.1)',border:'1.5px solid rgba(255,180,0,0.4)',borderRadius:'18px',padding:'20px 8px',display:'flex',flexDirection:'column',alignItems:'center',gap:'8px',cursor:'pointer'}} onClick={() => activateGloveDecision(true, 'derecha')}>
              <span style={{fontSize:'2.2rem',color:'#ffb400',lineHeight:1}}>→</span>
              <span style={{fontSize:'1.1rem',fontWeight:'900',color:'#ffb400',letterSpacing:'0.5px'}}>DERECHA</span>
              <span style={{fontSize:'0.78rem',color:'rgba(255,255,255,0.4)',textAlign:'center',lineHeight:1.4}}>bloquear<br/>50–99</span>
            </button>
          </div>
          <button style={{width:'100%',background:'rgba(255,40,40,0.2)',border:'2px solid #ff4444',borderRadius:'14px',padding:'16px',color:'#ff4444',fontSize:'1rem',fontWeight:'900',cursor:'pointer',boxShadow:'0 0 12px rgba(255,60,60,0.5),0 0 24px rgba(255,60,60,0.25)'}} onClick={() => activateGloveDecision(false)}>✕ No usar el Iron Fist</button>
        </div>
      )}

      {/* Mensaje de espera al tirador */}
      {waitingForGlove && myTurn && (
        <div style={{position:'absolute',bottom:'160px',left:'50%',transform:'translateX(-50%)',background:'rgba(255,180,0,0.1)',border:'1px solid rgba(255,180,0,0.3)',borderRadius:'12px',padding:'0.6rem 1.2rem',zIndex:30}}>
          <span style={{color:'#ffb400',fontSize:'0.85rem',fontWeight:'700'}}>🧤 El rival decide...</span>
        </div>
      )}

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
            {[[20,25],[30,35],[40,45]].map(([min,max]) => (
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
            Para entre {barrierRange.min} y {proShooterActive ? barrierRange.min + 10 : barrierRange.max} para marcar{proShooterActive && ' 🎯'}
          </span>
        </div>
      )}

      <div style={styles.btnArea}>
        {canShoot ? (
          <div style={{ position: 'relative', width: '150px', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {!running && (
              <svg style={{ position: 'absolute', top: 0, left: 0, width: '150px', height: '150px', transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
                <circle cx="75" cy="75" r="68" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
                <circle
                  cx="75" cy="75" r="68"
                  fill="none"
                  strokeWidth="5"
                  strokeDasharray={`${2 * Math.PI * 68}`}
                  strokeDashoffset={`${2 * Math.PI * 68 * (1 - inactivityProgress)}`}
                  stroke={
                    inactivityProgress < 0.35 ? '#00c853' :
                    inactivityProgress < 0.55 ? '#7ed321' :
                    inactivityProgress < 0.70 ? '#ffb400' :
                    inactivityProgress < 0.85 ? '#ff6d00' : '#ff4444'
                  }
                  strokeLinecap="round"
                  style={{
                    transition: 'stroke-dashoffset 0.05s linear, stroke 0.5s ease',
                    filter: inactivityProgress > 0.7
                      ? 'drop-shadow(0 0 6px #ff4444)'
                      : 'drop-shadow(0 0 4px rgba(0,200,80,0.5))',
                  }}
                />
              </svg>
            )}
            <button
              style={{
                ...styles.btnStop,
                background: running ? '#ff4444' : '#ffb400',
                boxShadow: running
                  ? '0 0 0 8px rgba(255,68,68,0.1),0 0 0 16px rgba(255,68,68,0.05)'
                  : '0 0 0 8px rgba(255,180,0,0.1),0 0 0 16px rgba(255,180,0,0.05)',
              }}
              onTouchEnd={(e) => handleTouch(e)}
            onClick={() => handleClick()}
            >
              <div style={{ width: running ? '22px' : '16px', height: running ? '22px' : '16px', background: '#141414', borderRadius: running ? '4px' : '50%' }} />
              <span style={styles.btnStopText}>{running ? 'PARAR' : 'START'}</span>
            </button>
          </div>
        ) : (
          <div style={styles.btnWaiting}>
            <span style={{ fontSize: '2rem' }}>⏳</span>
          </div>
        )}
      </div>

      <div style={styles.bottomBar}>
        <div style={styles.bottomItem}>
          <span style={styles.bottomLabel}>TIEMPO</span>
          <span style={styles.bottomVal}>{Math.max(0, 30 - secs)}s</span>
        </div>
        {(
          <button style={styles.chatBtnBottom} onClick={() => setShowChat(true)}>
            💬
          </button>
        )}
        <div style={styles.bottomItem}>
          <span style={styles.bottomLabel}>DIFERENCIA</span>
          <span style={styles.bottomVal}>{Math.abs(scoreMe - scoreOpp)} goles</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '2rem 1.5rem 2.5rem', background: '#141414', position: 'relative' },
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
  abandonBtn: { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer', padding: '6px 10px', lineHeight: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', zIndex: 100 },
  modal: { background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' },
  modalTitle: { fontSize: '1.2rem', fontWeight: '800', color: '#fff', textAlign: 'center', margin: 0 },
  modalText: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 1.6, margin: 0 },
  btnConfirmAbandon: { background: '#ff4444', color: '#fff', border: 'none', borderRadius: '12px', padding: '1rem', fontSize: '1rem', fontWeight: '700', cursor: 'pointer', width: '100%' },
  btnCancelAbandon: { background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.9rem', fontSize: '0.95rem', cursor: 'pointer', width: '100%' },
  disconnectBanner: { background: 'rgba(255,180,0,0.1)', border: '1px solid rgba(255,180,0,0.3)', borderRadius: '10px', padding: '0.6rem 1rem', textAlign: 'center', marginBottom: '0.5rem' },
  disconnectBannerText: { color: '#ffb400', fontSize: '0.85rem', fontWeight: '600' },
  chatBtn: { background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '8px', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', cursor: 'pointer', padding: '4px 8px' },
  chatBtnBottom: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '48px', height: '48px', fontSize: '1.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' },
  chatFloat: { position: 'absolute', bottom: '320px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(30,30,30,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: '12px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', animation: 'chatMsgIn 0.3s ease forwards', zIndex: 40, whiteSpace: 'nowrap' },
  chatFloatFrom: { fontSize: '0.65rem', color: '#ffb400', fontWeight: '700' },
  chatFloatText: { fontSize: '1.8rem', lineHeight: 1.3, color: '#fff', fontWeight: '800' },
  chatOverlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '2rem', zIndex: 60 },
  chatBox: { background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '1.25rem', width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' },
  chatTitle: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 0.25rem' },
  chatMsgBtn: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', color: '#fff', fontSize: '1.1rem', padding: '0.75rem 0.5rem', cursor: 'pointer', textAlign: 'center', lineHeight: 1.3, fontWeight: '700' },
  bottomBar: { display: 'flex', justifyContent: 'space-around', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' },
  bottomItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  bottomLabel: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '1px' },
  bottomVal: { fontSize: '1rem', fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
}
