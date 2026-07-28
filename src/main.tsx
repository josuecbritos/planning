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
import { makeRepo } from './data'
import './styles.css'

// #240: el backend se resuelve ANTES de montar. Elegirlo es asíncrono desde que
// el repo de memoria (con el plan de ejemplo) se carga bajo demanda; hacerlo
// acá deja a `App` recibiendo un repo ya listo, sin estados intermedios.
makeRepo().then((repo) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App repo={repo} />
    </StrictMode>,
  )
})
