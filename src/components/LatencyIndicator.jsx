import { useLatency } from '../hooks/useLatency'

export default function LatencyIndicator() {
  const { latency, color, bars } = useLatency()

  return (
    <div style={styles.wrapper}>
      <svg width="16" height="12" viewBox="0 0 16 12" style={{ display: 'block' }}>
        <rect x="6.5" y="9" width="3" height="3" rx="1"
          fill={bars >= 1 ? color : 'rgba(255,255,255,0.15)'} />
        <rect x="4" y="6" width="8" height="2.5" rx="1"
          fill={bars >= 2 ? color : 'rgba(255,255,255,0.15)'} />
        <rect x="1.5" y="3" width="13" height="2.5" rx="1"
          fill={bars >= 3 ? color : 'rgba(255,255,255,0.15)'} />
        <rect x="0" y="0" width="16" height="2.5" rx="1"
          fill={bars >= 4 ? color : 'rgba(255,255,255,0.15)'} />
      </svg>
      <span style={{ ...styles.ms, color }}>
        {latency !== null ? `${latency}ms` : '—'}
      </span>
    </div>
  )
}

const styles = {
  wrapper: { display: 'flex', alignItems: 'center', gap: '4px' },
  ms: { fontSize: '0.65rem', fontWeight: '700', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.3px' },
}
