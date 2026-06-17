import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect } from 'react'
import { supabase } from './lib/supabase'

function EmailVerificationHandler() {
  useEffect(() => {
    async function checkVerification() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user?.email_confirmed_at) return
      let { data: player } = await supabase
        .from('players')
        .select('id, email_verified, email')
        .eq('auth_id', session.user.id)
        .single()

      // Si no encontramos por auth_id, buscar por email (sesión anónima -> email)
      if (!player && session.user.email) {
        const { data: playerByEmail } = await supabase
          .from('players')
          .select('id, email_verified, email')
          .eq('email', session.user.email)
          .single()
        if (playerByEmail) {
          player = playerByEmail
          // Actualizar auth_id al nuevo
          await supabase.from('players').update({ auth_id: session.user.id }).eq('id', playerByEmail.id)
        }
      }

      if (player && !player.email_verified && session.user.email) {
        await supabase
          .from('players')
          .update({ email_verified: true, email: session.user.email })
          .eq('id', player.id)
        const key = 'player_' + session.user.id
        const cached = JSON.parse(sessionStorage.getItem(key) || '{}')
        sessionStorage.setItem(key, JSON.stringify({ ...cached, email_verified: true, email: session.user.email }))
        window.dispatchEvent(new Event('player_verified'))
      }
    }

    checkVerification()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user?.email_confirmed_at) {
        let { data: player } = await supabase
          .from('players')
          .select('id, email_verified')
          .eq('auth_id', session.user.id)
          .single()

        if (!player && session.user.email) {
          const { data: playerByEmail } = await supabase
            .from('players')
            .select('id, email_verified')
            .eq('email', session.user.email)
            .single()
          if (playerByEmail) {
            player = playerByEmail
            await supabase.from('players').update({ auth_id: session.user.id }).eq('id', playerByEmail.id)
          }
        }

        if (player && !player.email_verified) {
          await supabase
            .from('players')
            .update({ email_verified: true, email: session.user.email })
            .eq('id', player.id)
          const key = 'player_' + session.user.id
          const cached = JSON.parse(sessionStorage.getItem(key) || '{}')
          sessionStorage.setItem(key, JSON.stringify({ ...cached, email_verified: true, email: session.user.email }))
          window.dispatchEvent(new Event('player_verified'))
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
import Missions from './screens/Missions'
import Tutorial from './screens/Tutorial'
import UpdateBanner from './components/UpdateBanner'
import TrainingGame from './screens/TrainingGame'
import Announce from './screens/Announce'
import Leagues from './screens/Leagues'
import League from './screens/League'
import Shootout from './screens/Shootout'
import Verify from './screens/Verify'
import Admin from './screens/Admin'
import AdminLogin from './screens/AdminLogin'
import VerifyAdmin from './screens/VerifyAdmin'

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
        <Route path="/missions" element={<Missions />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route path="/academy/train/:type/:difficulty" element={<TrainingGame />} />
        <Route path="/announce/:matchId" element={<Announce />} />
        <Route path="/leagues" element={<Leagues />} />
        <Route path="/league/:leagueId" element={<League />} />
        <Route path="/shootout/:matchId" element={<Shootout />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/verify-admin" element={<VerifyAdmin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
