import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import AdminGuard from '../components/AdminGuard'

const CSS = `
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes countUp { from{opacity:0} to{opacity:1} }
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,180,0,0.3); border-radius: 2px; }
`

function KPI({ label, value, sub, color = '#ffb400', big = false }) {
  return (
    <div style={styles.kpi}>
      <p style={{ ...styles.kpiValue, color, fontSize: big ? '2.8rem' : '2rem' }}>{value}</p>
      <p style={styles.kpiLabel}>{label}</p>
      {sub && <p style={styles.kpiSub}>{sub}</p>}
    </div>
  )
}

function BarChart({ data, valueKey, labelKey, color = '#ffb400', height = 160 }) {
  if (!data?.length) return <p style={styles.empty}>Sin datos</p>
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1)
  return (
    <div style={{ ...styles.chartWrap, height: height + 32 }}>
      {data.slice(0, 30).reverse().map((d, i) => (
        <div key={i} style={styles.barCol}>
          <div style={styles.barValWrap}>
            <p style={styles.barVal}>{d[valueKey] > 0 ? d[valueKey] : ''}</p>
          </div>
          <div style={{ ...styles.bar, height: `${((d[valueKey] || 0) / max) * height}px`, background: color }} />
          <p style={styles.barLabel}>{d[labelKey]}</p>
        </div>
      ))}
    </div>
  )
}

export default function Admin() {
  return <AdminGuard><AdminDashboard /></AdminGuard>
}

function AdminDashboard() {
  const [view, setView] = useState('day')
  const [playerStats, setPlayerStats] = useState([])
  const [matchStats, setMatchStats] = useState([])
  const [topPlayers, setTopPlayers] = useState([])
  const [activePlayers, setActivePlayers] = useState(0)
  const [totals, setTotals] = useState({})
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)
    // Habilitar scroll solo en admin
    document.body.style.overflow = 'auto'
    document.documentElement.style.overflow = 'auto'
    const root = document.getElementById('root')
    if (root) root.style.overflow = 'auto'
    loadData()
    return () => {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      if (root) root.style.overflow = 'hidden'
    }
  }, [])

  async function loadData() {
    setLoading(true)
    const [pStats, mStats, top, active, tot] = await Promise.all([
      supabase.from('admin_player_stats').select('*').limit(90),
      supabase.from('admin_match_stats').select('*').limit(90),
      supabase.from('admin_top_players').select('*'),
      supabase.from('admin_active_players').select('*').single(),
      supabase.from('admin_totals').select('*').single(),
    ])
    setPlayerStats(pStats.data || [])
    setMatchStats(mStats.data || [])
    setTopPlayers(top.data || [])
    setActivePlayers(active.data?.active_players || 0)
    setTotals(tot.data || {})
    setLastUpdated(new Date().toLocaleTimeString('es-ES'))
    setLoading(false)
  }

  function aggregateByWeek(data, valueKeys) {
    const weeks = {}
    data.forEach(d => {
      const date = new Date(d.day)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay())
      const key = weekStart.toISOString().slice(0, 10)
      if (!weeks[key]) { weeks[key] = { day: key }; valueKeys.forEach(k => weeks[key][k] = 0) }
      valueKeys.forEach(k => weeks[key][k] += d[k] || 0)
    })
    return Object.values(weeks).sort((a, b) => b.day.localeCompare(a.day))
  }

  function formatDay(isoDate) {
    const d = new Date(isoDate)
    return `${d.getDate()}/${d.getMonth() + 1}`
  }

  const pData = (view === 'day' ? playerStats : aggregateByWeek(playerStats, ['new_players', 'verified_players']))
    .map(d => ({ ...d, label: formatDay(d.day) }))

  const mData = (view === 'day' ? matchStats : aggregateByWeek(matchStats, ['matches_played', 'matches_abandoned', 'goals_played']))
    .map(d => ({ ...d, label: formatDay(d.day) }))

  const todayPlayers = playerStats[0]?.new_players || 0
  const todayMatches = matchStats[0]?.matches_played || 0
  const todayGoals = matchStats[0]?.goals_played || 0
  const todayAbandoned = matchStats[0]?.matches_abandoned || 0
  const pctVerified = totals.total_players > 0 ? ((totals.total_verified / totals.total_players) * 100).toFixed(1) : 0
  const pctActive = totals.total_players > 0 ? ((activePlayers / totals.total_players) * 100).toFixed(1) : 0
  const abandonRate = totals.total_matches > 0 ? ((totals.total_abandoned / (Number(totals.total_matches) + Number(totals.total_abandoned))) * 100).toFixed(1) : 0

  if (loading) return (
    <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#141414' }}>
      <p style={{ color:'rgba(255,255,255,0.3)' }}>Cargando dashboard...</p>
    </div>
  )

  return (
    <div style={styles.container}>

      {/* HEADER */}
      <div style={styles.header}>
        <div>
          <p style={styles.wordmark}>SnapGoal</p>
          <p style={styles.headerSub}>Panel de administración · Actualizado {lastUpdated}</p>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.toggleWrap}>
            <button style={{ ...styles.toggle, background: view === 'day' ? '#ffb400' : 'transparent', color: view === 'day' ? '#141414' : 'rgba(255,255,255,0.4)' }} onClick={() => setView('day')}>Día</button>
            <button style={{ ...styles.toggle, background: view === 'week' ? '#ffb400' : 'transparent', color: view === 'week' ? '#141414' : 'rgba(255,255,255,0.4)' }} onClick={() => setView('week')}>Semana</button>
          </div>
          <button style={styles.refreshBtn} onClick={loadData}>↻ Actualizar</button>
        </div>
      </div>

      {/* SECCIÓN: JUGADORES */}
      <p style={styles.sectionTitle}>👥 Jugadores</p>
      <div style={styles.grid4}>
        <KPI label="Total jugadores" value={totals.total_players} sub={`+${todayPlayers} hoy`} color="#ffb400" big />
        <KPI label="Cuentas verificadas" value={totals.total_verified} sub={`${pctVerified}% del total`} color="#00c850" big />
        <KPI label="No verificados" value={Number(totals.total_players) - Number(totals.total_verified)} sub="sin protección" color="rgba(255,255,255,0.4)" big />
        <KPI label="Activos (7 días)" value={activePlayers} sub={`${pctActive}% retención`} color="#f472b6" big />
      </div>
      <div style={styles.grid5}>
        <KPI label="Media partidos/jugador" value={totals.avg_matches_per_player} color="#a78bfa" />
        <KPI label="Récord individual" value={totals.max_matches_single_player + ' partidos'} color="#a78bfa" />
        <KPI label="Ligas creadas (total)" value={totals.total_leagues} color="#a78bfa" />
        <KPI label="Ligas activas hoy" value={totals.active_leagues} sub="no expiradas" color="#34d399" />
        <KPI label="Miembros en ligas" value={totals.total_league_members} color="#a78bfa" />
      </div>

      {/* GRÁFICO JUGADORES NUEVOS */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <p style={styles.chartTitle}>Nuevos jugadores por {view === 'day' ? 'día' : 'semana'}</p>
          <p style={styles.chartNote}>últimos {view === 'day' ? '30 días' : '12 semanas'}</p>
        </div>
        <BarChart data={pData} valueKey="new_players" labelKey="label" color="#ffb400" height={180} />
      </div>

      {/* GRÁFICO JUGADORES ACUMULADO */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <p style={styles.chartTitle}>Total jugadores acumulado por {view === 'day' ? 'día' : 'semana'}</p>
          <p style={styles.chartNote}>crecimiento histórico</p>
        </div>
        <BarChart data={pData} valueKey="total_players_cumulative" labelKey="label" color="#34d399" height={180} />
      </div>

      {/* SECCIÓN: PARTIDOS */}
      <p style={styles.sectionTitle}>⚽ Partidos</p>
      <div style={styles.grid4}>
        <KPI label="Total partidos jugados" value={totals.total_matches} sub={`+${todayMatches} hoy`} color="#60a5fa" big />
        <KPI label="Total goles" value={totals.total_goals} sub={`+${todayGoals} hoy`} color="#fb923c" big />
        <KPI label="Partidos abandonados" value={totals.total_abandoned} sub={`${abandonRate}% tasa abandono`} color="#f87171" big />
        <KPI label="Partidos en ligas" value={totals.total_league_members} sub="miembros en ligas" color="#34d399" big />
      </div>
      <div style={styles.grid3}>
        <KPI label="Partidos hoy" value={todayMatches} color="#60a5fa" />
        <KPI label="Goles hoy" value={todayGoals} color="#fb923c" />
        <KPI label="Abandonados hoy" value={todayAbandoned} color="#f87171" />
      </div>

      {/* GRÁFICO PARTIDOS */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <p style={styles.chartTitle}>Partidos jugados por {view === 'day' ? 'día' : 'semana'}</p>
          <p style={styles.chartNote}>últimos {view === 'day' ? '30 días' : '12 semanas'}</p>
        </div>
        <BarChart data={mData} valueKey="matches_played" labelKey="label" color="#60a5fa" height={180} />
      </div>

      {/* GRÁFICO GOLES */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <p style={styles.chartTitle}>Goles jugados por {view === 'day' ? 'día' : 'semana'}</p>
          <p style={styles.chartNote}>últimos {view === 'day' ? '30 días' : '12 semanas'}</p>
        </div>
        <BarChart data={mData} valueKey="goals_played" labelKey="label" color="#fb923c" height={180} />
      </div>

      {/* GRÁFICO ABANDONADOS */}
      <div style={styles.chartCard}>
        <div style={styles.chartHeader}>
          <p style={styles.chartTitle}>Partidos abandonados por {view === 'day' ? 'día' : 'semana'}</p>
          <p style={styles.chartNote}>indica problemas de conexión o UX</p>
        </div>
        <BarChart data={mData} valueKey="matches_abandoned" labelKey="label" color="#f87171" height={120} />
      </div>

      {/* TOP JUGADORES */}
      <p style={styles.sectionTitle}>🏆 Top 10 jugadores</p>
      <div style={styles.chartCard}>
        <table style={styles.table}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Usuario</th>
              <th style={styles.th}>Partidos</th>
              <th style={styles.th}>Victorias</th>
              <th style={styles.th}>Puntos</th>
              <th style={styles.th}>XP</th>
              <th style={styles.th}>Verified</th>
            </tr>
          </thead>
          <tbody>
            {topPlayers.map((p, i) => (
              <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ ...styles.td, color: i === 0 ? '#ffb400' : i === 1 ? '#aaa' : i === 2 ? '#cd7f32' : 'rgba(255,255,255,0.3)', fontWeight:'800' }}>{i + 1}</td>
                <td style={{ ...styles.td, color:'#fff', fontWeight:'700' }}>{p.username}</td>
                <td style={styles.td}>{p.matches_played}</td>
                <td style={{ ...styles.td, color:'#60a5fa' }}>{p.matches_won}</td>
                <td style={{ ...styles.td, color:'#ffb400' }}>{p.total_points}</td>
                <td style={{ ...styles.td, color:'#a78bfa' }}>{p.xp_rating}</td>
                <td style={styles.td}>{p.email_verified ? '✅' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button style={styles.logout} onClick={async () => { await supabase.auth.signOut(); window.location.href = '/admin/login' }}>
        Cerrar sesión admin
      </button>
    </div>
  )
}

const styles = {
  container: { minHeight:'100%', background:'#141414', padding:'2rem 2rem 5rem', display:'flex', flexDirection:'column', gap:'1.25rem', animation:'fadeIn 0.3s ease forwards', maxWidth:'1400px', margin:'0 auto' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', paddingBottom:'0.5rem', borderBottom:'1px solid rgba(255,255,255,0.06)' },
  wordmark: { margin:0, fontSize:'2rem', fontWeight:'900', color:'#fff', letterSpacing:'-1.5px' },
  headerSub: { margin:'4px 0 0', fontSize:'0.72rem', color:'rgba(255,255,255,0.25)', letterSpacing:'0.5px' },
  headerRight: { display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.5rem' },
  toggleWrap: { display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:'8px', padding:'3px', gap:'2px' },
  toggle: { border:'none', borderRadius:'6px', padding:'6px 16px', fontSize:'0.8rem', fontWeight:'700', cursor:'pointer', transition:'all 0.2s' },
  refreshBtn: { background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'8px', color:'rgba(255,255,255,0.3)', fontSize:'0.75rem', cursor:'pointer', padding:'5px 12px' },
  sectionTitle: { margin:'0.5rem 0 0', fontSize:'0.8rem', fontWeight:'700', color:'rgba(255,255,255,0.5)', letterSpacing:'1px', textTransform:'uppercase' },
  grid4: { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'0.75rem' },
  grid3: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'0.75rem' },
  grid5: { display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'0.75rem' },
  kpi: { background:'#1c1c1c', borderRadius:'14px', padding:'1.25rem 1rem', display:'flex', flexDirection:'column', gap:'0.2rem' },
  kpiValue: { margin:0, fontWeight:'900', letterSpacing:'-1px', lineHeight:1 },
  kpiLabel: { margin:0, fontSize:'0.72rem', color:'rgba(255,255,255,0.35)', letterSpacing:'0.3px', marginTop:'4px' },
  kpiSub: { margin:0, fontSize:'0.68rem', color:'rgba(255,255,255,0.2)' },
  chartCard: { background:'#1c1c1c', borderRadius:'16px', padding:'1.5rem' },
  chartHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' },
  chartTitle: { margin:0, fontSize:'0.9rem', fontWeight:'700', color:'rgba(255,255,255,0.7)' },
  chartNote: { margin:0, fontSize:'0.72rem', color:'rgba(255,255,255,0.2)' },
  chartWrap: { display:'flex', alignItems:'flex-end', gap:'6px', overflowX:'auto', paddingBottom:'4px' },
  barCol: { display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', minWidth:'32px', flex:'0 0 auto' },
  barValWrap: { height:'20px', display:'flex', alignItems:'flex-end' },
  barVal: { margin:0, fontSize:'0.6rem', color:'rgba(255,255,255,0.3)', lineHeight:1 },
  bar: { width:'22px', borderRadius:'4px 4px 0 0', minHeight:'2px', transition:'height 0.4s ease' },
  barLabel: { margin:0, fontSize:'0.6rem', color:'rgba(255,255,255,0.2)', whiteSpace:'nowrap' },
  table: { width:'100%', borderCollapse:'collapse' },
  th: { textAlign:'left', fontSize:'0.7rem', color:'rgba(255,255,255,0.25)', padding:'0.6rem 0.75rem', letterSpacing:'0.5px', textTransform:'uppercase', fontWeight:'600' },
  td: { fontSize:'0.85rem', color:'rgba(255,255,255,0.45)', padding:'0.75rem 0.75rem' },
  empty: { color:'rgba(255,255,255,0.2)', fontSize:'0.85rem', textAlign:'center', padding:'3rem 0' },
  logout: { background:'transparent', color:'rgba(255,80,80,0.3)', border:'none', fontSize:'0.75rem', cursor:'pointer', padding:'0.5rem', marginTop:'1rem', alignSelf:'center' },
}
