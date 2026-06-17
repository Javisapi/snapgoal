import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

async function getPlayer() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data } = await supabase.from('players').select('*').eq('auth_id', session.user.id).single()
  return data
}

export default function MatchRecord() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const p = await getPlayer()
    if (!p) { navigate('/'); return }

    const { data, error } = await supabase.rpc('get_match_record', { p_player_id: p.id })
    if (!error && data) setRows(data)
    setLoading(false)
  }

  function fmtDate(d) {
    const date = new Date(d + 'Z')
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Madrid' }) + ' ' +
      date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' })
  }

  function fmtScore(r) {
    const hasShootout = r.shootout_my_score !== null && r.shootout_opp_score !== null && (r.shootout_my_score > 0 || r.shootout_opp_score > 0)
    if (hasShootout) {
      return `${r.my_score} (${r.shootout_my_score}) : ${r.opp_score} (${r.shootout_opp_score})`
    }
    return `${r.my_score} : ${r.opp_score}`
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/ranking')}>← volver</button>
        <div style={styles.headerTitle}>
          <h1 style={styles.title}>Match Record</h1>
          <div style={styles.titleLine} />
        </div>
        <p style={styles.subtitle}>Tu historial completo de partidos</p>
      </div>

      {loading ? (
        <p style={styles.loadingText}>Cargando...</p>
      ) : (
        <div style={styles.list}>
          {rows.map((r, i) => (
            <div key={i} style={{ ...styles.row, borderLeftColor: r.won ? '#22c55e' : '#ff4444' }}>
              <div style={styles.rowTop}>
                <span style={styles.opponent}>{r.opponent_username}</span>
                <span style={{ ...styles.score, color: r.won ? '#22c55e' : '#ff4444' }}>{fmtScore(r)}</span>
              </div>
              <div style={styles.rowBottom}>
                <span style={styles.date}>{fmtDate(r.played_at)}</span>
                <div style={styles.goalBreakdown}>
                  {r.gd_goals > 0 && <span style={styles.goalChip}>⚽×{r.gd_goals}</span>}
                  {r.corner_goals > 0 && <span style={styles.goalChip}>🚩×{r.corner_goals}</span>}
                  {r.falta_goals > 0 && <span style={styles.goalChip}>🧤×{r.falta_goals}</span>}
                  {r.pen_goals > 0 && <span style={styles.goalChip}>🥅×{r.pen_goals}</span>}
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 && (
            <p style={styles.emptyText}>Todavía no has jugado ningún partido.</p>
          )}
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: '#141414', overflow: 'hidden' },
  header: { padding: '2.5rem 1.75rem 1rem', flexShrink: 0 },
  backBtn: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '1rem', letterSpacing: '0.5px' },
  headerTitle: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' },
  title: { fontSize: '1.8rem', fontWeight: '900', color: '#fff', margin: 0, letterSpacing: '-0.5px' },
  titleLine: { height: '3px', width: '40px', background: '#ffb400', borderRadius: '2px' },
  subtitle: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', margin: 0 },
  loadingText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '2rem' },
  emptyText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' },
  list: { flex: 1, overflow: 'auto', padding: '0 1.25rem 2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  row: { background: 'rgba(255,255,255,0.03)', borderRadius: '12px', borderLeft: '3px solid', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  rowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  opponent: { fontSize: '0.9rem', fontWeight: '700', color: '#fff' },
  score: { fontSize: '0.95rem', fontWeight: '900', fontVariantNumeric: 'tabular-nums' },
  rowBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  date: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)' },
  goalBreakdown: { display: 'flex', gap: '0.4rem' },
  goalChip: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
}
