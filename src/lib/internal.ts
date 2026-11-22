import { supabase } from './supabase';
import { getPositionOnce } from './location';

/**
 * Proceso interno: termómetro con las 8 variables que usan las encuestas de definición de
 * coordinaciones (opinión positiva, disposición a votar, preferencia, buen candidato, honestidad,
 * conocimiento del territorio, cercanía y cumplir su palabra) más el reconocimiento.
 * Las entrevistas son anónimas: no se guarda nombre ni teléfono de la persona entrevistada.
 */

export type Contest = {
    tenant_id: string; self_name: string; process_label: string; coalition_label: string;
    template: 'morena_pt_pvem' | 'generico'; weights: Record<string, number>; survey_date: string | null; active: boolean;
};
export type Rival = { id: string; tenant_id: string; name: string; notes: string | null; sort: number };
export type Person = { pid: string; name: string; is_self: boolean };

export type ThermoResult = {
    configured: boolean;
    contest?: Contest;
    n?: number; n_sampled?: number; last_at?: string | null;
    persons?: (Person & { score: number })[];
    variables?: { key: string; label: string; weight: number; results: (Person & { pct: number; points: number })[] }[];
    sections?: { section_id: string; n: number; conoce_self: number; conoce_rival: number | null }[];
};

export const DEFAULT_WEIGHTS: Record<string, number> = {
    opinion: 2, votaria: 2, preferencia: 3, buen_candidato: 1, honestidad: 1.25,
    conoce_territorio: 0.25, cercania: 0.25, cumple: 0.25,
};

/** Preguntas por persona (se repiten para cada aspirante). */
export const PER_PERSON = [
    { key: 'conoce', q: (n: string) => `¿Conoce o ha oído hablar de ${n}?`, options: [['si', 'Sí'], ['no', 'No']] },
    { key: 'opinion', q: (n: string) => `¿Qué opinión tiene de ${n}?`, options: [['buena', 'Buena'], ['regular', 'Regular'], ['mala', 'Mala'], ['nc', 'No sabe']] },
    { key: 'votaria', q: (n: string) => `¿Votaría por ${n}?`, options: [['si', 'Sí'], ['no', 'No'], ['ns', 'No sabe']] },
] as const;

/** Preguntas comparativas (se elige una persona de la lista). */
export const COMPARATIVE = [
    { key: 'preferencia', q: (coalition: string) => `De estas personas, ¿a quién preferiría como candidato(a) de ${coalition}?` },
    { key: 'buen_candidato', q: () => '¿Quién cree que sería un buen candidato(a)?' },
    { key: 'honestidad', q: () => '¿Quién le parece más honesto(a)?' },
    { key: 'conoce_territorio', q: () => '¿Quién conoce mejor esta zona y sus problemas?' },
    { key: 'cercania', q: () => '¿Quién es más cercano(a) a la gente?' },
    { key: 'cumple', q: () => '¿Quién cumple más su palabra?' },
] as const;

export const loadContest = async (tenantId: string) => {
    const [{ data: c }, { data: r }] = await Promise.all([
        supabase.from('internal_contest').select('*').eq('tenant_id', tenantId).maybeSingle(),
        supabase.from('internal_rivals').select('*').eq('tenant_id', tenantId).order('sort'),
    ]);
    return { contest: (c as Contest) || null, rivals: (r || []) as Rival[] };
};

export const loadThermometer = async (days: number | null, onlySampled: boolean): Promise<ThermoResult> => {
    const { data, error } = await supabase.rpc('fn_thermometer', { p_days: days, p_only_sampled: onlySampled });
    if (error) throw error;
    return (data || { configured: false }) as ThermoResult;
};

/** Margen de error aproximado (95 %) para una proporción cercana a 50 %. */
export const marginOfError = (n: number) => (n > 0 ? Math.round(98 / Math.sqrt(n) * 10) / 10 : null);

/** Mezcla el orden de las personas en cada entrevista para no sesgar la respuesta. */
export const shuffle = <T,>(arr: T[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
};

// ---------------------------------------------------------------- Cola sin señal
type Pending = {
    offline_id: string; tenant_id: string; user_id: string; section_id: string | null; lat: number | null; lng: number | null;
    mode: 'vivienda' | 'telefono'; sampled: boolean; answers: Record<string, unknown>; created_at: string;
};
const QUEUE = 'tlatoani_thermo_queue';
const readQ = (): Pending[] => { try { return JSON.parse(localStorage.getItem(QUEUE) || '[]'); } catch { return []; } };
const writeQ = (q: Pending[]) => { try { localStorage.setItem(QUEUE, JSON.stringify(q)); } catch { /* sin espacio */ } };
export const pendingInterviews = () => readQ().length;

export const syncInterviews = async () => {
    const q = readQ();
    if (!q.length || !navigator.onLine) return 0;
    const { error } = await supabase.from('thermo_interviews').upsert(q, { onConflict: 'offline_id', ignoreDuplicates: true });
    if (error) { console.warn('No se pudieron subir las entrevistas:', error.message); return 0; }
    writeQ([]);
    return q.length;
};

export const saveInterview = async (p: {
    tenant_id: string; user_id: string; section_id: string | null; mode: 'vivienda' | 'telefono'; sampled: boolean;
    answers: Record<string, unknown>;
}) => {
    let lat: number | null = null, lng: number | null = null;
    // En vivienda se toma la ubicación para ubicar la sección; por teléfono no aplica
    if (p.mode === 'vivienda' && !p.section_id) {
        try { const f = await getPositionOnce({ maxAgeMs: 60000, timeoutMs: 8000 }); lat = f.lat; lng = f.lng; } catch { /* sin GPS */ }
    }
    writeQ([...readQ(), { ...p, offline_id: crypto.randomUUID(), lat, lng, created_at: new Date().toISOString() }]);
    return syncInterviews();
};
