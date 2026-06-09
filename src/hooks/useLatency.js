import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useLatency() {
  const [latency, setLatency] = useState(null)
  const intervalRef = useRef(null)

  useEffect(() => {
    measure()
    intervalRef.current = setInterval(measure, 3000)
    return () => clearInterval(intervalRef.current)
  }, [])

  async function measure() {
    const start = Date.now()
    try {
      await supabase.from('players').select('id').limit(1).single()
      const ms = Date.now() - start
      setLatency(ms)
    } catch(e) {
      setLatency(null)
    }
  }

  function getColor(ms) {
    if (ms === null) return 'rgba(255,255,255,0.2)'
    if (ms < 80) return '#00c853'
    if (ms < 150) return '#ffb400'
    if (ms < 300) return '#ff6d00'
    return '#ff4444'
  }

  function getLabel(ms) {
    if (ms === null) return '—'
    if (ms < 80) return 'Excelente'
    if (ms < 150) return 'Bueno'
    if (ms < 300) return 'Regular'
    return 'Malo'
  }

  function getBars(ms) {
    if (ms === null) return 0
    if (ms < 80) return 4
    if (ms < 150) return 3
    if (ms < 300) return 2
    return 1
  }

  return { latency, color: getColor(latency), label: getLabel(latency), bars: getBars(latency) }
}
