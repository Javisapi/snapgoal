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

  const { league_id, sender_name, message } = req.body

  const { data: members } = await supabase
    .from('league_members')
    .select('player_id')
    .eq('league_id', league_id)

  if (!members?.length) return res.status(200).json({ sent: 0 })

  const playerIds = members.map(m => m.player_id)

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('player_id', playerIds)

  if (!subs?.length) return res.status(200).json({ sent: 0 })

  const payload = JSON.stringify({
    title: `⚽ ${sender_name} alerta a la liga`,
    body: message || '¡Atención jugadores!',
    url: `/league/${league_id}`
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
