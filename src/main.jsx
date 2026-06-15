import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPushSW } from './lib/pushNotifications'

const CACHE_VERSION = '3'
if (sessionStorage.getItem('cache_version') !== CACHE_VERSION) {
  Object.keys(sessionStorage).forEach(k => {
    if (k.startsWith('player_')) sessionStorage.removeItem(k)
  })
  sessionStorage.setItem('cache_version', CACHE_VERSION)
}

registerPushSW()

// Detectar nuevo SW y recargar automáticamente
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}

createRoot(document.getElementById('root')).render(<App />)
