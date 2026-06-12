self.addEventListener('push', function(event) {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch(e) { data = { title: event.data?.text() || 'SnapGoal' } }
  const title = data.title || 'SnapGoal'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' }
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
