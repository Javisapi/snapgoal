import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ProStats() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('pct') // 'pct' | 'abs'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)

    const { data: players } = await supabase
      .from('players')
      .select('id, username, matches_played')
      .gte('matches_played', 25)

    if (!players) { setLoading(false); return }

    const results = []
    for (const p of players) {
      const { data: plays } = await supabase
        .from('plays')
        .select('result')
        .eq('player_id', p.id)

      if (!plays) continue

      const count = (arr) => plays.filter(pl => arr.includes(pl.result)).length

      const gdGoals = count(['GOL_DIRECTO'])
      const gdTotal = count(['GOL_DIRECTO','NADA','AL_PALO','GOL_PROPIO','ROJA'])
      const faltaGoals = count(['GOL_FALTA'])
      const faltaTotal = count(['GOL_FALTA','FALTA_FALLO'])
      const penGoals = count(['GOL_PENALTY'])
      const penTotal = count(['GOL_PENALTY','PENALTY_FALLO'])
      const cornerGoals = count(['GOL_CORNER'])
      const cornerTotal = count(['GOL_CORNER','CORNER_FALLO'])

      results.push({
        username: p.username,
        gdGoals, gdTotal,
        faltaGoals, faltaTotal,
        penGoals, penTotal,
        cornerGoals, cornerTotal,
        gdPct: gdTotal ? (gdGoals / gdTotal) * 100 : null,
        faltaPct: faltaTotal ? (faltaGoals / faltaTotal) * 100 : null,
        penPct: penTotal ? (penGoals / penTotal) * 100 : null,
        cornerPct: cornerTotal ? (cornerGoals / cornerTotal) * 100 : null,
      })
    }

    results.sort((a, b) => (b.gdPct ?? -1) - (a.gdPct ?? -1))
    setRows(results)
    setLoading(false)
  }

  function fmtPct(v) {
    return v === null ? '—' : `${v.toFixed(0)}%`
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/ranking')}>← volver</button>
        <div style={styles.headerTitle}>
          <h1 style={styles.title}>Estadísticas PRO</h1>
          <div style={styles.titleLine} />
        </div>
        <p style={styles.subtitle}>Mínimo 25 partidos jugados</p>
      </div>

      <div style={styles.toggleRow}>
        <button
          style={{ ...styles.toggleBtn, ...(mode === 'pct' ? styles.toggleBtnActive : {}) }}
          onClick={() => setMode('pct')}
        >%</button>
        <button
          style={{ ...styles.toggleBtn, ...(mode === 'abs' ? styles.toggleBtnActive : {}) }}
          onClick={() => setMode('abs')}
        >Abs</button>
      </div>

      {loading ? (
        <p style={styles.loadingText}>Cargando...</p>
      ) : (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thName}>Jugador</th>
                <th style={styles.th}>⚽ Directo</th>
                <th style={styles.th}>🧤 Falta</th>
                <th style={styles.th}>🥅 Penalty</th>
                <th style={styles.th}>🚩 Córner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={styles.tr}>
                  <td style={styles.tdName}>{r.username}</td>
                  <td style={styles.td}>
                    {mode === 'pct' ? fmtPct(r.gdPct) : `${r.gdGoals}/${r.gdTotal}`}
                  </td>
                  <td style={styles.td}>
                    {mode === 'pct' ? fmtPct(r.faltaPct) : `${r.faltaGoals}/${r.faltaTotal}`}
                  </td>
                  <td style={styles.td}>
                    {mode === 'pct' ? fmtPct(r.penPct) : `${r.penGoals}/${r.penTotal}`}
                  </td>
                  <td style={styles.td}>
                    {mode === 'pct' ? fmtPct(r.cornerPct) : `${r.cornerGoals}/${r.cornerTotal}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p style={styles.emptyText}>Ningún jugador alcanza los 25 partidos todavía.</p>
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
  toggleRow: { display: 'flex', gap: '0.5rem', padding: '0 1.75rem 1rem', flexShrink: 0 },
  toggleBtn: { flex: 1, padding: '0.6rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)', fontWeight: '800', fontSize: '0.85rem', cursor: 'pointer' },
  toggleBtnActive: { background: 'rgba(255,180,0,0.12)', border: '1px solid rgba(255,180,0,0.4)', color: '#ffb400' },
  loadingText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '2rem' },
  emptyText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '2rem', fontSize: '0.85rem' },
  tableWrap: { flex: 1, overflow: 'auto', padding: '0 1.25rem 2rem' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' },
  thName: { textAlign: 'left', padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.3)', fontWeight: '700', fontSize: '0.7rem', letterSpacing: '0.5px', position: 'sticky', left: 0, background: '#141414' },
  th: { textAlign: 'center', padding: '0.5rem 0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: '700', fontSize: '0.7rem', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.05)' },
  tdName: { padding: '0.65rem 0.75rem', color: '#fff', fontWeight: '700', position: 'sticky', left: 0, background: '#141414' },
  td: { textAlign: 'center', padding: '0.65rem 0.6rem', color: 'rgba(255,255,255,0.7)', fontWeight: '600', fontVariantNumeric: 'tabular-nums' },
}
