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

const MISSION_META = {
  win_streak_3:    { name: 'Hat-Trick de Victorias', desc: 'Gana 3 partidos seguidos sin perder', icon: '🏆', reward: '1 🎯 + 1 🧤' },
  goals_20:        { name: 'Beast Mode',             desc: 'Mete 20 goles en un día',            icon: '💥', reward: '2 🎯 + 2 🧤' },
  clean_sheet_win: { name: 'Muralla Infranqueable',  desc: 'Gana sin recibir ningún gol',        icon: '🛡️', reward: '1 🎯 + 1 🧤' },
  falta_goals_10:  { name: 'Sniper de Élite',        desc: 'Mete 10 goles de falta hoy',         icon: '⚡', reward: '2 🎯 + 2 🧤' },
  play_10:         { name: 'Maratoniano',             desc: 'Juega 10 partidos completados hoy',  icon: '🎮', reward: '2 🎯 + 2 🧤' },
  secret:          { name: '???',                     desc: 'Completa 2 misiones para descubrir', icon: '🔒', reward: '2 🎯 + 2 🧤' },
}

const SECRET_TYPES = [
  { name: '¡Accidente Histórico!', desc: 'Mete un gol en propia... a propósito',                          icon: '💥' },
  { name: '¡Velocidad de Vértigo!', desc: 'Mete 3 goles antes del segundo 15',                             icon: '⚡' },
  { name: '¡Primer Tiro, Primer Gol!', desc: 'Mete un gol directo (:00) en tu primer tiro del partido',   icon: '🎯' },
  { name: '¡Goleada Perfecta!', desc: 'Gana 5-0 sin que sea por abandono ni inactividad',                  icon: '🔥' },
]

function getTodaySecretType() {
  const doy = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000)
  return doy % 4
}

const SECRET_REVEALED = SECRET_TYPES[getTodaySecretType()]

const CSS = `
  @keyframes missionComplete { 0%{transform:scale(1)} 50%{transform:scale(1.03)} 100%{transform:scale(1)} }
  @keyframes streakCirclePop { 0%{transform:scale(0.7);opacity:0} 100%{transform:scale(1);opacity:1} }
`

export default function Missions() {
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [streak, setStreak] = useState(null)
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)
    init()
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)

    const today = new Date().toISOString().split('T')[0]

    const { data: streakData } = await supabase
      .from('daily_streaks').select('*').eq('player_id', p.id).single()
    setStreak(streakData || { current_streak: 0, longest_streak: 0, last_played_date: null })

    const { data: missionsData } = await supabase
      .from('daily_missions').select('*').eq('player_id', p.id).eq('date', today)

    if (!missionsData || missionsData.length === 0) {
      const empty = Object.keys(MISSION_META).filter(t => t !== 'secret').map(type => ({
        mission_type: type, progress: 0,
        target: { win_streak_3: 3, goals_20: 20, clean_sheet_win: 1, falta_goals_10: 10, play_10: 10 }[type],
        completed: false, reward_claimed: false,
      }))
      setMissions(empty)
    } else {
      // Ordenar: no completadas primero, completadas al final
      const ordered = [...missionsData].sort((a, b) => {
        if (a.completed === b.completed) return 0
        return a.completed ? 1 : -1
      })
      setMissions(ordered)
    }

    setLoading(false)
  }

  const currentStreak = streak?.current_streak || 0
  const posInCycle = currentStreak % 5
  const nextMilestone = currentStreak === 0 ? 5 : posInCycle === 0 ? currentStreak + 5 : Math.ceil(currentStreak / 5) * 5
  const daysToMilestone = nextMilestone - currentStreak
  const milestoneRewardTimes = nextMilestone / 5
  const milestoneReward = `${milestoneRewardTimes + 1} 🎯 + ${milestoneRewardTimes + 1} 🧤`

  const completedToday = missions.filter(m => m.completed).length
  const secretUnlocked = completedToday >= 2
  const secretMission = missions.find(m => m.mission_type === 'secret')
  const normalMissions = missions.filter(m => m.mission_type !== 'secret')

  if (loading) return (
    <div style={styles.container}>
      <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Cargando...</p>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>←</button>
        <h1 style={styles.title}>🏟️ Vestuario</h1>
        <div style={{ width: '36px' }} />
      </div>

      {/* Contador total */}
      {player?.missions_completed > 0 && (
        <div style={styles.totalBadge}>
          <span style={styles.totalBadgeText}>⚡ {player.missions_completed} misiones completadas en total</span>
        </div>
      )}

      {/* Racha */}
      <div style={styles.streakCard}>
        <div style={styles.streakTop}>
          <div>
            <p style={styles.streakLabel}>RACHA ACTUAL</p>
            <div style={styles.streakRow}>
              <span style={styles.streakNumber}>{currentStreak}</span>
              <span style={styles.streakFire}>🔥</span>
            </div>
            <p style={styles.streakSub}>Mejor racha: {streak?.longest_streak || 0} días</p>
          </div>
          <div style={styles.streakRight}>
            <p style={styles.streakMilestoneLabel}>PRÓXIMO PREMIO</p>
            <p style={styles.streakMilestoneVal}>{nextMilestone} días</p>
            <p style={styles.streakMilestoneReward}>{milestoneReward}</p>
            <p style={styles.streakMilestoneDays}>Faltan {daysToMilestone} día{daysToMilestone !== 1 ? 's' : ''}</p>
          </div>
        </div>

        {/* Círculos de racha */}
        <div style={styles.streakCircles}>
          {[1,2,3,4,5].map(i => {
            const filled = i <= posInCycle || (posInCycle === 0 && currentStreak > 0 && i === 5)
            return (
              <div key={i} style={{
                ...styles.streakCircle,
                background: filled ? '#ffb400' : 'rgba(255,255,255,0.06)',
                border: filled ? '2px solid #ffb400' : '2px solid rgba(255,255,255,0.1)',
                boxShadow: filled ? '0 0 10px rgba(255,180,0,0.4)' : 'none',
                animation: filled ? `streakCirclePop 0.3s ease ${i * 0.05}s both` : 'none',
              }}>
                {filled && <span style={{ fontSize: '0.7rem' }}>🔥</span>}
              </div>
            )
          })}
        </div>

        <p style={styles.streakHint}>
          {currentStreak > 0
            ? `Juega hoy para mantener la racha`
            : 'Juega un partido hoy para empezar tu racha'}
        </p>
      </div>

      {/* Misiones del día */}
      <div style={styles.sectionHeader}>
        <p style={styles.sectionTitle}>MISIONES DE HOY</p>
        <p style={styles.sectionSub}>{completedToday}/5 completadas · Se reinician a medianoche</p>
      </div>
      <p style={styles.missionsNote}>Solo cuentan partidos completados — los abandonos no suman.</p>

      <div style={styles.missionsList}>
        {normalMissions.map(m => {
          const meta = MISSION_META[m.mission_type]
          if (!meta) return null
          const pct = Math.min(m.progress / m.target, 1)
          return (
            <div key={m.mission_type} style={{
              ...styles.missionCard,
              borderColor: m.completed ? 'rgba(0,220,100,0.3)' : 'rgba(255,255,255,0.08)',
              background: m.completed ? 'rgba(0,220,100,0.04)' : 'rgba(255,255,255,0.03)',
              animation: m.completed ? 'missionComplete 0.4s ease' : 'none',
            }}>
              <div style={styles.missionTop}>
                <span style={styles.missionIcon}>{meta.icon}</span>
                <div style={styles.missionInfo}>
                  <p style={styles.missionName}>{meta.name}</p>
                  <p style={styles.missionDesc}>{meta.desc}</p>
                  <p style={styles.missionReward}>{meta.reward}</p>
                </div>
                {m.completed
                  ? <span style={styles.missionDone}>✓</span>
                  : <span style={styles.missionProgress}>{m.progress}/{m.target}</span>
                }
              </div>
              <div style={styles.missionBarBg}>
                <div style={{
                  ...styles.missionBarFill,
                  width: `${pct * 100}%`,
                  background: m.completed ? '#00dc64' : '#ffb400',
                }} />
              </div>
            </div>
          )
        })}

        {/* Misión secreta */}
        {(() => {
          const isCompleted = secretMission?.completed || false
          const isRevealed = secretUnlocked || isCompleted
          const meta = isRevealed && !isCompleted ? SECRET_REVEALED : MISSION_META['secret']
          return (
            <div style={{
              ...styles.missionCard,
              borderColor: isCompleted ? 'rgba(0,220,100,0.3)' : isRevealed ? 'rgba(255,180,0,0.25)' : 'rgba(255,255,255,0.06)',
              background: isCompleted ? 'rgba(0,220,100,0.04)' : isRevealed ? 'rgba(255,180,0,0.04)' : 'rgba(255,255,255,0.02)',
              opacity: isRevealed ? 1 : 0.6,
            }}>
              <div style={styles.missionTop}>
                <span style={styles.missionIcon}>{isCompleted ? '💥' : isRevealed ? SECRET_REVEALED.icon : '🔒'}</span>
                <div style={styles.missionInfo}>
                  <p style={styles.missionName}>{isCompleted ? SECRET_REVEALED.name : isRevealed ? SECRET_REVEALED.name : '??? Misión Secreta'}</p>
                  <p style={styles.missionDesc}>{isRevealed ? SECRET_REVEALED.desc : 'Completa 2 misiones para desbloquear'}</p>
                  <p style={styles.missionReward}>{MISSION_META['secret'].reward}</p>
                </div>
                {isCompleted
                  ? <span style={styles.missionDone}>✓</span>
                  : isRevealed
                    ? <span style={styles.missionProgress}>{secretMission?.progress || 0}/1</span>
                    : <span style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.2)', fontWeight:'700' }}>{completedToday}/2</span>
                }
              </div>
              {isRevealed && (
                <div style={styles.missionBarBg}>
                  <div style={{
                    ...styles.missionBarFill,
                    width: isCompleted ? '100%' : '0%',
                    background: isCompleted ? '#00dc64' : '#ffb400',
                  }} />
                </div>
              )}
            </div>
          )
        })()}
      </div>

      <button style={styles.btnPlay} onClick={() => navigate('/queue')}>
        ⚽ Buscar partido
      </button>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: '#141414', padding: '2rem 1.5rem', gap: '1.25rem', overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: '#fff', fontSize: '1.1rem', padding: '6px 12px', cursor: 'pointer' },
  title: { fontSize: '1.2rem', fontWeight: '800', color: '#fff', margin: 0 },
  totalBadge: { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.15)', borderRadius: '20px', padding: '6px 14px', alignSelf: 'center' },
  totalBadgeText: { fontSize: '0.75rem', color: '#ffb400', fontWeight: '700' },
  streakCard: { background: 'rgba(255,180,0,0.06)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  streakTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  streakLabel: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', margin: '0 0 4px' },
  streakRow: { display: 'flex', alignItems: 'center', gap: '0.4rem' },
  streakNumber: { fontSize: '3.5rem', fontWeight: '900', color: '#ffb400', lineHeight: 1 },
  streakFire: { fontSize: '2rem', lineHeight: 1 },
  streakSub: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', margin: '4px 0 0' },
  streakRight: { textAlign: 'right' },
  streakMilestoneLabel: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', margin: '0 0 2px' },
  streakMilestoneVal: { fontSize: '1.4rem', fontWeight: '900', color: '#fff', margin: 0 },
  streakMilestoneReward: { fontSize: '0.85rem', fontWeight: '700', color: '#ffb400', margin: '2px 0' },
  streakMilestoneDays: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', margin: 0 },
  streakCircles: { display: 'flex', gap: '0.5rem', justifyContent: 'center' },
  streakCircle: { width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s ease' },
  streakHint: { fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', margin: 0, textAlign: 'center' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', margin: 0 },
  sectionSub: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', margin: 0 },
  missionsList: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  missionsNote: { fontSize: '0.72rem', color: 'rgba(255,80,80,0.7)', margin: '-0.25rem 0 0' },
  missionCard: { border: '1px solid', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', transition: 'all 0.3s ease' },
  missionTop: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  missionIcon: { fontSize: '1.5rem', flexShrink: 0 },
  missionInfo: { flex: 1 },
  missionName: { fontSize: '0.9rem', fontWeight: '800', color: '#fff', margin: '0 0 2px' },
  missionDesc: { fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', margin: '0 0 3px' },
  missionReward: { fontSize: '0.72rem', color: '#ffb400', margin: 0, fontWeight: '600' },
  missionDone: { fontSize: '1.1rem', color: '#00dc64', fontWeight: '900', flexShrink: 0 },
  missionProgress: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontWeight: '700', flexShrink: 0 },
  missionBarBg: { height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' },
  missionBarFill: { height: '100%', borderRadius: '2px', transition: 'width 0.5s ease' },
  btnPlay: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '1.1rem', fontSize: '1rem', fontWeight: '800', cursor: 'pointer', width: '100%', marginTop: 'auto' },
}
