import { useEffect, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
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

export default function DuelCreate() {
  const { leagueId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const preselected = location.state?.preselectedOpponentId
  const [player, setPlayer] = useState(null)
  const [myStock, setMyStock] = useState({})
  const [candidates, setCandidates] = useState([])
  const [search, setSearch] = useState('')
  const [selectedOpponent, setSelectedOpponent] = useState(null)
  const [wager, setWager] = useState({ pro_shooter: 0, golden_glove: 0, hand_of_god: 0 })
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { init() }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)

    const { data: myItems } = await supabase.from('player_items').select('item_type, stock').eq('player_id', p.id)
    const stockMap = {}
    myItems?.forEach(i => { stockMap[i.item_type] = i.stock })
    setMyStock(stockMap)

    const { data: candidateData } = await supabase.rpc('get_duelable_players', { p_exclude_player_id: p.id })
    setCandidates(candidateData || [])

    if (preselected) {
      const match = candidateData?.find(c => c.player_id === preselected)
      if (match) setSelectedOpponent(match)
    }

    setLoading(false)
  }

  const filteredCandidates = search
    ? candidates.filter(c => c.username.toLowerCase().includes(search.toLowerCase()))
    : candidates

  function maxFor(itemType) {
    if (!selectedOpponent) return 0
    const myAmount = myStock[itemType] || 0
    const theirAmount = selectedOpponent[itemType + '_stock'] || 0
    return Math.min(myAmount, theirAmount)
  }

  function adjustWager(itemType, delta) {
    setWager(w => {
      const next = Math.max(0, Math.min(maxFor(itemType), (w[itemType] || 0) + delta))
      return { ...w, [itemType]: next }
    })
  }

  function selectOpponent(c) {
    setSelectedOpponent(c)
    setWager({ pro_shooter: 0, golden_glove: 0, hand_of_god: 0 })
    setError(null)
  }

  async function sendChallenge() {
    if (!selectedOpponent || sending) return
    setSending(true)
    setError(null)

    const wagerPayload = {}
    Object.entries(wager).forEach(([k, v]) => { if (v > 0) wagerPayload[k] = v })

    if (Object.keys(wagerPayload).length === 0) {
      setError('Selecciona al menos una skill para apostar.')
      setSending(false)
      return
    }

    const { data: result } = await supabase.rpc('create_duel_challenge', {
      p_challenger_id: player.id,
      p_opponent_id: selectedOpponent.player_id,
      p_league_id: leagueId || null,
      p_wager: wagerPayload,
    })

    if (result?.error) {
      setError(result.error === 'wager_exceeds_max'
        ? `Máximo permitido de ${ITEM_LABELS[result.item]}: ${result.max_allowed}`
        : 'No se pudo crear el reto. Inténtalo de nuevo.')
      setSending(false)
      return
    }

    // Notificación push (best-effort, no bloquea el flujo si falla)
    try {
      await fetch('/api/notify-duel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: result.challenge_id,
          sender_name: player.username,
          opponent_id: selectedOpponent.player_id,
          wager: wagerPayload,
        }),
      })
    } catch (e) { /* silencioso, no es crítico */ }

    navigate('/duels')
  }

  if (loading || !player) return (
    <div style={styles.container}>
      <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontSize: '0.9rem' }}>Cargando...</p>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(-1)}>← volver</button>
        <h1 style={styles.title}>⚔️ Retar a alguien</h1>
      </div>

      {!selectedOpponent && (
        <div style={styles.list}>
          <input
            style={styles.searchInput}
            placeholder="Buscar jugador..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {filteredCandidates.map(c => (
            <button key={c.player_id} style={styles.candidateRow} onClick={() => selectOpponent(c)}>
              <span style={styles.candidateName}>{c.username}</span>
              <div style={styles.candidateStock}>
                <span>🎯{c.pro_shooter_stock}</span>
                <span>🧤{c.golden_glove_stock}</span>
                <span>🙏{c.hand_of_god_stock}</span>
              </div>
            </button>
          ))}
          {filteredCandidates.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', fontSize: '0.85rem', marginTop: '2rem' }}>
              No hay jugadores disponibles con ese nombre.
            </p>
          )}
        </div>
      )}

      {selectedOpponent && (
        <div style={styles.wagerArea}>
          <div style={styles.opponentBanner}>
            <span>Retando a <strong style={{ color: '#ffb400' }}>{selectedOpponent.username}</strong></span>
            <button style={styles.changeBtn} onClick={() => setSelectedOpponent(null)}>Cambiar</button>
          </div>

          <p style={styles.wagerHint}>Elige cuántas skills apostar. El máximo depende del stock de ambos jugadores.</p>

          {Object.keys(ITEM_LABELS).map(itemType => {
            const max = maxFor(itemType)
            return (
              <div key={itemType} style={styles.wagerRow}>
                <div style={styles.wagerLabel}>
                  <span style={{ fontSize: '1.3rem' }}>{ITEM_ICONS[itemType]}</span>
                  <span>{ITEM_LABELS[itemType]}</span>
                  <span style={styles.wagerMax}>máx. {max}</span>
                </div>
                <div style={styles.wagerControls}>
                  <button
                    style={styles.wagerBtn}
                    disabled={(wager[itemType] || 0) <= 0}
                    onClick={() => adjustWager(itemType, -1)}
                  >−</button>
                  <span style={styles.wagerAmount}>{wager[itemType] || 0}</span>
                  <button
                    style={styles.wagerBtn}
                    disabled={(wager[itemType] || 0) >= max}
                    onClick={() => adjustWager(itemType, 1)}
                  >+</button>
                </div>
              </div>
            )
          })}

          {error && <p style={styles.errorText}>{error}</p>}

          <button style={styles.sendBtn} onClick={sendChallenge} disabled={sending}>
            {sending ? 'Enviando...' : '⚔️ Enviar reto'}
          </button>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: '#141414', overflow: 'hidden' },
  header: { padding: '2.5rem 1.75rem 1rem', flexShrink: 0 },
  backBtn: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '1rem' },
  title: { fontSize: '1.8rem', fontWeight: '900', color: '#fff', margin: 0, letterSpacing: '-1px' },
  list: { flex: 1, overflowY: 'auto', padding: '0 1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  searchInput: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.9rem 1rem', color: '#fff', fontSize: '0.95rem', marginBottom: '0.5rem' },
  candidateRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '0.9rem 1rem', cursor: 'pointer', color: '#fff' },
  candidateName: { fontSize: '0.95rem', fontWeight: '700' },
  candidateStock: { display: 'flex', gap: '0.75rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' },
  wagerArea: { flex: 1, overflowY: 'auto', padding: '0 1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  opponentBanner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '12px', padding: '1rem', color: '#fff', fontSize: '0.95rem' },
  changeBtn: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' },
  wagerHint: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.35)', margin: 0, lineHeight: 1.4 },
  wagerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '0.9rem 1rem' },
  wagerLabel: { display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#fff', fontSize: '0.9rem', fontWeight: '700' },
  wagerMax: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', fontWeight: '500', marginLeft: '0.25rem' },
  wagerControls: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  wagerBtn: { width: '32px', height: '32px', borderRadius: '8px', border: '1px solid rgba(255,180,0,0.3)', background: 'rgba(255,180,0,0.1)', color: '#ffb400', fontSize: '1.1rem', fontWeight: '900', cursor: 'pointer' },
  wagerAmount: { fontSize: '1.1rem', fontWeight: '900', color: '#fff', minWidth: '20px', textAlign: 'center' },
  errorText: { fontSize: '0.8rem', color: '#ff4444', margin: 0, textAlign: 'center' },
  sendBtn: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '1.1rem', fontSize: '1rem', fontWeight: '900', cursor: 'pointer', marginTop: '0.5rem' },
}
