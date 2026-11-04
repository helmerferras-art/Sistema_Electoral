import { createClient } from '@supabase/supabase-js'

// @ts-ignore
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
// @ts-ignore
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * La demo vive en un proyecto de Supabase aparte (tlatoani-demo): nada de lo que se hace en la demo
 * toca la base de producción. Mientras el visitante está en la demo, toda la app habla con esa base.
 * La llave publicable es pública por diseño (igual que la de producción).
 */
// @ts-ignore
export const DEMO_SUPABASE_URL: string = import.meta.env.VITE_DEMO_SUPABASE_URL || 'https://uukewfxjpeavsfeercmi.supabase.co'
// @ts-ignore
export const DEMO_SUPABASE_KEY: string = import.meta.env.VITE_DEMO_SUPABASE_KEY || 'sb_publishable_1VHhOcWkrr-y8oY5nB4kvw_L2jDLMuy'
export const DEMO_MODE_KEY = 'tl_demo_mode'

/** Activa mientras haya uso reciente: si el visitante cerró la pestaña, después de 35 min la app vuelve a producción. */
export const isDemoMode = () => {
    try {
        const last = Number(localStorage.getItem(DEMO_MODE_KEY) || 0)
        return last > 0 && Date.now() - last < 35 * 60_000
    } catch { return false }
}
export const markDemoActivity = () => { try { localStorage.setItem(DEMO_MODE_KEY, String(Date.now())) } catch { /* sin almacenamiento */ } }

export const supabase = isDemoMode()
    ? createClient(DEMO_SUPABASE_URL, DEMO_SUPABASE_KEY)
    : createClient(supabaseUrl, supabaseAnonKey)
