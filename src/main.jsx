import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const CACHE_VERSION = '3'
if (sessionStorage.getItem('cache_version') !== CACHE_VERSION) {
  Object.keys(sessionStorage).forEach(k => {
    if (k.startsWith('player_')) sessionStorage.removeItem(k)
  })
  sessionStorage.setItem('cache_version', CACHE_VERSION)
}

createRoot(document.getElementById('root')).render(<App />)
