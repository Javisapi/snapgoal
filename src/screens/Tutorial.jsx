import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const CSS = `
  @keyframes slideIn { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }
  @keyframes slideOut { from{opacity:1;transform:translateX(0)} to{opacity:0;transform:translateX(-40px)} }
  @keyframes goalPop { 0%{opacity:0;transform:scale(0.3) rotate(-8deg)} 60%{transform:scale(1.15) rotate(2deg)} 100%{opacity:1;transform:scale(1) rotate(0deg)} }
  @keyframes goalRing { 0%{transform:scale(0.5);opacity:1} 100%{transform:scale(2.5);opacity:0} }
  @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
  @keyframes cardShake { 0%,100%{transform:translateX(0) rotate(0)} 20%{transform:translateX(-8px) rotate(-3deg)} 40%{transform:translateX(8px) rotate(3deg)} 60%{transform:translateX(-4px) rotate(-1deg)} 80%{transform:translateX(4px) rotate(1deg)} }
  @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes glow { 0%,100%{box-shadow:0 0 10px rgba(255,180,0,0.3)} 50%{box-shadow:0 0 30px rgba(255,180,0,0.8)} }
  @keyframes countUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes streakFire { 0%,100%{transform:scale(1) rotate(-3deg)} 50%{transform:scale(1.2) rotate(3deg)} }
  @keyframes pillIn { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }
`

// Slide 1 — Bienvenida
function SlideWelcome() {
  return (
    <div style={S.slide}>
      <div style={{position:'relative',display:'flex',alignItems:'center',justifyContent:'center',marginBottom:'0.5rem'}}>
        <div style={{position:'absolute',width:'120px',height:'120px',borderRadius:'50%',border:'2px solid rgba(255,180,0,0.3)',animation:'pulse 2s ease-in-out infinite'}}/>
        <div style={{position:'absolute',width:'80px',height:'80px',borderRadius:'50%',border:'2px solid rgba(255,180,0,0.2)',animation:'pulse 2s ease-in-out infinite 0.3s'}}/>
        <span style={{fontSize:'4.5rem',lineHeight:1,position:'relative',zIndex:1}}>⚽</span>
      </div>
      <h2 style={S.title}>Bienvenido a<br/><span style={{color:'#ffb400'}}>SnapGoal</span></h2>
      <p style={S.desc}>El fútbol más rápido del mundo.<br/>30 segundos. Un cronómetro compartido.<br/><strong style={{color:'rgba(255,255,255,0.9)'}}>Gana el más preciso.</strong></p>
    </div>
  )
}

// Slide 2 — Cronómetro animado 18:47 → 19:00
function SlideCronometro() {
  const [totalCents, setTotalCents] = useState(1847)
  const [running, setRunning] = useState(false)
  const [gol, setGol] = useState(false)
  const intervalRef = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setRunning(true)
      startRef.current = performance.now()
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((performance.now() - startRef.current) / 10)
        const val = 1847 + elapsed
        setTotalCents(val)
        if (val >= 1900) {
          clearInterval(intervalRef.current)
          setTotalCents(1900)
          setRunning(false)
          setGol(true)
        }
      }, 10)
    }, 800)
    return () => { clearTimeout(t); clearInterval(intervalRef.current) }
  }, [])

  const secs = Math.floor(totalCents / 100)
  const cents = totalCents % 100

  return (
    <div style={S.slide}>
      <p style={S.eyebrow}>EL CRONÓMETRO</p>
      <div style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',gap:'0.75rem'}}>
        {gol && <div style={{position:'absolute',width:'200px',height:'200px',borderRadius:'50%',border:'3px solid #ffb400',animation:'goalRing 0.8s ease-out forwards',pointerEvents:'none'}}/>}
        <div style={{...S.timerBox, borderColor: running ? 'rgba(255,180,0,0.6)' : gol ? '#ffb400' : 'rgba(255,255,255,0.1)', boxShadow: running ? '0 0 30px rgba(255,180,0,0.3)' : 'none', transition:'all 0.3s ease'}}>
          <span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.3)',letterSpacing:'3px',marginBottom:'4px'}}>SEG : CEN</span>
          <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
            <span style={{fontSize:'4rem',fontWeight:'900',color: gol ? '#ffb400' : running ? '#fff' : 'rgba(255,255,255,0.6)',fontVariantNumeric:'tabular-nums',transition:'color 0.2s'}}>{String(secs).padStart(2,'0')}</span>
            <span style={{fontSize:'3rem',color:'rgba(255,255,255,0.3)'}}>:</span>
            <span style={{fontSize:'4rem',fontWeight:'900',color: gol ? '#ffb400' : running ? '#fff' : 'rgba(255,255,255,0.6)',fontVariantNumeric:'tabular-nums',transition:'color 0.2s'}}>{String(cents).padStart(2,'0')}</span>
          </div>
        </div>
        {gol && (
          <div style={{animation:'goalPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards',opacity:0}}>
            <span style={{fontSize:'3rem',fontWeight:'900',color:'#ffb400',letterSpacing:'-1px'}}>⚽ GOL DIRECTO</span>
          </div>
        )}
      </div>
      {!gol
        ? <p style={S.desc}>{running ? 'El cronómetro corre... ¡para en :00!' : 'START → STOP. La centésima decide.'}</p>
        : <p style={{...S.desc,color:'#ffb400',fontWeight:'700'}}>¡:00 = Gol directo!</p>
      }
    </div>
  )
}

// Slide 3 — Eventos tabla animada
function SlideEventos() {
  const [visible, setVisible] = useState(0)
  const rows = [
    { cent: ':00', event: 'Gol directo', emoji: '⚽' },
    { cent: ':99', event: 'Penalty',     emoji: '🥅' },
    { cent: ':98', event: 'Falta',       emoji: '🧤' },
    { cent: ':97', event: 'Córner',      emoji: '🚩' },
    { cent: ':13', event: 'Gol en propia', emoji: '💥' },
  ]
  useEffect(() => {
    let i = 0
    const t = setInterval(() => {
      i++
      setVisible(i)
      if (i >= rows.length) clearInterval(t)
    }, 350)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={S.slide}>
      <p style={S.eyebrow}>CENTÉSIMAS ESPECIALES</p>
      <h2 style={S.title}>Cada número<br/><span style={{color:'#ffb400'}}>tiene su destino</span></h2>
      <div style={{width:'100%',display:'flex',flexDirection:'column',gap:'0.4rem'}}>
        {rows.map((row, i) => (
          <div key={i} style={{
            display: i < visible ? 'flex' : 'none',
            justifyContent:'space-between',alignItems:'center',
            background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',
            borderRadius:'12px',padding:'0.65rem 1rem',
            animation:'fadeUp 0.3s ease forwards',
          }}>
            <span style={{fontSize:'1.1rem',fontWeight:'900',color:'#ffb400',fontVariantNumeric:'tabular-nums',minWidth:'36px'}}>{row.cent}</span>
            <span style={{fontSize:'0.9rem',color:'rgba(255,255,255,0.7)',fontWeight:'600'}}>{row.event}</span>
            <span style={{fontSize:'1.3rem'}}>{row.emoji}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Slide 4 — Penalty interactivo con cronómetro real
function SlidePenalty() {
  const [chosen, setChosen] = useState(null)
  const [phase, setPhase] = useState('choose') // choose | shoot | result
  const [totalCents, setTotalCents] = useState(0)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)
  const intervalRef = useRef(null)
  const startRef = useRef(null)
  const baseRef = useRef(0)

  function startTimer() {
    if (running) return
    baseRef.current = totalCents
    startRef.current = performance.now()
    setRunning(true)
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((performance.now() - startRef.current) / 10)
      setTotalCents(baseRef.current + elapsed)
    }, 10)
  }

  function stopTimer() {
    if (!running) return
    clearInterval(intervalRef.current)
    const elapsed = Math.floor((performance.now() - startRef.current) / 10)
    const total = baseRef.current + elapsed
    setTotalCents(total)
    setRunning(false)
    const last1 = total % 10
    const last2 = total % 100
    const inRange = last2 >= 30 && last2 <= 70
    const gol = (chosen === 'par' ? last1 % 2 === 0 : last1 % 2 !== 0) && inRange
    setResult(gol)
    setPhase('result')
  }

  function reset() {
    clearInterval(intervalRef.current)
    setChosen(null)
    setPhase('choose')
    setTotalCents(0)
    setRunning(false)
    setResult(null)
    baseRef.current = 0
  }

  const secs = Math.floor(totalCents / 100)
  const cents = totalCents % 100
  const last1 = totalCents % 10

  return (
    <div style={S.slide}>
      <span style={{fontSize:'2.5rem',lineHeight:1}}>🥅</span>
      <h2 style={{...S.title,fontSize:'1.5rem'}}><span style={{color:'#ffb400'}}>Penalty</span> — ¡Pruébalo!</h2>

      {phase === 'choose' && (
        <>
          <p style={S.desc}>Paraste en :99. Elige PAR o IMPAR.<br/>Si coincide Y caes entre :30-:70 → GOL.</p>
          <div style={{display:'flex',gap:'0.75rem',width:'100%'}}>
            {['par','impar'].map(ch => (
              <button key={ch} style={{
                flex:1,padding:'1.1rem',borderRadius:'14px',border:'2px solid',
                borderColor:'rgba(255,255,255,0.15)',background:'rgba(255,255,255,0.04)',
                color:'rgba(255,255,255,0.7)',fontSize:'1rem',fontWeight:'900',cursor:'pointer',transition:'all 0.2s',
              }} onClick={() => { setChosen(ch); setPhase('shoot') }}>
                {ch.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}

      {phase === 'shoot' && (
        <>
          <p style={{...S.desc,color:'#ffb400',fontWeight:'700'}}>Elegiste <strong>{chosen.toUpperCase()}</strong> — ¡ahora tira!</p>
          <div style={{...S.timerBox, borderColor: running ? 'rgba(255,180,0,0.6)' : 'rgba(255,255,255,0.1)', boxShadow: running ? '0 0 30px rgba(255,180,0,0.3)' : 'none', width:'100%'}}>
            <span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.3)',letterSpacing:'3px',marginBottom:'4px'}}>SEG : CEN</span>
            <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
              <span style={{fontSize:'3.5rem',fontWeight:'900',color:running?'#fff':'rgba(255,255,255,0.5)',fontVariantNumeric:'tabular-nums'}}>{String(secs).padStart(2,'0')}</span>
              <span style={{fontSize:'2.5rem',color:'rgba(255,255,255,0.3)'}}>:</span>
              <span style={{fontSize:'3.5rem',fontWeight:'900',color:running?'#fff':'rgba(255,255,255,0.5)',fontVariantNumeric:'tabular-nums'}}>{String(cents).padStart(2,'0')}</span>
            </div>
            {running && <p style={{fontSize:'0.7rem',color:'rgba(255,255,255,0.3)',margin:'4px 0 0'}}>última cen: <strong style={{color:'#ffb400'}}>{last1} ({last1%2===0?'par':'impar'})</strong></p>}
          </div>
          <button
            style={{
              width:'120px',height:'120px',borderRadius:'50%',border:'none',cursor:'pointer',
              background: running ? '#ff4444' : '#ffb400',
              display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'4px',
              boxShadow: running ? '0 0 0 8px rgba(255,68,68,0.15)' : '0 0 0 8px rgba(255,180,0,0.15)',
              fontSize:'0.8rem',fontWeight:'900',color:'#141414',
            }}
            onClick={() => running ? stopTimer() : startTimer()}
          >
            <div style={{width: running?'20px':'14px',height:running?'20px':'14px',background:'#141414',borderRadius:running?'4px':'50%'}}/>
            {running ? 'PARAR' : 'START'}
          </button>
        </>
      )}

      {phase === 'result' && (
        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'0.75rem',width:'100%'}}>
          <div style={{animation:'goalPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) forwards',opacity:0,display:'flex',flexDirection:'column',alignItems:'center',gap:'0.5rem'}}>
            <span style={{fontSize:'4rem'}}>{result ? '⚽' : '🥅'}</span>
            <span style={{fontSize:'2rem',fontWeight:'900',color: result ? '#ffb400' : 'rgba(255,255,255,0.4)'}}>
              {result ? '¡GOOOL!' : 'Fallado'}
            </span>
            <p style={{fontSize:'0.85rem',color:'rgba(255,255,255,0.4)',margin:0}}>
              Elegiste <strong style={{color:'#fff'}}>{chosen}</strong> · Centésima: <strong style={{color:'#ffb400'}}>{totalCents % 10}</strong> ({(totalCents%10)%2===0?'par':'impar'})
            </p>
          </div>
          <button style={{
            background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',
            borderRadius:'12px',padding:'0.9rem',fontSize:'0.95rem',fontWeight:'800',
            color:'rgba(255,255,255,0.6)',cursor:'pointer',width:'100%',marginTop:'0.5rem',
          }} onClick={reset}>
            🔄 Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  )
}

// Slide 5 — Falta
function SlideFalta() {
  const [chosen, setChosen] = useState(null)
  const barriers = [[20,25],[30,35],[40,45]]
  return (
    <div style={S.slide}>
      <span style={{fontSize:'3.5rem',lineHeight:1}}>🧤</span>
      <h2 style={S.title}><span style={{color:'#ffb400'}}>Falta</span></h2>
      <p style={S.desc}>Paraste en :98. Tu rival elige la barrera.<br/>Para dentro del rango → GOL.</p>
      <p style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.3)',margin:0}}>Elige la barrera que pondrías:</p>
      <div style={{display:'flex',gap:'0.5rem',width:'100%'}}>
        {barriers.map(([min,max]) => (
          <button key={min} style={{
            flex:1,padding:'0.9rem 0.5rem',borderRadius:'12px',border:'2px solid',
            borderColor: chosen?.[0]===min ? '#ffb400' : 'rgba(255,255,255,0.1)',
            background: chosen?.[0]===min ? 'rgba(255,180,0,0.15)' : 'rgba(255,255,255,0.03)',
            color: chosen?.[0]===min ? '#ffb400' : 'rgba(255,255,255,0.5)',
            fontSize:'0.85rem',fontWeight:'900',cursor:'pointer',transition:'all 0.2s',
          }} onClick={() => setChosen([min,max])}>
            {min}–{max}
          </button>
        ))}
      </div>
      {chosen && (
        <p style={{fontSize:'0.85rem',color:'#ffb400',fontWeight:'700',animation:'fadeUp 0.3s ease forwards',opacity:0}}>
          ✓ Barrera {chosen[0]}–{chosen[1]} puesta. El tirador debe parar aquí.
        </p>
      )}
    </div>
  )
}

// Slide 6 — Corner: empieza en :97, para en :30
function SlideCorner() {
  const [totalCents, setTotalCents] = useState(97)
  const [running, setRunning] = useState(false)
  const [gol, setGol] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setRunning(true)
      const start = performance.now()
      intervalRef.current = setInterval(() => {
        const elapsed = Math.floor((performance.now() - start) / 10)
        const val = 97 + elapsed
        setTotalCents(val)
        if (val >= 130) {
          clearInterval(intervalRef.current)
          setTotalCents(130)
          setRunning(false)
          setGol(true)
        }
      }, 10)
    }, 600)
    return () => { clearTimeout(t); clearInterval(intervalRef.current) }
  }, [])

  const secs = Math.floor(totalCents / 100)
  const cents = totalCents % 100

  return (
    <div style={S.slide}>
      <span style={{fontSize:'3.5rem',lineHeight:1}}>🚩</span>
      <h2 style={S.title}><span style={{color:'#ffb400'}}>Córner</span></h2>
      <p style={S.desc}>Paraste en :97. Tira de nuevo.<br/>Para en múltiplo de 10 → GOL.</p>
      <div style={{...S.timerBox, borderColor: gol ? '#ffb400' : running ? 'rgba(255,180,0,0.4)' : 'rgba(255,255,255,0.1)', boxShadow: gol ? '0 0 30px rgba(255,180,0,0.4)' : 'none', transition:'all 0.3s'}}>
        <span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.3)',letterSpacing:'3px',marginBottom:'4px'}}>SEG : CEN</span>
        <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
          <span style={{fontSize:'3.5rem',fontWeight:'900',color: gol ? '#ffb400' : '#fff',fontVariantNumeric:'tabular-nums'}}>{String(secs).padStart(2,'0')}</span>
          <span style={{fontSize:'2.5rem',color:'rgba(255,255,255,0.3)'}}>:</span>
          <span style={{fontSize:'3.5rem',fontWeight:'900',color: gol ? '#ffb400' : '#fff',fontVariantNumeric:'tabular-nums'}}>{String(cents).padStart(2,'0')}</span>
        </div>
      </div>
      {gol
        ? <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'0.25rem',animation:'goalPop 0.5s ease forwards',opacity:0}}>
            <span style={{fontSize:'2rem',fontWeight:'900',color:'#ffb400'}}>⚽ ¡GOL de córner!</span>
            <p style={{fontSize:'0.8rem',color:'rgba(255,255,255,0.5)',margin:0}}>:30 es múltiplo de 10 ✓</p>
          </div>
        : <p style={{fontSize:'0.8rem',color:'rgba(255,255,255,0.3)'}}>Múltiplos de 10: :10 · :20 · :30 · :40 · :50 · :60 · :70 · :80 · :90 · :00</p>
      }
    </div>
  )
}

// Slide 7 — Tarjetas con animación
function SlideTarjetas() {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 600),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 3000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])
  return (
    <div style={S.slide}>
      <h2 style={S.title}>El reloj<br/><span style={{color:'#ffc800'}}>no perdona</span></h2>
      <p style={S.desc}>Cuando es tu turno, el tiempo corre.</p>
      <div style={{width:'100%',display:'flex',flexDirection:'column',gap:'0.5rem'}}>
        {phase >= 1 && (
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem',background:'rgba(255,200,0,0.08)',border:'1px solid rgba(255,200,0,0.2)',borderRadius:'12px',padding:'0.75rem 1rem',animation:'fadeUp 0.3s ease forwards',opacity:0}}>
            <span style={{fontSize:'1.8rem',animation:'cardShake 0.4s ease 0.1s both'}}>🟨</span>
            <div>
              <p style={{margin:0,fontSize:'0.85rem',fontWeight:'800',color:'#ffc800'}}>+2s sin parar</p>
              <p style={{margin:0,fontSize:'0.75rem',color:'rgba(255,255,255,0.4)'}}>Tarjeta amarilla</p>
            </div>
          </div>
        )}
        {phase >= 2 && (
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem',background:'rgba(255,68,68,0.08)',border:'1px solid rgba(255,68,68,0.2)',borderRadius:'12px',padding:'0.75rem 1rem',animation:'fadeUp 0.3s ease forwards',opacity:0}}>
            <span style={{fontSize:'1.8rem',animation:'cardShake 0.4s ease 0.1s both'}}>🟥</span>
            <div>
              <p style={{margin:0,fontSize:'0.85rem',fontWeight:'800',color:'#ff4444'}}>+5s sin parar</p>
              <p style={{margin:0,fontSize:'0.75rem',color:'rgba(255,255,255,0.4)'}}>Roja + gol para el rival</p>
            </div>
          </div>
        )}
        {phase >= 3 && (
          <div style={{display:'flex',alignItems:'center',gap:'0.75rem',background:'rgba(255,68,68,0.05)',border:'1px solid rgba(255,68,68,0.15)',borderRadius:'12px',padding:'0.75rem 1rem',animation:'fadeUp 0.3s ease forwards',opacity:0}}>
            <span style={{fontSize:'1.8rem'}}>💀</span>
            <div>
              <p style={{margin:0,fontSize:'0.85rem',fontWeight:'800',color:'rgba(255,255,255,0.6)'}}>2 tarjetas rojas</p>
              <p style={{margin:0,fontSize:'0.75rem',color:'rgba(255,255,255,0.4)'}}>Derrota automática 0-5</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Slide 8 — Fin del partido
function SlideFin() {
  return (
    <div style={S.slide}>
      <span style={{fontSize:'3.5rem',lineHeight:1}}>🏁</span>
      <h2 style={S.title}>Fin del<br/><span style={{color:'#ffb400'}}>partido</span></h2>
      <div style={{width:'100%',display:'flex',flexDirection:'column',gap:'0.5rem'}}>
        {[
          { icon:'⚡', label:'5 goles de ventaja', sub:'Victoria inmediata' },
          { icon:'⏱', label:'30 segundos',         sub:'Fin por tiempo' },
          { icon:'🥅', label:'Empate al tiempo',    sub:'Penaltis a muerte súbita' },
        ].map((item,i) => (
          <div key={i} style={{display:'flex',alignItems:'center',gap:'0.75rem',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:'12px',padding:'0.75rem 1rem',animation:`fadeUp 0.3s ease ${i*0.15}s forwards`,opacity:0}}>
            <span style={{fontSize:'1.5rem'}}>{item.icon}</span>
            <div>
              <p style={{margin:0,fontSize:'0.88rem',fontWeight:'800',color:'#fff'}}>{item.label}</p>
              <p style={{margin:0,fontSize:'0.72rem',color:'rgba(255,255,255,0.4)'}}>{item.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Slide 9 — Skills
function SlideSkills() {
  const [active, setActive] = useState(null)
  return (
    <div style={S.slide}>
      <h2 style={S.title}><span style={{color:'#ffb400'}}>Skills</span></h2>
      <p style={S.desc}>Tres habilidades especiales que pueden cambiar el partido.</p>
      <div style={{width:'100%',display:'flex',flexDirection:'column',gap:'0.75rem'}}>
        {[
          { icon:'🧤', name:'Iron Fist', color:'#ffb400', desc:'En penalty: bloquea la mitad del cronómetro (00-49 ó 50-99). Tu rival no sabe qué lado elegiste.' },
          { icon:'🎯', name:'Sniper',    color:'#ffb400', desc:'En falta: tu ventana de gol se amplía al doble. De 5 centésimas a 10.' },
          { icon:'🙏', name:'Mano de Dios', color:'#7dd3fc', desc:'Si paras en :99 o :01 → se convierte en :00 → GOL. Si paras en :98 → Penalty. En :97 → Falta. En :96 → Córner. Tienes 5s para decidir. Solo se consigue completando las 6 misiones diarias.' },
        ].map((skill,i) => (
          <div key={i} style={{
            background: active===i ? (i===2 ? 'rgba(100,180,255,0.08)' : 'rgba(255,180,0,0.08)') : 'rgba(255,255,255,0.03)',
            border:`1px solid ${active===i ? (i===2 ? 'rgba(100,180,255,0.3)' : 'rgba(255,180,0,0.3)') : 'rgba(255,255,255,0.07)'}`,
            borderRadius:'14px',padding:'1rem',cursor:'pointer',transition:'all 0.2s',
          }} onClick={() => setActive(active===i ? null : i)}>
            <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
              <span style={{fontSize:'2rem'}}>{skill.icon}</span>
              <p style={{margin:0,fontSize:'1rem',fontWeight:'900',color:skill.color}}>{skill.name}</p>
              <span style={{marginLeft:'auto',fontSize:'0.75rem',color:'rgba(255,255,255,0.3)'}}>{ active===i ? '▲' : '▼'}</span>
            </div>
            {active===i && <p style={{margin:'0.75rem 0 0',fontSize:'0.85rem',color:'rgba(255,255,255,0.6)',lineHeight:1.5,animation:'fadeUp 0.2s ease forwards',opacity:0}}>{skill.desc}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}

// Slide 10 — Vestuario con misiones
function SlideVestuario() {
  const [visible, setVisible] = useState(0)
  const missions = [
    { icon:'⚡', name:'Sniper de Élite',        reward:'2🎯+2🧤', progress:4,  target:10 },
    { icon:'💥', name:'Beast Mode',             reward:'2🎯+2🧤', progress:12, target:20 },
    { icon:'🎮', name:'Maratoniano',             reward:'2🎯+2🧤', progress:3,  target:10 },
    { icon:'🏆', name:'Hat-Trick de Victorias', reward:'1🎯+1🧤', progress:2,  target:3  },
    { icon:'🛡️', name:'Muralla Infranqueable',  reward:'1🎯+1🧤', progress:0,  target:1  },
    { icon:'🔒', name:'Misión Secreta',          reward:'2🎯+2🧤', progress:0,  target:1, locked:true },
  ]
  useEffect(() => {
    let i = 0
    const t = setInterval(() => {
      i++
      setVisible(i)
      if (i >= missions.length) clearInterval(t)
    }, 250)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{...S.slide,gap:'0.6rem'}}>
      <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
        <span style={{fontSize:'2rem',lineHeight:1}}>🏟️</span>
        <h2 style={{...S.title,fontSize:'1.5rem',margin:0}}>El <span style={{color:'#ffb400'}}>Vestuario</span></h2>
      </div>
      <p style={{...S.desc,fontSize:'0.82rem'}}>5 misiones diarias + 1 secreta. Complétalas para ganar skills.</p>
      <div style={{width:'100%',display:'flex',flexDirection:'column',gap:'0.4rem'}}>
        {missions.map((m, i) => i < visible && (
          <div key={i} style={{
            display:'flex',alignItems:'center',gap:'0.6rem',
            background: m.locked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)',
            border:`1px solid ${m.locked ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)'}`,
            borderRadius:'10px',padding:'0.5rem 0.75rem',
            animation:'fadeUp 0.25s ease forwards',opacity:0,
          }}>
            <span style={{fontSize:'1.1rem',flexShrink:0}}>{m.icon}</span>
            <span style={{flex:1,fontSize:'0.78rem',fontWeight:'700',color: m.locked ? 'rgba(255,255,255,0.3)' : '#fff'}}>{m.name}</span>
            {!m.locked && (
              <div style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
                <div style={{width:'40px',height:'4px',background:'rgba(255,255,255,0.08)',borderRadius:'2px',overflow:'hidden'}}>
                  <div style={{width:`${(m.progress/m.target)*100}%`,height:'100%',background:'#ffb400',borderRadius:'2px'}}/>
                </div>
                <span style={{fontSize:'0.65rem',color:'rgba(255,255,255,0.3)',minWidth:'24px'}}>{m.progress}/{m.target}</span>
              </div>
            )}
            <span style={{fontSize:'0.65rem',color:'#ffb400',fontWeight:'700',flexShrink:0}}>{m.reward}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Slide 11 — Ligas
function SlideLigas() {
  return (
    <div style={S.slide}>
      <span style={{fontSize:'3.5rem',lineHeight:1}}>🏆</span>
      <h2 style={S.title}>Ligas<br/><span style={{color:'#ffb400'}}>privadas</span></h2>
      <p style={S.desc}>Crea o únete a una liga con tus amigos.<br/>Código de 6 caracteres. Solo entre vosotros.</p>
      <div style={{background:'rgba(255,180,0,0.06)',border:'1px solid rgba(255,180,0,0.2)',borderRadius:'16px',padding:'1rem 1.5rem',display:'flex',flexDirection:'column',alignItems:'center',gap:'0.25rem'}}>
        <p style={{margin:0,fontSize:'0.7rem',color:'rgba(255,255,255,0.3)',letterSpacing:'2px'}}>CÓDIGO DE LIGA</p>
        <p style={{margin:0,fontSize:'2.5rem',fontWeight:'900',color:'#ffb400',letterSpacing:'8px',fontVariantNumeric:'tabular-nums'}}>SG4X2K</p>
      </div>
      <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap',justifyContent:'center'}}>
        {['Hasta 50 jugadores','Ranking propio','Chat en partido'].map((t,i) => (
          <span key={i} style={{...S.pill,animation:`pillIn 0.3s ease ${i*0.1}s both`}}>{t}</span>
        ))}
      </div>
    </div>
  )
}

// Slide 12 — Proteger cuenta
function SlideProteger() {
  return (
    <div style={S.slide}>
      <span style={{fontSize:'3.5rem',lineHeight:1,animation:'pulse 1.5s ease-in-out infinite'}}>🔒</span>
      <h2 style={S.title}>Protege<br/><span style={{color:'#ffb400'}}>tu cuenta</span></h2>
      <p style={S.desc}>Vincula tu email. No pierdas nunca tu progreso, puntos y victorias.</p>
      <div style={{display:'flex',gap:'1rem',width:'100%'}}>
        {[{e:'🎯',n:'5 Snipers'},{e:'🧤',n:'5 Iron Fists'}].map((item,i) => (
          <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'6px',background:'rgba(255,180,0,0.08)',border:'1px solid rgba(255,180,0,0.2)',borderRadius:'14px',padding:'1rem',animation:`pillIn 0.4s ease ${i*0.15}s both`}}>
            <span style={{fontSize:'2rem'}}>{item.e}</span>
            <span style={{fontSize:'0.85rem',fontWeight:'800',color:'#ffb400'}}>{item.n}</span>
            <span style={{fontSize:'0.7rem',color:'rgba(255,255,255,0.3)'}}>gratis</span>
          </div>
        ))}
      </div>
      <p style={{fontSize:'0.75rem',color:'rgba(255,255,255,0.25)',margin:0,textAlign:'center'}}>Al verificar tu cuenta recibirás estos skills automáticamente</p>
    </div>
  )
}

const SLIDE_COMPONENTS = [
  SlideWelcome, SlideCronometro, SlideEventos, SlidePenalty,
  SlideFalta, SlideCorner, SlideTarjetas, SlideFin,
  SlideSkills, SlideVestuario, SlideLigas, SlideProteger,
]

export default function Tutorial() {
  const navigate = useNavigate()
  const [idx, setIdx] = useState(0)
  const [animKey, setAnimKey] = useState(0)

  const SlideComponent = SLIDE_COMPONENTS[idx]
  const isLast = idx === SLIDE_COMPONENTS.length - 1

  function next() {
    if (isLast) { navigate('/') } 
    else { setIdx(i => i + 1); setAnimKey(k => k + 1) }
  }

  return (
    <div style={styles.container}>
      <style>{CSS}</style>

      <div style={styles.header}>
        <div style={styles.progress}>
          {SLIDE_COMPONENTS.map((_, i) => (
            <div key={i} style={{
              ...styles.progressDot,
              background: i === idx ? '#ffb400' : i < idx ? 'rgba(255,180,0,0.4)' : 'rgba(255,255,255,0.1)',
              width: i === idx ? '20px' : '6px',
            }} />
          ))}
        </div>
        <button style={styles.skipBtn} onClick={() => navigate('/')}>Saltar</button>
      </div>

      <div key={animKey} style={{...styles.slideWrapper, animation:'slideIn 0.3s ease forwards'}}>
        <SlideComponent />
      </div>

      <div style={styles.footer}>
        <p style={styles.counter}>{idx + 1} / {SLIDE_COMPONENTS.length}</p>
        <button style={styles.btnNext} onClick={next}>
          {isLast ? '¡Empieza a jugar! ⚽' : 'Entendido →'}
        </button>
      </div>
    </div>
  )
}

const S = {
  slide: { display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem', textAlign:'center', width:'100%' },
  eyebrow: { fontSize:'0.65rem', color:'rgba(255,255,255,0.3)', letterSpacing:'3px', margin:0 },
  title: { fontSize:'1.8rem', fontWeight:'900', color:'#fff', margin:0, letterSpacing:'-0.5px', lineHeight:1.15 },
  desc: { fontSize:'0.9rem', color:'rgba(255,255,255,0.55)', lineHeight:1.65, margin:0 },
  timerBox: { background:'rgba(255,255,255,0.03)', border:'2px solid', borderRadius:'20px', padding:'1.25rem 2rem', display:'flex', flexDirection:'column', alignItems:'center', transition:'all 0.3s ease' },
  pill: { background:'rgba(255,180,0,0.1)', border:'1px solid rgba(255,180,0,0.25)', borderRadius:'20px', padding:'5px 12px', fontSize:'0.8rem', color:'#ffb400', fontWeight:'700' },
}

const styles = {
  container: { height:'100%', display:'flex', flexDirection:'column', background:'#141414', padding:'2rem 1.5rem 3rem', gap:'1rem' },
  header: { display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  progress: { display:'flex', gap:'4px', alignItems:'center' },
  progressDot: { height:'6px', borderRadius:'3px', transition:'all 0.3s ease' },
  skipBtn: { background:'none', border:'none', color:'rgba(255,255,255,0.25)', fontSize:'0.85rem', cursor:'pointer', padding:'4px 8px' },
  slideWrapper: { flex:1, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' },
  footer: { display:'flex', flexDirection:'column', gap:'0.5rem', alignItems:'center', flexShrink:0 },
  counter: { fontSize:'0.7rem', color:'rgba(255,255,255,0.2)', margin:0 },
  btnNext: { background:'#ffb400', color:'#141414', border:'none', borderRadius:'12px', padding:'1.1rem', fontSize:'1rem', fontWeight:'900', cursor:'pointer', width:'100%', letterSpacing:'0.5px' },
}
