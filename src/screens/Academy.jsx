import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CSS = `
  @keyframes academyIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`

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

const DIFFICULTIES = [
  { id: 'amateur', label: 'Amateur', color: '#22c55e', desc: 'Sin restricción de ventana' },
  { id: 'national', label: 'National Class', color: '#ffb400', desc: 'Centésima entre 20–80' },
  { id: 'world_class', label: 'World Class', color: '#ff4444', desc: 'Centésima entre 40–60' },
]

export default function Academy() {
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [streaks, setStreaks] = useState({})
  const [showInfo, setShowInfo] = useState(false)

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

    const { data } = await supabase
      .from('training_stats')
      .select('*')
      .eq('player_id', p.id)
    
    if (data) {
      const map = {}
      data.forEach(s => { map[`${s.type}_${s.difficulty}`] = s })
      setStats(map)

      // Cargar mejor racha para cada combinación con datos
      const streakMap = {}
      await Promise.all(data.map(async s => {
        const { data: streak } = await supabase.rpc('get_best_streak', {
          p_player_id: p.id,
          p_type: s.type,
          p_difficulty: s.difficulty
        })
        streakMap[`${s.type}_${s.difficulty}`] = streak || 0
      }))
      setStreaks(streakMap)
    }
    setLoading(false)
  }

  function getStreak(type, diff) {
    return streaks[`${type}_${diff}`] || 0
  }

  function getStats(type, diff) {
    return stats[`${type}_${diff}`] || null
  }

  function startTraining(type, difficulty) {
    navigate(`/academy/train/${type}/${difficulty}`)
  }

  if (loading) return (
    <div style={styles.container}>
      <p style={{color:'rgba(255,255,255,0.3)',textAlign:'center'}}>Cargando...</p>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate('/')}>←</button>
        <div>
          <div style={styles.title}>Academy</div>
          <div style={styles.titleLine} />
        </div>
      </div>

      <p style={styles.subtitle}>Entrena tu precisión. Sin límites, sin skills.</p>

      <button style={styles.infoBtn} onClick={() => setShowInfo(v => !v)}>
        {showInfo ? '▲ Ocultar instrucciones' : '▼ ¿Cómo funciona la Academy?'}
      </button>

      {showInfo && (
        <div style={styles.infoBox}>
          <p style={styles.infoTitle}>Cómo funciona</p>
          <div style={styles.infoSection}>
            <p style={styles.infoSub}>🥅 Penalties</p>
            <p style={styles.infoText}>Elige par o impar y para el cronómetro. Para marcar gol la centésima final ha de ser del tipo elegido (par o impar).</p>
            <p style={styles.infoText}>• <strong style={{color:'#22c55e'}}>Amateur</strong> — solo acertar par/impar, sin restricción de centésima.</p>
            <p style={styles.infoText}>• <strong style={{color:'#ffb400'}}>National Class</strong> — acertar par/impar y centésima entre 20–80.</p>
            <p style={styles.infoText}>• <strong style={{color:'#ff4444'}}>World Class</strong> — acertar par/impar y centésima entre 40–60.</p>
          </div>
          <div style={styles.infoSection}>
            <p style={styles.infoSub}>🧤 Faltas</p>
            <p style={styles.infoText}>El sistema elige una barrera aleatoria. Para marcar gol la centésima final ha de caer dentro de la ventana.</p>
            <p style={styles.infoText}>• <strong style={{color:'#22c55e'}}>Amateur</strong> — ventana de 15 centésimas (ej: 20–35).</p>
            <p style={styles.infoText}>• <strong style={{color:'#ffb400'}}>National Class</strong> — ventana de 10 centésimas (ej: 20–30).</p>
            <p style={styles.infoText}>• <strong style={{color:'#ff4444'}}>World Class</strong> — ventana de 5 centésimas (ej: 20–25).</p>
          </div>
          <div style={styles.infoSection}>
            <p style={styles.infoSub}>📊 Estadísticas</p>
            <p style={styles.infoText}>• <strong style={{color:'#fff'}}>%</strong> — porcentaje de acierto acumulado desde el primer entrenamiento.</p>
            <p style={styles.infoText}>• <strong style={{color:'#fff'}}>G/T</strong> — goles marcados sobre total de tiros.</p>
            <p style={styles.infoText}>• <strong style={{color:'#ffb400'}}>🔥N</strong> — mejor racha de goles consecutivos conseguida hasta la fecha.</p>
          </div>
        </div>
      )}

      {/* PENALTIES */}
      <div style={styles.section}>
        <p style={styles.sectionTitle}>🥅 Penalties</p>
        <div style={styles.diffList}>
          {DIFFICULTIES.map(d => {
            const s = getStats('penalty', d.id)
            return (
              <button key={d.id} style={styles.diffCard} onClick={() => startTraining('penalty', d.id)}>
                <div style={styles.diffLeft}>
                  <span style={{...styles.diffBadge, color: d.color, borderColor: d.color, background: `${d.color}15`}}>{d.label}</span>
                  <span style={styles.diffDesc}>{d.desc}</span>
                </div>
                <div style={styles.diffStats}>
                  {s ? (
                    <>
                      <span style={styles.diffPct}>{s.pct}%</span>
                      <span style={styles.diffTotal}>{s.goals}/{s.total_shots}</span>
                      {getStreak('penalty', d.id) > 0 && <span style={styles.streakBadge}>🔥{getStreak('penalty', d.id)}</span>}
                    </>
                  ) : (
                    <span style={styles.diffNew}>Nuevo</span>
                  )}
                  <span style={styles.diffArrow}>›</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* FALTAS */}
      <div style={styles.section}>
        <p style={styles.sectionTitle}>🧤 Faltas</p>
        <div style={styles.diffList}>
          {DIFFICULTIES.map(d => {
            const s = getStats('falta', d.id)
            const barrierDesc = d.id === 'world_class' ? 'Ventana 5 cents' : d.id === 'national' ? 'Ventana 10 cents' : 'Ventana 15 cents'
            return (
              <button key={d.id} style={styles.diffCard} onClick={() => startTraining('falta', d.id)}>
                <div style={styles.diffLeft}>
                  <span style={{...styles.diffBadge, color: d.color, borderColor: d.color, background: `${d.color}15`}}>{d.label}</span>
                  <span style={styles.diffDesc}>{barrierDesc}</span>
                </div>
                <div style={styles.diffStats}>
                  {s ? (
                    <>
                      <span style={styles.diffPct}>{s.pct}%</span>
                      <span style={styles.diffTotal}>{s.goals}/{s.total_shots}</span>
                      {getStreak('falta', d.id) > 0 && <span style={styles.streakBadge}>🔥{getStreak('falta', d.id)}</span>}
                    </>
                  ) : (
                    <span style={styles.diffNew}>Nuevo</span>
                  )}
                  <span style={styles.diffArrow}>›</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: { height:'100%', display:'flex', flexDirection:'column', padding:'3.5rem 1.5rem 2rem', background:'#141414', overflowY:'auto', animation:'academyIn 0.4s ease forwards' },
  header: { display:'flex', alignItems:'center', gap:'1rem', marginBottom:'0.5rem' },
  back: { background:'transparent', border:'none', color:'rgba(255,255,255,0.4)', fontSize:'1.4rem', cursor:'pointer', padding:0 },
  title: { fontSize:'2rem', fontWeight:'900', color:'#fff', letterSpacing:'-1px', lineHeight:1 },
  titleLine: { height:'3px', width:'36px', background:'#ffb400', borderRadius:'2px', marginTop:'3px' },
  subtitle: { fontSize:'0.82rem', color:'rgba(255,255,255,0.3)', margin:'0 0 1.5rem', letterSpacing:'0.3px' },
  section: { marginBottom:'1.5rem' },
  sectionTitle: { fontSize:'0.75rem', fontWeight:'800', color:'rgba(255,255,255,0.4)', letterSpacing:'1.5px', textTransform:'uppercase', margin:'0 0 0.75rem' },
  diffList: { display:'flex', flexDirection:'column', gap:'0.5rem' },
  diffCard: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'14px', padding:'0.9rem 1rem', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer', width:'100%', textAlign:'left' },
  diffLeft: { display:'flex', flexDirection:'column', gap:'3px' },
  diffBadge: { fontSize:'0.78rem', fontWeight:'800', border:'1px solid', borderRadius:'6px', padding:'2px 8px', width:'fit-content', letterSpacing:'0.3px' },
  diffDesc: { fontSize:'0.72rem', color:'rgba(255,255,255,0.3)' },
  diffStats: { display:'flex', alignItems:'center', gap:'8px' },
  diffPct: { fontSize:'1rem', fontWeight:'900', color:'#ffb400' },
  diffTotal: { fontSize:'0.7rem', color:'rgba(255,255,255,0.3)' },
  diffNew: { fontSize:'0.72rem', color:'rgba(255,255,255,0.2)', fontStyle:'italic' },
  infoBtn: { background:'transparent', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'10px', padding:'0.6rem 1rem', color:'rgba(255,255,255,0.35)', fontSize:'0.78rem', cursor:'pointer', width:'100%', textAlign:'left', marginBottom:'0.75rem' },
  infoBox: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'14px', padding:'1rem', marginBottom:'1rem' },
  infoTitle: { fontSize:'0.75rem', fontWeight:'800', color:'rgba(255,255,255,0.5)', letterSpacing:'1px', textTransform:'uppercase', margin:'0 0 0.75rem' },
  infoSection: { marginBottom:'0.75rem' },
  infoSub: { fontSize:'0.82rem', fontWeight:'800', color:'#ffb400', margin:'0 0 0.35rem' },
  infoText: { fontSize:'0.78rem', color:'rgba(255,255,255,0.45)', lineHeight:1.5, margin:'0 0 0.2rem' },
  streakBadge: { fontSize:'0.78rem', fontWeight:'800', color:'#ffb400' },
  diffArrow: { fontSize:'1.2rem', color:'rgba(255,255,255,0.2)' },
}
