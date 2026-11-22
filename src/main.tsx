import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Después de publicar una versión nueva, un teléfono con la app abierta puede pedir módulos que ya no existen.
// En ese caso se recarga una sola vez para tomar la versión nueva (en lugar de mostrar una pantalla rota).
window.addEventListener('vite:preloadError', (event) => {
  try {
    const last = Number(sessionStorage.getItem('tl_reload_at') || 0)
    if (Date.now() - last > 60_000) {
      sessionStorage.setItem('tl_reload_at', String(Date.now()))
      event.preventDefault()
      window.location.reload()
    }
  } catch { /* sin almacenamiento */ }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
