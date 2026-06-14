const COLORS = {
  idle:    { bg: '#00c850', shadow: 'rgba(0,200,80,0.6)' },
  playing: { bg: '#ffb400', shadow: 'rgba(255,180,0,0.6)' },
  offline: { bg: '#444', shadow: 'transparent' },
}

const CSS = `
  @keyframes statusPulse {
    0%,100% { opacity:1; }
    50% { opacity:0.5; }
  }
`

if (!document.getElementById('status-dot-css')) {
  const s = document.createElement('style')
  s.id = 'status-dot-css'
  s.textContent = CSS
  document.head.appendChild(s)
}

export default function StatusDot({ status = 'offline', size = 8 }) {
  const { bg, shadow } = COLORS[status] || COLORS.offline
  return (
    <span style={{
      display: 'inline-block',
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      boxShadow: status !== 'offline' ? `0 0 ${size}px ${shadow}` : 'none',
      flexShrink: 0,
      animation: status === 'playing' ? 'statusPulse 1.5s ease-in-out infinite' : 'none',
    }} />
  )
}
