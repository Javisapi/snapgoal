import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const CHANNEL_NAME = 'snapgoal-presence'

let globalChannel = null
let globalSubscribers = 0

function getChannel() {
  if (!globalChannel) {
    globalChannel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: 'presence' } }
    })
    globalChannel.subscribe()
  }
  return globalChannel
}

export function useTrackPresence(playerId, status = 'idle') {
  useEffect(() => {
    if (!playerId) return
    const ch = getChannel()
    globalSubscribers++

    const track = async () => {
      await ch.track({ player_id: playerId, status, ts: Date.now() })
    }

    if (ch.state === 'joined') {
      track()
    } else {
      ch.subscribe(async (s) => { if (s === 'SUBSCRIBED') await track() })
    }

    return () => {
      globalSubscribers--
      if (globalSubscribers <= 0) {
        ch.untrack()
      }
    }
  }, [playerId, status])
}

export function usePresenceMap(onChange) {
  useEffect(() => {
    const ch = getChannel()

    const handler = () => {
      const state = ch.presenceState()
      const map = {}
      Object.values(state).flat().forEach(p => {
        if (p.player_id) map[p.player_id] = p.status
      })
      onChange(map)
    }

    ch.on('presence', { event: 'sync' }, handler)
    ch.on('presence', { event: 'join' }, handler)
    ch.on('presence', { event: 'leave' }, handler)

    // Estado inicial
    handler()

    return () => {
      ch.off('presence', handler)
    }
  }, [])
}
