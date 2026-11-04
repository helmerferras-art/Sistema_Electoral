import { supabase } from './supabase';
import { PUBLIC_URL } from './verification';

/** Versión del aviso de privacidad y términos de la plataforma (Ko'on Soluciones) que acepta cada usuario. */
export const PLATFORM_TERMS_VERSION = '2026-11';

// ---------------------------------------------------------------- Guiones y encuestas
export type PollOption = { id: string; option_text: string; sort: number };
export type PollQuestion = { id: string; question_text: string; sort: number; show_if_option: string | null; poll_options: PollOption[] };
export type Poll = {
    id: string; title: string; description: string | null; kind: 'sondeo' | 'guion';
    script_intro: string | null; script_closing: string | null; active: boolean; created_at?: string;
    poll_questions: PollQuestion[];
};

const POLL_SELECT = 'id, title, description, kind, script_intro, script_closing, active, created_at, poll_questions(id, question_text, sort, show_if_option, poll_options(id, option_text, sort))';

export const sortPoll = (p: Poll): Poll => ({
    ...p,
    poll_questions: [...(p.poll_questions || [])]
        .sort((a, b) => a.sort - b.sort)
        .map(q => ({ ...q, poll_options: [...(q.poll_options || [])].sort((a, b) => a.sort - b.sort) })),
});

/** Preguntas visibles según las respuestas dadas (ramificación por "mostrar si se eligió la opción X"). */
export const visibleQuestions = (poll: Poll, answers: Record<string, string>) => {
    const chosen = new Set(Object.values(answers));
    return poll.poll_questions.filter(q => !q.show_if_option || chosen.has(q.show_if_option));
};

/** Quita respuestas de preguntas que dejaron de mostrarse al cambiar una respuesta anterior. */
export const pruneAnswers = (poll: Poll, answers: Record<string, string>) => {
    let current = { ...answers };
    for (let i = 0; i < 5; i++) {
        const visible = new Set(visibleQuestions(poll, current).map(q => q.id));
        const next = Object.fromEntries(Object.entries(current).filter(([qid]) => visible.has(qid)));
        if (Object.keys(next).length === Object.keys(current).length) return next;
        current = next;
    }
    return current;
};

const guionCacheKey = (tenantId: string) => `tlatoani_guion_${tenantId}`;

/** Guion activo de la campaña. Se guarda en el teléfono para usarlo sin señal. */
export const loadActiveGuion = async (tenantId: string): Promise<Poll | null> => {
    if (navigator.onLine) {
        const { data, error } = await supabase.from('polls').select(POLL_SELECT)
            .eq('tenant_id', tenantId).eq('kind', 'guion').eq('active', true)
            .order('created_at', { ascending: false }).limit(1);
        if (!error) {
            const poll = data && data.length ? sortPoll(data[0] as unknown as Poll) : null;
            try { localStorage.setItem(guionCacheKey(tenantId), JSON.stringify(poll)); } catch { /* sin espacio */ }
            return poll;
        }
    }
    try {
        const cached = localStorage.getItem(guionCacheKey(tenantId));
        return cached ? JSON.parse(cached) : null;
    } catch { return null; }
};

export const loadPolls = async (tenantScope: string[], opts: { kind?: 'sondeo' | 'guion'; activeOnly?: boolean } = {}) => {
    let q = supabase.from('polls').select(POLL_SELECT).in('tenant_id', tenantScope).order('created_at', { ascending: false });
    if (opts.kind) q = q.eq('kind', opts.kind);
    if (opts.activeOnly) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) throw error;
    return ((data || []) as unknown as Poll[]).map(sortPoll);
};

// ---------------------------------------------------------------- Eventos
export type EventRow = {
    id: string; tenant_id: string; title: string; description: string | null; place: string | null;
    starts_at: string; ends_at: string | null; capacity: number | null; status: 'programado' | 'cancelado' | 'realizado';
    checkin_token: string; created_by: string | null; created_at: string;
};

export const eventLink = (token: string, refUserId?: string | null) =>
    `${PUBLIC_URL}/e/${token}${refUserId ? `?r=${refUserId}` : ''}`;

export const formatEventDate = (iso: string) =>
    new Date(iso).toLocaleString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- Capacitación
export type TrainingModule = {
    id: string; title: string; summary: string | null; body: string;
    quiz: { q: string; options: string[] }[]; sort: number; required: boolean;
    passed_at: string | null; attempts: number; training_required: boolean;
};

export const loadMyTraining = async (): Promise<TrainingModule[]> => {
    const { data, error } = await supabase.rpc('fn_my_training');
    if (error) throw error;
    return (data || []) as TrainingModule[];
};

/** true si la campaña exige capacitación y al usuario le falta algún módulo obligatorio. */
export const trainingPending = (mods: TrainingModule[]) =>
    mods.length > 0 && mods[0].training_required && mods.some(m => m.required && !m.passed_at);
