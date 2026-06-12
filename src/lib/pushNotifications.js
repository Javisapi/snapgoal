const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
}

export async function registerPushSW() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const reg = await navigator.serviceWorker.register('/sw-push.js')
  return reg
}

export async function subscribeToPush(supabase, playerId) {
  try {
    const reg = await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      await saveSub(supabase, playerId, existing)
      return existing
    }

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })

    await saveSub(supabase, playerId, sub)
    return sub
  } catch (e) {
    console.error('Push subscription failed:', e)
    return null
  }
}

async function saveSub(supabase, playerId, sub) {
  console.log('SAVING SUB for player:', playerId)
  const json = sub.toJSON()
  const result = await supabase.from('push_subscriptions').upsert({
    player_id: playerId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  }, { onConflict: 'endpoint' })
  console.log('SAVE RESULT:', result)
}

export async function requestPermissionAndSubscribe(supabase, playerId) {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  await registerPushSW()
  await subscribeToPush(supabase, playerId)
  return true
}
