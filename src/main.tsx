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

// App guardada (PWA): busca versión nueva al volver a la app y recarga una vez cuando la nueva toma el control.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return // primera instalación: no hace falta recargar
    try {
      if (sessionStorage.getItem('tl_sw_reloaded')) return
      sessionStorage.setItem('tl_sw_reloaded', '1')
    } catch { /* sin almacenamiento */ }
    window.location.reload()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then(r => r?.update()).catch(() => undefined)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
