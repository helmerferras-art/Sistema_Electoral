# C4I Secure Node — Sistema Electoral

Plataforma de gestión territorial de campaña (Chiapas): registro de simpatizantes, estructura de brigadistas, mapa por sección/colonia, Día D, comunicaciones y finanzas.

## Componentes

| Carpeta | Qué es |
|---|---|
| `src/` | App web/PWA (React 19 + Vite + Leaflet). Se carga por módulos (lazy loading). |
| `electron/`, `src-server/` | Nodo de escritorio (Electron + SQLite local + SyncEngine). |
| `android/`, `ios/` | App móvil (Capacitor). |
| `supabase/functions/` | Edge Functions (alta de miembros del equipo, etc.). |
| `sql/` | Esquemas, RPCs y parches SQL históricos. **No ejecutar `patch_rls_dev.sql`.** |
| `scripts/` | Puente SMS, importadores y semillas. `scripts/dev/` = scripts de diagnóstico sueltos. |
| `docs/` | Documentación funcional y técnica. |
| `_archivo/` | Logs y volcados viejos (ignorado por git). |

## Comandos

```bash
npm run dev             # web en http://localhost:5173
npm run build           # tsc + build de producción
npm run electron:dev    # nodo de escritorio en desarrollo
npm run electron:build  # instalador Windows
npm run mobile:build    # build + sync Capacitor
```

Los scripts de `scripts/dev/` se ejecutan desde la raíz del proyecto (`node scripts/dev/<archivo>`).

## Capas cartográficas

Las capas INE de Chiapas (entidad 07) originales están en `C:\Users\helme\Downloads\Capas\07\07`.
Versiones ligeras (simplificadas ~10x) en `...\07\07\ligeras\`, incluyendo `por_municipio/secciones/<mun>.json`,
`por_municipio/colonias/<mun>.json` y `colonia_seccion.csv` (cruce espacial colonia → secciones con % de superficie).

## Variables de entorno

Copiar `.env.example` a `.env`. Nunca subir `.env` ni archivos `credenciales*.md`.
