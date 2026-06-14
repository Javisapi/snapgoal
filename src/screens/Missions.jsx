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
  win_streak_3:    { label: 'Gana 3 partidos seguidos',        icon: '🏆', reward: '1 🎯 + 1 🧤' },
  goals_20:        { label: 'Mete 20 goles hoy',               icon: '⚽', reward: '2 🎯 + 2 🧤' },
  clean_sheet_win: { label: 'Gana sin recibir ningún gol',     icon: '🛡️', reward: '1 🎯 + 1 🧤' },
  falta_goals_10:  { label: 'Mete 10 goles de falta',          icon: '🧤', reward: '2 🎯 + 2 🧤' },
  play_10:         { label: 'Juega 10 partidos hoy',           icon: '🎮', reward: '2 🎯 + 2 🧤' },
}

export default function Missions() {
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [streak, setStreak] = useState(null)
  const [missions, setMissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { init() }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)

    const today = new Date().toISOString().split('T')[0]

    // Cargar racha
    const { data: streakData } = await supabase
      .from('daily_streaks').select('*').eq('player_id', p.id).single()
    setStreak(streakData || { current_streak: 0, longest_streak: 0, last_played_date: null })

    // Cargar misiones de hoy
    const { data: missionsData } = await supabase
      .from('daily_missions')
      .select('*')
      .eq('player_id', p.id)
      .eq('date', today)

    // Si no hay misiones creadas aún, mostrarlas vacías
    if (!missionsData || missionsData.length === 0) {
      const empty = Object.keys(MISSION_META).map(type => ({
        mission_type: type, progress: 0,
        target: { win_streak_3: 3, goals_20: 20, clean_sheet_win: 1, falta_goals_10: 10, play_10: 10 }[type],
        completed: false, reward_claimed: false,
      }))
      setMissions(empty)
    } else {
      setMissions(missionsData)
    }

    setLoading(false)
  }

  const nextMilestone = streak ? Math.ceil((streak.current_streak + 1) / 5) * 5 : 5
  const daysToMilestone = streak ? nextMilestone - streak.current_streak : 5
  const milestoneRewardTimes = nextMilestone / 5
  const milestoneReward = `${milestoneRewardTimes + 1} 🎯 + ${milestoneRewardTimes + 1} 🧤`

  if (loading) return (
    <div style={styles.container}>
      <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Cargando...</p>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>←</button>
        <h1 style={styles.title}>⚡ Desafíos</h1>
        <div style={{ width: '36px' }} />
      </div>

      {/* Racha */}
      <div style={styles.streakCard}>
        <div style={styles.streakTop}>
          <div>
            <p style={styles.streakLabel}>RACHA ACTUAL</p>
            <div style={styles.streakRow}>
              <span style={styles.streakNumber}>{streak?.current_streak || 0}</span>
              <span style={styles.streakFire}>🔥</span>
            </div>
            <p style={styles.streakSub}>Mejor racha: {streak?.longest_streak || 0} días</p>
          </div>
          <div style={styles.streakRight}>
            <p style={styles.streakMilestoneLabel}>PRÓXIMO HITO</p>
            <p style={styles.streakMilestoneVal}>{nextMilestone} días</p>
            <p style={styles.streakMilestoneReward}>{milestoneReward}</p>
            <p style={styles.streakMilestoneDays}>Faltan {daysToMilestone} día{daysToMilestone !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {/* Barra de progreso hacia el siguiente hito */}
        <div style={styles.streakBarBg}>
          <div style={{
            ...styles.streakBarFill,
            width: `${((streak?.current_streak || 0) % 5) / 5 * 100}%`
          }} />
        </div>
        <p style={styles.streakHint}>
          {streak?.current_streak > 0
            ? `Último partido: ${streak?.last_played_date || '—'} · Juega hoy para mantener la racha`
            : 'Juega un partido hoy para empezar tu racha'}
        </p>
      </div>

      {/* Misiones del día */}
      <div style={styles.sectionHeader}>
        <p style={styles.sectionTitle}>MISIONES DE HOY</p>
        <p style={styles.sectionSub}>Se reinician cada día a medianoche</p>
      </div>

      <div style={styles.missionsList}>
        {missions.map(m => {
          const meta = MISSION_META[m.mission_type]
          if (!meta) return null
          const pct = Math.min(m.progress / m.target, 1)
          return (
            <div key={m.mission_type} style={{
              ...styles.missionCard,
              opacity: m.completed ? 0.6 : 1,
              borderColor: m.completed ? 'rgba(0,220,100,0.3)' : 'rgba(255,255,255,0.08)',
            }}>
              <div style={styles.missionTop}>
                <span style={styles.missionIcon}>{meta.icon}</span>
                <div style={styles.missionInfo}>
                  <p style={styles.missionLabel}>{meta.label}</p>
                  <p style={styles.missionReward}>Recompensa: {meta.reward}</p>
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
  streakCard: { background: 'rgba(255,180,0,0.06)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '16px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
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
  streakBarBg: { height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' },
  streakBarFill: { height: '100%', background: '#ffb400', borderRadius: '2px', transition: 'width 0.5s ease' },
  streakHint: { fontSize: '0.72rem', color: 'rgba(255,255,255,0.25)', margin: 0, textAlign: 'center' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionTitle: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', margin: 0 },
  sectionSub: { fontSize: '0.65rem', color: 'rgba(255,255,255,0.2)', margin: 0 },
  missionsList: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  missionCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid', borderRadius: '14px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  missionTop: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  missionIcon: { fontSize: '1.5rem', flexShrink: 0 },
  missionInfo: { flex: 1 },
  missionLabel: { fontSize: '0.88rem', fontWeight: '700', color: '#fff', margin: '0 0 2px' },
  missionReward: { fontSize: '0.72rem', color: '#ffb400', margin: 0, fontWeight: '600' },
  missionDone: { fontSize: '1.1rem', color: '#00dc64', fontWeight: '900', flexShrink: 0 },
  missionProgress: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontWeight: '700', flexShrink: 0 },
  missionBarBg: { height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' },
  missionBarFill: { height: '100%', borderRadius: '2px', transition: 'width 0.5s ease' },
  btnPlay: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '1.1rem', fontSize: '1rem', fontWeight: '800', cursor: 'pointer', width: '100%', marginTop: 'auto' },
}
