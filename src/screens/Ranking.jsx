import { useEffect, useState } from 'react'
import { usePresenceMap } from '../hooks/usePresence'
import StatusDot from '../components/StatusDot'
import { ProtectedBadge } from '../components/ProtectAccount'
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
  const [presenceMap, setPresenceMap] = useState({})
  usePresenceMap(setPresenceMap)
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedOpponent, setSelectedOpponent] = useState(null)
  const [h2hData, setH2hData] = useState({})

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = RANK_CSS
    document.head.appendChild(s)
    init()
  }, [])

  async function init() {
    const p = await getPlayer()
    setMe(p)
    const { data } = await supabase.from('players').select('*').order('xp_rating', { ascending: false })
    setPlayers(data || [])
    setLoading(false)
  }

  const myRank = me ? players.findIndex(p => p.id === me.id) + 1 : null

  const opponentNames = players.filter(p => !me || p.id !== me.id).map(p => p.username)
  const suggestions = search && !selectedOpponent
    ? opponentNames.filter(n => n.toLowerCase().startsWith(search.toLowerCase()))
    : []

  const filteredPlayers = selectedOpponent
    ? players.filter(p => p.username === selectedOpponent)
    : players

  async function fetchH2h(opponentId) {
    if (!me || h2hData[opponentId]) return
    const { data } = await supabase.rpc('get_head_to_head_stats', { p_me: me.id, p_opponent: opponentId })
    setH2hData(prev => ({ ...prev, [opponentId]: data }))
  }

  function toggleExpand(p) {
    const isExpanded = expanded === p.id
    setExpanded(isExpanded ? null : p.id)
    if (!isExpanded && me && p.id !== me.id) fetchH2h(p.id)
  }

  function selectOpponent(name) {
    setSelectedOpponent(name)
    setSearch(name)
    const p = players.find(pl => pl.username === name)
    if (p) {
      setExpanded(p.id)
      fetchH2h(p.id)
    }
  }

  function clearFilter() {
    setSelectedOpponent(null)
    setSearch('')
  }

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

      <div style={styles.searchWrap}>
        <input
          style={styles.searchInput}
          placeholder="Buscar rival..."
          value={search}
          onChange={e => { setSearch(e.target.value); setSelectedOpponent(null) }}
        />
        {selectedOpponent && (
          <button style={styles.clearBtn} onClick={clearFilter}>✕</button>
        )}
        {suggestions.length > 0 && (
          <div style={styles.suggestionsBox}>
            {suggestions.map((name, i) => (
              <button key={i} style={styles.suggestionItem} onClick={() => selectOpponent(name)}>{name}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{display:'flex', gap:'0.6rem', padding:'0 1.75rem 1rem'}}>
        <button style={styles.proStatsBtn} onClick={() => navigate('/pro-stats')}>🏅 Estadísticas PRO</button>
        <button style={styles.matchRecordBtn} onClick={() => navigate('/match-record')}>🗒️ Match Record</button>
      </div>

      <div style={styles.list}>
        {filteredPlayers.map((p, i) => {
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
              onClick={() => toggleExpand(p)}
            >
              {/* Fila principal */}
              <div style={styles.cardMain}>
                <div style={{ ...styles.rankBadge, background: m.bg }}>
                  <span style={{ ...styles.rankNum, color: m.color }}>{m.label}</span>
                </div>
                <div style={styles.playerInfo}>
                  <div style={styles.playerTopRow}>
                    <StatusDot status={presenceMap[p.id] || 'offline'} size={8} />
                    <span style={styles.playerUsername}>{p.username}</span>
                    {p.email_verified && <ProtectedBadge size={14} />}
                    {isMe && <span style={styles.youBadge}>tú</span>}
                  </div>
                  <div style={styles.playerWDL}>
                    <span style={styles.wVal}>{p.matches_won}<span style={styles.wLabel}>V</span></span>
                    <span style={styles.wDot}>·</span>
                    
                    <span style={styles.wDot}>·</span>
                    <span style={styles.wVal}>{p.matches_lost}<span style={styles.wLabel}>D</span></span>
                  </div>
                </div>
                <div style={styles.ptsBlock}>
                  <span style={styles.ptsNum}>{p.xp_rating || 1500} <span style={{fontSize:'0.6rem',color:'rgba(255,180,0,0.5)'}}>XP</span></span>
                  <span style={styles.ptsLabel}>{p.total_points} pts</span>
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

              {isExpanded && !isMe && (
                <div style={styles.h2hBox}>
                  <p style={styles.h2hTitle}>VS {p.username.toUpperCase()} — CARA A CARA</p>
                  {!h2hData[p.id] ? (
                    <p style={styles.h2hLoading}>Cargando...</p>
                  ) : h2hData[p.id].matches_played === 0 ? (
                    <p style={styles.h2hLoading}>Todavía no os habéis enfrentado.</p>
                  ) : (
                    <>
                      <div style={styles.h2hWDL}>
                        <span style={styles.h2hWDLItem}><strong style={{color:'#22c55e'}}>{h2hData[p.id].wins}</strong> V</span>
                        <span style={styles.wDot}>·</span>
                        <span style={styles.h2hWDLItem}><strong style={{color:'#ff4444'}}>{h2hData[p.id].losses}</strong> D</span>
                        <span style={styles.wDot}>·</span>
                        <span style={styles.h2hWDLItem}>{h2hData[p.id].matches_played} jugados</span>
                      </div>
                      <div style={styles.statsGrid}>
                        <div style={styles.statItem}>
                          <span style={styles.statVal}>⚽ {h2hData[p.id].goals_scored}</span>
                          <span style={styles.statLabel}>goles marcados</span>
                        </div>
                        <div style={styles.statItem}>
                          <span style={styles.statVal}>🥅 {h2hData[p.id].goals_conceded}</span>
                          <span style={styles.statLabel}>goles recibidos</span>
                        </div>
                        <div style={styles.statItem}>
                          <span style={styles.statVal}>{avg(h2hData[p.id].goals_scored, h2hData[p.id].matches_played)}</span>
                          <span style={styles.statLabel}>⚽ por partido</span>
                        </div>
                        <div style={styles.statItem}>
                          <span style={styles.statVal}>{avg(h2hData[p.id].goals_conceded, h2hData[p.id].matches_played)}</span>
                          <span style={styles.statLabel}>🥅 por partido</span>
                        </div>
                        <div style={styles.statItem}>
                          <span style={styles.statVal}>🟨 {h2hData[p.id].yellow_cards}</span>
                          <span style={styles.statLabel}>amarillas</span>
                        </div>
                        <div style={styles.statItem}>
                          <span style={styles.statVal}>🟥 {h2hData[p.id].red_cards}</span>
                          <span style={styles.statLabel}>rojas</span>
                        </div>
                      </div>
                    </>
                  )}
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
  proStatsBtn: { flex:1, background:'linear-gradient(135deg, rgba(255,180,0,0.18), rgba(255,140,0,0.1))', border:'1.5px solid rgba(255,180,0,0.4)', borderRadius:'14px', color:'#ffb400', fontSize:'0.85rem', fontWeight:'800', cursor:'pointer', padding:'10px 12px', boxShadow:'0 0 16px rgba(255,180,0,0.15)', letterSpacing:'0.3px' },
  matchRecordBtn: { flex:1, background:'linear-gradient(135deg, rgba(96,165,250,0.18), rgba(59,130,246,0.1))', border:'1.5px solid rgba(147,197,253,0.4)', borderRadius:'14px', color:'#93c5fd', fontSize:'0.85rem', fontWeight:'800', cursor:'pointer', padding:'10px 12px', boxShadow:'0 0 16px rgba(147,197,253,0.15)', letterSpacing:'0.3px' },
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
  searchWrap: { position: 'relative', padding: '0 1.75rem 0.75rem' },
  searchInput: { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '0.7rem 0.9rem', color: '#fff', fontSize: '0.85rem', outline: 'none' },
  clearBtn: { position: 'absolute', right: '2.1rem', top: '0.55rem', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem', cursor: 'pointer' },
  suggestionsBox: { position: 'absolute', top: '100%', left: '1.75rem', right: '1.75rem', background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', marginTop: '4px', overflow: 'hidden', zIndex: 10 },
  suggestionItem: { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#fff', padding: '0.6rem 0.9rem', fontSize: '0.82rem', cursor: 'pointer' },
  h2hBox: { borderTop: '1px solid rgba(255,180,0,0.15)', marginTop: '0.75rem', paddingTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  h2hTitle: { fontSize: '0.68rem', color: '#ffb400', letterSpacing: '1px', margin: 0, fontWeight: '800' },
  h2hLoading: { fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', margin: 0 },
  h2hWDL: { display: 'flex', alignItems: 'center', gap: '6px' },
  h2hWDLItem: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' },
}
