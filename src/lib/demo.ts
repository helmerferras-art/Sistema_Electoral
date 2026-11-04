import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Leyenda obligatoria del plan gratuito y de la demo. */
export const FREE_LEGEND = 'Versión de demostración gratuita. No constituye aportación a ninguna campaña electoral.';

export const DEMO_CAMPAIGNS = [
    { k: 1, title: 'Gubernatura', place: 'Chiapas', blurb: 'Estructura estatal completa: 7 perfiles, cientos de simpatizantes, secciones y casillas.' },
    { k: 2, title: 'Presidencia municipal', place: 'Tuxtla Gutiérrez', blurb: 'La campaña típica de ciudad: brigadas, recorridos casa por casa y Día D.' },
    { k: 3, title: 'Aspirante', place: 'San Cristóbal', blurb: 'Precampaña con encuesta interna: medir conocimiento y armar equipo desde cero.' },
] as const;

export const DEMO_ROLES = [
    { role: 'candidato', label: 'Candidato(a)', what: 'Tablero de mando, metas, IA y finanzas.' },
    { role: 'coordinador_campana', label: 'Coordinación de campaña', what: 'Equipo, guiones, eventos, casillas y cotejo.' },
    { role: 'coordinador_territorial', label: 'Coordinación territorial', what: 'Zonas de recorrido, líderes y avance por sección.' },
    { role: 'lider', label: 'Líder', what: 'Su brigada, invitaciones y ranking de referidos.' },
    { role: 'brigadista', label: 'Brigadista', what: 'Registro en campo, guion, puertas tocadas y recompensas.' },
    { role: 'comunicacion_digital', label: 'Comunicación digital', what: 'Redes, mensajes y seguimiento de conversación.' },
    { role: 'coordinador_logistica', label: 'Logística', what: 'Inventario, entregas y suministros.' },
] as const;

const callDemo = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('demo-session', { body });
    if (error) {
        let msg = 'No se pudo abrir la demo. Intenta de nuevo.';
        try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* sin cuerpo */ }
        throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data as { ok: boolean; token_hash?: string; name?: string; role?: string };
};

const enterWith = async (token_hash: string) => {
    // El contexto guardado de la sesión anterior impediría que se cargue el nuevo perfil
    localStorage.removeItem('gamefi_agent_context');
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' });
    if (error) throw new Error('No se pudo abrir la sesión de la demo.');
    window.location.href = '/';
};

/** Crea una demo privada (sólo para este visitante) y entra con el perfil elegido. */
export const startDemo = async (campaign: number, role: string) => {
    await supabase.auth.signOut().catch(() => undefined);
    const r = await callDemo({ action: 'start', campaign, role });
    await enterWith(r.token_hash!);
};

/** Cambia de perfil dentro de la misma demo (mismos datos). */
export const switchDemoRole = async (role: string) => {
    const r = await callDemo({ action: 'switch', role });
    await enterWith(r.token_hash!);
};

/** Borra la demo (datos, cuentas y archivos) y cierra sesión. */
export const endDemo = async () => {
    try { await callDemo({ action: 'end' }); } catch { /* si ya expiró, no hay nada que borrar */ }
    await supabase.auth.signOut().catch(() => undefined);
    localStorage.removeItem('gamefi_agent_context');
    window.location.href = '/?demo=fin';
};

export type MyPlan = {
    plan: 'demo' | 'arranque' | 'profesional' | 'a_medida' | null;
    sandbox: boolean;
    campana: string;
    limites: Record<string, number>;
    uso: { simpatizantes: number; usuarios: Record<string, number> | null };
};

/** Plan de la campaña del usuario actual (límites y uso). */
export const useMyPlan = (enabled = true) => {
    const [plan, setPlan] = useState<MyPlan | null>(null);
    useEffect(() => {
        if (!enabled) return;
        supabase.rpc('fn_my_plan').then(({ data }) => setPlan((data as MyPlan) || null));
    }, [enabled]);
    return plan;
};

/** Mantiene viva la demo mientras se usa: sin actividad 30 min se borra sola. */
export const useDemoHeartbeat = (active: boolean) => {
    useEffect(() => {
        if (!active) return;
        let lastSent = 0;
        let lastActivity = Date.now();
        const touch = () => {
            lastActivity = Date.now();
            if (Date.now() - lastSent < 60_000) return;
            lastSent = Date.now();
            supabase.rpc('fn_demo_touch');
        };
        touch();
        const events = ['click', 'keydown', 'touchstart', 'scroll'];
        events.forEach(e => window.addEventListener(e, touch, { passive: true }));
        // Sin actividad 30 min: se borra y se cierra (el servidor también la borra aunque la pestaña quede cerrada)
        const id = window.setInterval(() => { if (Date.now() - lastActivity > 30 * 60_000) endDemo(); }, 60_000);
        return () => { events.forEach(e => window.removeEventListener(e, touch)); window.clearInterval(id); };
    }, [active]);
};
