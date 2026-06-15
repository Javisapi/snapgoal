import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const CSS = `
  @keyframes badgeIn { 0%{opacity:0;transform:translateY(20px) scale(0.97)} 100%{opacity:1;transform:translateY(0) scale(1)} }
  @keyframes badgeOut { 0%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-20px)} }
`

const SLIDES = [
  {
    emoji: '⚽',
    title: 'Bienvenido a SnapGoal',
    desc: 'El fútbol más rápido del mundo. 30 segundos. Un cronómetro compartido. Gana el más preciso.',
    color: '#ffb400',
  },
  {
    emoji: '⏱',
    title: 'El cronómetro',
    desc: 'Pulsa START para arrancar. Pulsa STOP para parar. La centésima donde pares decide qué ocurre. El cronómetro nunca se resetea — acumula entre turnos.',
    color: '#ffb400',
    extra: [
      { label: 'SEG', val: '18' },
      { label: 'CEN', val: '34' },
    ],
  },
  {
    emoji: '🎯',
    title: 'Goles y eventos',
    desc: 'Todo depende de las últimas 2 centésimas donde pares:',
    color: '#ffb400',
    table: [
      { cent: ':00', event: '⚽ Gol directo' },
      { cent: ':99', event: '🥅 Penalty' },
      { cent: ':98', event: '🧤 Falta' },
      { cent: ':97', event: '🚩 Córner' },
      { cent: ':13', event: '💥 Gol en propia' },
    ],
  },
  {
    emoji: '🥅',
    title: 'Penalty',
    desc: 'Paraste en :99. Elige PAR o IMPAR. Luego tira de nuevo. Si la última centésima coincide con tu elección → GOL.',
    color: '#ffb400',
    pills: ['PAR → centésima par = ⚽', 'IMPAR → centésima impar = ⚽'],
  },
  {
    emoji: '🧤',
    title: 'Falta',
    desc: 'Paraste en :98. Tu rival elige una barrera. Para dentro de ese rango → GOL.',
    color: '#ffb400',
    pills: ['20–25', '30–35', '40–45'],
  },
  {
    emoji: '🚩',
    title: 'Córner',
    desc: 'Paraste en :97. Tira de nuevo. Para en múltiplo de 10 → GOL.',
    color: '#ffb400',
    pills: [':10 ⚽', ':20 ⚽', ':30 ⚽', ':40 ⚽'],
  },
  {
    emoji: '🟨',
    title: 'Tarjetas',
    desc: 'El tiempo corre cuando es tu turno.',
    color: '#ffc800',
    table: [
      { cent: '+2s sin parar', event: '🟨 Tarjeta amarilla' },
      { cent: '+5s sin parar', event: '🟥 Roja + gol rival' },
      { cent: '2 amarillas', event: '🟥 Roja automática' },
      { cent: '2 rojas', event: '💀 Derrota 0-5' },
    ],
  },
  {
    emoji: '🏁',
    title: 'Fin del partido',
    desc: 'El partido termina cuando alguien llega a 5 goles de ventaja o se acaban los 30 segundos. Si hay empate → penaltis a muerte súbita sin límite de rondas.',
    color: '#ffb400',
    pills: ['5 goles de ventaja', '30 segundos', 'Empate → penaltis'],
  },
  {
    emoji: '🧤🎯',
    title: 'Iron Fist y Sniper',
    desc: 'Dos habilidades especiales que cambian el juego.',
    color: '#ffb400',
    table: [
      { cent: '🧤 Iron Fist', event: 'En penalty: bloquea la mitad del cronómetro' },
      { cent: '🎯 Sniper', event: 'En falta: amplía tu ventana de gol al doble' },
    ],
  },
  {
    emoji: '🏟️',
    title: 'El Vestuario',
    desc: '5 misiones diarias que se reinician cada medianoche. Complétalas para ganar Iron Fists y Snipers. Juega días consecutivos para mantener tu racha 🔥 y conseguir más premios.',
    color: '#ffb400',
    pills: ['🏆 Hat-Trick de Victorias', '💥 Beast Mode', '🛡️ Muralla Infranqueable', '⚡ Sniper de Élite', '🎮 Maratoniano'],
  },
  {
    emoji: '🏆',
    title: 'Ligas privadas',
    desc: 'Crea o únete a una liga con tus amigos usando un código de 6 caracteres. Clasificación propia, partidos solo entre miembros.',
    color: '#ffb400',
    pills: ['Código de 6 caracteres', 'Hasta 50 jugadores', 'Ranking propio'],
  },
  {
    emoji: '🔒',
    title: 'Protege tu cuenta',
    desc: 'Vincula tu email para no perder nunca tu progreso, puntos y victorias. Además recibirás un regalo de bienvenida.',
    color: '#ffb400',
    pills: ['5 🎯 Snipers gratis', '5 🧤 Iron Fists gratis'],
  },
]

export default function Tutorial() {
  const navigate = useNavigate()
  const [idx, setIdx] = useState(0)
  const [animOut, setAnimOut] = useState(false)

  const slide = SLIDES[idx]
  const isLast = idx === SLIDES.length - 1

  function next() {
    setAnimOut(true)
    setTimeout(() => {
      setAnimOut(false)
      if (isLast) {
        navigate('/')
      } else {
        setIdx(i => i + 1)
      }
    }, 200)
  }

  function skip() {
    navigate('/')
  }

  return (
    <div style={styles.container}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.progress}>
          {SLIDES.map((_, i) => (
            <div key={i} style={{
              ...styles.progressDot,
              background: i === idx ? '#ffb400' : i < idx ? 'rgba(255,180,0,0.4)' : 'rgba(255,255,255,0.1)',
              width: i === idx ? '20px' : '6px',
            }} />
          ))}
        </div>
        <button style={styles.skipBtn} onClick={skip}>Saltar</button>
      </div>

      {/* Slide */}
      <div style={{
        ...styles.slide,
        animation: animOut ? 'badgeOut 0.2s ease forwards' : 'badgeIn 0.3s ease forwards',
      }}>
        <span style={styles.emoji}>{slide.emoji}</span>
        <h2 style={{ ...styles.title, color: slide.color }}>{slide.title}</h2>
        <p style={styles.desc}>{slide.desc}</p>

        {slide.table && (
          <div style={styles.table}>
            {slide.table.map((row, i) => (
              <div key={i} style={styles.tableRow}>
                <span style={styles.tableCent}>{row.cent}</span>
                <span style={styles.tableEvent}>{row.event}</span>
              </div>
            ))}
          </div>
        )}

        {slide.pills && (
          <div style={styles.pills}>
            {slide.pills.map((pill, i) => (
              <span key={i} style={styles.pill}>{pill}</span>
            ))}
          </div>
        )}

        {slide.extra && (
          <div style={styles.timerPreview}>
            <span style={styles.timerNum}>{slide.extra[0].val}</span>
            <span style={styles.timerSep}>:</span>
            <span style={styles.timerNum}>{slide.extra[1].val}</span>
          </div>
        )}
      </div>

      {/* Counter + Button */}
      <div style={styles.footer}>
        <p style={styles.counter}>{idx + 1} / {SLIDES.length}</p>
        <button style={styles.btnNext} onClick={next}>
          {isLast ? '¡Empieza a jugar! ⚽' : 'Entendido →'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: '#141414', padding: '2rem 1.5rem 3rem', gap: '1.5rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  progress: { display: 'flex', gap: '4px', alignItems: 'center' },
  progressDot: { height: '6px', borderRadius: '3px', transition: 'all 0.3s ease' },
  skipBtn: { background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '0.85rem', cursor: 'pointer', padding: '4px 8px' },
  slide: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', textAlign: 'center' },
  emoji: { fontSize: '4rem', lineHeight: 1 },
  title: { fontSize: '1.6rem', fontWeight: '900', margin: 0, letterSpacing: '-0.5px', lineHeight: 1.1 },
  desc: { fontSize: '0.95rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: 0, maxWidth: '320px' },
  table: { width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '0.75rem' },
  tableRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.5rem' },
  tableCent: { fontSize: '0.8rem', fontWeight: '800', color: '#ffb400', fontVariantNumeric: 'tabular-nums' },
  tableEvent: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  pills: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'center' },
  pill: { background: 'rgba(255,180,0,0.1)', border: '1px solid rgba(255,180,0,0.25)', borderRadius: '20px', padding: '5px 12px', fontSize: '0.8rem', color: '#ffb400', fontWeight: '700' },
  timerPreview: { display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,180,0,0.06)', border: '1px solid rgba(255,180,0,0.15)', borderRadius: '16px', padding: '1rem 2rem' },
  timerNum: { fontSize: '3.5rem', fontWeight: '900', color: '#ffb400', fontVariantNumeric: 'tabular-nums', lineHeight: 1 },
  timerSep: { fontSize: '2.5rem', color: 'rgba(255,180,0,0.4)', margin: '0 4px' },
  footer: { display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' },
  counter: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', margin: 0 },
  btnNext: { background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '1.1rem', fontSize: '1rem', fontWeight: '900', cursor: 'pointer', width: '100%', letterSpacing: '0.5px' },
}
