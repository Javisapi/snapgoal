import { useState, useEffect } from 'react'
import { registerPushSW, requestPermissionAndSubscribe } from '../lib/pushNotifications'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useSearchParams } from 'react-router-dom'
import ProtectAccount, { useShouldShowProtect, ProtectedBadge } from '../components/ProtectAccount'
import { useTrackPresence, usePresenceMap } from '../hooks/usePresence'
import { useTranslation } from '../contexts/LanguageContext'

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
  const { lang, toggleLang, t } = useTranslation()
  const [username, setUsername] = useState('')
  const [streak, setStreak] = useState(0)
  const [pendingDuels, setPendingDuels] = useState(0)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const [showFieldIntro, setShowFieldIntro] = useState(true)

  useEffect(() => {
    const introTimer = setTimeout(() => setShowFieldIntro(false), 2000)
    return () => clearTimeout(introTimer)
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
  const [recoverCode, setRecoverCode] = useState('')
  const [recoverCodeError, setRecoverCodeError] = useState('')
  const [recoverCodeLoading, setRecoverCodeLoading] = useState(false)
  usePresenceMap((map) => setOnlineCount(Object.keys(map).length))
  useTrackPresence(player?.id, 'idle')

  useEffect(() => {
    if (!player?.id) return
    supabase.from('daily_streaks').select('current_streak').eq('player_id', player.id).single()
      .then(({ data }) => { if (data) setStreak(data.current_streak) })
    supabase.rpc('get_my_duels', { p_player_id: player.id })
      .then(({ data }) => {
        if (data) setPendingDuels(data.filter(d => d.role === 'received' && d.status === 'pending').length)
      })
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
    if (!name) { setError(t('home_err_empty')); return }
    if (name.length < 3) { setError(t('home_err_min')); return }
    if (name.length > 20) { setError(t('home_err_max')); return }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) { setError(t('home_err_chars')); return }
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
      setRecoverError(t('home_recover_invalid_email'))
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
      setRecoverError(t('home_recover_not_found'))
      return
    }
    setRecoverSent(true)
  }

  async function handleVerifyCode() {
    const code = recoverCode.trim()
    if (code.length !== 8) {
      setRecoverCodeError(t('home_recover_code_err_length'))
      return
    }
    setRecoverCodeLoading(true)
    setRecoverCodeError('')
    const { error } = await supabase.auth.verifyOtp({
      email: recoverEmail.trim().toLowerCase(),
      token: code,
      type: 'email',
    })
    setRecoverCodeLoading(false)
    if (error) {
      setRecoverCodeError(t('home_recover_code_err_invalid'))
      return
    }
    window.location.reload()
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
        background:"radial-gradient(ellipse 140% 70% at 50% -10%, rgba(94,196,140,0.16), transparent 55%), radial-gradient(ellipse 160% 90% at 50% 110%, rgba(34,90,60,0.14), transparent 60%)",
        transform:`translate(${parallax.x}px, ${parallax.y}px)`,
        transition:'transform 0.3s ease-out',
      }} />

      {showFieldIntro && (
        <div style={{ position:'fixed', inset:0, zIndex:50, background:'#0a120e', pointerEvents:'none', animation:'fieldIntroFadeOut 2s ease forwards' }}>
          <svg viewBox="0 0 400 800" style={{ width:'100%', height:'100%' }}>
            <defs>
              <filter id="neonGlow" x="-300%" y="-300%" width="700%" height="700%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="blur1" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="30" result="blur2" />
                <feGaussianBlur in="SourceGraphic" stdDeviation="50" result="blur3" />
                <feMerge>
                  <feMergeNode in="blur3" />
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g filter="url(#neonGlow)">
              <line x1="0" y1="400" x2="400" y2="400"
                stroke="#ffffff" strokeWidth="4"
                strokeDasharray="400" style={{ animation:'fieldIntroDrawLine 1.1s ease forwards' }} />
              <circle cx="200" cy="400" r="70" fill="none"
                stroke="#ffffff" strokeWidth="4"
                strokeDasharray="440" style={{ animation:'fieldIntroDrawCircle 1.1s 0.3s ease forwards' }} />
              <circle cx="200" cy="400" r="4" fill="#ffffff"
                style={{ opacity:0, animation:'fieldIntroDot 0.4s 1.2s ease forwards' }} />
            </g>
          </svg>
        </div>
      )}

      {showDeleteConfirm && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>{t('home_delete_account')}</p>
            <p style={styles.modalText}>{t('home_delete_warning')}</p>
            <p style={styles.modalText}>{t('home_delete_confirm_prompt')}</p>
            <input
              style={{...styles.input, marginBottom:'0.75rem'}}
              type="text"
              placeholder={player?.username}
              value={deleteConfirmName}
              onChange={e => setDeleteConfirmName(e.target.value.toLowerCase())}
            />
            <button style={{...styles.btnConfirmDelete, opacity: deleteConfirmName === player?.username ? 1 : 0.3}} onClick={handleDeleteAccount} disabled={deleting || deleteConfirmName !== player?.username}>
              {deleting ? t('home_deleting') : t('home_delete_confirm_btn')}
            </button>
            <button style={styles.btnCancelDelete} onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmName('') }}>{t('home_cancel')}</button>
          </div>
        </div>
      )}

      {showInstall && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>{t('home_install_title')}</p>
            {isIOS ? (
              <>
                <p style={styles.modalText}>{t('home_install_ios_intro')}</p>
                <div style={styles.installStep}><span style={styles.installNum}>1</span><p style={styles.installText}>{t('home_install_ios_step1')}</p></div>
                <div style={styles.installStep}><span style={styles.installNum}>2</span><p style={styles.installText}>{t('home_install_select')} <strong style={{color:'#fff'}}>{t('home_install_add_home')}</strong></p></div>
                <div style={styles.installStep}><span style={styles.installNum}>3</span><p style={styles.installText}>{t('home_install_tap')} <strong style={{color:'#fff'}}>{t('home_install_add_word')}</strong> {t('home_install_done_suffix')}</p></div>
              </>
            ) : (
              <>
                <p style={styles.modalText}>{t('home_install_android_intro')}</p>
                <div style={styles.installStep}><span style={styles.installNum}>1</span><p style={styles.installText}>{t('home_install_tap_the')} <strong style={{color:'#fff'}}>{t('home_install_three_dots')}</strong> {t('home_install_in_browser_bar')}</p></div>
                <div style={styles.installStep}><span style={styles.installNum}>2</span><p style={styles.installText}>{t('home_install_select')} <strong style={{color:'#fff'}}>{t('home_install_add_home')}</strong></p></div>
                <div style={styles.installStep}><span style={styles.installNum}>3</span><p style={styles.installText}>{t('home_install_confirm')} {t('home_install_done_suffix')}</p></div>
              </>
            )}
            <button style={styles.btnCancelDelete} onClick={() => setShowInstall(false)}>{t('home_close')}</button>
          </div>
        </div>
      )}

      {showRegisterInfo && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>{t('home_register_info_title')}</p>
            <p style={styles.modalText}>{t('home_register_info_desc')}</p>
            <div style={styles.registerInfoList}>
              <div style={styles.registerInfoRow}><span style={styles.registerInfoDot}/><p style={styles.registerInfoText}>{t('home_register_info_1')}</p></div>
              <div style={styles.registerInfoRow}><span style={styles.registerInfoDot}/><p style={styles.registerInfoText}>{t('home_register_info_2')}</p></div>
              <div style={styles.registerInfoRow}><span style={styles.registerInfoDot}/><p style={styles.registerInfoText}>{t('home_register_info_3')}</p></div>
              <div style={styles.registerInfoRow}><span style={styles.registerInfoDot}/><p style={styles.registerInfoText}>{t('home_register_info_4')}</p></div>
            </div>
            <button style={styles.btnPrimary} onClick={() => setShowRegisterInfo(false)}>{t('home_start_button')}</button>
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
            <div style={{display:'flex', gap:'0.4rem'}}>
              {onlineCount > 0 && (
                <div style={styles.onlineBadge}>
                  <div style={styles.onlineDot} />
                  <span style={styles.onlineText}>{onlineCount} {t('home_online')}</span>
                </div>
              )}
              <button style={styles.topBtn} onClick={toggleLang}>{lang === 'es' ? 'EN' : 'ES'}</button>
            </div>
            <button style={styles.topBtn} onClick={() => setShowInstall(true)}>{t('home_install')}</button>
          </div>
        </div>
      </div>

      <style>{`@keyframes tutorialBtnGlow{0%,100%{box-shadow:0 0 6px rgba(147,197,253,0.2),0 0 12px rgba(147,197,253,0.1)}50%{box-shadow:0 0 14px rgba(147,197,253,0.5),0 0 28px rgba(147,197,253,0.2)}}`}</style>
      <div style={styles.playerSection}>
        <p style={styles.playerGreeting}>{t('home_welcome')}</p>
        <div style={{display:'flex', alignItems:'center', gap:'0.6rem'}}>
          <p style={styles.playerName}>{player.username}</p>
          {player?.email_verified && <ProtectedBadge />}
          <button onClick={() => navigate('/tutorial')} style={{background:'rgba(96,165,250,0.15)',border:'1px solid rgba(147,197,253,0.4)',borderRadius:'20px',padding:'3px 10px',fontSize:'0.7rem',fontWeight:'800',color:'#93c5fd',cursor:'pointer',whiteSpace:'nowrap',animation:'tutorialBtnGlow 2s ease-in-out infinite',flexShrink:0}}>✦ {t('home_tutorial')}</button>
        </div>
        {(skills.sniper > 0 || skills.glove > 0 || skills.hog > 0) && (
          <div style={{display:'flex', gap:'0.75rem', alignItems:'center', marginBottom:'0.25rem'}}>
            <span style={{fontSize:'0.8rem', color:'rgba(255,255,255,0.5)', fontWeight:'600'}}>🎯 ×{skills.sniper}</span>
            <span style={{fontSize:'0.8rem', color:'rgba(255,255,255,0.5)', fontWeight:'600'}}>🧤 ×{skills.glove}</span>
            {skills.hog > 0 && <span style={{fontSize:'0.8rem', color:'#7dd3fc', fontWeight:'600'}}>🙏 ×{skills.hog}</span>}
          </div>
        )}
        <div style={styles.statCardsRow}>
          <div style={styles.statCard}>
            <p style={styles.statCardLabel}>{t('home_xp')}</p>
            <p style={styles.statCardValue}>{player.xp_rating || 1500}</p>
          </div>
          <div style={styles.statCard}>
            <p style={styles.statCardLabel}>{t('home_league_points')}</p>
            <p style={styles.statCardValue}>{player.total_points}</p>
          </div>
        </div>
        <div style={styles.playerMetaSecondary}>
          <span style={styles.playerMetaItem}>{player.matches_played} {t('home_matches')}</span>
          <span style={styles.playerMetaDot} />
          <span style={styles.playerMetaItem}>{player.matches_won}{t('home_won_abbr')} {player.matches_lost}{t('home_lost_abbr')}</span>
        </div>
      </div>

      <button style={styles.cardPlay} onClick={handlePlay}>
        <svg viewBox="0 0 40 40" fill="none" style={{width:'32px',height:'32px',marginBottom:'8px'}}>
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
        <span style={styles.cardPlayLabel}>{t('home_play')}</span>
        <span style={styles.cardSub}>{t('home_play_sub')}</span>
      </button>

      <div>
        <button style={styles.navItemFull} onClick={() => navigate('/ranking')}>
          <svg viewBox="0 0 28 28" fill="none" style={{width:'19px',height:'19px',flexShrink:0}}>
            <rect x="3" y="16" width="5" height="9" rx="1.5" fill="rgba(255,180,0,0.5)"/>
            <rect x="11" y="10" width="5" height="15" rx="1.5" fill="rgba(255,180,0,0.75)"/>
            <rect x="19" y="4" width="5" height="21" rx="1.5" fill="#ffb400"/>
          </svg>
          <span style={styles.navItemLabelAmber}>{t('home_ranking')}</span>
        </button>
        <p style={styles.navSectionLabel}>{t('home_more_options')}</p>
        <div style={styles.navGrid}>
          <button style={styles.navItem} onClick={() => navigate('/leagues')}>
            <svg viewBox="0 0 36 36" fill="none" style={{width:'19px',height:'19px',flexShrink:0}}>
              <path d="M10 3h16v9c0 6-3.5 10-8 11C13.5 22 10 18 10 12V3z" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinejoin="round"/>
              <path d="M10 5.5H6.5S5 13 10 16" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M26 5.5h3.5S31 13 26 16" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M18 23v5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M13.5 28h9" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round"/>
              <ellipse cx="18" cy="31.5" rx="6" ry="1.8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2"/>
            </svg>
            <span style={styles.navItemLabel}>{t('home_my_leagues')}</span>
          </button>
          <button style={styles.navItem} onClick={() => navigate('/duels')}>
            <span style={{fontSize:'1rem',flexShrink:0}}>⚔️</span>
            <span style={styles.navItemLabel}>{t('home_my_duels')}</span>
            {pendingDuels > 0 && <span style={styles.navBadge}>{pendingDuels}</span>}
          </button>
          <button style={styles.navItem} onClick={() => navigate('/academy')}>
            <svg viewBox="0 0 24 24" fill="none" style={{width:'19px',height:'19px',flexShrink:0}}>
              <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" fill="none"/>
              <circle cx="12" cy="12" r="5.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1" fill="none"/>
              <circle cx="12" cy="12" r="2" fill="rgba(255,255,255,0.55)"/>
              <line x1="12" y1="1" x2="12" y2="4" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="12" y1="20" x2="12" y2="23" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="1" y1="12" x2="4" y2="12" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="20" y1="12" x2="23" y2="12" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={styles.navItemLabel}>{t('home_academy')}</span>
          </button>
          <button style={styles.navItem} onClick={() => navigate('/missions')}>
            <svg viewBox="0 0 24 24" fill="none" style={{width:'19px',height:'19px',flexShrink:0}}>
              <path d="M8 3 L3 7 L5 9.5 L5 21 L19 21 L19 9.5 L21 7 L16 3 L13 5.5 Q12 6.5 11 5.5 Z" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
            </svg>
            <span style={styles.navItemLabel}>{t('home_locker_room')}</span>
            {streak > 0 && <span style={styles.navStreak}><span style={{display:'inline-block',animation:'flamePulse 1.6s ease-in-out infinite'}}>🔥</span>{streak}</span>}
          </button>
          <button style={styles.navItem} onClick={() => navigate('/rules')}>
            <svg viewBox="0 0 28 28" fill="none" style={{width:'19px',height:'19px',flexShrink:0}}>
              <rect x="5" y="2" width="18" height="24" rx="3" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" fill="none"/>
              <line x1="9" y1="9" x2="19" y2="9" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="9" y1="14" x2="19" y2="14" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="9" y1="19" x2="14" y2="19" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={styles.navItemLabel}>{t('home_rules')}</span>
          </button>
          <button style={styles.navItem} onClick={() => navigate('/skills')}>
            <svg viewBox="0 0 28 28" fill="none" style={{width:'19px',height:'19px',flexShrink:0}}>
              <circle cx="14" cy="14" r="10" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" fill="none"/>
              <circle cx="14" cy="14" r="5.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1" fill="none"/>
              <circle cx="14" cy="14" r="2" fill="rgba(255,255,255,0.55)"/>
              <line x1="14" y1="1" x2="14" y2="4.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="14" y1="23.5" x2="14" y2="27" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="1" y1="14" x2="4.5" y2="14" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="23.5" y1="14" x2="27" y2="14" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <span style={styles.navItemLabel}>{t('home_skills')}</span>
          </button>
        </div>
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
      }}>{t('home_invite')}</button>
      {!player?.email_verified && <div style={{display:'flex', flexDirection:'column', gap:'0.4rem'}}>
        <p style={{fontSize:'0.72rem', color:'#ffb400', textAlign:'center', margin:0, fontWeight:'600'}}>{t('home_protect_banner')}</p>
        <button style={styles.btnProtect} onClick={() => setShowProtect(true)}>{t('home_protect_account')}</button>
      </div>}
      <button style={styles.btnGhost} onClick={() => setShowDeleteConfirm(true)}>{t('home_delete_account')}</button>
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
            <div style={{display:'flex', gap:'0.4rem'}}>
              {onlineCount > 0 && (
                <div style={styles.onlineBadge}>
                  <div style={styles.onlineDot} />
                  <span style={styles.onlineText}>{onlineCount} {t('home_online')}</span>
                </div>
              )}
              <button style={styles.topBtn} onClick={toggleLang}>{lang === 'es' ? 'EN' : 'ES'}</button>
            </div>
            <button style={styles.topBtn} onClick={() => setShowInstall(true)}>{t('home_install')}</button>
          </div>
        </div>
        <p style={styles.tagline}>Sin VAR. Sin lesiones. 30 secondi sono molto lunghi.</p>
      </div>

      <div style={styles.registerSection}>
        <p style={styles.registerLabel}>{t('home_register_label')}</p>
        <input
          style={styles.input}
          type="text"
          placeholder={t('home_register_placeholder')}
          value={username}
          onChange={e => setUsername(e.target.value.toLowerCase())}
          onKeyDown={e => e.key === 'Enter' && handleRegister()}
          maxLength={20}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
        />
        <p style={styles.inputHint}>{t('home_register_hint')}</p>
        {error && <p style={styles.error}>{error}</p>}
      </div>

      <div style={styles.actions}>
        <button style={styles.btnPrimary} onClick={handleRegister} disabled={saving}>
          {saving ? t('home_creating') : t('home_start_playing')}
        </button>
        <button style={styles.btnSecondary} onClick={() => navigate('/ranking')}>{t('home_ranking')}</button>
        <button style={styles.btnSecondary} onClick={() => navigate('/leagues')}>🏆 {t('home_my_leagues')}</button>
        <button style={styles.btnSecondary} onClick={() => navigate('/rules')}>{t('home_rules')}</button>
        <button style={styles.btnGhost} onClick={() => setShowRegisterInfo(true)}>{t('home_create_profile_q')}</button>
        <button style={{...styles.btnGhost, color:'rgba(255,180,0,0.5)'}} onClick={() => setShowRecover(true)}>{t('home_recover_link')}</button>
      </div>

      {showRecover && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            {recoverSent ? (
              <>
                <p style={styles.modalTitle}>{t('home_recover_sent_title')}</p>
                <p style={styles.modalText}>{t('home_recover_sent_desc_pre')} <strong style={{color:'#fff'}}>{recoverEmail}</strong>{t('home_recover_sent_desc_post')}</p>
                <input
                  style={{...styles.input, marginBottom:'0.75rem', textAlign:'center', fontSize:'1.3rem', letterSpacing:'4px'}}
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="00000000"
                  value={recoverCode}
                  onChange={e => setRecoverCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyCode()}
                />
                {recoverCodeError && <p style={{fontSize:'0.8rem', color:'#ff4444', margin:'0 0 0.5rem'}}>{recoverCodeError}</p>}
                <button style={styles.btnPrimary} onClick={handleVerifyCode} disabled={recoverCodeLoading}>
                  {recoverCodeLoading ? t('home_recover_verifying') : t('home_recover_access')}
                </button>
                <button style={styles.btnCancelDelete} onClick={() => { setShowRecover(false); setRecoverSent(false); setRecoverEmail(''); setRecoverCode(''); setRecoverCodeError('') }}>{t('home_close')}</button>
              </>
            ) : (
              <>
                <p style={styles.modalTitle}>{t('home_recover_title')}</p>
                <p style={styles.modalText}>{t('home_recover_desc')}</p>
                <input
                  style={{...styles.input, marginBottom:'0.75rem'}}
                  type="email"
                  placeholder={t('home_recover_email_placeholder')}
                  value={recoverEmail}
                  onChange={e => setRecoverEmail(e.target.value.toLowerCase())}
                  onKeyDown={e => e.key === 'Enter' && handleRecover()}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                {recoverError && <p style={{fontSize:'0.8rem', color:'#ff4444', margin:0}}>{recoverError}</p>}
                <button style={styles.btnPrimary} onClick={handleRecover} disabled={recoverLoading}>
                  {recoverLoading ? t('home_recover_sending') : t('home_recover_send')}
                </button>
                <button style={styles.btnCancelDelete} onClick={() => { setShowRecover(false); setRecoverEmail(''); setRecoverError('') }}>{t('home_cancel')}</button>
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
  cardPlay: { width:'100%', background:'linear-gradient(145deg, #ffb400 0%, #e07800 100%)', border:'none', borderRadius:'20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:'1.1rem 0.75rem', minHeight:'110px', boxShadow:'0 8px 32px rgba(255,180,0,0.25)', animation:'ctaGlowPulse 2.4s ease-in-out infinite' },
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
  btnInvite: { background:'transparent', border:'1px solid rgba(255,180,0,0.3)', borderRadius:'12px', color:'rgba(255,180,0,0.75)', fontSize:'0.9rem', fontWeight:'700', cursor:'pointer', padding:'0.9rem', width:'100%' },
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
  navSectionLabel: { fontSize:'0.7rem', color:'rgba(255,255,255,0.25)', letterSpacing:'1px', textTransform:'uppercase', margin:'0 0 0.5rem' },
  navGrid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' },
  navItem: { background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'14px', display:'flex', alignItems:'center', gap:'0.55rem', cursor:'pointer', padding:'0.7rem 0.8rem' },
  navItemFull: { width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:'14px', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.55rem', cursor:'pointer', padding:'0.7rem 0.8rem', marginBottom:'0.5rem' },
  navItemLabelAmber: { fontSize:'0.78rem', fontWeight:'800', color:'#ffb400' },
  navItemLabel: { fontSize:'0.78rem', fontWeight:'700', color:'rgba(255,255,255,0.7)' },
  navBadge: { marginLeft:'auto', background:'#ff4444', color:'#fff', borderRadius:'50%', width:'16px', height:'16px', fontSize:'0.6rem', fontWeight:'800', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 },
  navStreak: { marginLeft:'auto', fontSize:'0.7rem', color:'#ffb400', fontWeight:'800', display:'inline-flex', alignItems:'center', gap:'2px' },
  statCardsRow: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' },
  statCard: { background:'rgba(255,255,255,0.04)', borderRadius:'12px', padding:'0.6rem 0.8rem' },
  statCardLabel: { fontSize:'0.65rem', color:'rgba(255,255,255,0.35)', margin:0 },
  statCardValue: { fontSize:'1.1rem', fontWeight:'800', color:'#ffb400', margin:'2px 0 0' },
  playerMetaSecondary: { display:'flex', alignItems:'center', gap:'0.5rem' },
}
