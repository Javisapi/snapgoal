import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const ADMIN_EMAILS = ['snapgoal00@gmail.com', 'javi.fernandez.castanon@gmail.com']

export default function AdminGuard({ children }) {
  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email && ADMIN_EMAILS.includes(session.user.email)) {
        setAllowed(true)
      } else {
        navigate('/admin/login')
      }
      setChecking(false)
    }
    check()
  }, [])

  if (checking) return (
    <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#141414' }}>
      <p style={{ color:'rgba(255,255,255,0.3)', fontSize:'0.9rem' }}>Verificando acceso...</p>
    </div>
  )

  return allowed ? children : null
}

export { ADMIN_EMAILS }
