import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ADMIN_EMAILS } from '../components/AdminGuard'

export default function VerifyAdmin() {
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    async function process() {
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
          const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type || 'magiclink' })
          if (error) throw error
          session = data.session
        } else {
          const { data } = await supabase.auth.getSession()
          session = data.session
        }

        if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
          throw new Error('No autorizado')
        }

        setStatus('success')
        setTimeout(() => navigate('/admin'), 2000)
      } catch (err) {
        console.error('VerifyAdmin error:', err)
        setStatus('error')
        setTimeout(() => navigate('/admin/login'), 3000)
      }
    }
    process()
  }, [])

  return (
    <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#141414', padding:'2rem' }}>
      <div style={{ background:'#1c1c1c', border:'1px solid rgba(255,180,0,0.2)', borderRadius:'20px', padding:'2.5rem 2rem', textAlign:'center', maxWidth:'360px', width:'100%' }}>
        {status === 'loading' && <><p style={{ fontSize:'2rem', margin:'0 0 1rem' }}>⏳</p><p style={{ color:'#fff', fontWeight:'800', margin:0 }}>Verificando acceso...</p></>}
        {status === 'success' && <><p style={{ fontSize:'2rem', margin:'0 0 1rem' }}>✅</p><p style={{ color:'#fff', fontWeight:'800', margin:0 }}>Acceso concedido. Entrando...</p></>}
        {status === 'error' && <><p style={{ fontSize:'2rem', margin:'0 0 1rem' }}>❌</p><p style={{ color:'#fff', fontWeight:'800', margin:0 }}>Acceso denegado</p></>}
      </div>
    </div>
  )
}
