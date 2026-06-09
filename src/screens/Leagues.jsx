import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

async function getPlayer() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null
  const key = 'player_' + session.user.id
  const cached = sessionStorage.getItem(key)
  if (cached) return JSON.parse(cached)
  const { data } = await supabase.from('players').select('*').eq('auth_id', session.user.id).single()
  if (data) sessionStorage.setItem(key, JSON.stringify(data))
  return data
}

const DURATION_OPTIONS = [
  { label: '2 días', days: 2 },
  { label: '1 semana', days: 7 },
  { label: '2 semanas', days: 14 },
  { label: '1 mes', days: 30 },
  { label: '1 año', days: 365 },
]

const CSS = `
  @keyframes leagueFadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`

export default function Leagues() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [player, setPlayer] = useState(null)
  const [leagues, setLeagues] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // list | create | join
  const [leagueName, setLeagueName] = useState('')
  const [duration, setDuration] = useState(7)
  const [joinCode, setJoinCode] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [createdCode, setCreatedCode] = useState(null)

  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = CSS
    document.head.appendChild(s)
    init()
  }, [])

  async function init() {
    const p = await getPlayer()
    if (!p) { navigate('/'); return }
    setPlayer(p)
    await loadLeagues(p)
    setLoading(false)
    // Auto-mostrar formulario de unirse si viene de link de WhatsApp
    const joinCode = searchParams.get('join')
    if (joinCode) {
      setJoinCode(joinCode)
      setView('join')
    }
  }

  async function loadLeagues(p) {
    const { data } = await supabase
      .from('league_members')
      .select(`
        league_id,
        points,
        matches_played,
        leagues (
          id, name, code, status, expires_at, created_by,
          created_at
        )
      `)
      .eq('player_id', p.id)
      .order('joined_at', { ascending: false })
    setLeagues(data || [])
  }

  async function handleCreate() {
    if (!leagueName.trim()) { setError('Escribe un nombre para la liga'); return }
    setSaving(true)
    setError('')

    const { data: code } = await supabase.rpc('generate_league_code')
    const expiresAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString()

    const { data: league, error: createError } = await supabase
      .from('leagues')
      .insert({ name: leagueName.trim(), code, created_by: player.id, expires_at: expiresAt })
      .select().single()

    if (createError) { setError('Error al crear la liga'); setSaving(false); return }

    await supabase.from('league_members').insert({ league_id: league.id, player_id: player.id })
    setCreatedCode(code)
    setSaving(false)
    await loadLeagues(player)
  }

  async function handleJoin() {
    const code = joinCode.trim().toUpperCase()
    if (!code) { setError('Introduce el código de la liga'); return }
    setSaving(true)
    setError('')

    const { data: league } = await supabase
      .from('leagues').select('*').eq('code', code).single()

    if (!league) { setError('Código no válido'); setSaving(false); return }
    if (league.status === 'finished') { setError('Esta liga ya ha terminado'); setSaving(false); return }
    if (new Date(league.expires_at) < new Date()) { setError('Esta liga ha expirado'); setSaving(false); return }

    const { data: count } = await supabase
      .from('league_members')
      .select('id', { count: 'exact' })
      .eq('league_id', league.id)

    if (count && count.length >= 50) { setError('La liga está llena (máx. 50 jugadores)'); setSaving(false); return }

    const { error: joinError } = await supabase
      .from('league_members')
      .insert({ league_id: league.id, player_id: player.id })

    if (joinError) {
      if (joinError.code === '23505') setError('Ya eres miembro de esta liga')
      else setError('Error al unirse a la liga')
      setSaving(false)
      return
    }

    setSaving(false)
    setJoinCode('')
    setView('list')
    await loadLeagues(player)
  }

  function shareWhatsApp(code, name) {
    const url = `${window.location.origin}?join=${code}`
    const text = `¡Te invito a mi liga "${name}" en SnapGoal! Únete con el código *${code}* o entra aquí: ${url}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  function getStatusLabel(league) {
    if (league.status === 'finished') return { text: 'Terminada', color: 'rgba(255,255,255,0.3)' }
    if (new Date(league.expires_at) < new Date()) return { text: 'Expirada', color: '#ff4444' }
    const days = Math.ceil((new Date(league.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
    if (days <= 1) return { text: `${days}d restante`, color: '#ff6d00' }
    return { text: `${days}d restantes`, color: '#00c853' }
  }

  if (loading) return (
    <div style={styles.container}>
      <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>Cargando...</p>
    </div>
  )

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← volver</button>
        <div style={styles.headerTitle}>
          <h1 style={styles.title}>Mis Ligas</h1>
          <div style={styles.titleLine} />
        </div>
      </div>

      {view === 'list' && (
        <div style={styles.content}>
          {/* Botones de acción */}
          <div style={styles.actionRow}>
            <button style={styles.btnPrimary} onClick={() => { setView('create'); setError(''); setCreatedCode(null) }}>
              + Crear liga
            </button>
            <button style={styles.btnSecondary} onClick={() => { setView('join'); setError('') }}>
              Unirme a liga
            </button>
          </div>

          {/* Lista de ligas */}
          {leagues.length === 0 ? (
            <div style={styles.emptyBox}>
              <p style={styles.emptyTitle}>Sin ligas todavía</p>
              <p style={styles.emptyText}>Crea una liga o únete con un código</p>
            </div>
          ) : (
            <div style={styles.leagueList}>
              {leagues.map((m, i) => {
                const league = m.leagues
                const status = getStatusLabel(league)
                const isAdmin = league.created_by === player.id
                return (
                  <div
                    key={league.id}
                    style={{ ...styles.leagueCard, animation: `leagueFadeIn 0.3s ease ${i * 0.05}s both` }}
                    onClick={() => navigate('/league/' + league.id)}
                  >
                    <div style={styles.leagueCardTop}>
                      <div style={styles.leagueInfo}>
                        <div style={styles.leagueNameRow}>
                          <span style={styles.leagueName}>{league.name}</span>
                          {isAdmin && <span style={styles.adminBadge}>Admin</span>}
                        </div>
                        <span style={styles.leagueCode}>#{league.code}</span>
                      </div>
                      <div style={styles.leagueRight}>
                        <span style={{ ...styles.leagueStatus, color: status.color }}>{status.text}</span>
                        <span style={styles.leaguePts}>{m.points} pts</span>
                      </div>
                    </div>
                    <div style={styles.leagueCardBottom}>
                      <span style={styles.leagueStat}>{m.matches_played} partidos</span>
                      <span style={styles.leagueStat}>{m.matches_won}V {m.matches_drawn}E {m.matches_lost}D</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {view === 'create' && (
        <div style={styles.content}>
          {!createdCode ? (
            <>
              <div style={styles.formGroup}>
                <p style={styles.formLabel}>Nombre de la liga</p>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="ej: Los Cracks del Martes"
                  value={leagueName}
                  onChange={e => setLeagueName(e.target.value)}
                  maxLength={40}
                  autoComplete="off"
                />
              </div>
              <div style={styles.formGroup}>
                <p style={styles.formLabel}>Duración</p>
                <div style={styles.durationGrid}>
                  {DURATION_OPTIONS.map(opt => (
                    <button
                      key={opt.days}
                      style={{
                        ...styles.durationBtn,
                        background: duration === opt.days ? '#ffb400' : 'rgba(255,255,255,0.04)',
                        color: duration === opt.days ? '#141414' : 'rgba(255,255,255,0.6)',
                        border: duration === opt.days ? 'none' : '1px solid rgba(255,255,255,0.08)',
                      }}
                      onClick={() => setDuration(opt.days)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {error && <p style={styles.error}>{error}</p>}
              <div style={styles.formActions}>
                <button style={styles.btnPrimary} onClick={handleCreate} disabled={saving}>
                  {saving ? 'Creando...' : 'Crear liga'}
                </button>
                <button style={styles.btnSecondary} onClick={() => setView('list')}>Cancelar</button>
              </div>
            </>
          ) : (
            <div style={styles.createdBox}>
              <p style={styles.createdLabel}>¡Liga creada!</p>
              <p style={styles.createdName}>{leagueName}</p>
              <div style={styles.codeBox}>
                <p style={styles.codeLabel}>Código de invitación</p>
                <p style={styles.codeValue}>{createdCode}</p>
              </div>
              <p style={styles.createdHint}>Comparte este código con tus amigos para que se unan</p>
              <button
                style={styles.btnWhatsapp}
                onClick={() => shareWhatsApp(createdCode, leagueName)}
              >
                Compartir por WhatsApp
              </button>
              <button style={styles.btnPrimary} onClick={() => navigate('/league/' + leagues[0]?.leagues?.id)}>
                Ver liga
              </button>
              <button style={styles.btnSecondary} onClick={() => { setView('list'); setCreatedCode(null); setLeagueName('') }}>
                Volver
              </button>
            </div>
          )}
        </div>
      )}

      {view === 'join' && (
        <div style={styles.content}>
          <div style={styles.formGroup}>
            <p style={styles.formLabel}>Código de invitación</p>
            <input
              style={{ ...styles.input, textTransform: 'uppercase', letterSpacing: '4px', fontSize: '1.5rem', textAlign: 'center' }}
              type="text"
              placeholder="ABC123"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>
          {error && <p style={styles.error}>{error}</p>}
          <div style={styles.formActions}>
            <button style={styles.btnPrimary} onClick={handleJoin} disabled={saving}>
              {saving ? 'Uniéndome...' : 'Unirme'}
            </button>
            <button style={styles.btnSecondary} onClick={() => setView('list')}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  container: { height: '100%', display: 'flex', flexDirection: 'column', background: '#141414', overflow: 'hidden' },
  header: { padding: '2.5rem 1.75rem 1rem', flexShrink: 0 },
  backBtn: { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: '0.8rem', cursor: 'pointer', padding: 0, marginBottom: '1rem', letterSpacing: '0.5px' },
  headerTitle: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  title: { fontSize: '2.5rem', fontWeight: '900', color: '#fff', letterSpacing: '-2px', margin: 0, lineHeight: 1 },
  titleLine: { height: '3px', width: '36px', background: '#ffb400', borderRadius: '2px' },
  content: { flex: 1, overflowY: 'auto', padding: '1rem 1.75rem 2rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  actionRow: { display: 'flex', gap: '0.75rem' },
  btnPrimary: { flex: 1, background: '#ffb400', color: '#141414', border: 'none', borderRadius: '12px', padding: '0.9rem', fontSize: '0.95rem', fontWeight: '800', cursor: 'pointer' },
  btnSecondary: { flex: 1, background: 'transparent', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.9rem', fontSize: '0.9rem', cursor: 'pointer' },
  btnWhatsapp: { width: '100%', background: '#25D366', color: '#fff', border: 'none', borderRadius: '12px', padding: '0.9rem', fontSize: '0.95rem', fontWeight: '700', cursor: 'pointer', marginBottom: '0.5rem' },
  emptyBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '0.5rem', paddingTop: '3rem' },
  emptyTitle: { fontSize: '1.1rem', fontWeight: '700', color: 'rgba(255,255,255,0.4)', margin: 0 },
  emptyText: { fontSize: '0.85rem', color: 'rgba(255,255,255,0.2)', margin: 0, textAlign: 'center' },
  leagueList: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  leagueCard: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '1rem', cursor: 'pointer' },
  leagueCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' },
  leagueInfo: { display: 'flex', flexDirection: 'column', gap: '2px' },
  leagueNameRow: { display: 'flex', alignItems: 'center', gap: '0.5rem' },
  leagueName: { fontSize: '0.95rem', fontWeight: '700', color: '#fff' },
  adminBadge: { fontSize: '0.6rem', fontWeight: '800', color: '#ffb400', background: 'rgba(255,180,0,0.15)', padding: '2px 6px', borderRadius: '6px', letterSpacing: '0.5px' },
  leagueCode: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', letterSpacing: '1px' },
  leagueRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' },
  leagueStatus: { fontSize: '0.7rem', fontWeight: '600' },
  leaguePts: { fontSize: '0.9rem', fontWeight: '800', color: '#ffb400' },
  leagueCardBottom: { display: 'flex', gap: '1rem' },
  leagueStat: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' },
  formGroup: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  formLabel: { fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', textTransform: 'uppercase', margin: 0 },
  input: { background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.15)', borderRadius: 0, padding: '0.75rem 0', fontSize: '1.1rem', fontWeight: '700', color: '#fff', outline: 'none', width: '100%' },
  durationGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  durationBtn: { padding: '0.5rem 0.9rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' },
  error: { fontSize: '0.85rem', color: '#ff4444', margin: 0 },
  formActions: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' },
  createdBox: { display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', paddingTop: '1rem' },
  createdLabel: { fontSize: '0.8rem', color: '#ffb400', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', margin: 0 },
  createdName: { fontSize: '1.5rem', fontWeight: '900', color: '#fff', margin: 0, textAlign: 'center' },
  codeBox: { background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)', borderRadius: '16px', padding: '1.25rem 2rem', textAlign: 'center', width: '100%' },
  codeLabel: { fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 0.5rem' },
  codeValue: { fontSize: '2.5rem', fontWeight: '900', color: '#ffb400', letterSpacing: '8px', margin: 0 },
  createdHint: { fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0 },
}
