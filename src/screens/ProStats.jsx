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
    const { data, error } = await supabase.rpc('get_pro_stats')
    if (error || !data) { setLoading(false); return }

    const results = data.map(r => ({
      username: r.username,
      gdGoals: r.gd_goals, gdTotal: r.gd_total,
      faltaGoals: r.falta_goals, faltaTotal: r.falta_total,
      penGoals: r.pen_goals, penTotal: r.pen_total,
      cornerGoals: r.corner_goals, cornerTotal: r.corner_total,
      gdPct: r.gd_total ? (r.gd_goals / r.gd_total) * 100 : null,
      faltaPct: r.falta_total ? (r.falta_goals / r.falta_total) * 100 : null,
      penPct: r.pen_total ? (r.pen_goals / r.pen_total) * 100 : null,
      cornerPct: r.corner_total ? (r.corner_goals / r.corner_total) * 100 : null,
    }))

    setRows(results)
    setLoading(false)
  }

  function fmtPct(v) {
    return v === null ? '—' : `${v.toFixed(1)}%`
  }

  function medal(i) {
    if (i === 0) return { bg: 'rgba(255,180,0,0.15)', color: '#ffb400', label: '1' }
    if (i === 1) return { bg: 'rgba(180,180,180,0.1)', color: 'rgba(255,255,255,0.5)', label: '2' }
    if (i === 2) return { bg: 'rgba(180,100,50,0.1)', color: 'rgba(200,130,80,0.8)', label: '3' }
    return { bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)', label: String(i+1) }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/ranking')}>← volver</button>
        <div style={styles.headerTitle}>
          <h1 style={styles.title}>Estadísticas PRO</h1>
          <div style={styles.titleLine} />
        </div>
        <p style={styles.subtitle}>Estadísticas totales históricas — solo jugadores con más de 25 partidos disputados</p>
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
                <th style={styles.thPos}>#</th>
                <th style={styles.thName}>Jugador</th>
                <th style={styles.th}>⚽ Directo</th>
                <th style={styles.th}>🧤 Falta</th>
                <th style={styles.th}>🥅 Penalty</th>
                <th style={styles.th}>🚩 Córner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const m = medal(i)
                return (
                <tr key={i} style={styles.tr}>
                  <td style={styles.tdPos}>
                    <span style={{ ...styles.posBadge, background: m.bg, color: m.color }}>{m.label}</span>
                  </td>
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
              )})}
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
  thPos: { textAlign: 'center', padding: '0.5rem 0.4rem', color: 'rgba(255,255,255,0.3)', fontWeight: '700', fontSize: '0.7rem', width: '32px' },
  thName: { textAlign: 'left', padding: '0.5rem 0.75rem', color: 'rgba(255,255,255,0.3)', fontWeight: '700', fontSize: '0.7rem', letterSpacing: '0.5px', position: 'sticky', left: 0, background: '#141414' },
  th: { textAlign: 'center', padding: '0.5rem 0.6rem', color: 'rgba(255,255,255,0.3)', fontWeight: '700', fontSize: '0.7rem', whiteSpace: 'nowrap' },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.05)' },
  tdPos: { textAlign: 'center', padding: '0.4rem' },
  posBadge: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '50%', fontSize: '0.7rem', fontWeight: '900' },
  tdName: { padding: '0.65rem 0.75rem', color: '#fff', fontWeight: '700', position: 'sticky', left: 0, background: '#141414' },
  td: { textAlign: 'center', padding: '0.65rem 0.6rem', color: 'rgba(255,255,255,0.7)', fontWeight: '600', fontVariantNumeric: 'tabular-nums' },
}
