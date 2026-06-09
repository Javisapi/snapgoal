import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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

const CSS = `
  @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes msgIn { from{opacity:0;transform:translateY(8px) scale(0.95)} to{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes msgOut { from{opacity:1} to{opacity:0} }
`

const CHAT_MESSAGES = [
  '⚽ ¡Vaya golazo!',
  '💥 BOOOM',
  '😂 ahahahahah',
  '🚩 ¡Exijo VAR!',
  '🤨 El árbitro está comprado',
  '🤝 Buen partido',
]

export default function League() {
  const { leagueId } = useParams()
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [league, setLeague] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('ranking')
  const [showKick, setShowKick] = useState(null)
  const channelRef = useRef(null)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)
    init()
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)
    await loadLeague(p)
    setLoading(false)
  }

  async function loadLeague(p) {
    const { data: leagueData } = await supabase
      .from('leagues').select('*').eq('id', leagueId).single()
    if (!leagueData) { navigate('/leagues'); return }
    setLeague(leagueData)

    const { data: membersData } = await supabase
      .from('league_members')
      .select('*, players(id, username)')
      .eq('league_id', leagueId)
      .order('points', { ascending: false })
    setMembers(membersData || [])

    // Realtime para actualizaciones de miembros
    const ch = supabase.channel('league-' + leagueId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` },
        () => loadLeague(p))
      .subscribe()
    channelRef.current = ch
  }

  async function handleKick(memberId, playerId) {
    if (!league || league.created_by !== player.id) return
    await supabase.from('league_members').delete().eq('id', memberId)
    setShowKick(null)
    await loadLeague(player)
  }

  async function handleLeave() {
    const member = members.find(m => m.players.id === player.id)
    if (!member) return
    await supabase.from('league_members').delete().eq('id', member.id)
    navigate('/leagues')
  }

  function isExpired() {
    return new Date(league?.expires_at) < new Date()
  }

  function isAdmin() {
    return league?.created_by === player?.id
  }

  function getDaysLeft() {
    const diff = new Date(league?.expires_at) - new Date()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  function shareWhatsApp() {
    const url = `${window.location.origin}?join=${league.code}`
    const text = `¡Te invito a la liga "${league.name}" en SnapGoal! Únete con el código *${league.code}* o entra aquí: ${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  if (loading || !league || !player) return (
    <div style={styles.container}>
      <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Cargando...</p>
    </div>
  )

  const expired = isExpired()
  const daysLeft = getDaysLeft()
  const myMember = members.find(m => m.players.id === player.id)
  const myRank = members.findIndex(m => m.players.id === player.id) + 1

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/leagues')}>← volver</button>
        <div style={styles.leagueHeader}>
          <div>
            <h1 style={styles.leagueName}>{league.name}</h1>
            <div style={styles.titleLine} />
            <div style={styles.leagueMeta}>
              <span style={styles.leagueCode}>#{league.code}</span>
              <span style={{
                ...styles.leagueStatusBadge,
                background: expired ? 'rgba(255,68,68,0.1)' : 'rgba(0,200,80,0.1)',
                color: expired ? '#ff4444' : '#00c853',
              }}>
                {expired ? 'Terminada' : daysLeft <= 1 ? `${daysLeft}d` : `${daysLeft}d restantes`}
              </span>
            </div>
          </div>
          {!expired && (
            <button style={styles.shareBtn} onClick={shareWhatsApp}>
              Invitar
            </button>
          )}
        </div>

        {/* Mi posición */}
        {myMember && (
          <div style={styles.myStats}>
            <div style={styles.myStatsItem}>
              <span style={styles.myStatsVal}>#{myRank}</span>
              <span style={styles.myStatsLabel}>posición</span>
            </div>
            <div style={styles.myStatsItem}>
              <span style={styles.myStatsVal}>{myMember.points}</span>
              <span style={styles.myStatsLabel}>puntos</span>
            </div>
            <div style={styles.myStatsItem}>
              <span style={styles.myStatsVal}>{myMember.matches_played}</span>
              <span style={styles.myStatsLabel}>partidos</span>
            </div>
            <div style={styles.myStatsItem}>
              <span style={styles.myStatsVal}>{myMember.matches_won}V {myMember.matches_drawn}E {myMember.matches_lost}D</span>
              <span style={styles.myStatsLabel}>resultados</span>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={styles.tabs}>
          {['ranking', 'miembros'].map(t => (
            <button key={t} style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {tab === 'ranking' && (
          <div style={styles.list}>
            {members.map((m, i) => {
              const isMe = m.players.id === player.id
              const isAdminMember = m.players.id === league.created_by
              return (
                <div key={m.id} style={{ ...styles.memberCard, ...(isMe ? styles.memberCardMe : {}), animation: `fadeIn 0.3s ease ${i * 0.04}s both` }}>
                  <div style={styles.memberRank}>
                    <span style={{ ...styles.rankNum, color: i === 0 ? '#ffb400' : i === 1 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)' }}>
                      #{i + 1}
                    </span>
                  </div>
                  <div style={styles.memberInfo}>
                    <div style={styles.memberNameRow}>
                      <span style={styles.memberName}>{m.players.username}</span>
                      {isAdminMember && <span style={styles.adminBadge}>Admin</span>}
                      {isMe && <span style={styles.meBadge}>tú</span>}
                    </div>
                    <span style={styles.memberWDL}>{m.matches_won}V · {m.matches_drawn}E · {m.matches_lost}D</span>
                  </div>
                  <div style={styles.memberPtsBlock}>
                    <span style={styles.memberPts}>{m.points}</span>
                    <span style={styles.memberPtsLabel}>pts</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {tab === 'miembros' && (
          <div style={styles.list}>
            {members.map((m, i) => {
              const isMe = m.players.id === player.id
              const isAdminMember = m.players.id === league.created_by
              const canKick = isAdmin() && !isMe && !isAdminMember
              return (
                <div key={m.id} style={{ ...styles.memberCard, animation: `fadeIn 0.3s ease ${i * 0.04}s both` }}>
                  <div style={styles.memberInfo}>
                    <div style={styles.memberNameRow}>
                      <span style={styles.memberName}>{m.players.username}</span>
                      {isAdminMember && <span style={styles.adminBadge}>Admin</span>}
                      {isMe && <span style={styles.meBadge}>tú</span>}
                    </div>
                    <span style={styles.memberWDL}>Desde {new Date(m.joined_at).toLocaleDateString('es-ES')}</span>
                  </div>
                  {canKick && (
                    <button style={styles.kickBtn} onClick={() => setShowKick(m)}>Expulsar</button>
                  )}
                </div>
              )
            })}

            {/* Botón salir de liga */}
            {!isAdmin() && !expired && (
              <button style={styles.leaveBtn} onClick={handleLeave}>Salir de la liga</button>
            )}
          </div>
        )}
      </div>

      {/* Botón buscar rival en liga */}
      {!expired && (
        <div style={styles.footer}>
          <button
            style={styles.btnPlay}
            onClick={() => navigate('/queue?league=' + leagueId)}
          >
            ⚡ Buscar rival en la liga
          </button>
        </div>
      )}

      {/* Modal expulsar */}
      {showKick && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>Expulsar jugador</p>
            <p style={styles.modalText}>¿Expulsar a <strong style={{ color: '#fff' }}>{showKick.players.username}</strong> de la liga? Sus estadísticas se eliminarán.</p>
            <button style={styles.btnConfirm} onClick={() => handleKick(showKick.id, showKick.players.id)}>Sí, expulsar</button>
            <button style={styles.btnCancel} onClick={() => setShowKick(null)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: '#141414', overflow: 'hidden', position: 'relative' },
  header: { padding: '2rem 1.75rem 0', flexShrink: 0 },
  backBtn: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '0.75rem', letterSpacing: '0.5px' },
  leagueHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' },
  leagueName: { fontSize: '1.8rem', fontWeight: '900', color: '#fff', letterSpacing: '-1px', margin: 0, lineHeight: 1 },
  titleLine: { height: '3px', width: '28px', background: '#ffb400', borderRadius: '2px', margin: '0.4rem 0' },
  leagueMeta: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  leagueCode: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '1px' },
  leagueStatusBadge: { fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' },
  shareBtn: { background: 'rgba(255,180,0,0.1)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '10px', color: '#ffb400', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', padding: '6px 12px' },
  myStats: { display: 'flex', gap: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '0.75rem' },
  myStatsItem: { display: 'flex', flexDirection: 'column', gap: '1px' },
  myStatsVal: { fontSize: '0.85rem', fontWeight: '800', color: '#fff' },
  myStatsLabel: { fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '0.5px' },
  tabs: { display: 'flex', gap: '0', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '0' },
  tab: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', padding: '0.6rem 1rem', borderBottom: '2px solid transparent' },
  tabActive: { color: '#ffb400', borderBottom: '2px solid #ffb400' },
  content: { flex: 1, overflowY: 'auto', padding: '0.75rem 1.75rem 1rem' },
  list: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  memberCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' },
  memberCardMe: { background: 'rgba(255,180,0,0.06)', border: '1px solid rgba(255,180,0,0.2)' },
  memberRank: { width: '28px', flexShrink: 0 },
  rankNum: { fontSize: '0.8rem', fontWeight: '800' },
  memberInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' },
  memberNameRow: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  memberName: { fontSize: '0.9rem', fontWeight: '700', color: '#fff' },
  adminBadge: { fontSize: '0.6rem', fontWeight: '800', color: '#ffb400', background: 'rgba(255,180,0,0.15)', padding: '1px 5px', borderRadius: '4px' },
  meBadge: { fontSize: '0.6rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)' },
  memberWDL: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)' },
  memberPtsBlock: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  memberPts: { fontSize: '1.2rem', fontWeight: '900', color: '#fff', lineHeight: 1 },
  memberPtsLabel: { fontSize: '0.6rem', color: 'rgba(255,255,255,0.25)' },
  kickBtn: { background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '8px', color: '#ff4444', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', padding: '4px 10px' },
  leaveBtn: { background: 'transparent', border: '1px solid rgba(255,68,68,0.2)', borderRadius: '10px', color: 'rgba(255,68,68,0.5)', fontSize: '0.85rem', cursor: 'pointer', padding: '0.75rem', marginTop: '0.5rem' },
  footer: { padding: '1rem 1.75rem 2rem', flexShrink: 0 },
  btnPlay: { width: '100%', background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '1.1rem', fontSize: '1rem', fontWeight: '800', cursor: 'pointer' },
  overlay: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', zIndex: 100 },
  modal: { background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' },
  modalTitle: { fontSize: '1.1rem', fontWeight: '700', color: '#fff', margin: 0 },
  modalText: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, margin: 0 },
  btnConfirm: { background: '#ff4444', color: '#fff', border: 'none', borderRadius: '10px', padding: '0.9rem', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer' },
  btnCancel: { background: 'transparent', color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '0.85rem', fontSize: '0.9rem', cursor: 'pointer' },
}
