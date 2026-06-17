import { useState, useEffect } from 'react'
import { registerPushSW, requestPermissionAndSubscribe } from '../lib/pushNotifications'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useSearchParams } from 'react-router-dom'
import ProtectAccount, { useShouldShowProtect, ProtectedBadge } from '../components/ProtectAccount'
import { useTrackPresence, usePresenceMap } from '../hooks/usePresence'

async function deleteAccount(playerId) {
  await supabase.from('plays').delete().eq('player_id', playerId)
  await supabase.from('matchmaking_queue').delete().eq('player_id', playerId)
  await supabase.from('matches').delete().or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
  await supabase.from('players').delete().eq('id', playerId)
  await supabase.auth.signOut()
  Object.keys(sessionStorage).forEach(k => sessionStorage.removeItem(k))
}

const HOME_CSS = `
  @keyframes fadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes lineDraw { from{width:0} to{width:48px} }
  @keyframes onlinePulse { 0%,100%{opacity:1;box-shadow:0 0 6px rgba(0,220,100,0.6)} 50%{opacity:0.7;box-shadow:0 0 12px rgba(0,220,100,0.3)} }
  @keyframes invitePulse { 0%,100%{box-shadow:0 0 24px rgba(255,210,80,0.5), 0 0 48px rgba(255,180,0,0.25)} 50%{box-shadow:0 0 36px rgba(255,220,80,0.8), 0 0 64px rgba(255,180,0,0.45)} }
`

export default function Home() {
  const { player, loading, registerPlayer, refreshPlayer } = useAuth()
  const [username, setUsername] = useState('')
  const [streak, setStreak] = useState(0)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const [showFieldIntro, setShowFieldIntro] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShowFieldIntro(false), 2000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    function handleOrientation(e) {
      const x = Math.max(-10, Math.min(10, (e.gamma || 0) * 0.4))
      const y = Math.max(-6, Math.min(6, (e.beta ? e.beta - 45 : 0) * 0.2))
      setParallax({ x, y })
    }
    window.addEventListener('deviceorientation', handleOrientation)
    return () => window.removeEventListener('deviceorientation', handleOrientation)
  }, [])
  const [skills, setSkills] = useState({ sniper: 0, glove: 0, hog: 0 })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pushAsked, setPushAsked] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showInstall, setShowInstall] = useState(false)
  const [showRegisterInfo, setShowRegisterInfo] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const [showProtect, setShowProtect] = useState(false)
  const [showRecover, setShowRecover] = useState(false)
  const [recoverEmail, setRecoverEmail] = useState('')
  const [recoverSent, setRecoverSent] = useState(false)
  const [recoverError, setRecoverError] = useState('')
  const [recoverLoading, setRecoverLoading] = useState(false)
  usePresenceMap((map) => setOnlineCount(Object.keys(map).length))
  useTrackPresence(player?.id, 'idle')

  useEffect(() => {
    if (!player?.id) return
    supabase.from('daily_streaks').select('current_streak').eq('player_id', player.id).single()
      .then(({ data }) => { if (data) setStreak(data.current_streak) })
    supabase.from('player_items').select('item_type,stock').eq('player_id', player.id)
      .then(({ data }) => {
        if (data) {
          const sniper = data.find(i => i.item_type === 'pro_shooter')?.stock || 0
          const glove = data.find(i => i.item_type === 'golden_glove')?.stock || 0
          const hog = data.find(i => i.item_type === 'hand_of_god')?.stock || 0
          setSkills({ sniper, glove, hog })
        }
      })
  }, [player?.id])
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const joinCode = searchParams.get('join')
  const openProtect = searchParams.get('protect')

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = HOME_CSS
    document.head.appendChild(s)
  }, [])

  useEffect(() => {
    if (player) {
      requestPermissionAndSubscribe(supabase, player.id)
      if (useShouldShowProtect(player) || openProtect) setShowProtect(true)
    }
  }, [player])

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isAndroid = /Android/.test(navigator.userAgent)

  useEffect(() => {
    const channel = supabase.channel('online-users', {
      config: { presence: { key: Math.random().toString(36).slice(2) } }
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        setOnlineCount(Object.keys(state).length)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() })
        }
      })

    return () => supabase.removeChannel(channel)
  }, [])

  async function handleRegister() {
    const name = username.trim()
    if (!name) { setError('Escribe tu nombre de jugador'); return }
    if (name.length < 3) { setError('Mínimo 3 caracteres'); return }
    if (name.length > 20) { setError('Máximo 20 caracteres'); return }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) { setError('Solo letras, números y guión bajo'); return }
    setSaving(true)
    setError('')
    const { player: newPlayer, error: authError } = await registerPlayer(name)
    if (authError) { setError(authError); setSaving(false); return }
    navigate('/tutorial')
  }

  useEffect(() => {
    if (joinCode && player) {
      navigate('/leagues?join=' + joinCode)
    }
  }, [joinCode, player])

  useEffect(() => {
    const onVerified = () => { if (refreshPlayer) refreshPlayer() }
    window.addEventListener('player_verified', onVerified)
    return () => window.removeEventListener('player_verified', onVerified)
  }, [])

  useEffect(() => {
    if (!player) return
    registerPushSW()
    const asked = localStorage.getItem('push_asked_' + player.id)
    if (!asked) {
      setTimeout(async () => {
        await requestPermissionAndSubscribe(supabase, player.id)
        localStorage.setItem('push_asked_' + player.id, '1')
      }, 3000)
    }
  }, [player])

  async function handleRecover() {
    const trimmed = recoverEmail.trim().toLowerCase()
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setRecoverError('Introduce un email válido')
      return
    }
    setRecoverLoading(true)
    setRecoverError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: 'https://snapgoal.vercel.app/verify', shouldCreateUser: false }
    })
    setRecoverLoading(false)
    if (error) {
      setRecoverError('No encontramos una cuenta con ese email. ¿Lo has protegido antes?')
      return
    }
    setRecoverSent(true)
  }

  async function handlePlay() {
    const { data: { session } } = await supabase.auth.getSession()
    if (session && player) {
      sessionStorage.setItem('player_' + session.user.id, JSON.stringify(player))
      navigate('/queue')
    }
  }

  async function handleDeleteAccount() {
    if (!player) return
    setDeleting(true)
    await deleteAccount(player.id)
    setDeleting(false)
    setShowDeleteConfirm(false)
    setDeleteConfirmName('')
    window.location.reload()
  }

  if (loading) return (
    <div style={styles.container}>
      <div style={styles.wordmark}>SnapGoal</div>
    </div>
  )

  if (player) return (
    <div style={styles.container}>
      <div style={{
        position:'absolute', inset:'-20px', pointerEvents:'none', zIndex:0,
        background:'radial-gradient(ellipse 140% 70% at 50% -10%, rgba(94,196,140,0.16), transparent 55%)',
        transform:`translate(${parallax.x}px, ${parallax.y}px)`,
        transition:'transform 0.3s ease-out',
      }} />

      {showFieldIntro && (
        <div style={{ position:'fixed', inset:0, zIndex:50, background:'#0a120e', pointerEvents:'none', animation:'fieldIntroFadeOut 2s ease forwards' }}>
          <svg viewBox="0 0 400 800" style={{ width:'100%', height:'100%' }}>
            <line x1="0" y1="400" x2="400" y2="400"
              stroke="#ffffff" strokeWidth="3"
              strokeDasharray="400" style={{ animation:'fieldIntroDraw 1.1s ease forwards', '--dash-len':'400', filter:'drop-shadow(0 0 4px #fff) drop-shadow(0 0 14px #fff) drop-shadow(0 0 30px rgba(200,255,230,0.9)) drop-shadow(0 0 60px rgba(150,255,210,0.6))' }} />
            <circle cx="200" cy="400" r="70" fill="none"
              stroke="#ffffff" strokeWidth="3"
              strokeDasharray="440" style={{ animation:'fieldIntroDraw 1.1s 0.3s ease forwards', '--dash-len':'440', filter:'drop-shadow(0 0 4px #fff) drop-shadow(0 0 14px #fff) drop-shadow(0 0 30px rgba(200,255,230,0.9)) drop-shadow(0 0 60px rgba(150,255,210,0.6))' }} />
            <circle cx="200" cy="400" r="3.5" fill="#ffffff"
              style={{ opacity:0, animation:'fieldIntroDraw 0.4s 1.2s ease forwards', filter:'drop-shadow(0 0 6px #fff) drop-shadow(0 0 20px #fff) drop-shadow(0 0 40px rgba(200,255,230,0.9))' }} />
          </svg>
        </div>
      )}

      {showDeleteConfirm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>Borrar cuenta</p>
            <p style={styles.modalText}>Se eliminarán permanentemente tu perfil, historial y estadísticas. Esta acción no se puede deshacer.</p>
            <p style={styles.modalText}>Escribe tu nombre de usuario para confirmar:</p>
            <input
              style={{...styles.input, marginBottom:'0.75rem'}}
              type="text"
              placeholder={player?.username}
              value={deleteConfirmName}
              onChange={e => setDeleteConfirmName(e.target.value.toLowerCase())}
            />
            <button style={{...styles.btnConfirmDelete, opacity: deleteConfirmName === player?.username ? 1 : 0.3}} onClick={handleDeleteAccount} disabled={deleting || deleteConfirmName !== player?.username}>
              {deleting ? 'Borrando...' : 'Confirmar borrado'}
            </button>
            <button style={styles.btnCancelDelete} onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmName('') }}>Cancelar</button>
          </div>
        </div>
      )}

      {showInstall && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>Instalar SnapGoal</p>
            {isIOS ? (
              <>
                <p style={styles.modalText}>En tu iPhone o iPad:</p>
                <div style={styles.installStep}><span style={styles.installNum}>1</span><p style={styles.installText}>Pulsa el botón de compartir en la barra del navegador</p></div>
                <div style={styles.installStep}><span style={styles.installNum}>2</span><p style={styles.installText}>Selecciona <strong style={{color:'#fff'}}>"Añadir a pantalla de inicio"</strong></p></div>
                <div style={styles.installStep}><span style={styles.installNum}>3</span><p style={styles.installText}>Pulsa <strong style={{color:'#fff'}}>"Añadir"</strong> — ya tienes SnapGoal en tu pantalla</p></div>
              </>
            ) : (
              <>
                <p style={styles.modalText}>En tu Android:</p>
                <div style={styles.installStep}><span style={styles.installNum}>1</span><p style={styles.installText}>Pulsa los <strong style={{color:'#fff'}}>tres puntos ⋮</strong> en la barra del navegador</p></div>
                <div style={styles.installStep}><span style={styles.installNum}>2</span><p style={styles.installText}>Selecciona <strong style={{color:'#fff'}}>"Añadir a pantalla de inicio"</strong></p></div>
                <div style={styles.installStep}><span style={styles.installNum}>3</span><p style={styles.installText}>Confirma — ya tienes SnapGoal en tu pantalla</p></div>
              </>
            )}
            <button style={styles.btnCancelDelete} onClick={() => setShowInstall(false)}>Cerrar</button>
          </div>
        </div>
      )}

      {showRegisterInfo && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>Crea tu perfil</p>
            <p style={styles.modalText}>Solo necesitas elegir un nombre de usuario. Sin email, sin contraseña, sin formularios.</p>
            <div style={styles.registerInfoList}>
              <div style={styles.registerInfoRow}><span style={styles.registerInfoDot}/><p style={styles.registerInfoText}>Elige un nombre único — ese será tu identidad en SnapGoal</p></div>
              <div style={styles.registerInfoRow}><span style={styles.registerInfoDot}/><p style={styles.registerInfoText}>Tu perfil se guarda automáticamente en este dispositivo</p></div>
              <div style={styles.registerInfoRow}><span style={styles.registerInfoDot}/><p style={styles.registerInfoText}>Acumula puntos, sube en el ranking y reta a cualquier jugador del mundo</p></div>
              <div style={styles.registerInfoRow}><span style={styles.registerInfoDot}/><p style={styles.registerInfoText}>En menos de 10 segundos estás jugando</p></div>
            </div>
            <button style={styles.btnPrimary} onClick={() => setShowRegisterInfo(false)}>Empezar</button>
          </div>
        </div>
      )}

      <div style={styles.top}>
        <div style={styles.topRow}>
          <div>
            <div style={styles.wordmark}>SnapGoal</div>
            <div style={styles.wordmarkLine} />
          </div>
          <div style={styles.topBtns}>
            {onlineCount > 0 && (
              <div style={styles.onlineBadge}>
                <div style={styles.onlineDot} />
                <span style={styles.onlineText}>{onlineCount} online</span>
              </div>
            )}
            <button style={styles.topBtn} onClick={() => setShowInstall(true)}>Instalar</button>
          </div>
        </div>
      </div>

      <style>{`@keyframes tutorialBtnGlow{0%,100%{box-shadow:0 0 6px rgba(147,197,253,0.2),0 0 12px rgba(147,197,253,0.1)}50%{box-shadow:0 0 14px rgba(147,197,253,0.5),0 0 28px rgba(147,197,253,0.2)}}`}</style>
      <div style={styles.playerSection}>
        <p style={styles.playerGreeting}>Bienvenido</p>
        <div style={{display:'flex', alignItems:'center', gap:'0.6rem'}}>
          <p style={styles.playerName}>{player.username}</p>
          {player?.email_verified && <ProtectedBadge />}
          <button onClick={() => navigate('/tutorial')} style={{background:'rgba(96,165,250,0.15)',border:'1px solid rgba(147,197,253,0.4)',borderRadius:'20px',padding:'3px 10px',fontSize:'0.7rem',fontWeight:'800',color:'#93c5fd',cursor:'pointer',whiteSpace:'nowrap',animation:'tutorialBtnGlow 2s ease-in-out infinite',flexShrink:0}}>✦ Tutorial</button>
        </div>
        {(skills.sniper > 0 || skills.glove > 0 || skills.hog > 0) && (
          <div style={{display:'flex', gap:'0.75rem', alignItems:'center', marginBottom:'0.25rem'}}>
            <span style={{fontSize:'0.8rem', color:'rgba(255,255,255,0.5)', fontWeight:'600'}}>🎯 ×{skills.sniper}</span>
            <span style={{fontSize:'0.8rem', color:'rgba(255,255,255,0.5)', fontWeight:'600'}}>🧤 ×{skills.glove}</span>
            {skills.hog > 0 && <span style={{fontSize:'0.8rem', color:'#7dd3fc', fontWeight:'600'}}>🙏 ×{skills.hog}</span>}
          </div>
        )}
        <div style={styles.playerMeta}>
          <span style={styles.playerMetaItem}>{player.total_points} pts</span>
          <span style={styles.playerMetaDot} />
          <span style={styles.playerMetaItem}>{player.xp_rating || 1500} XP</span>
          <span style={styles.playerMetaDot} />
          <span style={styles.playerMetaItem}>{player.matches_played} partidos</span>
          <span style={styles.playerMetaDot} />
          <span style={styles.playerMetaItem}>{player.matches_won}V {player.matches_lost}D</span>
        </div>
      </div>

      <div style={styles.mainCards}>
        <button style={styles.cardPlay} onClick={handlePlay}>
          <svg viewBox="0 0 40 40" fill="none" style={{width:'36px',height:'36px',marginBottom:'10px'}}>
            <rect x="6" y="8" width="3" height="22" rx="1.5" fill="#141414"/>
            <rect x="31" y="8" width="3" height="22" rx="1.5" fill="#141414"/>
            <rect x="6" y="8" width="28" height="3" rx="1.5" fill="#141414"/>
            <line x1="9" y1="11" x2="9" y2="30" stroke="#14141466" strokeWidth="0.8"/>
            <line x1="15" y1="11" x2="15" y2="30" stroke="#14141466" strokeWidth="0.8"/>
            <line x1="21" y1="11" x2="21" y2="30" stroke="#14141466" strokeWidth="0.8"/>
            <line x1="27" y1="11" x2="27" y2="30" stroke="#14141466" strokeWidth="0.8"/>
            <line x1="9" y1="16" x2="31" y2="16" stroke="#14141466" strokeWidth="0.8"/>
            <line x1="9" y1="22" x2="31" y2="22" stroke="#14141466" strokeWidth="0.8"/>
            <line x1="9" y1="28" x2="31" y2="28" stroke="#14141466" strokeWidth="0.8"/>
            <line x1="6" y1="30" x2="34" y2="30" stroke="#14141488" strokeWidth="1.5"/>
          </svg>
          <span style={styles.cardPlayLabel}>Buscar Partido</span>
          <span style={styles.cardSub}>Jugar ahora</span>
        </button>
        <button style={styles.cardLeague} onClick={() => navigate('/leagues')}>
          <svg viewBox="0 0 36 36" fill="none" style={{width:'36px',height:'36px',marginBottom:'10px'}}>
            <path d="M10 3h16v9c0 6-3.5 10-8 11C13.5 22 10 18 10 12V3z" fill="rgba(255,180,0,0.2)" stroke="rgba(255,180,0,0.9)" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M10 5.5H6.5S5 13 10 16" stroke="rgba(255,180,0,0.9)" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M26 5.5h3.5S31 13 26 16" stroke="rgba(255,180,0,0.9)" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M18 23v5" stroke="rgba(255,180,0,0.9)" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M13.5 28h9" stroke="rgba(255,180,0,0.9)" strokeWidth="1.4" strokeLinecap="round"/>
            <ellipse cx="18" cy="31.5" rx="6" ry="1.8" fill="rgba(255,180,0,0.15)" stroke="rgba(255,180,0,0.7)" strokeWidth="1.2"/>
          </svg>
          <span style={styles.cardLeagueLabel}>Mis Ligas</span>
          <span style={styles.cardSubLight}>Competir</span>
        </button>
      </div>
      <div style={{display:'flex',gap:'0.5rem',width:'100%'}}>
        <button style={styles.academyBtn} onClick={() => navigate('/academy')}>
          <svg viewBox="0 0 24 24" fill="none" style={{width:'18px',height:'18px',flexShrink:0}}>
            <circle cx="12" cy="12" r="10" stroke="#ffb400" strokeWidth="1.5" fill="none"/>
            <circle cx="12" cy="12" r="5.5" stroke="#ffb400" strokeWidth="1" fill="none"/>
            <circle cx="12" cy="12" r="2" fill="#ffb400"/>
            <line x1="12" y1="1" x2="12" y2="4" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="12" y1="20" x2="12" y2="23" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="1" y1="12" x2="4" y2="12" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="20" y1="12" x2="23" y2="12" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span style={styles.academyBtnLabel}>Academy</span>
        </button>
        <button style={styles.missionsBtn} onClick={() => navigate('/missions')}>
          <span style={{fontSize:'1.1rem'}}>🏟️</span>
          <span style={styles.missionsBtnLabel}>Vestuario</span>
          {streak > 0 && <span style={{fontSize:'0.7rem',color:'#ffb400',fontWeight:'800',display:'inline-flex',alignItems:'center',gap:'2px'}}><span style={{display:'inline-block',animation:'flamePulse 1.6s ease-in-out infinite'}}>🔥</span>{streak}</span>}
        </button>
      </div>

      <div style={styles.secondaryRow}>
        <button style={styles.btnIcon} onClick={() => navigate('/ranking')}>
          <svg viewBox="0 0 28 28" fill="none" style={{width:'22px',height:'22px',marginBottom:'5px'}}>
            <rect x="3" y="16" width="5" height="9" rx="1.5" fill="rgba(255,180,0,0.5)"/>
            <rect x="11" y="10" width="5" height="15" rx="1.5" fill="rgba(255,180,0,0.75)"/>
            <rect x="19" y="4" width="5" height="21" rx="1.5" fill="#ffb400"/>
          </svg>
          <span style={styles.btnIconLabel}>Ranking</span>
        </button>
        <button style={styles.btnIcon} onClick={() => navigate('/rules')}>
          <svg viewBox="0 0 28 28" fill="none" style={{width:'22px',height:'22px',marginBottom:'5px'}}>
            <rect x="5" y="2" width="18" height="24" rx="3" stroke="rgba(255,180,0,0.7)" strokeWidth="1.5" fill="none"/>
            <line x1="9" y1="9" x2="19" y2="9" stroke="rgba(255,180,0,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="9" y1="14" x2="19" y2="14" stroke="rgba(255,180,0,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="9" y1="19" x2="14" y2="19" stroke="rgba(255,180,0,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span style={styles.btnIconLabel}>Reglas</span>
        </button>
        <button style={styles.btnIcon} onClick={() => navigate('/skills')}>
          <svg viewBox="0 0 28 28" fill="none" style={{width:'22px',height:'22px',marginBottom:'5px'}}>
            <circle cx="14" cy="14" r="10" stroke="rgba(255,180,0,0.7)" strokeWidth="1.5" fill="none"/>
            <circle cx="14" cy="14" r="5.5" stroke="rgba(255,180,0,0.7)" strokeWidth="1" fill="none"/>
            <circle cx="14" cy="14" r="2" fill="rgba(255,180,0,0.8)"/>
            <line x1="14" y1="1" x2="14" y2="4.5" stroke="rgba(255,180,0,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="14" y1="23.5" x2="14" y2="27" stroke="rgba(255,180,0,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="1" y1="14" x2="4.5" y2="14" stroke="rgba(255,180,0,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
            <line x1="23.5" y1="14" x2="27" y2="14" stroke="rgba(255,180,0,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <span style={styles.btnIconLabel}>Skills</span>
        </button>
      </div>
      {showProtect && !player?.email_verified && (
        <div style={styles.overlay}>
          <div style={styles.protectModal}>
            <ProtectAccount
              player={player}
              onDone={() => setShowProtect(false)}
              onDismiss={() => setShowProtect(false)}
              inline={true}
            />
          </div>
        </div>
      )}
      <button style={styles.btnInvite} onClick={() => {
        const text = '⚽ Únete a SnapGoal. Partidos rápidos, Ligas y mucho más. https://snapgoal.vercel.app'
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')
      }}>🎁 Invita a un amigo</button>
      {!player?.email_verified && <div style={{display:'flex', flexDirection:'column', gap:'0.4rem'}}>
        <p style={{fontSize:'0.72rem', color:'#ffb400', textAlign:'center', margin:0, fontWeight:'600'}}>🎁 Verifica tu cuenta y recibe 5 🎯 + 5 🧤</p>
        <button style={styles.btnProtect} onClick={() => setShowProtect(true)}>🔒 Proteger mi cuenta</button>
      </div>}
      <button style={styles.btnGhost} onClick={() => setShowDeleteConfirm(true)}>Borrar cuenta</button>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.top}>
        <div style={styles.topRow}>
          <div>
            <div style={styles.wordmark}>SnapGoal</div>
            <div style={styles.wordmarkLine} />
          </div>
          <div style={styles.topBtns}>
            {onlineCount > 0 && (
              <div style={styles.onlineBadge}>
                <div style={styles.onlineDot} />
                <span style={styles.onlineText}>{onlineCount} online</span>
              </div>
            )}
            <button style={styles.topBtn} onClick={() => setShowInstall(true)}>Instalar</button>
          </div>
        </div>
        <p style={styles.tagline}>Sin VAR. Sin lesiones. 30 secondi sono molto lunghi.</p>
      </div>

      <div style={styles.registerSection}>
        <p style={styles.registerLabel}>Elige tu nombre</p>
        <input
          style={styles.input}
          type="text"
          placeholder="ej: Snaplayer00"
          value={username}
          onChange={e => setUsername(e.target.value.toLowerCase())}
          onKeyDown={e => e.key === 'Enter' && handleRegister()}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
        />
        <p style={styles.inputHint}>Solo letras, números y guión bajo. No se puede cambiar.</p>
        {error && <p style={styles.error}>{error}</p>}
      </div>

      <div style={styles.actions}>
        <button style={styles.btnPrimary} onClick={handleRegister} disabled={saving}>
          {saving ? 'Creando...' : 'Empezar a jugar'}
        </button>
        <button style={styles.btnSecondary} onClick={() => navigate('/ranking')}>Ranking</button>
        <button style={styles.btnSecondary} onClick={() => navigate('/leagues')}>🏆 Mis Ligas</button>
        <button style={styles.btnSecondary} onClick={() => navigate('/rules')}>Reglas</button>
        <button style={styles.btnGhost} onClick={() => setShowRegisterInfo(true)}>¿Cómo crear mi perfil?</button>
        <button style={{...styles.btnGhost, color:'rgba(255,180,0,0.5)'}} onClick={() => setShowRecover(true)}>🔑 Ya tengo cuenta — recuperar acceso</button>
      </div>

      {showRecover && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            {recoverSent ? (
              <>
                <p style={styles.modalTitle}>📧 Revisa tu email</p>
                <p style={styles.modalText}>Te hemos enviado un magic link a <strong style={{color:'#fff'}}>{recoverEmail}</strong>. Haz clic en él para acceder a tu cuenta.</p>
                <button style={styles.btnCancelDelete} onClick={() => { setShowRecover(false); setRecoverSent(false); setRecoverEmail('') }}>Cerrar</button>
              </>
            ) : (
              <>
                <p style={styles.modalTitle}>🔑 Recuperar cuenta</p>
                <p style={styles.modalText}>Introduce el email con el que protegiste tu cuenta. Te enviaremos un link para acceder.</p>
                <input
                  style={{...styles.input, marginBottom:'0.75rem'}}
                  type="email"
                  placeholder="tu@email.com"
                  value={recoverEmail}
                  onChange={e => setRecoverEmail(e.target.value.toLowerCase())}
                  onKeyDown={e => e.key === 'Enter' && handleRecover()}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                {recoverError && <p style={{fontSize:'0.8rem', color:'#ff4444', margin:0}}>{recoverError}</p>}
                <button style={styles.btnPrimary} onClick={handleRecover} disabled={recoverLoading}>
                  {recoverLoading ? 'Enviando...' : 'Enviar magic link'}
                </button>
                <button style={styles.btnCancelDelete} onClick={() => { setShowRecover(false); setRecoverEmail(''); setRecoverError('') }}>Cancelar</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { height:'100%', display:'flex', flexDirection:'column', justifyContent:'space-between', padding:'3.5rem 2rem 4rem', background:'#141414', position:'relative', animation:'fadeIn 0.4s ease forwards' },
  top: { display:'flex', flexDirection:'column', gap:'0.75rem' },
  wordmark: { fontSize:'2.8rem', fontWeight:'900', color:'#fff', letterSpacing:'-2px', lineHeight:1 },
  wordmarkLine: { height:'3px', width:'48px', background:'#ffb400', borderRadius:'2px', animation:'lineDraw 0.5s ease 0.2s both' },
  tagline: { fontSize:'0.85rem', color:'rgba(255,255,255,0.25)', letterSpacing:'0.5px', margin:0 },
  playerSection: { display:'flex', flexDirection:'column', gap:'0.4rem' },
  playerGreeting: { fontSize:'0.8rem', color:'rgba(255,255,255,0.3)', letterSpacing:'1px', textTransform:'uppercase', margin:0 },
  playerName: { fontSize:'2rem', fontWeight:'800', color:'#fff', letterSpacing:'-1px', margin:0 },
  playerMeta: { display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' },
  playerMetaItem: { fontSize:'0.8rem', color:'rgba(255,255,255,0.4)' },
  playerMetaDot: { width:'3px', height:'3px', borderRadius:'50%', background:'rgba(255,255,255,0.2)' },
  registerSection: { display:'flex', flexDirection:'column', gap:'0.75rem' },
  registerLabel: { fontSize:'0.8rem', color:'rgba(255,255,255,0.3)', letterSpacing:'1px', textTransform:'uppercase', margin:0 },
  input: { background:'transparent', border:'none', borderBottom:'1px solid rgba(255,255,255,0.15)', borderRadius:0, padding:'0.75rem 0', fontSize:'1.4rem', fontWeight:'700', color:'#fff', outline:'none', width:'100%', letterSpacing:'-0.5px' },
  inputHint: { fontSize:'0.75rem', color:'rgba(255,255,255,0.2)', margin:0 },
  error: { fontSize:'0.85rem', color:'#ff4444', margin:0 },
  actions: { display:'flex', flexDirection:'column', gap:'0.75rem' },
  mainCards: { display:'flex', gap:'0.75rem', width:'100%' },
  cardPlay: { flex:1, background:'linear-gradient(145deg, #ffb400 0%, #e07800 100%)', border:'none', borderRadius:'20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:'1.25rem 0.75rem', minHeight:'130px', boxShadow:'0 8px 32px rgba(255,180,0,0.25)', animation:'ctaGlowPulse 2.4s ease-in-out infinite' },
  cardPlayLabel: { fontSize:'0.95rem', fontWeight:'800', color:'#141414', letterSpacing:'0.2px', margin:0 },
  cardLeague: { flex:1, background:'rgba(255,180,0,0.07)', border:'1.5px solid rgba(255,180,0,0.2)', borderRadius:'20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:'1.25rem 0.75rem', minHeight:'130px' },
  cardLeagueLabel: { fontSize:'0.95rem', fontWeight:'800', color:'rgba(255,180,0,0.9)', letterSpacing:'0.2px', margin:0 },
  cardSub: { fontSize:'0.7rem', color:'rgba(0,0,0,0.35)', marginTop:'2px', fontWeight:'500' },
  cardSubLight: { fontSize:'0.7rem', color:'rgba(255,180,0,0.4)', marginTop:'2px', fontWeight:'500' },
  academyBtn: { display:'flex', alignItems:'center', gap:'0.75rem', flex:1, background:'rgba(255,180,0,0.06)', border:'1px solid rgba(255,180,0,0.2)', borderRadius:'14px', padding:'0.9rem 1rem', cursor:'pointer', textAlign:'left' },
  academyBtnLabel: { flex:1, fontSize:'0.88rem', fontWeight:'700', color:'rgba(255,180,0,0.8)', letterSpacing:'0.2px' },
  academyBtnArrow: { fontSize:'1.2rem', color:'rgba(255,180,0,0.4)' },
  missionsBtn: { display:'flex', alignItems:'center', justifyContent:'center', gap:'0.4rem', flex:1, background:'rgba(255,180,0,0.06)', border:'1px solid rgba(255,180,0,0.2)', borderRadius:'14px', padding:'0.9rem 1rem', cursor:'pointer' },
  missionsBtnLabel: { fontSize:'0.88rem', fontWeight:'700', color:'rgba(255,180,0,0.8)' },
  secondaryRow: { display:'flex', gap:'0.75rem', width:'100%' },
  btnIcon: { flex:1, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'14px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:'0.85rem 0.5rem' },
  btnIconLabel: { fontSize:'0.72rem', fontWeight:'600', color:'rgba(255,255,255,0.4)', letterSpacing:'0.5px' },
  btnPrimary: { background:'#ffb400', color:'#141414', border:'none', borderRadius:'12px', padding:'1.1rem', fontSize:'1rem', fontWeight:'800', cursor:'pointer', width:'100%', letterSpacing:'0.5px' },
  btnSecondary: { background:'transparent', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'12px', padding:'0.9rem', fontSize:'0.9rem', cursor:'pointer', width:'100%' },
  btnInvite: { background:'rgba(255,180,0,0.12)', border:'1px solid rgba(255,210,80,0.6)', borderRadius:'12px', color:'#ffd040', fontSize:'0.9rem', fontWeight:'700', cursor:'pointer', padding:'0.9rem', width:'100%', boxShadow:'0 0 24px rgba(255,210,80,0.5), 0 0 48px rgba(255,180,0,0.25)', animation:'invitePulse 2s ease-in-out infinite' },
  btnProtect: { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:'12px', color:'rgba(255,255,255,0.5)', fontSize:'0.9rem', fontWeight:'700', cursor:'pointer', padding:'0.9rem', width:'100%', boxShadow:'0 0 8px rgba(255,255,255,0.05)' },
  btnGhost: { background:'transparent', color:'rgba(255,80,80,0.4)', border:'none', padding:'0.5rem', fontSize:'0.8rem', cursor:'pointer', width:'100%' },
  protectModal: { background:'#1c1c1c', border:'1px solid rgba(255,180,0,0.2)', borderRadius:'20px', padding:'2rem 1.75rem', width:'92%', maxWidth:'480px' },
  topRow: { display:'flex', justifyContent:'space-between', alignItems:'flex-start' },
  topBtns: { display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.4rem', paddingTop:'0.25rem' },
  topBtn: { background:'rgba(255,180,0,0.1)', border:'1px solid rgba(255,180,0,0.2)', borderRadius:'8px', color:'#ffb400', fontSize:'0.72rem', fontWeight:'700', cursor:'pointer', padding:'5px 10px', letterSpacing:'0.3px' },
  onlineBadge: { display:'flex', alignItems:'center', gap:'5px', background:'rgba(0,220,100,0.08)', border:'1px solid rgba(0,220,100,0.2)', borderRadius:'20px', padding:'4px 10px', animation:'onlinePulse 2.5s ease-in-out infinite' },
  onlineDot: { width:'6px', height:'6px', borderRadius:'50%', background:'#00dc64', flexShrink:0 },
  onlineText: { fontSize:'0.7rem', fontWeight:'700', color:'#00dc64', letterSpacing:'0.3px' },
  installStep: { display:'flex', alignItems:'flex-start', gap:'0.75rem', padding:'0.4rem 0' },
  installNum: { width:'22px', height:'22px', borderRadius:'50%', background:'#ffb400', color:'#141414', fontSize:'0.75rem', fontWeight:'900', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  installText: { fontSize:'0.85rem', color:'rgba(255,255,255,0.5)', lineHeight:1.5, margin:0 },
  registerInfoList: { display:'flex', flexDirection:'column', gap:'0.6rem' },
  registerInfoRow: { display:'flex', alignItems:'flex-start', gap:'0.6rem' },
  registerInfoDot: { width:'6px', height:'6px', borderRadius:'50%', background:'#ffb400', flexShrink:0, marginTop:'0.4rem' },
  registerInfoText: { fontSize:'0.9rem', color:'rgba(255,255,255,0.55)', lineHeight:1.5, margin:0 },
  overlay: { position:'absolute', inset:0, background:'rgba(0,0,0,0.9)', display:'flex', alignItems:'center', justifyContent:'center', padding:'2rem', zIndex:100 },
  modal: { background:'#1a1a1a', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'20px', padding:'1.75rem', display:'flex', flexDirection:'column', gap:'1rem', width:'100%' },
  modalTitle: { fontSize:'1.1rem', fontWeight:'700', color:'#fff', margin:0 },
  modalText: { fontSize:'0.85rem', color:'rgba(255,255,255,0.4)', lineHeight:1.6, margin:0 },
  btnConfirmDelete: { background:'#ff4444', color:'#fff', border:'none', borderRadius:'10px', padding:'0.9rem', fontSize:'0.95rem', fontWeight:'700', cursor:'pointer', width:'100%' },
  btnCancelDelete: { background:'transparent', color:'rgba(255,255,255,0.3)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'10px', padding:'0.85rem', fontSize:'0.9rem', cursor:'pointer', width:'100%' },
}
