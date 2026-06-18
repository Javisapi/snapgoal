import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

webpush.setVapidDetails(
  process.env.VAPID_MAILTO,
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

const ITEM_LABELS = { pro_shooter: 'Sniper', golden_glove: 'Iron Fist', hand_of_god: 'Mano de Dios' }

function formatWager(wager) {
  if (!wager) return 'algunas skills'
  const parts = Object.entries(wager)
    .filter(([, amount]) => amount > 0)
    .map(([item, amount]) => `${amount} ${ITEM_LABELS[item] || item}`)
  return parts.length ? parts.join(' y ') : 'algunas skills'
}

const NOTIFICATIONS = {
  challenge_received: (sender_name, wager) => ({
    title: `⚔️ ${sender_name} te ha retado`,
    body: `🎯 ${sender_name} te reta a un duelo apostando ${formatWager(wager)}. ¡Acepta o rechaza!`,
  }),
  challenge_accepted: (sender_name) => ({
    title: `✅ ${sender_name} aceptó tu reto`,
    body: `⚔️ ${sender_name} ha aceptado el duelo. ¡Entra y pulsa Jugar cuando estés listo!`,
  }),
  challenge_rejected: (sender_name) => ({
    title: `❌ ${sender_name} rechazó tu reto`,
    body: `${sender_name} no ha aceptado el duelo esta vez.`,
  }),
  player_ready: (sender_name) => ({
    title: `🔥 ${sender_name} está listo para jugar`,
    body: `⚔️ ${sender_name} ha pulsado Jugar. ¡Entra ahora y confirma tú también!`,
  }),
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { challenge_id, sender_name, recipient_id, wager, event } = req.body

  if (!challenge_id || !recipient_id || !event || !NOTIFICATIONS[event]) {
    return res.status(400).json({ error: 'missing_or_invalid_params' })
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('player_id', recipient_id)

  if (!subs?.length) return res.status(200).json({ sent: 0 })

  const { title, body } = NOTIFICATIONS[event](sender_name, wager)
  const payload = JSON.stringify({ title, body, url: `/duels` })

  const results = await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  )

  res.status(200).json({ sent: results.filter(r => r.status === 'fulfilled').length })
}
