import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [player, setPlayer] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('*')
        .eq('auth_id', session.user.id)
        .single()
      if (existingPlayer) {
        setPlayer(existingPlayer)
        sessionStorage.setItem('player_' + session.user.id, JSON.stringify(existingPlayer))
      }
    }
    setLoading(false)
  }

  async function registerPlayer(username) {
    const { data: taken } = await supabase
      .from('players')
      .select('id')
      .eq('username', username)
      .single()

    if (taken) return { error: 'Este nombre ya está en uso. Elige otro.' }

    let session
    const { data: { session: existing } } = await supabase.auth.getSession()
    if (existing) {
      session = existing
    } else {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) return { error: 'Error al crear cuenta. Intenta de nuevo.' }
      session = data.session
    }

    const { data: newPlayer, error: createError } = await supabase
      .from('players')
      .insert({ username, auth_id: session.user.id })
      .select()
      .single()

    if (createError) return { error: 'Error al guardar el perfil.' }

    setPlayer(newPlayer)
    sessionStorage.setItem('player_' + session.user.id, JSON.stringify(newPlayer))
    return { player: newPlayer }
  }

  async function refreshPlayer() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: p } = await supabase.from('players').select('*').eq('auth_id', session.user.id).single()
    if (p) {
      setPlayer(p)
      sessionStorage.setItem('player_' + session.user.id, JSON.stringify(p))
    }
  }

  return { player, loading, registerPlayer, setPlayer, refreshPlayer }
}
