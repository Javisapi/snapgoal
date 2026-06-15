import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { ADMIN_EMAILS } from '../components/AdminGuard'

export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    const trimmed = email.trim().toLowerCase()
    if (!ADMIN_EMAILS.includes(trimmed)) {
      setError('Email no autorizado')
      return
    }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: 'https://snapgoal.vercel.app/verify-admin' }
    })
    setLoading(false)
    if (err) { setError('Error al enviar el magic link'); return }
    setSent(true)
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <p style={styles.wordmark}>SnapGoal</p>
        <div style={styles.line} />
        <p style={styles.title}>Panel de administración</p>
        {sent ? (
          <>
            <p style={styles.icon}>📧</p>
            <p style={styles.sub}>Revisa tu email. Te hemos enviado un magic link para acceder.</p>
          </>
        ) : (
          <>
            <input
              style={styles.input}
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              autoCapitalize="none"
              autoCorrect="off"
            />
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.btn} onClick={handleLogin} disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar magic link'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  container: { height:'100%', display:'flex', alignItems:'center', justifyContent:'center', background:'#141414', padding:'2rem' },
  card: { background:'#1c1c1c', border:'1px solid rgba(255,180,0,0.2)', borderRadius:'20px', padding:'2.5rem 2rem', display:'flex', flexDirection:'column', gap:'1rem', width:'100%', maxWidth:'380px' },
  wordmark: { margin:0, fontSize:'2rem', fontWeight:'900', color:'#fff', letterSpacing:'-2px' },
  line: { height:'3px', width:'40px', background:'#ffb400', borderRadius:'2px' },
  title: { margin:0, fontSize:'0.85rem', color:'rgba(255,255,255,0.3)', letterSpacing:'1px', textTransform:'uppercase' },
  icon: { margin:0, fontSize:'2.5rem', textAlign:'center' },
  sub: { margin:0, fontSize:'0.9rem', color:'rgba(255,255,255,0.4)', lineHeight:1.6, textAlign:'center' },
  input: { background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,0.15)', borderRadius:0, padding:'0.75rem 0', fontSize:'1.1rem', fontWeight:'600', color:'#fff', outline:'none', width:'100%' },
  error: { margin:0, fontSize:'0.8rem', color:'#ff4444' },
  btn: { background:'#ffb400', color:'#141414', border:'none', borderRadius:'12px', padding:'1rem', fontSize:'1rem', fontWeight:'800', cursor:'pointer', width:'100%' },
}
