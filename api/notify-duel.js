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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { challenge_id, sender_name, opponent_id, wager } = req.body

  if (!challenge_id || !opponent_id) {
    return res.status(400).json({ error: 'missing_params' })
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('player_id', opponent_id)

  if (!subs?.length) return res.status(200).json({ sent: 0 })

  const wagerLabel = formatWager(wager)

  const payload = JSON.stringify({
    title: `⚔️ ${sender_name} te ha retado`,
    body: `🎯 ${sender_name} te reta a un duelo apostando ${wagerLabel}. ¡Acepta o rechaza!`,
    url: `/duels/${challenge_id}`
  })

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

function formatWager(wager) {
  if (!wager) return 'algunas skills'
  const labels = { pro_shooter: 'Sniper', golden_glove: 'Iron Fist', hand_of_god: 'Mano de Dios' }
  const parts = Object.entries(wager)
    .filter(([, amount]) => amount > 0)
    .map(([item, amount]) => `${amount} ${labels[item] || item}`)
  return parts.length ? parts.join(' y ') : 'algunas skills'
}
