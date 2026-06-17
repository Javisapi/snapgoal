const CACHE = 'snapgoal-v3'
const ASSETS = ['/', '/index.html']

self.addEventListener('install', e => {
  // No skipWaiting automático — esperamos confirmación del usuario vía banner
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)))
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting()
})
