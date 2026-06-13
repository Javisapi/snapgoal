import { useState, useEffect } from 'react'
import { registerPushSW, requestPermissionAndSubscribe } from '../lib/pushNotifications'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useSearchParams } from 'react-router-dom'

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
`

export default function Home() {
  const { player, loading, registerPlayer } = useAuth()
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pushAsked, setPushAsked] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [showInstall, setShowInstall] = useState(false)
  const [showRegisterInfo, setShowRegisterInfo] = useState(false)
  const [onlineCount, setOnlineCount] = useState(0)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const joinCode = searchParams.get('join')

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = HOME_CSS
    document.head.appendChild(s)
  }, [])

  useEffect(() => {
    if (player) {
      requestPermissionAndSubscribe(supabase, player.id)
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
    navigate('/queue')
  }

  useEffect(() => {
    if (joinCode && player) {
      navigate('/leagues?join=' + joinCode)
    }
  }, [joinCode, player])

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

      <div style={styles.playerSection}>
        <p style={styles.playerGreeting}>Bienvenido</p>
        <p style={styles.playerName}>{player.username}</p>
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
            <circle cx="20" cy="20" r="18" fill="rgba(0,0,0,0.15)"/>
            <polygon points="15,12 30,20 15,28" fill="#141414"/>
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
      <button style={styles.academyBtn} onClick={() => navigate('/academy')}>
        <svg viewBox="0 0 24 24" fill="none" style={{width:'20px',height:'20px',flexShrink:0}}>
          <circle cx="12" cy="12" r="10" stroke="#ffb400" strokeWidth="1.5" fill="none"/>
          <circle cx="12" cy="12" r="5.5" stroke="#ffb400" strokeWidth="1" fill="none"/>
          <circle cx="12" cy="12" r="2" fill="#ffb400"/>
          <line x1="12" y1="1" x2="12" y2="4" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="12" y1="20" x2="12" y2="23" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="1" y1="12" x2="4" y2="12" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="20" y1="12" x2="23" y2="12" stroke="#ffb400" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span style={styles.academyBtnLabel}>Academy — Entrena tu precisión</span>
        <span style={styles.academyBtnArrow}>›</span>
      </button>

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
      <button style={styles.btnInvite} onClick={() => {
        const text = '⚽ Únete a SnapGoal. Partidos rápidos, Ligas y mucho más. https://snapgoal.vercel.app'
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank')
      }}>🟢 Invita a un amigo</button>
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
      </div>
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
  cardPlay: { flex:1, background:'linear-gradient(145deg, #ffb400 0%, #e07800 100%)', border:'none', borderRadius:'20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:'1.25rem 0.75rem', minHeight:'130px', boxShadow:'0 8px 32px rgba(255,180,0,0.25)' },
  cardPlayLabel: { fontSize:'0.95rem', fontWeight:'800', color:'#141414', letterSpacing:'0.2px', margin:0 },
  cardLeague: { flex:1, background:'rgba(255,180,0,0.07)', border:'1.5px solid rgba(255,180,0,0.2)', borderRadius:'20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:'1.25rem 0.75rem', minHeight:'130px' },
  cardLeagueLabel: { fontSize:'0.95rem', fontWeight:'800', color:'rgba(255,180,0,0.9)', letterSpacing:'0.2px', margin:0 },
  cardSub: { fontSize:'0.7rem', color:'rgba(0,0,0,0.35)', marginTop:'2px', fontWeight:'500' },
  cardSubLight: { fontSize:'0.7rem', color:'rgba(255,180,0,0.4)', marginTop:'2px', fontWeight:'500' },
  academyBtn: { display:'flex', alignItems:'center', gap:'0.75rem', width:'100%', background:'rgba(255,180,0,0.06)', border:'1px solid rgba(255,180,0,0.2)', borderRadius:'14px', padding:'0.9rem 1rem', cursor:'pointer', textAlign:'left' },
  academyBtnLabel: { flex:1, fontSize:'0.88rem', fontWeight:'700', color:'rgba(255,180,0,0.8)', letterSpacing:'0.2px' },
  academyBtnArrow: { fontSize:'1.2rem', color:'rgba(255,180,0,0.4)' },
  secondaryRow: { display:'flex', gap:'0.75rem', width:'100%' },
  btnIcon: { flex:1, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:'14px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:'0.85rem 0.5rem' },
  btnIconLabel: { fontSize:'0.72rem', fontWeight:'600', color:'rgba(255,255,255,0.4)', letterSpacing:'0.5px' },
  btnPrimary: { background:'#ffb400', color:'#141414', border:'none', borderRadius:'12px', padding:'1.1rem', fontSize:'1rem', fontWeight:'800', cursor:'pointer', width:'100%', letterSpacing:'0.5px' },
  btnSecondary: { background:'transparent', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'12px', padding:'0.9rem', fontSize:'0.9rem', cursor:'pointer', width:'100%' },
  btnInvite: { background:'rgba(255,180,0,0.1)', border:'1px solid rgba(255,180,0,0.4)', borderRadius:'12px', color:'#ffb400', fontSize:'0.9rem', fontWeight:'700', cursor:'pointer', padding:'0.9rem', width:'100%', boxShadow:'0 0 16px rgba(255,180,0,0.35)' },
  btnGhost: { background:'transparent', color:'rgba(255,80,80,0.4)', border:'none', padding:'0.5rem', fontSize:'0.8rem', cursor:'pointer', width:'100%' },
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
