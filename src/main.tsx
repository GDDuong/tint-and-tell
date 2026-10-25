import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { LangProvider } from './Lang.tsx'
import { applyTheme, loadPrefs } from './prefs.ts'
import { PrefsProvider } from './PrefsContext.tsx'

applyTheme(loadPrefs().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <PrefsProvider>
        <App />
      </PrefsProvider>
    </LangProvider>
  </StrictMode>,
)
