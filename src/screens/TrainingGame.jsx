import { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const CSS = `
  @keyframes trainIn { from{opacity:0} to{opacity:1} }
  @keyframes goalFlash { 0%{opacity:0;transform:scale(0.8)} 20%{opacity:1;transform:scale(1.1)} 60%{opacity:1;transform:scale(1)} 100%{opacity:0} }
  @keyframes missFlash { 0%{opacity:0;transform:scale(0.8)} 20%{opacity:1;transform:scale(1.05)} 60%{opacity:1} 100%{opacity:0} }
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

const BARRIER_OPTIONS = {
  world_class: [[20,25],[30,35],[40,45]],
  national:    [[20,30],[30,40],[40,50]],
  amateur:     [[20,35],[35,50],[50,65]],
}

const PENALTY_WINDOWS = {
  world_class: { min: 40, max: 60 },
  national:    { min: 20, max: 80 },
  amateur:     null,
}

const DIFF_LABELS = {
  world_class: 'World Class',
  national: 'National Class',
  amateur: 'Amateur',
}

const DIFF_COLORS = {
  world_class: '#ff4444',
  national: '#ffb400',
  amateur: '#22c55e',
}

export default function TrainingGame() {
  const { type, difficulty } = useParams()
  const navigate = useNavigate()
  const [player, setPlayer] = useState(null)
  const [centesimas, setCentesimas] = useState(0)
  const [running, setRunning] = useState(false)
  const [choice, setChoice] = useState(null) // par/impar para penalties
  const [barrier, setBarrier] = useState(null) // {min,max} para faltas
  const [flash, setFlash] = useState(null) // 'goal' | 'miss'
  const [lastResult, setLastResult] = useState(null)
  const [sessionStats, setSessionStats] = useState({ shots: 0, goals: 0, streak: 0, bestStreak: 0 })
  const [phase, setPhase] = useState('choose') // 'choose' | 'ready' | 'running' | 'result'

  const intervalRef = useRef(null)
  const startPerfRef = useRef(null)
  const offsetRef = useRef(0)
  const runningRef = useRef(false)
  const playerRef = useRef(null)
  const lastTapRef = useRef(0)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)
    init()
    return () => clearInterval(intervalRef.current)
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)
    playerRef.current = p
    setupRound()
  }

  function setupRound() {
    clearInterval(intervalRef.current)
    offsetRef.current = 0
    setCentesimas(0)
    setRunning(false)
    runningRef.current = false
    setChoice(null)
    setFlash(null)
    setLastResult(null)
    if (type === 'falta') {
      const opts = BARRIER_OPTIONS[difficulty]
      const pick = opts[Math.floor(Math.random() * opts.length)]
      setBarrier({ min: pick[0], max: pick[1] })
      setPhase('ready')
    } else {
      setBarrier(null)
      setPhase('choose')
    }
  }

  function handleChoicePenalty(c) {
    setChoice(c)
    setPhase('ready')
  }

  function handleTap(e) {
    if (e) e.preventDefault()
    const now = Date.now()
    if (now - lastTapRef.current < 30) return
    lastTapRef.current = now
    if (phase !== 'ready' && phase !== 'running') return

    if (!runningRef.current) {
      // START
      startPerfRef.current = performance.now()
      offsetRef.current = 0
      runningRef.current = true
      setRunning(true)
      setPhase('running')
      const v = Date.now()
      intervalRef.current = setInterval(() => {
        setCentesimas(Math.floor((performance.now() - startPerfRef.current) / 10))
      }, 10)
    } else {
      // STOP
      clearInterval(intervalRef.current)
      const total = Math.floor((performance.now() - startPerfRef.current) / 10)
      setCentesimas(total)
      runningRef.current = false
      setRunning(false)
      resolveShot(total)
    }
  }

  async function resolveShot(total) {
    setPhase('result')
    const cents = total % 100
    let gol = false
    let msg = ''

    if (type === 'penalty') {
      const last1 = total % 10
      const parImpar = choice === 'par' ? last1 % 2 === 0 : last1 % 2 !== 0
      const window = PENALTY_WINDOWS[difficulty]
      const inWindow = window ? (cents >= window.min && cents <= window.max) : true
      gol = parImpar && inWindow
      if (gol) msg = `⚽ GOL — ${cents} (${choice}, dentro de ventana)`
      else if (!parImpar) msg = `🥅 Fallo — ${cents} (no era ${choice})`
      else msg = `🥅 Fallo — ${cents} (fuera de ventana ${window?.min}–${window?.max})`
    } else {
      gol = cents >= barrier.min && cents <= barrier.max
      msg = gol ? `⚽ GOL — ${cents} (en ${barrier.min}–${barrier.max})` : `🧤 Fallo — ${cents} (fuera de ${barrier.min}–${barrier.max})`
    }

    setFlash(gol ? 'goal' : 'miss')
    setLastResult(msg)
    setTimeout(() => setFlash(null), 800)

    setSessionStats(prev => {
      const newStreak = gol ? prev.streak + 1 : 0
      return {
        shots: prev.shots + 1,
        goals: prev.goals + (gol ? 1 : 0),
        streak: newStreak,
        bestStreak: Math.max(prev.bestStreak, newStreak),
      }
    })

    await supabase.from('training_sessions').insert({
      player_id: playerRef.current.id,
      type,
      difficulty,
      result: gol,
      centesima: cents,
      choice: type === 'penalty' ? choice : null,
      barrier_min: type === 'falta' ? barrier.min : null,
      barrier_max: type === 'falta' ? barrier.max : null,
    })

    setTimeout(() => setupRound(), 1200)
  }

  const secs = Math.floor(centesimas / 100)
  const cents = String(centesimas % 100).padStart(2, '0')
  const diffColor = DIFF_COLORS[difficulty]
  const window = PENALTY_WINDOWS[difficulty]

  return (
    <div style={styles.container}>
      {/* Flash */}
      {flash && (
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none',zIndex:50}}>
          <span style={{fontSize:'4rem',fontWeight:'900',color: flash==='goal' ? '#ffb400' : '#ff4444',animation: flash==='goal' ? 'goalFlash 0.8s ease forwards' : 'missFlash 0.8s ease forwards'}}>
            {flash === 'goal' ? 'GOL' : 'FALLO'}
          </span>
        </div>
      )}

      {/* Header */}
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate('/academy')}>←</button>
        <div>
          <span style={{...styles.diffTag, color: diffColor, borderColor: diffColor, background: `${diffColor}15`}}>{DIFF_LABELS[difficulty]}</span>
          <div style={styles.typeLabel}>{type === 'penalty' ? '🥅 Penalty' : '🧤 Falta'}</div>
        </div>
        <div style={styles.sessionStats}>
          <span style={styles.statChip}>{sessionStats.goals}/{sessionStats.shots}</span>
          {sessionStats.streak > 1 && <span style={{...styles.statChip, color:'#ffb400', borderColor:'rgba(255,180,0,0.3)'}}>🔥{sessionStats.streak}</span>}
        </div>
      </div>

      {/* Barrera (faltas) */}
      {type === 'falta' && barrier && (
        <div style={styles.barrierBox}>
          <p style={styles.barrierLabel}>Para entre</p>
          <p style={styles.barrierRange}>{barrier.min} — {barrier.max}</p>
        </div>
      )}

      {/* Ventana penalty */}
      {type === 'penalty' && window && phase !== 'choose' && (
        <div style={styles.barrierBox}>
          <p style={styles.barrierLabel}>Ventana válida</p>
          <p style={styles.barrierRange}>{window.min} — {window.max}</p>
          {choice && <p style={styles.choiceTag}>Elegiste: <strong>{choice.toUpperCase()}</strong></p>}
        </div>
      )}

      {/* Cronómetro */}
      <div style={styles.timerArea}>
        <div style={styles.timer}>
          <span style={styles.timerSecs}>{String(secs).padStart(2,'0')}</span>
          <span style={styles.timerDot}>.</span>
          <span style={styles.timerCents}>{cents}</span>
        </div>
      </div>

      {/* Fase: elegir par/impar */}
      {phase === 'choose' && type === 'penalty' && (
        <div style={styles.choiceArea}>
          <p style={styles.choiceTitle}>Elige par o impar</p>
          <div style={styles.choiceRow}>
            <button style={styles.choiceBtn} onClick={() => handleChoicePenalty('par')}>PAR</button>
            <button style={styles.choiceBtn} onClick={() => handleChoicePenalty('impar')}>IMPAR</button>
          </div>
        </div>
      )}

      {/* Botón START/STOP */}
      {(phase === 'ready' || phase === 'running') && (
        <div style={styles.btnArea}>
          <button
            style={{...styles.btn, background: running ? '#ff4444' : '#ffb400', boxShadow: running ? '0 0 0 8px rgba(255,68,68,0.1),0 0 0 16px rgba(255,68,68,0.05)' : '0 0 0 8px rgba(255,180,0,0.1),0 0 0 16px rgba(255,180,0,0.05)'}}
            onTouchEnd={handleTap}
            onClick={handleTap}
          >
            <div style={{width: running ? '22px':'16px', height: running ? '22px':'16px', background:'#141414', borderRadius: running ? '4px':'50%'}} />
            <span style={styles.btnText}>{running ? 'PARAR' : 'START'}</span>
          </button>
        </div>
      )}

      {/* Último resultado */}
      {lastResult && (
        <p style={styles.lastResult}>{lastResult}</p>
      )}
    </div>
  )
}

const styles = {
  container: { height:'100%', display:'flex', flexDirection:'column', padding:'3.5rem 1.5rem 2rem', background:'#141414', position:'relative', animation:'trainIn 0.3s ease forwards' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.5rem' },
  back: { background:'transparent', border:'none', color:'rgba(255,255,255,0.4)', fontSize:'1.4rem', cursor:'pointer', padding:0 },
  diffTag: { fontSize:'0.72rem', fontWeight:'800', border:'1px solid', borderRadius:'6px', padding:'2px 8px', letterSpacing:'0.3px' },
  typeLabel: { fontSize:'0.85rem', color:'rgba(255,255,255,0.4)', marginTop:'2px' },
  sessionStats: { display:'flex', gap:'6px', alignItems:'center' },
  statChip: { fontSize:'0.78rem', fontWeight:'700', color:'rgba(255,255,255,0.5)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'20px', padding:'3px 10px' },
  barrierBox: { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'14px', padding:'1rem', textAlign:'center', marginBottom:'1rem' },
  barrierLabel: { fontSize:'0.7rem', color:'rgba(255,255,255,0.3)', letterSpacing:'1px', textTransform:'uppercase', margin:'0 0 4px' },
  barrierRange: { fontSize:'2rem', fontWeight:'900', color:'#ffb400', margin:0, letterSpacing:'-1px' },
  choiceTag: { fontSize:'0.78rem', color:'rgba(255,255,255,0.4)', margin:'6px 0 0' },
  timerArea: { flex:1, display:'flex', alignItems:'center', justifyContent:'center' },
  timer: { display:'flex', alignItems:'baseline', gap:'2px' },
  timerSecs: { fontSize:'5rem', fontWeight:'900', color:'#fff', letterSpacing:'-3px', lineHeight:1 },
  timerDot: { fontSize:'3rem', fontWeight:'900', color:'rgba(255,255,255,0.3)' },
  timerCents: { fontSize:'3.5rem', fontWeight:'900', color:'#ffb400', letterSpacing:'-2px', lineHeight:1 },
  choiceArea: { textAlign:'center', marginBottom:'1.5rem' },
  choiceTitle: { fontSize:'0.85rem', color:'rgba(255,255,255,0.4)', marginBottom:'0.75rem' },
  choiceRow: { display:'flex', gap:'0.75rem', justifyContent:'center' },
  choiceBtn: { background:'rgba(255,180,0,0.1)', border:'1.5px solid rgba(255,180,0,0.4)', borderRadius:'14px', padding:'1rem 2rem', fontSize:'1.1rem', fontWeight:'900', color:'#ffb400', cursor:'pointer' },
  btnArea: { display:'flex', justifyContent:'center', marginBottom:'1.5rem' },
  btn: { width:'130px', height:'130px', borderRadius:'50%', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'6px', WebkitTapHighlightColor:'transparent' },
  btnText: { fontSize:'0.8rem', fontWeight:'900', color:'#141414', letterSpacing:'1px' },
  lastResult: { textAlign:'center', fontSize:'0.85rem', color:'rgba(255,255,255,0.4)', padding:'0.5rem' },
}
