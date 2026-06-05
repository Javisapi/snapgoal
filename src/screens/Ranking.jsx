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

export default function Ranking() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    init()
  }, [])

  async function init() {
    const p = await getPlayer()
    setMe(p)

    const { data } = await supabase
      .from('players')
      .select('*')
      .order('total_points', { ascending: false })

    setPlayers(data || [])
    setLoading(false)
  }

  function avg(val, matches) {
    if (!matches) return '0.00'
    return (val / matches).toFixed(2)
  }

  const myRank = me ? players.findIndex(p => p.id === me.id) + 1 : null

  if (loading) return (
    <div style={styles.container}>
      <p style={{ color: '#fff', textAlign: 'center' }}>Cargando ranking...</p>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← Volver</button>
        <h1 style={styles.title}>🏆 Ranking</h1>
        {myRank && <p style={styles.myRank}>Tu posición: #{myRank}</p>}
      </div>

      <div style={styles.list}>
        {players.map((p, i) => {
          const isMe = me && p.id === me.id
          return (
            <div key={p.id} style={{ ...styles.card, ...(isMe ? styles.cardMe : {}) }}>
              <div style={styles.cardTop}>
                <div style={styles.rankBadge}>
                  <span style={styles.rankNum}>#{i + 1}</span>
                </div>
                <div style={styles.playerInfo}>
                  <span style={styles.playerUsername}>
                    {p.username}
                    {isMe && <span style={styles.youBadge}> tú</span>}
                  </span>
                  <span style={styles.playerPts}>{p.total_points} pts</span>
                </div>
                <div style={styles.wdl}>
                  <span style={styles.wdlItem}>
                    <span style={styles.wdlVal}>{p.matches_won}</span>
                    <span style={styles.wdlLabel}>V</span>
                  </span>
                  <span style={styles.wdlSep}>·</span>
                  <span style={styles.wdlItem}>
                    <span style={styles.wdlVal}>{p.matches_drawn}</span>
                    <span style={styles.wdlLabel}>E</span>
                  </span>
                  <span style={styles.wdlSep}>·</span>
                  <span style={styles.wdlItem}>
                    <span style={styles.wdlVal}>{p.matches_lost}</span>
                    <span style={styles.wdlLabel}>D</span>
                  </span>
                </div>
              </div>

              <div style={styles.cardStats}>
                <div style={styles.statCol}>
                  <span style={styles.statVal}>⚽ {p.goals_scored}</span>
                  <span style={styles.statLabel}>goles marcados</span>
                </div>
                <div style={styles.statCol}>
                  <span style={styles.statVal}>🥅 {p.goals_conceded}</span>
                  <span style={styles.statLabel}>goles recibidos</span>
                </div>
                <div style={styles.statCol}>
                  <span style={styles.statVal}>{avg(p.goals_scored, p.matches_played)}</span>
                  <span style={styles.statLabel}>⚽ por partido</span>
                </div>
                <div style={styles.statCol}>
                  <span style={styles.statVal}>{avg(p.goals_conceded, p.matches_played)}</span>
                  <span style={styles.statLabel}>🥅 por partido</span>
                </div>
                <div style={styles.statCol}>
                  <span style={styles.statVal}>🟨 {p.yellow_cards}</span>
                  <span style={styles.statLabel}>amarillas</span>
                </div>
                <div style={styles.statCol}>
                  <span style={styles.statVal}>🟥 {p.red_cards}</span>
                  <span style={styles.statLabel}>rojas</span>
                </div>
                <div style={styles.statCol}>
                  <span style={styles.statVal}>{avg(p.yellow_cards, p.matches_played)}</span>
                  <span style={styles.statLabel}>🟨 por partido</span>
                </div>
                <div style={styles.statCol}>
                  <span style={styles.statVal}>{avg(p.red_cards, p.matches_played)}</span>
                  <span style={styles.statLabel}>🟥 por partido</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: '#141414', overflow: 'hidden' },
  header: { padding: '2rem 1.5rem 1rem', flexShrink: 0 },
  backBtn: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', cursor: 'pointer', padding: '0', marginBottom: '0.75rem' },
  title: { fontSize: '1.8rem', fontWeight: '900', color: '#fff', margin: '0 0 0.25rem' },
  myRank: { fontSize: '0.85rem', color: '#ffb400', margin: 0 },
  list: { flex: 1, overflowY: 'auto', padding: '0 1.5rem 2rem' },
  card: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1rem', marginBottom: '0.75rem' },
  cardMe: { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.25)' },
  cardTop: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' },
  rankBadge: { width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rankNum: { fontSize: '0.75rem', fontWeight: '800', color: 'rgba(255,255,255,0.5)' },
  playerInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: '1px' },
  playerUsername: { fontSize: '0.95rem', fontWeight: '700', color: '#fff' },
  youBadge: { fontSize: '0.7rem', color: '#ffb400', fontWeight: '700' },
  playerPts: { fontSize: '0.75rem', color: '#ffb400', fontWeight: '600' },
  wdl: { display: 'flex', alignItems: 'center', gap: '4px' },
  wdlItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' },
  wdlVal: { fontSize: '0.9rem', fontWeight: '800', color: '#fff' },
  wdlLabel: { fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' },
  wdlSep: { color: 'rgba(255,255,255,0.15)', fontSize: '0.8rem' },
  cardStats: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem' },
  statCol: { display: 'flex', flexDirection: 'column', gap: '2px' },
  statVal: { fontSize: '0.8rem', fontWeight: '700', color: '#fff' },
  statLabel: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' },
}
