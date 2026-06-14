import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import AdminGuard from '../components/AdminGuard'

const CSS = `
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`

function StatCard({ label, value, sub, color = '#ffb400' }) {
  return (
    <div style={styles.statCard}>
      <p style={{ ...styles.statValue, color }}>{value}</p>
      <p style={styles.statLabel}>{label}</p>
      {sub && <p style={styles.statSub}>{sub}</p>}
    </div>
  )
}

function BarChart({ data, valueKey, labelKey, color = '#ffb400' }) {
  if (!data?.length) return <p style={styles.empty}>Sin datos</p>
  const max = Math.max(...data.map(d => d[valueKey] || 0))
  return (
    <div style={styles.chartWrap}>
      {data.slice(0, 14).reverse().map((d, i) => (
        <div key={i} style={styles.barCol}>
          <div style={{ ...styles.bar, height: max ? `${((d[valueKey] || 0) / max) * 80}px` : '2px', background: color }} />
          <p style={styles.barLabel}>{d[labelKey]}</p>
        </div>
      ))}
    </div>
  )
}

export default function Admin() {
  return (
    <AdminGuard>
      <AdminDashboard />
    </AdminGuard>
  )
}

function AdminDashboard() {
  const [view, setView] = useState('day')
  const [playerStats, setPlayerStats] = useState([])
  const [matchStats, setMatchStats] = useState([])
  const [topPlayers, setTopPlayers] = useState([])
  const [activePlayers, setActivePlayers] = useState(0)
  const [totals, setTotals] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)

    const [pStats, mStats, top, active, players, matches] = await Promise.all([
      supabase.from('admin_player_stats').select('*').limit(90),
      supabase.from('admin_match_stats').select('*').limit(90),
      supabase.from('admin_top_players').select('*'),
      supabase.from('admin_active_players').select('*').single(),
      supabase.from('players').select('id, email_verified, matches_played'),
      supabase.from('matches').select('id, status').eq('status', 'finished'),
    ])

    const allPlayers = players.data || []
    const totalPlayers = allPlayers.length
    const totalVerified = allPlayers.filter(p => p.email_verified).length
    const totalMatches = matches.data?.length || 0
    const avgMatchesPerPlayer = totalPlayers > 0 ? (totalMatches / totalPlayers).toFixed(1) : 0

    setPlayerStats(pStats.data || [])
    setMatchStats(mStats.data || [])
    setTopPlayers(top.data || [])
    setActivePlayers(active.data?.active_players || 0)
    setTotals({ totalPlayers, totalVerified, totalMatches, avgMatchesPerPlayer, pctVerified: totalPlayers > 0 ? ((totalVerified / totalPlayers) * 100).toFixed(1) : 0 })
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

  if (loading) return (
    <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#141414' }}>
      <p style={{ color:'rgba(255,255,255,0.3)' }}>Cargando dashboard...</p>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <p style={styles.wordmark}>SnapGoal</p>
          <p style={styles.subtitle}>Panel de administración</p>
        </div>
        <div style={styles.toggleWrap}>
          <button style={{ ...styles.toggle, background: view === 'day' ? '#ffb400' : 'transparent', color: view === 'day' ? '#141414' : 'rgba(255,255,255,0.4)' }} onClick={() => setView('day')}>Día</button>
          <button style={{ ...styles.toggle, background: view === 'week' ? '#ffb400' : 'transparent', color: view === 'week' ? '#141414' : 'rgba(255,255,255,0.4)' }} onClick={() => setView('week')}>Semana</button>
        </div>
      </div>

      {/* KPIs principales */}
      <div style={styles.grid4}>
        <StatCard label="Jugadores totales" value={totals.totalPlayers} sub={`+${todayPlayers} hoy`} />
        <StatCard label="Cuentas verificadas" value={totals.totalVerified} sub={`${totals.pctVerified}% del total`} color="#00c850" />
        <StatCard label="Partidos totales" value={totals.totalMatches} sub={`+${todayMatches} hoy`} color="#60a5fa" />
        <StatCard label="Activos (7 días)" value={activePlayers} sub={`${totals.totalPlayers > 0 ? ((activePlayers / totals.totalPlayers) * 100).toFixed(1) : 0}% retención`} color="#f472b6" />
      </div>

      <div style={styles.grid4}>
        <StatCard label="Media partidos/jugador" value={totals.avgMatchesPerPlayer} color="#a78bfa" />
        <StatCard label="Goles hoy" value={todayGoals} color="#fb923c" />
        <StatCard label="No verificados" value={totals.totalPlayers - totals.totalVerified} color="rgba(255,255,255,0.3)" />
        <StatCard label="Partidos abandonados hoy" value={matchStats[0]?.matches_abandoned || 0} color="#f87171" />
      </div>

      {/* Gráfico nuevos jugadores */}
      <div style={styles.chartCard}>
        <p style={styles.chartTitle}>Nuevos jugadores por {view === 'day' ? 'día' : 'semana'}</p>
        <BarChart data={pData} valueKey="new_players" labelKey="label" color="#ffb400" />
      </div>

      {/* Gráfico partidos */}
      <div style={styles.chartCard}>
        <p style={styles.chartTitle}>Partidos jugados por {view === 'day' ? 'día' : 'semana'}</p>
        <BarChart data={mData} valueKey="matches_played" labelKey="label" color="#60a5fa" />
      </div>

      {/* Gráfico goles */}
      <div style={styles.chartCard}>
        <p style={styles.chartTitle}>Goles jugados por {view === 'day' ? 'día' : 'semana'}</p>
        <BarChart data={mData} valueKey="goals_played" labelKey="label" color="#fb923c" />
      </div>

      {/* Top jugadores */}
      <div style={styles.chartCard}>
        <p style={styles.chartTitle}>Top 10 jugadores</p>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>#</th>
              <th style={styles.th}>Usuario</th>
              <th style={styles.th}>Partidos</th>
              <th style={styles.th}>Victorias</th>
              <th style={styles.th}>Puntos</th>
              <th style={styles.th}>XP</th>
              <th style={styles.th}>✓</th>
            </tr>
          </thead>
          <tbody>
            {topPlayers.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={styles.td}>{i + 1}</td>
                <td style={{ ...styles.td, color: '#fff', fontWeight: '700' }}>{p.username}</td>
                <td style={styles.td}>{p.matches_played}</td>
                <td style={styles.td}>{p.matches_won}</td>
                <td style={styles.td}>{p.total_points}</td>
                <td style={styles.td}>{p.xp_rating}</td>
                <td style={styles.td}>{p.email_verified ? '✅' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button style={styles.logout} onClick={async () => { await supabase.auth.signOut(); window.location.href = '/admin/login' }}>
        Cerrar sesión
      </button>
    </div>
  )
}

const styles = {
  container: { minHeight:'100%', background:'#141414', padding:'2rem 1.5rem 4rem', display:'flex', flexDirection:'column', gap:'1.25rem', animation:'fadeIn 0.3s ease forwards' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'flex-start' },
  wordmark: { margin:0, fontSize:'1.8rem', fontWeight:'900', color:'#fff', letterSpacing:'-1.5px' },
  subtitle: { margin:'4px 0 0', fontSize:'0.75rem', color:'rgba(255,255,255,0.3)', letterSpacing:'1px', textTransform:'uppercase' },
  toggleWrap: { display:'flex', background:'rgba(255,255,255,0.06)', borderRadius:'8px', padding:'3px' },
  toggle: { border:'none', borderRadius:'6px', padding:'6px 14px', fontSize:'0.8rem', fontWeight:'700', cursor:'pointer' },
  grid4: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' },
  statCard: { background:'#1c1c1c', borderRadius:'14px', padding:'1rem', display:'flex', flexDirection:'column', gap:'0.25rem' },
  statValue: { margin:0, fontSize:'1.6rem', fontWeight:'900', letterSpacing:'-1px' },
  statLabel: { margin:0, fontSize:'0.72rem', color:'rgba(255,255,255,0.4)', letterSpacing:'0.3px' },
  statSub: { margin:0, fontSize:'0.7rem', color:'rgba(255,255,255,0.25)' },
  chartCard: { background:'#1c1c1c', borderRadius:'14px', padding:'1.25rem' },
  chartTitle: { margin:'0 0 1rem', fontSize:'0.85rem', fontWeight:'700', color:'rgba(255,255,255,0.6)', letterSpacing:'0.3px' },
  chartWrap: { display:'flex', alignItems:'flex-end', gap:'4px', height:'100px', overflowX:'auto' },
  barCol: { display:'flex', flexDirection:'column', alignItems:'center', gap:'4px', minWidth:'28px' },
  bar: { width:'18px', borderRadius:'3px 3px 0 0', minHeight:'2px', transition:'height 0.3s ease' },
  barLabel: { margin:0, fontSize:'0.6rem', color:'rgba(255,255,255,0.25)', transform:'rotate(-45deg)', transformOrigin:'top center', whiteSpace:'nowrap' },
  table: { width:'100%', borderCollapse:'collapse' },
  th: { textAlign:'left', fontSize:'0.7rem', color:'rgba(255,255,255,0.3)', padding:'0.5rem 0.5rem', letterSpacing:'0.5px', textTransform:'uppercase' },
  td: { fontSize:'0.82rem', color:'rgba(255,255,255,0.5)', padding:'0.6rem 0.5rem' },
  empty: { color:'rgba(255,255,255,0.2)', fontSize:'0.85rem', textAlign:'center', padding:'2rem 0' },
  logout: { background:'transparent', color:'rgba(255,80,80,0.4)', border:'none', fontSize:'0.8rem', cursor:'pointer', padding:'0.5rem', marginTop:'1rem' },
}
