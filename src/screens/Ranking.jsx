import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

async function getPlayer() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const { data } = await supabase.from('players').select('*').eq('auth_id', session.user.id).single()
  if (data) sessionStorage.setItem('player_' + session.user.id, JSON.stringify(data))
  return data
}

const RANK_CSS = `
  @keyframes rankFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`

function medal(i) {
  if (i === 0) return { bg: 'rgba(255,180,0,0.15)', color: '#ffb400', label: '1' }
  if (i === 1) return { bg: 'rgba(180,180,180,0.1)', color: 'rgba(255,255,255,0.5)', label: '2' }
  if (i === 2) return { bg: 'rgba(180,100,50,0.1)', color: 'rgba(200,130,80,0.8)', label: '3' }
  return { bg: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.2)', label: String(i+1) }
}

function avg(val, matches) {
  if (!matches) return '—'
  return (val / matches).toFixed(2)
}

export default function Ranking() {
  const navigate = useNavigate()
  const [players, setPlayers] = useState([])
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = RANK_CSS
    document.head.appendChild(s)
    init()
  }, [])

  async function init() {
    const p = await getPlayer()
    setMe(p)
    const { data } = await supabase.from('players').select('*').order('total_points', { ascending: false })
    setPlayers(data || [])
    setLoading(false)
  }

  const myRank = me ? players.findIndex(p => p.id === me.id) + 1 : null

  if (loading) return (
    <div style={styles.container}>
      <p style={{ color:'rgba(255,255,255,0.2)', textAlign:'center', fontSize:'0.85rem' }}>Cargando...</p>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← volver</button>
        <div style={styles.headerTitle}>
          <h1 style={styles.title}>Ranking</h1>
          <div style={styles.titleLine} />
        </div>
        {myRank && <p style={styles.myRank}>Tu posición — #{myRank}</p>}
      </div>

      <div style={styles.list}>
        {players.map((p, i) => {
          const isMe = me && p.id === me.id
          const m = medal(i)
          const isExpanded = expanded === p.id

          return (
            <div
              key={p.id}
              style={{
                ...styles.card,
                ...(isMe ? styles.cardMe : {}),
                animation: `rankFadeIn 0.3s ease ${i * 0.04}s both`,
              }}
              onClick={() => setExpanded(isExpanded ? null : p.id)}
            >
              {/* Fila principal */}
              <div style={styles.cardMain}>
                <div style={{ ...styles.rankBadge, background: m.bg }}>
                  <span style={{ ...styles.rankNum, color: m.color }}>{m.label}</span>
                </div>
                <div style={styles.playerInfo}>
                  <div style={styles.playerTopRow}>
                    <span style={styles.playerUsername}>{p.username}</span>
                    {isMe && <span style={styles.youBadge}>tú</span>}
                  </div>
                  <div style={styles.playerWDL}>
                    <span style={styles.wVal}>{p.matches_won}<span style={styles.wLabel}>V</span></span>
                    <span style={styles.wDot}>·</span>
                    <span style={styles.wVal}>{p.matches_drawn}<span style={styles.wLabel}>E</span></span>
                    <span style={styles.wDot}>·</span>
                    <span style={styles.wVal}>{p.matches_lost}<span style={styles.wLabel}>D</span></span>
                  </div>
                </div>
                <div style={styles.ptsBlock}>
                  <span style={styles.ptsNum}>{p.total_points}</span>
                  <span style={styles.ptsLabel}>pts</span>
                </div>
              </div>

              {/* Stats expandidas */}
              {isExpanded && (
                <div style={styles.statsGrid}>
                  <div style={styles.statItem}>
                    <span style={styles.statVal}>⚽ {p.goals_scored}</span>
                    <span style={styles.statLabel}>goles marcados</span>
                  </div>
                  <div style={styles.statItem}>
                    <span style={styles.statVal}>🥅 {p.goals_conceded}</span>
                    <span style={styles.statLabel}>goles recibidos</span>
                  </div>
                  <div style={styles.statItem}>
                    <span style={styles.statVal}>{avg(p.goals_scored, p.matches_played)}</span>
                    <span style={styles.statLabel}>⚽ por partido</span>
                  </div>
                  <div style={styles.statItem}>
                    <span style={styles.statVal}>{avg(p.goals_conceded, p.matches_played)}</span>
                    <span style={styles.statLabel}>🥅 por partido</span>
                  </div>
                  <div style={styles.statItem}>
                    <span style={styles.statVal}>🟨 {p.yellow_cards}</span>
                    <span style={styles.statLabel}>amarillas</span>
                  </div>
                  <div style={styles.statItem}>
                    <span style={styles.statVal}>🟥 {p.red_cards}</span>
                    <span style={styles.statLabel}>rojas</span>
                  </div>
                  <div style={styles.statItem}>
                    <span style={styles.statVal}>{avg(p.yellow_cards, p.matches_played)}</span>
                    <span style={styles.statLabel}>🟨 por partido</span>
                  </div>
                  <div style={styles.statItem}>
                    <span style={styles.statVal}>{avg(p.red_cards, p.matches_played)}</span>
                    <span style={styles.statLabel}>🟥 por partido</span>
                  </div>
                </div>
              )}

              <div style={styles.expandHint}>
                <span style={{ color:'rgba(255,255,255,0.15)', fontSize:'0.7rem' }}>
                  {isExpanded ? '▲ menos' : '▼ estadísticas'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const styles = {
  container: { height:'100%', display:'flex', flexDirection:'column', background:'#141414', overflow:'hidden' },
  header: { padding:'2.5rem 1.75rem 1rem', flexShrink:0 },
  backBtn: { background:'transparent', border:'none', color:'rgba(255,255,255,0.25)', fontSize:'0.8rem', cursor:'pointer', padding:0, marginBottom:'1rem', letterSpacing:'0.5px' },
  headerTitle: { display:'flex', flexDirection:'column', gap:'0.5rem', marginBottom:'0.5rem' },
  title: { fontSize:'2.5rem', fontWeight:'900', color:'#fff', letterSpacing:'-2px', margin:0, lineHeight:1 },
  titleLine: { height:'3px', width:'36px', background:'#ffb400', borderRadius:'2px' },
  myRank: { fontSize:'0.8rem', color:'rgba(255,255,255,0.3)', margin:0, letterSpacing:'0.5px' },
  list: { flex:1, overflowY:'auto', padding:'0.5rem 1.75rem 2rem' },
  card: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:'14px', padding:'1rem', marginBottom:'0.6rem', cursor:'pointer' },
  cardMe: { background:'rgba(255,180,0,0.06)', border:'1px solid rgba(255,180,0,0.2)' },
  cardMain: { display:'flex', alignItems:'center', gap:'0.75rem' },
  rankBadge: { width:'34px', height:'34px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  rankNum: { fontSize:'0.8rem', fontWeight:'800' },
  playerInfo: { flex:1, display:'flex', flexDirection:'column', gap:'3px' },
  playerTopRow: { display:'flex', alignItems:'center', gap:'0.5rem' },
  playerUsername: { fontSize:'0.95rem', fontWeight:'700', color:'#fff' },
  youBadge: { fontSize:'0.65rem', color:'#ffb400', fontWeight:'700', letterSpacing:'0.5px', textTransform:'uppercase' },
  playerWDL: { display:'flex', alignItems:'center', gap:'4px' },
  wVal: { fontSize:'0.78rem', fontWeight:'600', color:'rgba(255,255,255,0.4)' },
  wLabel: { fontSize:'0.65rem', color:'rgba(255,255,255,0.2)', marginLeft:'1px' },
  wDot: { fontSize:'0.7rem', color:'rgba(255,255,255,0.15)' },
  ptsBlock: { display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'1px' },
  ptsNum: { fontSize:'1.4rem', fontWeight:'900', color:'#fff', lineHeight:1 },
  ptsLabel: { fontSize:'0.65rem', color:'rgba(255,255,255,0.25)', letterSpacing:'0.5px' },
  statsGrid: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'0.6rem', borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'0.75rem', marginTop:'0.75rem' },
  statItem: { display:'flex', flexDirection:'column', gap:'2px' },
  statVal: { fontSize:'0.8rem', fontWeight:'700', color:'rgba(255,255,255,0.7)' },
  statLabel: { fontSize:'0.62rem', color:'rgba(255,255,255,0.25)' },
  expandHint: { textAlign:'center', marginTop:'0.5rem' },
}
