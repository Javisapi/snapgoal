import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

const ITEM_LABELS = { pro_shooter: 'Sniper', golden_glove: 'Iron Fist', hand_of_god: 'Mano de Dios' }
const ITEM_ICONS = { pro_shooter: '🎯', golden_glove: '🧤', hand_of_god: '🙏' }
const STATUS_LABELS = { pending: 'Pendiente', accepted: 'Aceptado', rejected: 'Rechazado', expired: 'Expirado', completed: 'Completado', cancelled: 'Cancelado' }

function formatWager(wager) {
  if (!wager) return ''
  return Object.entries(wager)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${ITEM_ICONS[k] || ''}${v}`)
    .join(' ')
}

export default function Duels() {
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [duels, setDuels] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmModal, setConfirmModal] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('pending')

  useEffect(() => { init() }, [])

  useEffect(() => {
    if (!player?.id) return
    function handleDuelUpdate(payload) {
      const updated = payload.new
      if (updated.match_id && (updated.ready_players || []).includes(player.id)) {
        navigate('/announce/' + updated.match_id)
      } else {
        loadDuels(player.id)
      }
    }

    const ch1 = supabase.channel('duel-challenger-' + player.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'duel_challenges',
        filter: `challenger_id=eq.${player.id}`,
      }, handleDuelUpdate)
      .subscribe()

    const ch2 = supabase.channel('duel-opponent-' + player.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'duel_challenges',
        filter: `opponent_id=eq.${player.id}`,
      }, handleDuelUpdate)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'duel_challenges',
        filter: `opponent_id=eq.${player.id}`,
      }, () => loadDuels(player.id))
      .subscribe()

    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2) }
  }, [player?.id])

  // Tick cada segundo para recalcular si la ventana de 30s de algún duelo ya expiró
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Polling cada 5s como fallback al Realtime
  useEffect(() => {
    if (!player?.id) return
    const t = setInterval(() => loadDuels(player.id), 5000)
    return () => clearInterval(t)
  }, [player?.id])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)
    await loadDuels(p.id)
    setLoading(false)
  }

  async function loadDuels(playerId) {
    const { data } = await supabase.rpc('get_my_duels', { p_player_id: playerId })
    setDuels(data || [])
  }

  async function respond(duel, accept, confirmedWager = null) {
    setBusyId(duel.id)
    const { data: result } = await supabase.rpc('respond_duel_challenge', {
      p_challenge_id: duel.id,
      p_player_id: player.id,
      p_accept: accept,
      p_confirmed_wager: confirmedWager,
    })

    if (result?.needs_confirmation) {
      setConfirmModal({ duel, maxWager: result.max_wager, originalWager: result.original_wager })
      setBusyId(null)
      return
    }

    if (result?.success) {
      try {
        await fetch('/api/notify-duel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challenge_id: duel.id,
            sender_name: player.username,
            recipient_id: duel.other_player_id,
            event: accept ? 'challenge_accepted' : 'challenge_rejected',
          }),
        })
      } catch (e) { /* silencioso, no es crítico */ }
    }

    await loadDuels(player.id)
    setBusyId(null)
    setConfirmModal(null)
  }

  async function markReady(duel) {
    setBusyId(duel.id)
    const { data: result } = await supabase.rpc('mark_duel_ready', {
      p_challenge_id: duel.id,
      p_player_id: player.id,
    })

    if (result?.status === 'match_created' && result.match_id) {
      navigate('/announce/' + result.match_id)
      return
    }

    if (result?.status === 'waiting') {
      try {
        await fetch('/api/notify-duel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challenge_id: duel.id,
            sender_name: player.username,
            recipient_id: duel.other_player_id,
            event: 'player_ready',
          }),
        })
      } catch (e) { /* silencioso, no es crítico */ }
    }

    if (result?.error === 'stock_changed') {
      setError(`Ya no hay suficiente ${result.item} disponible. Vuelve a intentarlo.`)
    }

    await loadDuels(player.id)
    setBusyId(null)
  }

  async function cancelDuel(duel) {
    setBusyId(duel.id)
    const { data: result } = await supabase.rpc('cancel_duel_challenge', { p_challenge_id: duel.id, p_player_id: player.id })
    if (!result?.success) setError('No se pudo cancelar el reto.')
    await loadDuels(player.id)
    setBusyId(null)
  }

  async function dismissDuel(duel) {
    setBusyId(duel.id)
    await supabase.rpc('dismiss_duel_challenge', { p_challenge_id: duel.id, p_player_id: player.id })
    await loadDuels(player.id)
    setBusyId(null)
  }

  if (loading || !player) return (
    <div style={styles.container}>
      <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontSize: '0.9rem' }}>Cargando...</p>
    </div>
  )

  const received = duels.filter(d => d.role === 'received' && d.status === 'pending')
  const sent = duels.filter(d => d.role === 'sent' && d.status === 'pending')
  const readyToPlay = duels.filter(d => d.status === 'accepted')
  const others = duels.filter(d => d.status !== 'pending' && d.status !== 'accepted')

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← volver</button>
        <h1 style={styles.title}>⚔️ Mis Retos</h1>
        <div style={styles.tabs}>
          <button style={{...styles.tab, ...(tab==='pending' ? styles.tabActive : {})}} onClick={() => setTab('pending')}>Pendientes</button>
          <button style={{...styles.tab, ...(tab==='history' ? styles.tabActive : {})}} onClick={() => setTab('history')}>Historial</button>
        </div>
      </div>

      <div style={styles.list}>
        {error && <p style={{ color: '#ff4444', fontSize: '0.85rem', textAlign: 'center', margin: '0 0 0.5rem' }}>{error}</p>}

        {tab === 'pending' && (
          <>
            {sent.length > 0 && (
              <>
                <p style={styles.sectionTitle}>ENVIADOS</p>
                {sent.map(d => (
                  <div key={d.id} style={styles.duelCard}>
                    <div style={styles.duelRow}>
                      <span style={styles.duelName}>{d.other_username}</span>
                      <span style={styles.duelWager}>Apuesta: {formatWager(d.wager)}</span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.35)', margin: 0 }}>⏳ Esperando respuesta...</p>
                    <button style={styles.cancelDuelBtn} disabled={busyId === d.id} onClick={() => cancelDuel(d)}>
                      Cancelar reto
                    </button>
                  </div>
                ))}
              </>
            )}

            {received.length > 0 && (
              <>
                <p style={styles.sectionTitle}>RECIBIDOS</p>
                {received.map(d => (
                  <div key={d.id} style={styles.duelCard}>
                    <div style={styles.duelRow}>
                      <span style={styles.duelName}>{d.other_username}</span>
                      <span style={styles.duelWager}>Apuesta: {formatWager(d.wager)}</span>
                    </div>
                    <div style={styles.duelActions}>
                      <button style={styles.acceptBtn} disabled={busyId === d.id} onClick={() => respond(d, true)}>
                        {busyId === d.id ? '...' : 'Aceptar'}
                      </button>
                      <button style={styles.rejectBtn} disabled={busyId === d.id} onClick={() => respond(d, false)}>
                        Rechazar
                      </button>
                    </div>
                    <button style={styles.cancelDuelBtn} disabled={busyId === d.id} onClick={() => cancelDuel(d)}>
                      Cancelar reto
                    </button>
                  </div>
                ))}
              </>
            )}

            {readyToPlay.length > 0 && (
              <>
                <p style={styles.sectionTitle}>LISTOS PARA JUGAR</p>
                {readyToPlay.map(d => {
                  const windowExpired = d.ready_started_at && (Date.now() - new Date(d.ready_started_at).getTime()) > 30000
                  const iAmReady = !windowExpired && (d.ready_players || []).includes(player.id)
                  const opponentReady = !windowExpired && (d.ready_players || []).includes(d.other_player_id)
                  const secondsLeft = d.ready_started_at && !windowExpired
                    ? Math.max(0, 30 - Math.floor((Date.now() - new Date(d.ready_started_at).getTime()) / 1000))
                    : null
                  return (
                    <div key={d.id} style={styles.duelCard}>
                      <div style={styles.duelRow}>
                        <span style={styles.duelName}>{d.other_username}</span>
                        <span style={styles.duelWager}>Apuesta: {formatWager(d.final_wager || d.wager)}</span>
                      </div>
                      {d.match_id ? (
                        <button style={styles.acceptBtn} onClick={() => navigate('/announce/' + d.match_id)}>
                          ▶️ Entrar al partido
                        </button>
                      ) : (
                        <>
                          {opponentReady && !iAmReady && (
                            <p style={{ fontSize: '0.78rem', color: '#ffb400', margin: 0 }}>🔥 {d.other_username} ya está listo. ¡Pulsa Jugar antes de que pase el turno! ({secondsLeft}s)</p>
                          )}
                          {iAmReady && !opponentReady && (
                            <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>⏳ Esperando a que {d.other_username} confirme... ({secondsLeft}s)</p>
                          )}
                          <button
                            style={{ ...styles.acceptBtn, opacity: iAmReady ? 0.5 : 1 }}
                            disabled={busyId === d.id || iAmReady}
                            onClick={() => markReady(d)}
                          >
                            {busyId === d.id ? '...' : iAmReady ? 'Esperando...' : '▶️ Jugar'}
                          </button>
                        </>
                      )}
                      <button style={styles.cancelDuelBtn} disabled={busyId === d.id} onClick={() => cancelDuel(d)}>
                        Cancelar reto
                      </button>
                    </div>
                  )
                })}
              </>
            )}

            {received.length === 0 && readyToPlay.length === 0 && (
              <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontSize: '0.85rem', marginTop: '2rem' }}>
                No tienes retos pendientes.
              </p>
            )}
          </>
        )}

        {tab === 'history' && (
          <>
            {others.length > 0 ? others.map(d => {
              const isCompleted = d.status === 'completed'
              const iWon = isCompleted && d.winner_id === player.id
              const stripeColor = isCompleted
                ? (iWon ? '#22c55e' : '#ff4444')
                : (d.status === 'cancelled' || d.status === 'rejected' || d.status === 'expired')
                  ? 'rgba(255,255,255,0.15)'
                  : '#ffb400'
              const statusColor = isCompleted
                ? (iWon ? '#22c55e' : '#ff4444')
                : (d.status === 'cancelled' || d.status === 'rejected' || d.status === 'expired')
                  ? 'rgba(255,255,255,0.3)'
                  : '#ffb400'
              return (
                <div key={d.id} style={{ ...styles.historyCard, borderLeft: `4px solid ${stripeColor}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={styles.duelName}>
                        {d.role === 'sent' ? `Tú → ${d.other_username}` : `${d.other_username} → Tú`}
                      </span>
                      <span style={styles.historyWager}>{formatWager(d.final_wager || d.wager)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
                      <span style={{ ...styles.statusBadge, color: statusColor }}>{STATUS_LABELS[d.status] || d.status}</span>
                      {isCompleted && (
                        <span style={{ fontSize: '0.78rem', fontWeight: '800', color: iWon ? '#22c55e' : '#ff4444' }}>
                          {iWon ? '▲ Ganado' : '▼ Perdido'}
                        </span>
                      )}
                      {d.status === 'cancelled' && (
                        <button style={styles.dismissBtn} disabled={busyId === d.id} onClick={() => dismissDuel(d)}>
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            }) : (
              <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontSize: '0.85rem', marginTop: '2rem' }}>
                No hay historial todavía.
              </p>
            )}
          </>
        )}
      </div>

      <button style={styles.newDuelBtn} onClick={() => navigate('/duel/new')}>⚔️ Retar a alguien</button>

      {confirmModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalCard}>
            <p style={styles.modalTitle}>El stock ha cambiado</p>
            <p style={styles.modalDesc}>
              Algunas skills ya no están disponibles en la cantidad original. La apuesta se ajustará a:
            </p>
            <div style={styles.modalWagerList}>
              {Object.entries(confirmModal.maxWager).filter(([, v]) => v > 0).map(([k, v]) => (
                <span key={k} style={styles.modalWagerItem}>{ITEM_ICONS[k]} {v} {ITEM_LABELS[k]}</span>
              ))}
            </div>
            <div style={styles.modalBtns}>
              <button style={styles.modalConfirmBtn} onClick={() => respond(confirmModal.duel, true, confirmModal.maxWager)}>
                Confirmar y jugar
              </button>
              <button style={styles.modalCancelBtn} onClick={() => setConfirmModal(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: '#141414', overflow: 'hidden', position: 'relative' },
  header: { padding: '2.5rem 1.75rem 1rem', flexShrink: 0 },
  backBtn: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '1rem' },
  title: { fontSize: '1.8rem', fontWeight: '900', color: '#fff', margin: 0, letterSpacing: '-1px' },
  list: { flex: 1, overflowY: 'auto', padding: '0 1.75rem 6rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  sectionTitle: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', margin: '0.75rem 0 0.25rem' },
  duelCard: { background: 'rgba(255,180,0,0.06)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  duelCardSmall: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '1.1rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  duelRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' },
  duelName: { fontSize: '0.9rem', fontWeight: '700', color: '#fff' },
  duelWager: { fontSize: '1rem', color: '#ffb400', fontWeight: '800', textAlign: 'right' },
  duelActions: { display: 'flex', gap: '0.5rem' },
  acceptBtn: { flex: 1, background: '#ffb400', color: '#141414', border: 'none', borderRadius: '10px', padding: '0.7rem', fontSize: '0.85rem', fontWeight: '800', cursor: 'pointer' },
  rejectBtn: { flex: 1, background: 'transparent', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.7rem', fontSize: '0.85rem', cursor: 'pointer' },
  statusBadge: { fontSize: '0.75rem', fontWeight: '700' },
  newDuelBtn: { position: 'fixed', bottom: '1.5rem', left: '1.5rem', right: '1.5rem', background: '#ffb400', color: '#141414', border: 'none', borderRadius: '14px', padding: '1rem', fontSize: '0.95rem', fontWeight: '900', cursor: 'pointer' },
  modalOverlay: { position: 'fixed', inset: 0, background: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1.5rem' },
  modalCard: { background: '#1c1c1c', border: '1px solid rgba(255,180,0,0.25)', borderRadius: '18px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '320px', width: '100%' },
  modalTitle: { fontSize: '1.1rem', fontWeight: '900', color: '#ffb400', margin: 0 },
  modalDesc: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', margin: 0, lineHeight: 1.5 },
  modalWagerList: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap' },
  modalWagerItem: { background: 'rgba(255,180,0,0.1)', borderRadius: '10px', padding: '0.4rem 0.7rem', fontSize: '0.8rem', color: '#ffb400', fontWeight: '700' },
  modalBtns: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' },
  modalConfirmBtn: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '0.9rem', fontSize: '0.95rem', fontWeight: '900', cursor: 'pointer' },
  modalCancelBtn: { background: 'transparent', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.9rem', fontSize: '0.9rem', cursor: 'pointer' },
  tabs: { display: 'flex', gap: '0.5rem', marginTop: '1rem' },
  tab: { flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '0.5rem', fontSize: '0.8rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', cursor: 'pointer' },
  tabActive: { background: 'rgba(99,179,237,0.12)', border: '1px solid rgba(99,179,237,0.4)', color: '#63b3ed' },
  cancelDuelBtn: { background: 'transparent', color: 'rgba(255,100,100,0.6)', border: '1px solid rgba(255,100,100,0.2)', borderRadius: '10px', padding: '0.5rem', fontSize: '0.78rem', cursor: 'pointer', width: '100%' },
  dismissBtn: { background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.3rem 0.7rem', fontSize: '0.75rem', cursor: 'pointer' },
  historyCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' },
  historyWager: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  historyCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' },
  historyWager: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
}
