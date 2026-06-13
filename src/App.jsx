import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { supabase } from './lib/supabase'

function EmailVerificationHandler() {
  useEffect(() => {
    async function checkVerification() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.email_confirmed_at) return
      const { data: player } = await supabase
        .from('players')
        .select('id, email_verified, email')
        .eq('auth_id', session.user.id)
        .single()
      if (player && !player.email_verified && session.user.email) {
        await supabase
          .from('players')
          .update({ email_verified: true, email: session.user.email })
          .eq('id', player.id)
        const key = 'player_' + session.user.id
        const cached = JSON.parse(sessionStorage.getItem(key) || '{}')
        sessionStorage.setItem(key, JSON.stringify({ ...cached, email_verified: true, email: session.user.email }))
      }
    }

    checkVerification()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user?.email_confirmed_at) {
        const { data: player } = await supabase
          .from('players')
          .select('id, email_verified')
          .eq('auth_id', session.user.id)
          .single()
        if (player && !player.email_verified) {
          await supabase
            .from('players')
            .update({ email_verified: true, email: session.user.email })
            .eq('id', player.id)
          const key = 'player_' + session.user.id
          const cached = JSON.parse(sessionStorage.getItem(key) || '{}')
          sessionStorage.setItem(key, JSON.stringify({ ...cached, email_verified: true, email: session.user.email }))
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [])
  return null
}
import Home from './screens/Home'
import Queue from './screens/Queue'
import Game from './screens/Game'
import Result from './screens/Result'
import Ranking from './screens/Ranking'
import Rules from './screens/Rules'
import Skills from './screens/Skills'
import Academy from './screens/Academy'
import TrainingGame from './screens/TrainingGame'
import Announce from './screens/Announce'
import Leagues from './screens/Leagues'
import League from './screens/League'
import Shootout from './screens/Shootout'
import Verify from './screens/Verify'

function App() {
  return (
    <BrowserRouter>
      <EmailVerificationHandler />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/game/:matchId" element={<Game />} />
        <Route path="/result/:matchId" element={<Result />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/academy" element={<Academy />} />
        <Route path="/academy/train/:type/:difficulty" element={<TrainingGame />} />
        <Route path="/announce/:matchId" element={<Announce />} />
        <Route path="/leagues" element={<Leagues />} />
        <Route path="/league/:leagueId" element={<League />} />
        <Route path="/shootout/:matchId" element={<Shootout />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/verify" element={<Verify />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
