import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Verify() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    async function processToken() {
      try {
        const hash = window.location.hash
        const hashParams = new URLSearchParams(hash.replace('#', ''))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')

        const searchParams = new URLSearchParams(window.location.search)
        const tokenHash = searchParams.get('token_hash')
        const type = searchParams.get('type')

        let session = null

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          if (error) throw error
          session = data.session
        } else if (tokenHash) {
          const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type || 'email' })
          if (error) throw error
          session = data.session
        } else {
          const { data } = await supabase.auth.getSession()
          session = data.session
        }

        if (!session?.user) throw new Error('No session')

        let { data: player } = await supabase
          .from('players')
          .select('id, email_verified, email')
          .eq('auth_id', session.user.id)
          .single()

        if (!player && session.user.email) {
          const { data: playerByEmail } = await supabase
            .from('players')
            .select('id, email_verified, email')
            .eq('email', session.user.email)
            .single()
          if (playerByEmail) {
            player = playerByEmail
            await supabase.from('players').update({ auth_id: session.user.id }).eq('id', player.id)
          }
        }

        if (player) {
          await supabase.from('players').update({ email_verified: true, email: session.user.email }).eq('id', player.id)
          // Dar 5 skills por verificar la cuenta
          await supabase.rpc('grant_verification_skills', { p_player_id: player.id })
          const key = 'player_' + session.user.id
          const cached = JSON.parse(sessionStorage.getItem(key) || '{}')
          sessionStorage.setItem(key, JSON.stringify({ ...cached, email_verified: true, email: session.user.email }))
        }

        setStatus('success')
        setTimeout(() => navigate('/'), 3000)

      } catch (err) {
        console.error('Verify error:', err)
        setStatus('error')
        setTimeout(() => navigate('/'), 4000)
      }
    }

    processToken()
  }, [])

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {status === 'loading' && (
          <>
            <p style={styles.icon}>⏳</p>
            <p style={styles.title}>Verificando tu cuenta...</p>
            <p style={styles.sub}>Un momento</p>
          </>
        )}
        {status === 'success' && (
          <>
            <p style={styles.icon}>✅</p>
            <p style={styles.title}>¡Cuenta protegida!</p>
            <p style={styles.sub}>Tu cuenta, puntos y victorias están seguros para siempre. Volviendo a SnapGoal...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <p style={styles.icon}>❌</p>
            <p style={styles.title}>Link expirado</p>
            <p style={styles.sub}>El enlace ha caducado. Vuelve a la app y solicita uno nuevo desde "Proteger mi cuenta".</p>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: { height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#141414', padding:'2rem' },
  card: { background:'#1c1c1c', border:'1px solid rgba(255,180,0,0.2)', borderRadius:'20px', padding:'2.5rem 2rem', display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem', width:'100%', maxWidth:'380px', textAlign:'center' },
  icon: { fontSize:'3rem', margin:0 },
  title: { fontSize:'1.4rem', fontWeight:'800', color:'#fff', margin:0, letterSpacing:'-0.5px' },
  sub: { fontSize:'0.9rem', color:'rgba(255,255,255,0.4)', margin:0, lineHeight:1.6 },
}
