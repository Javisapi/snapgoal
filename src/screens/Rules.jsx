import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

const RULES_CSS = `
  @keyframes rulesFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`

const SECTIONS = [
  {
    title: 'Duración del partido',
    color: '#ffb400',
    rules: [
      '30 segundos.',
    ]
  },
  {
    title: 'Resultado de cada tirada',
    color: '#ffb400',
    rules: [
      '⚽ :00 — Gol directo',
      '🥅 :99 — Penalty',
      '🧤 :98 — Falta',
      '🚩 :97 — Córner',
      '💥 :13 — Gol en propia',
      'Cualquier otro valor — sin gol, turno cambia',
    ]
  },
  {
    title: '🥅 Penalty (:99)',
    color: 'rgba(255,255,255,0.7)',
    rules: [
      'El tirador elige par o impar.',
      'Vuelve a tirar. Si la centésima es del tipo elegido → GOL.',
      'Si no → fallo, turno cambia.',
    ]
  },
  {
    title: '🧤 Falta (:98)',
    color: 'rgba(255,255,255,0.7)',
    rules: [
      'El rival elige la barrera: 20-25, 30-35 o 40-45.',
      'El tirador ve el rango y vuelve a tirar.',
      'Si para dentro del rango → GOL. Si no → fallo, turno cambia.',
    ]
  },
  {
    title: '🚩 Córner (:97)',
    color: 'rgba(255,255,255,0.7)',
    rules: [
      'El tirador vuelve a tirar.',
      'Si para en un múltiplo de 10 → GOL. Si no → fallo, turno cambia.',
    ]
  },
  {
    title: '🟨 Tarjetas',
    color: 'rgba(255,255,255,0.7)',
    rules: [
      'Más de 2 segundos sin parar → tarjeta amarilla.',
      'Más de 5 segundos sin parar → tarjeta roja.',
      '2 amarillas = tarjeta roja automática.',
      'Tarjeta roja → gol al rival + el crono vuelve al tiempo anterior.',
      '2 rojas al mismo jugador → derrota 0-5.',
    ]
  },
  {
    title: 'Fin del partido',
    color: '#ffb400',
    rules: [
      'El partido termina cuando un jugador tiene 5 goles de ventaja.',
      'O cuando el cronómetro supera los 30 segundos.',
      'Si arranca antes de los 29 segundos, puede parar hasta los 31 segundos.',
    ]
  },
  {
    title: 'Penaltis a muerte súbita',
    color: 'rgba(255,255,255,0.7)',
    rules: [
      'Si hay empate al llegar a 30 segundos → penaltis a muerte súbita hasta que haya un ganador.',
      'En cada tanda lanza primero A y luego B.',
      'Si A marca y B falla → gana A (y viceversa).',
      'Se repiten tandas hasta que uno marque y el otro falle en la misma ronda.',
    ]
  },
  {
    title: 'Puntos',
    color: '#ffb400',
    rules: [
      'Victoria → 3 puntos',
      'No hay empates — siempre hay un ganador.',
      'Derrota → 0 puntos',
    ]
  },
  {
    title: 'Abandono y desconexión',
    color: 'rgba(255,255,255,0.7)',
    rules: [
      'Abandonar el partido → derrota 0-5.',
      'Sin respuesta durante 30 segundos → derrota 0-5 por desconexión.',
    ]
  },
,
  {
    title: 'Puntuación XP (solo partidos generales)',
    color: '#22c55e',
    rules: [
      'Cada jugador tiene una puntuación XP calculada con el sistema Glicko-1, un algoritmo de clasificación competitiva.',
      'El XP refleja tu nivel real: ganar contra rivales fuertes da más XP que ganar contra rivales débiles.',
      'Los jugadores nuevos empiezan con 1500 XP.',
      'Al ganar sumas XP. Al perder restas XP. La cantidad depende del nivel relativo de ambos jugadores.',
      'Ejemplo real: jugador A tiene 1500 XP y jugador B tiene 1800 XP. Si gana A (el más débil) → A gana +270 XP y B pierde -270 XP. Si gana B (el favorito) → B gana solo +85 XP y A pierde -85 XP. El sistema premia las sorpresas y penaliza poco los resultados esperados.',
      'El XP se calcula en todos los partidos, tanto generales como de liga.',

      'Al terminar cada partido verás cuántos XP has ganado o perdido.',
      'El ranking general está ordenado por XP.',
    ]
  },
  {
    title: 'Ligas — clasificación y desempate',
    color: '#ffb400',
    rules: [
      'Las ligas usan puntos simples: +3 por victoria, 0 por derrota.',
      'El ranking de liga está ordenado por puntos acumulados entre los miembros de esa liga.',
      'En caso de empate a puntos entre dos o más jugadores, se aplican estos criterios en orden:',
      '1. Mayor número de victorias.',
      '2. Mejor diferencia de goles (goles marcados menos goles recibidos).',
      '3. Mayor número de goles marcados.',
      '4. Si sigue el empate → partido de desempate entre los empatados.',
    ]
  }
]

export default function Rules() {
  const navigate = useNavigate()

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = RULES_CSS
    document.head.appendChild(s)
  }, [])

  return (
    <div style={styles.container}>
      <style>{`@keyframes tutorialGlow { 0%,100%{box-shadow:0 0 8px rgba(255,220,120,0.3),0 0 16px rgba(255,220,120,0.1)} 50%{box-shadow:0 0 16px rgba(255,220,120,0.6),0 0 32px rgba(255,220,120,0.25)} }`}</style>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← volver</button>
        <div style={styles.headerTitle}>
          <h1 style={styles.title}>Reglas</h1>
          <div style={styles.titleLine} />
        </div>
        <p style={styles.subtitle}>SnapGoal — el partido más rápido del mundo</p>
      </div>

      <div style={styles.list}>
        {SECTIONS.map((section, i) => (
          <div key={i} style={{ ...styles.section, animation: `rulesFadeIn 0.3s ease ${i * 0.05}s both` }}>
            <p style={{ ...styles.sectionTitle, color: section.color }}>{section.title}</p>
            <div style={styles.rulesList}>
              {section.rules.map((rule, j) => (
                <div key={j} style={styles.ruleRow}>
                  <div style={styles.ruleDot} />
                  <p style={styles.ruleText}>{rule}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ height: '2rem' }} />
      </div>
      <button style={styles.tutorialBtn} onClick={() => navigate('/tutorial')}>📖 Tutorial</button>
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: '#141414', overflow: 'hidden' },
  header: { padding: '2.5rem 1.75rem 1rem', flexShrink: 0 },
  tutorialBtn: { position: 'fixed', bottom: '1.5rem', left: '1.5rem', right: '1.5rem', width: 'calc(100% - 3rem)', background: 'rgba(20,20,20,0.97)', border: '1px solid rgba(255,220,120,0.5)', borderRadius: '14px', color: '#ffe085', fontSize: '0.95rem', fontWeight: '800', cursor: 'pointer', padding: '1rem', zIndex: 100, animation: 'tutorialGlow 2s ease-in-out infinite' },
  backBtn: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '1rem', letterSpacing: '0.5px' },
  headerTitle: { display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' },
  title: { fontSize: '2.5rem', fontWeight: '900', color: '#fff', letterSpacing: '-2px', margin: 0, lineHeight: 1 },
  titleLine: { height: '3px', width: '36px', background: '#ffb400', borderRadius: '2px' },
  subtitle: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.2)', margin: 0, letterSpacing: '0.5px' },
  list: { flex: 1, overflowY: 'auto', padding: '1rem 1.75rem 0' },
  section: { marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '0.85rem', fontWeight: '800', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 0.6rem' },
  rulesList: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  ruleRow: { display: 'flex', alignItems: 'flex-start', gap: '0.6rem' },
  ruleDot: { width: '4px', height: '4px', borderRadius: '50%', background: '#ffb400', flexShrink: 0, marginTop: '0.45rem' },
  ruleText: { fontSize: '0.9rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, margin: 0 },
}
