import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const CHANNEL_NAME = 'snapgoal-presence'
let channel = null
let listeners = new Set()
let presenceMap = {}

function getOrCreateChannel() {
  if (channel) return channel

  channel = supabase.channel(CHANNEL_NAME)

  const syncMap = () => {
    const state = channel.presenceState()
    const map = {}
    Object.values(state).flat().forEach(p => {
      if (p.player_id) map[p.player_id] = p.status
    })
    presenceMap = map
    listeners.forEach(fn => fn(map))
  }

  channel
    .on('presence', { event: 'sync' }, syncMap)
    .on('presence', { event: 'join' }, syncMap)
    .on('presence', { event: 'leave' }, syncMap)
    .subscribe()

  return channel
}

export function useTrackPresence(playerId, status = 'idle') {
  useEffect(() => {
    if (!playerId) return
    const ch = getOrCreateChannel()

    const track = async () => {
      await ch.track({ player_id: playerId, status, ts: Date.now() })
    }

    if (ch.state === 'joined') {
      track()
    } else {
      const timer = setInterval(() => {
        if (ch.state === 'joined') {
          clearInterval(timer)
          track()
        }
      }, 200)
      return () => clearInterval(timer)
    }
  }, [playerId, status])
}

export function usePresenceMap(onChange) {
  useEffect(() => {
    getOrCreateChannel()
    listeners.add(onChange)
    onChange(presenceMap)
    return () => listeners.delete(onChange)
  }, [])
}
