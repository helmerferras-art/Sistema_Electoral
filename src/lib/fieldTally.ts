/**
 * Conteo automático de la bitácora de campo.
 * Mientras el operador trabaja, cada acción suma sola a "Contactados", "Ya lo conocían" y "Se suman":
 *  - puerta donde sí hubo plática (volver, no le interesa) → contacto
 *  - registro de simpatizante → contacto + se suma
 *  - entrevista del termómetro → contacto (+ ya lo conocía si dijo que sí)
 * Al guardar la actividad el conteo vuelve a cero. Se guarda en el teléfono, así funciona sin señal.
 */
export type Tally = {
    contacts: number; known: number; joined: number;
    doors: number; registros: number; entrevistas: number;
    since: string | null;
};
export type TallyDelta = { contacts?: number; known?: number; joined?: number; source: 'puerta' | 'registro' | 'entrevista'; door?: boolean };

const KEY = 'tlatoani_field_tally';
const empty = (): Tally => ({ contacts: 0, known: 0, joined: 0, doors: 0, registros: 0, entrevistas: 0, since: null });

export const readTally = (): Tally => {
    try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return empty(); }
};

export const bumpTally = (d: TallyDelta) => {
    const t = readTally();
    t.contacts += d.contacts || 0;
    t.known += d.known || 0;
    t.joined += d.joined || 0;
    if (d.source === 'puerta' || d.door) t.doors += 1;
    if (d.source === 'registro') t.registros += 1;
    if (d.source === 'entrevista') t.entrevistas += 1;
    t.since = t.since || new Date().toISOString();
    try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* sin espacio */ }
    window.dispatchEvent(new CustomEvent('field-tally', { detail: d }));
};

export const resetTally = () => { try { localStorage.removeItem(KEY); } catch { /* */ } };

/** Guarda lo que el operador ajusta a mano, para no perderlo si cierra la app. */
export const writeTallyCounts = (c: { contacts: number; known: number; joined: number }) => {
    const t = readTally();
    if (t.contacts === c.contacts && t.known === c.known && t.joined === c.joined) return;
    try { localStorage.setItem(KEY, JSON.stringify({ ...t, ...c, since: t.since || (c.contacts ? new Date().toISOString() : null) })); } catch { /* */ }
};
