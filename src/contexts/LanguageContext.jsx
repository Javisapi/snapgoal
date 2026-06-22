import { createContext, useContext, useState, useCallback } from 'react'
import { translations } from '../locales/translations'

const STORAGE_KEY = 'snapgoal_lang'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'es'
    } catch (e) {
      return 'es'
    }
  })

  const setLang = useCallback((newLang) => {
    setLangState(newLang)
    try {
      localStorage.setItem(STORAGE_KEY, newLang)
    } catch (e) { /* localStorage no disponible, no es crítico */ }
  }, [])

  const toggleLang = useCallback(() => {
    setLang(lang === 'es' ? 'en' : 'es')
  }, [lang, setLang])

  const t = useCallback((key) => {
    return translations[lang]?.[key] || translations.es[key] || key
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useTranslation debe usarse dentro de LanguageProvider')
  return ctx
}
