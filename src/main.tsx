import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Tipografias del sistema Andotek (autoalojadas): Inter para la interfaz,
// JetBrains Mono para labels tecnicos, fechas y datos numericos.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'
import App from './App.tsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
