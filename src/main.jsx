import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerPushSW } from './lib/pushNotifications'
import { LanguageProvider } from './contexts/LanguageContext'

const CACHE_VERSION = '3'
if (sessionStorage.getItem('cache_version') !== CACHE_VERSION) {
  Object.keys(sessionStorage).forEach(k => {
    if (k.startsWith('player_')) sessionStorage.removeItem(k)
  })
  sessionStorage.setItem('cache_version', CACHE_VERSION)
}

registerPushSW()

// Recargar cuando el usuario acepta la actualización desde el banner
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload()
  })
}

createRoot(document.getElementById('root')).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>
)
