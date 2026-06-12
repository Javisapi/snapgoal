import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'

const CSS = `
  @keyframes skillsFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`

const HOW_TO_GET = [
  'Cada jugador empieza con 3 Iron Fists y 3 Snipers gratis.',
  'Por cada 100 XP ganados por encima de 1500 (es decir, al llegar a 1600, 1700, 1800...) recibes automáticamente 3 Iron Fists y 3 Snipers adicionales.',
  'No hay límite de acumulación — puedes tener tantos como quieras.',
  'En el futuro se podrán conseguir más habilidades especiales.',
]

const SKILLS = [
  {
    id: 'iron_fist',
    name: 'Iron Fist',
    icon: null,
    color: '#ffb400',
    stock: 3,
    description: 'Habilidad defensiva para usar en los penalties.',
    howto: [
      'Cuando tu rival lanza un penalty y elige par o impar, se te pregunta si quieres usar el Iron Fist.',
      'Tienes 5 segundos para decidir. Si no respondes, se omite.',
      'Si lo activas, eliges DERECHA o IZQUIERDA:',
      '→ DERECHA: bloqueas las centésimas 50–99. Tu rival solo puede marcar entre 00–49 (y acertando par/impar).',
      '← IZQUIERDA: bloqueas las centésimas 00–49. Tu rival solo puede marcar entre 50–99 (y acertando par/impar).',
      'Tu rival no sabe qué lado has elegido hasta después de tirar.',
      'Si el penalty se para gracias al Iron Fist, aparece una animación especial.',
      'Cada jugador empieza con 3 Iron Fist. Una vez usados, se agotan.',
    ]
  },
  {
    id: 'sniper',
    name: 'Sniper',
    icon: null,
    color: '#ffb400',
    stock: 3,
    description: 'Habilidad ofensiva para usar en las faltas.',
    howto: [
      'Cuando te toca lanzar una falta y el rival ya ha elegido la barrera, se te pregunta si quieres usar el Sniper.',
      'La ventana de gol normal es de 5 centésimas (ej: 30–35).',
      'Si activas el Sniper, la ventana se amplía a 10 centésimas (ej: 30–40).',
      'Tu rival ve que has activado el Sniper antes de que tires.',
      'Cada jugador empieza con 3 Snipers. Una vez usados, se agotan.',
    ]
  }
]

export default function Skills() {
  const navigate = useNavigate()

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.back} onClick={() => navigate('/')}>←</button>
        <div>
          <div style={styles.title}>Skills</div>
          <div style={styles.titleLine} />
        </div>
      </div>

      <div style={styles.list}>
        {SKILLS.map(skill => (
          <div key={skill.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <p style={styles.skillName}>{skill.name}</p>
                <p style={styles.skillDesc}>{skill.description}</p>
              </div>
              <div style={styles.stockBadge}>
                <span style={styles.stockNum}>{skill.stock}</span>
                <span style={styles.stockLabel}>iniciales</span>
              </div>
            </div>
            <div style={styles.divider} />
            <div style={styles.howto}>
              {skill.howto.map((line, i) => (
                <div key={i} style={styles.howtoRow}>
                  <span style={styles.howtoDot} />
                  <p style={styles.howtoText}>{line}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={styles.card}>
        <p style={{...styles.skillName, marginBottom:'0.5rem'}}>¿Cómo conseguir más?</p>
        <div style={styles.howto}>
          {HOW_TO_GET.map((line, i) => (
            <div key={i} style={styles.howtoRow}>
              <span style={styles.howtoDot} />
              <p style={styles.howtoText}>{line}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: { height:'100%', display:'flex', flexDirection:'column', padding:'3.5rem 1.5rem 2rem', background:'#141414', overflowY:'auto', animation:'skillsFadeIn 0.4s ease forwards' },
  header: { display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1.5rem' },
  back: { background:'transparent', border:'none', color:'rgba(255,255,255,0.4)', fontSize:'1.4rem', cursor:'pointer', padding:'0' },
  title: { fontSize:'2rem', fontWeight:'900', color:'#fff', letterSpacing:'-1px', lineHeight:1 },
  titleLine: { height:'3px', width:'36px', background:'#ffb400', borderRadius:'2px', marginTop:'3px' },
  list: { display:'flex', flexDirection:'column', gap:'1rem' },
  card: { background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'18px', padding:'1.25rem' },
  cardHeader: { display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.75rem' },
  skillName: { fontSize:'1.2rem', fontWeight:'900', color:'#ffb400', margin:'0 0 0.25rem', letterSpacing:'-0.5px' },
  skillDesc: { fontSize:'0.8rem', color:'rgba(255,255,255,0.4)', margin:0 },
  stockBadge: { background:'rgba(255,180,0,0.1)', border:'1px solid rgba(255,180,0,0.2)', borderRadius:'10px', padding:'0.4rem 0.75rem', display:'flex', flexDirection:'column', alignItems:'center' },
  stockNum: { fontSize:'1.2rem', fontWeight:'900', color:'#ffb400', lineHeight:1 },
  stockLabel: { fontSize:'0.6rem', color:'rgba(255,180,0,0.5)', letterSpacing:'0.5px' },
  divider: { height:'1px', background:'rgba(255,255,255,0.05)', marginBottom:'0.75rem' },
  howto: { display:'flex', flexDirection:'column', gap:'0.5rem' },
  howtoRow: { display:'flex', gap:'0.5rem', alignItems:'flex-start' },
  howtoDot: { width:'4px', height:'4px', borderRadius:'50%', background:'#ffb400', flexShrink:0, marginTop:'6px' },
  howtoText: { fontSize:'0.82rem', color:'rgba(255,255,255,0.55)', margin:0, lineHeight:1.5 },
}
