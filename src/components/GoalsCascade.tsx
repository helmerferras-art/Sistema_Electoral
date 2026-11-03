import { useEffect, useState, type ReactNode } from 'react';
import { Target, ChevronRight, ArrowLeft, Calculator, Settings, X, Users, CalendarDays, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { ThanksPageEditor } from './ThanksPageEditor';
import { AuditPanel } from './AuditPanel';

type BoardRow = {
    user_id: string; name: string; role: string; is_root: boolean;
    territory_type: string | null; territory_zones: number;
    meta_votos: number | null; meta_simpatizantes: number | null; meta_contactos: number | null; method: string | null;
    periodo_inicio: string; periodo_fin: string; dias_restantes: number; fraccion_esperada: number;
    esperado_simpatizantes: number; esperado_contactos: number;
    avance_simpatizantes: number; avance_verificados: number; avance_alertas: number; avance_contactos: number; avance_convencidos: number; avance_conocian: number; actividades: number;
    repartido_simpatizantes: number; equipo: number; sin_meta: number;
};
type Suggestion = {
    method: 'historico' | 'reparto' | 'sin_base'; objective?: Objective; sections_count?: number; sections_with_data?: number;
    lista_nominal?: number; votos_base?: number; ganador_base?: number; secciones_competidas?: number;
    meta_votos?: number; meta_simpatizantes?: number; meta_contactos?: number; repartido_entre?: number; mensaje?: string;
};
type Week = {
    period_start: string; period_end: string; phase: string | null; is_current: boolean;
    meta_simpatizantes: number; meta_contactos: number; meta_simpatizantes_acum: number; meta_contactos_acum: number;
    real_simpatizantes: number; real_contactos: number; real_simpatizantes_acum: number; real_contactos_acum: number;
};
type Objective = 'votos' | 'encuesta' | 'conocimiento';
type Thermo = { section_id: string; contactos: number; conocian: number; prefieren: number; pct_conocimiento: number | null; pct_preferencia: number | null };

/** Etiquetas según el tipo de proceso: campaña (votos) o aspirante (encuesta / darse a conocer). */
const OBJECTIVE_LABEL: Record<Objective, string> = {
    votos: 'Campaña constitucional', encuesta: 'Proceso interno por encuesta', conocimiento: 'Darse a conocer',
};
const labelsFor = (o: Objective) => o === 'votos'
    ? { alcance: 'Personas contactadas (bitácora)', alcanceMeta: 'Meta de personas contactadas', prefieren: 'Convencidos en campo' }
    : { alcance: 'Personas alcanzadas (bitácora)', alcanceMeta: 'Meta de personas a alcanzar', prefieren: o === 'encuesta' ? 'Lo prefieren' : 'Se suman' };
const pctTxt = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');

type Phase = { id?: string; name: string; start_date: string; end_date: string; weight: number; sort: number };

const ROLE_LABEL: Record<string, string> = {
    candidato: 'Candidato', coordinador_campana: 'Coord. de campaña', coordinador: 'Coordinador',
    coordinador_territorial: 'Coord. territorial', lider: 'Líder', brigadista: 'Brigadista',
    comunicacion_digital: 'Comunicación digital', coordinador_logistica: 'Logística', superadmin: 'Superadmin',
};
const TERRITORY_LABEL: Record<string, string> = {
    seccion: 'sección(es)', colonia: 'colonia(s)', municipio: 'municipio(s)', distrito_local: 'distrito(s) local(es)', distrito_federal: 'distrito(s) federal(es)',
};
const SELF_GOAL_ROLES = ['coordinador_territorial', 'coordinador', 'coordinador_campana', 'candidato', 'superadmin'];
const SETTINGS_ROLES = ['candidato', 'coordinador_campana', 'superadmin'];
const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('es-MX');
const fdate = (d: string | null | undefined, withYear = false) => d
    ? new Date(`${d}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
    : '—';
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86400000);

const Modal = ({ onClose, children }: { onClose: () => void; children: ReactNode }) => (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
        <div className="tactile-card flex-col gap-2" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', height: 'auto', fontSize: '0.85rem' }}>
            {children}
        </div>
    </div>
);

/** Barra de avance con marca de "dónde debería ir hoy" según el calendario. */
const Progress = ({ label, value, goal, expected, color }: { label: string; value: number; goal: number | null; expected: number; color: string }) => {
    const pct = goal && goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
    const expPct = goal && goal > 0 ? Math.min(100, (expected / goal) * 100) : 0;
    const gap = expected - value;
    return (
        <div style={{ marginBottom: '0.55rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#bbb' }}>
                <span>{label}</span>
                <span>{fmt(value)} / {goal ? fmt(goal) : '—'} {goal ? <strong style={{ color }}>{pct}%</strong> : null}</span>
            </div>
            <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .4s' }} />
                {goal ? <div title="Dónde deberías ir hoy" style={{ position: 'absolute', left: `${expPct}%`, top: -3, width: 2, height: 14, background: '#fff' }} /> : null}
            </div>
            {goal ? (
                <div style={{ fontSize: '0.72rem', marginTop: 2, color: gap > 0 ? 'var(--primary)' : 'var(--secondary)' }}>
                    {gap > 0 ? `Atrasado: hoy deberías llevar ${fmt(expected)} (te faltan ${fmt(gap)})` : `En ritmo: hoy deberías llevar ${fmt(expected)}`}
                </div>
            ) : null}
        </div>
    );
};

const pace = (value: number, expected: number) => (expected > 0 ? Math.round((value / expected) * 100) : null);

export const GoalsCascade = () => {
    const { user } = useAuth();
    const [stack, setStack] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Mi meta' }]);
    const [rows, setRows] = useState<BoardRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState<{ row: BoardRow; suggestion: Suggestion | null; votos: number; simp: number; contactos: number; method: string; notes: string; start: string; end: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [phases, setPhases] = useState<Phase[]>([]);
    const [showSettings, setShowSettings] = useState(false);
    const [calendar, setCalendar] = useState<{ row: BoardRow; weeks: Week[] | null } | null>(null);
    const [objective, setObjective] = useState<Objective>('votos');
    const [thermo, setThermo] = useState<Thermo[]>([]);
    const [showThanks, setShowThanks] = useState(false);
    const [showAudit, setShowAudit] = useState(false);
    const canAudit = ['superadmin', 'candidato', 'coordinador_campana', 'comunicacion_digital'].includes(user?.role || '');

    const root = stack[stack.length - 1];
    const canEditSettings = SETTINGS_ROLES.includes(user?.role || '');

    const load = async () => {
        setLoading(true); setError('');
        const { data, error: e } = await supabase.rpc('fn_goal_board', { p_root: root.id });
        if (e) setError(e.message); else setRows((data || []) as BoardRow[]);
        setLoading(false);
    };
    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [root.id]);

    // Tipo de proceso (lo ven todos) y termómetro de posicionamiento por sección
    useEffect(() => {
        if (!user?.tenant_id) return;
        supabase.from('goal_settings').select('objective').eq('tenant_id', user.tenant_id).maybeSingle()
            .then(({ data }) => setObjective(((data as any)?.objective as Objective) || 'votos'));
        if (user.role !== 'brigadista') {
            supabase.rpc('fn_recognition_by_section', { p_days: 30 })
                .then(({ data }) => setThermo(((data as Thermo[]) || []).filter(t => t.contactos > 0)));
        }
    }, [user?.tenant_id, user?.role]);
    const L = labelsFor(objective);

    const loadSettings = async () => {
        if (!user?.tenant_id) return;
        const [{ data: s }, { data: ph }] = await Promise.all([
            supabase.from('goal_settings').select('*').eq('tenant_id', user.tenant_id).maybeSingle(),
            supabase.from('campaign_phases').select('*').eq('tenant_id', user.tenant_id).order('start_date'),
        ]);
        setSettings(s || {
            tenant_id: user.tenant_id, method: 'ganador', win_margin: 0.10, target_share: 0.50,
            supporter_ratio: 0.40, contacts_per_supporter: 3, campaign_start: null, campaign_end: null, pacing: 'fases',
            objective: 'votos', reach_target: 0.25, preference_target: 0.40,
        });
        setPhases((ph || []) as Phase[]);
    };
    useEffect(() => { if (canEditSettings) loadSettings(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [canEditSettings, user?.tenant_id]);

    const me = rows.find(r => r.is_root);
    const team = rows.filter(r => !r.is_root);
    const isMyself = root.id === null;
    const canEditRoot = !isMyself || SELF_GOAL_ROLES.includes(user?.role || '');

    // ─── Editor de meta ───
    const openEditor = async (row: BoardRow) => {
        const { data: g } = await supabase.from('goals').select('start_date, end_date, notes').eq('user_id', row.user_id).maybeSingle();
        setEditing({
            row, suggestion: null, votos: row.meta_votos ?? 0, simp: row.meta_simpatizantes ?? 0, contactos: row.meta_contactos ?? 0,
            method: row.method || 'manual', notes: g?.notes || '', start: g?.start_date || '', end: g?.end_date || '',
        });
        const { data, error: e } = await supabase.rpc('fn_suggest_goal', { p_user_id: row.user_id });
        if (e) { setEditing(prev => prev && { ...prev, suggestion: { method: 'sin_base', mensaje: e.message } }); return; }
        const s = data as Suggestion;
        setEditing(prev => prev && {
            ...prev, suggestion: s,
            ...(s.method !== 'sin_base' && row.meta_votos == null
                ? { votos: s.meta_votos ?? 0, simp: s.meta_simpatizantes ?? 0, contactos: s.meta_contactos ?? 0, method: s.method } : {}),
        });
    };
    const applySuggestion = () => {
        const s = editing?.suggestion;
        if (!editing || !s || s.method === 'sin_base') return;
        setEditing({ ...editing, votos: s.meta_votos ?? 0, simp: s.meta_simpatizantes ?? 0, contactos: s.meta_contactos ?? 0, method: s.method });
    };
    const saveGoal = async () => {
        if (!editing) return;
        if (editing.start && editing.end && editing.end < editing.start) { alert('La fecha final no puede ser anterior a la inicial.'); return; }
        setSaving(true);
        const { error: e } = await supabase.rpc('fn_set_goal', {
            p_user_id: editing.row.user_id, p_meta_votos: editing.votos, p_meta_simpatizantes: editing.simp,
            p_meta_contactos: editing.contactos, p_method: editing.method, p_notes: editing.notes || null,
            p_start_date: editing.start || null, p_end_date: editing.end || null,
        });
        setSaving(false);
        if (e) { alert(e.message); return; }
        setEditing(null);
        load();
    };

    // ─── Calendario semanal ───
    const openCalendar = async (row: BoardRow) => {
        setCalendar({ row, weeks: null });
        const { data, error: e } = await supabase.rpc('fn_goal_schedule', { p_user_id: row.user_id });
        if (e) { alert(e.message); setCalendar(null); return; }
        setCalendar({ row, weeks: (data || []) as Week[] });
    };

    // ─── Parámetros y fases ───
    const phasesTotal = phases.reduce((a, p) => a + (Number(p.weight) || 0), 0);
    const applyTemplate = () => {
        const s = settings?.campaign_start, e = settings?.campaign_end;
        if (!s || !e || e <= s) { alert('Primero define el inicio de campaña y el día de la elección.'); return; }
        const total = daysBetween(s, e) + 1;
        const d1 = Math.max(1, Math.round(total * 0.3)), d2 = Math.max(1, Math.round(total * 0.4));
        const end1 = addDays(s, d1 - 1), end2 = addDays(end1, d2), end3 = addDays(e, -3);
        setPhases([
            { name: 'Arranque', start_date: s, end_date: end1, weight: 20, sort: 1 },
            { name: 'Consolidación', start_date: addDays(end1, 1), end_date: end2, weight: 35, sort: 2 },
            { name: 'Cierre', start_date: addDays(end2, 1), end_date: end3 >= addDays(end2, 1) ? end3 : e, weight: 45, sort: 3 },
        ]);
    };
    const saveSettings = async () => {
        if (settings.campaign_start && settings.campaign_end && settings.campaign_end < settings.campaign_start) {
            alert('El día de la elección no puede ser anterior al inicio.'); return;
        }
        if (phases.some(p => !p.name || !p.start_date || !p.end_date || p.end_date < p.start_date)) {
            alert('Revisa las fases: cada una necesita nombre y fechas válidas.'); return;
        }
        if (phases.length > 0 && Math.round(phasesTotal) !== 100 &&
            !confirm(`Las fases suman ${phasesTotal}% de la meta (lo normal es 100%). Se ajustará proporcionalmente. ¿Guardar así?`)) return;
        const { error: e1 } = await supabase.from('goal_settings').upsert({ ...settings, updated_at: new Date().toISOString() });
        if (e1) { alert(e1.message); return; }
        const { error: e2 } = await supabase.from('campaign_phases').delete().eq('tenant_id', user!.tenant_id);
        if (e2) { alert(e2.message); return; }
        if (phases.length) {
            const { error: e3 } = await supabase.from('campaign_phases').insert(
                phases.map((p, i) => ({ tenant_id: user!.tenant_id, name: p.name, start_date: p.start_date, end_date: p.end_date, weight: Number(p.weight) || 0, sort: i + 1 })));
            if (e3) { alert(e3.message); return; }
        }
        setObjective(settings.objective || 'votos');
        setShowSettings(false);
        load();
    };

    const repartoPct = me?.meta_simpatizantes ? Math.round((me.repartido_simpatizantes / me.meta_simpatizantes) * 100) : 0;
    const periodLabel = (r: BoardRow) => `${fdate(r.periodo_inicio)} → ${fdate(r.periodo_fin, true)}${r.dias_restantes > 0 ? ` · faltan ${r.dias_restantes} días` : ' · periodo cerrado'}`;

    return (
        <div className="flex-col gap-2" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {stack.length > 1 && (
                    <button className="squishy-btn" style={{ padding: '0.3rem 0.5rem' }} aria-label="Regresar"
                        onClick={() => setStack(stack.slice(0, -1))}><ArrowLeft size={16} /></button>
                )}
                <h2 style={{ fontFamily: 'Oswald, sans-serif', letterSpacing: '0.08em', margin: 0, flex: 1 }}>
                    <Target size={20} /> METAS {stack.length > 1 ? `· ${root.name}` : ''}
                </h2>
                {canAudit && stack.length === 1 && (
                    <button className="squishy-btn" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setShowAudit(true)} aria-label="Auditoría de calidad" title="Auditoría de calidad">🔎</button>
                )}
                {canEditSettings && stack.length === 1 && (
                    <button className="squishy-btn" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setShowThanks(true)} aria-label="Página de agradecimiento" title="Página de agradecimiento">📣</button>
                )}
                {canEditSettings && stack.length === 1 && (
                    <button className="squishy-btn" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setShowSettings(true)} aria-label="Calendario y parámetros"><Settings size={16} /></button>
                )}
            </div>

            {loading && <div style={{ color: '#9aa' }}>Calculando avance...</div>}
            {error && <div style={{ color: 'var(--primary)' }}>❌ {error}</div>}

            {me && (
                <div className="tactile-card flex-col" style={{ gap: '0.3rem', borderColor: 'var(--tertiary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                        <strong>{me.name}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#9aa', textAlign: 'right' }}>
                            {ROLE_LABEL[me.role] || me.role}
                            {me.territory_zones > 0 && ` · ${me.territory_zones} ${TERRITORY_LABEL[me.territory_type || ''] || 'zonas'}`}
                        </span>
                    </div>
                    {me.meta_simpatizantes == null ? (
                        <div style={{ fontSize: '0.85rem', color: '#bbb' }}>
                            {canEditRoot ? 'Aún no hay meta. Calcúlala con el histórico de tu territorio.' : 'Tu superior aún no te asigna meta.'}
                        </div>
                    ) : (
                        <>
                            <div style={{ fontSize: '0.78rem', color: '#9aa' }}><CalendarDays size={13} /> {periodLabel(me)}</div>
                            {objective === 'votos'
                                ? <div style={{ fontSize: '0.8rem', color: '#9aa' }}>Meta de votos del territorio: <strong style={{ color: '#fff' }}>{fmt(me.meta_votos)}</strong></div>
                                : <div style={{ fontSize: '0.8rem', color: '#9aa' }}>{OBJECTIVE_LABEL[objective]} · meta de alcance: <strong style={{ color: '#fff' }}>{fmt(me.meta_contactos)}</strong> personas</div>}
                            <Progress label="Simpatizantes validados por WhatsApp" value={me.avance_verificados} goal={me.meta_simpatizantes} expected={me.esperado_simpatizantes} color="var(--secondary)" />
                            <div style={{ fontSize: '0.72rem', color: '#9aa', marginTop: '-0.35rem', marginBottom: '0.45rem' }}>
                                Registrados: {fmt(me.avance_simpatizantes)} · validados {pctTxt(me.avance_verificados, me.avance_simpatizantes)}
                                {me.avance_alertas > 0 && <span style={{ color: '#FFB000' }}> · ⚠️ {fmt(me.avance_alertas)} con alerta (revisar)</span>}
                            </div>
                            <Progress label={L.alcance} value={me.avance_contactos} goal={me.meta_contactos} expected={me.esperado_contactos} color="var(--tertiary)" />
                            <div style={{ fontSize: '0.75rem', color: '#9aa' }}>
                                {L.prefieren}: {fmt(me.avance_convencidos)} ({pctTxt(me.avance_convencidos, me.avance_contactos)}) ·
                                {' '}Ya lo conocían: {fmt(me.avance_conocian)} ({pctTxt(me.avance_conocian, me.avance_contactos)}) · {fmt(me.actividades)} actividades
                            </div>
                            {me.equipo > 0 && (
                                <div style={{ fontSize: '0.78rem', marginTop: '0.3rem', color: repartoPct < 100 ? 'var(--primary)' : 'var(--secondary)' }}>
                                    Repartido a tu equipo: {fmt(me.repartido_simpatizantes)} de {fmt(me.meta_simpatizantes)} simpatizantes ({repartoPct}%)
                                    {me.sin_meta > 0 && ` · ${me.sin_meta} sin meta`}
                                </div>
                            )}
                        </>
                    )}
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                        {canEditRoot && (
                            <button className="squishy-btn" style={{ flex: 1 }} onClick={() => openEditor(me)}>
                                <Calculator size={16} /> {me.meta_simpatizantes == null ? 'Calcular meta' : 'Ajustar meta'}
                            </button>
                        )}
                        {me.meta_simpatizantes != null && (
                            <button className="squishy-btn" style={{ flex: 1 }} onClick={() => openCalendar(me)}><CalendarDays size={16} /> Calendario</button>
                        )}
                    </div>
                </div>
            )}

            {thermo.length > 0 && stack.length === 1 && (
                <div className="tactile-card flex-col" style={{ gap: '0.3rem', padding: '0.6rem' }}>
                    <h4 style={{ margin: 0, fontFamily: 'Oswald, sans-serif' }}>🌡️ TERMÓMETRO POR SECCIÓN · 30 DÍAS</h4>
                    <div style={{ fontSize: '0.72rem', color: '#9aa' }}>De la gente contactada en campo: qué % ya conocía {objective === 'votos' ? 'al candidato' : 'al aspirante'} y qué % {objective === 'votos' ? 'se convenció' : 'lo prefiere'}. Sirve para anticipar la encuesta y decidir a dónde mandar brigadas.</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0.2rem 0.7rem', fontSize: '0.78rem' }}>
                        <span style={{ color: '#9aa' }}>Sección</span><span style={{ color: '#9aa', textAlign: 'right' }}>Contactos</span><span style={{ color: '#9aa', textAlign: 'right' }}>Conocen</span><span style={{ color: '#9aa', textAlign: 'right' }}>{objective === 'votos' ? 'Convencidos' : 'Prefieren'}</span>
                        {thermo.slice(0, 12).map(t => {
                            const k = Math.round((t.pct_conocimiento ?? 0) * 100), v = Math.round((t.pct_preferencia ?? 0) * 100);
                            return [
                                <span key={`${t.section_id}-s`}>{t.section_id}</span>,
                                <span key={`${t.section_id}-c`} style={{ textAlign: 'right' }}>{fmt(t.contactos)}</span>,
                                <span key={`${t.section_id}-k`} style={{ textAlign: 'right', color: k >= 50 ? 'var(--secondary)' : k >= 25 ? '#FFB000' : 'var(--primary)' }}>{k}%</span>,
                                <span key={`${t.section_id}-v`} style={{ textAlign: 'right', color: v >= 30 ? 'var(--secondary)' : v >= 15 ? '#FFB000' : 'var(--primary)' }}>{v}%</span>,
                            ];
                        })}
                    </div>
                    {thermo.some(t => t.contactos < 30) && <div style={{ fontSize: '0.7rem', color: '#9aa' }}>Con menos de 30 contactos en una sección, el porcentaje todavía es poco confiable.</div>}
                </div>
            )}

            {team.length > 0 && (
                <div className="flex-col" style={{ gap: '0.5rem' }}>
                    <h4 style={{ margin: '0.3rem 0 0', fontFamily: 'Oswald, sans-serif' }}><Users size={16} /> EQUIPO DIRECTO ({team.length})</h4>
                    {team.map(t => {
                        const pct = t.meta_simpatizantes ? Math.min(100, Math.round((t.avance_verificados / t.meta_simpatizantes) * 100)) : null;
                        const ritmo = pace(t.avance_verificados, t.esperado_simpatizantes);
                        const tasaValidacion = t.avance_simpatizantes > 0 ? Math.round((t.avance_verificados / t.avance_simpatizantes) * 100) : null;
                        return (
                            <div key={t.user_id} className="tactile-card" style={{ padding: '0.6rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                                        <div style={{ fontSize: '0.72rem', color: '#9aa' }}>
                                            {ROLE_LABEL[t.role] || t.role}
                                            {t.territory_zones > 0 ? ` · ${t.territory_zones} ${TERRITORY_LABEL[t.territory_type || ''] || 'zonas'}` : ' · sin territorio'}
                                            {t.equipo > 0 && ` · equipo de ${t.equipo}`}
                                        </div>
                                        {pct !== null && <div style={{ fontSize: '0.7rem', color: '#9aa' }}>{fdate(t.periodo_inicio)} → {fdate(t.periodo_fin)}</div>}
                                        {t.avance_simpatizantes > 0 && (
                                            <div style={{ fontSize: '0.7rem', color: tasaValidacion !== null && tasaValidacion < 50 ? 'var(--primary)' : '#9aa' }}>
                                                {fmt(t.avance_simpatizantes)} registrados · {tasaValidacion}% validados
                                                {t.avance_alertas > 0 && <span style={{ color: '#FFB000' }}> · ⚠️ {t.avance_alertas} alertas</span>}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                        {pct === null ? <span style={{ color: 'var(--primary)' }}>Sin meta</span> : (
                                            <>
                                                <div style={{ color: '#9aa' }}>{fmt(t.avance_verificados)}/{fmt(t.meta_simpatizantes)} validados · {pct}%</div>
                                                {ritmo === null
                                                    ? <span style={{ color: '#9aa' }}>Aún no inicia</span>
                                                    : <strong style={{ color: ritmo >= 100 ? 'var(--secondary)' : ritmo >= 70 ? '#FFB000' : 'var(--primary)' }}>
                                                        {ritmo >= 100 ? 'En ritmo' : 'Atrasado'} · {ritmo}%
                                                    </strong>}
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.45rem' }}>
                                    <button className="squishy-btn" style={{ flex: 1, padding: '0.3rem', fontSize: '0.78rem' }} onClick={() => openEditor(t)}>
                                        <Calculator size={14} /> {t.meta_simpatizantes == null ? 'Asignar meta' : 'Ajustar'}
                                    </button>
                                    {t.meta_simpatizantes != null && (
                                        <button className="squishy-btn" style={{ flex: 1, padding: '0.3rem', fontSize: '0.78rem' }} onClick={() => openCalendar(t)}>
                                            <CalendarDays size={14} /> Calendario
                                        </button>
                                    )}
                                    {t.equipo > 0 && (
                                        <button className="squishy-btn" style={{ flex: 1, padding: '0.3rem', fontSize: '0.78rem' }}
                                            onClick={() => setStack([...stack, { id: t.user_id, name: t.name }])}>
                                            Equipo <ChevronRight size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showThanks && <ThanksPageEditor onClose={() => setShowThanks(false)} />}
            {showAudit && <AuditPanel onClose={() => setShowAudit(false)} />}

            {/* Editor de meta */}
            {editing && (
                <Modal onClose={() => setEditing(null)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>Meta de {editing.row.name}</strong>
                        <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setEditing(null)} aria-label="Cerrar"><X size={16} /></button>
                    </div>

                    {!editing.suggestion && <div style={{ color: '#9aa' }}>Calculando con el histórico...</div>}
                    {editing.suggestion?.method === 'historico' && (
                        <div style={{ background: 'rgba(0,212,255,0.08)', padding: '0.6rem', borderRadius: 8 }}>
                            {objective === 'votos' ? (<>
                                <strong>Cálculo histórico</strong> · {editing.suggestion.sections_count} secciones
                                ({editing.suggestion.sections_with_data} con datos 2024)<br />
                                Lista nominal: {fmt(editing.suggestion.lista_nominal)} · Votaron en 2024: {fmt(editing.suggestion.votos_base)}<br />
                                Votos del ganador 2024: {fmt(editing.suggestion.ganador_base)}
                                {(editing.suggestion.secciones_competidas ?? 0) > 0 && <><br />⚠️ {editing.suggestion.secciones_competidas} secciones muy competidas (margen menor a 10%)</>}
                                <br />Sugerido: <strong>{fmt(editing.suggestion.meta_votos)}</strong> votos · <strong>{fmt(editing.suggestion.meta_simpatizantes)}</strong> simpatizantes · <strong>{fmt(editing.suggestion.meta_contactos)}</strong> contactos
                            </>) : (<>
                                <strong>Cálculo por alcance</strong> ({OBJECTIVE_LABEL[objective]}) · {editing.suggestion.sections_count} secciones<br />
                                Lista nominal del territorio: {fmt(editing.suggestion.lista_nominal)}<br />
                                Sugerido: alcanzar a <strong>{fmt(editing.suggestion.meta_contactos)}</strong> personas · <strong>{fmt(editing.suggestion.meta_simpatizantes)}</strong> simpatizantes registrados
                            </>)}
                        </div>
                    )}
                    {editing.suggestion?.method === 'reparto' && (
                        <div style={{ background: 'rgba(255,176,0,0.08)', padding: '0.6rem', borderRadius: 8 }}>
                            <strong>Sin territorio propio:</strong> se reparte lo que falta de la meta del superior entre {editing.suggestion.repartido_entre} persona(s) sin meta.<br />
                            Sugerido: <strong>{fmt(editing.suggestion.meta_simpatizantes)}</strong> simpatizantes · <strong>{fmt(editing.suggestion.meta_contactos)}</strong> contactos
                        </div>
                    )}
                    {editing.suggestion?.method === 'sin_base' && <div style={{ color: 'var(--primary)' }}>{editing.suggestion.mensaje}</div>}
                    {editing.suggestion && editing.suggestion.method !== 'sin_base' && (
                        <button className="squishy-btn" onClick={applySuggestion}>Usar lo sugerido</button>
                    )}

                    {([['votos', 'Meta de votos'], ['simp', 'Meta de simpatizantes registrados'], ['contactos', L.alcanceMeta]] as const)
                        .filter(([k]) => objective === 'votos' || k !== 'votos').map(([k, label]) => (
                        <label key={k} style={{ display: 'flex', flexDirection: 'column', color: '#bbb', gap: '0.2rem' }}>
                            {label}
                            <input type="number" min={0} className="squishy-input" value={editing[k]}
                                onChange={e => setEditing({ ...editing, [k]: Math.max(0, parseInt(e.target.value || '0', 10)), method: 'manual' })} />
                        </label>
                    ))}

                    <div style={{ color: '#bbb' }}>Periodo de esta meta <span style={{ color: '#9aa' }}>(vacío = el de la campaña)</span></div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <label className="flex-col" style={{ gap: '0.2rem', flex: 1, minWidth: 0 }}>Desde
                            <input type="date" className="squishy-input" style={{ minWidth: 0, width: '100%' }} value={editing.start} onChange={e => setEditing({ ...editing, start: e.target.value })} />
                        </label>
                        <label className="flex-col" style={{ gap: '0.2rem', flex: 1, minWidth: 0 }}>Hasta
                            <input type="date" className="squishy-input" style={{ minWidth: 0, width: '100%' }} value={editing.end} onChange={e => setEditing({ ...editing, end: e.target.value })} />
                        </label>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#9aa' }}>Si alguien se suma a media campaña, pon su fecha de inicio: su meta se reparte solo en el tiempo que le queda, según el peso de cada fase.</div>

                    <textarea className="squishy-input" rows={2} placeholder="Nota para esta meta (opcional)" value={editing.notes}
                        onChange={e => setEditing({ ...editing, notes: e.target.value })} />
                    <button className="squishy-btn primary" disabled={saving} onClick={saveGoal}>{saving ? 'Guardando...' : 'Guardar meta'}</button>
                </Modal>
            )}

            {/* Calendario semanal: meta vs real */}
            {calendar && (
                <Modal onClose={() => setCalendar(null)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong><CalendarDays size={16} /> Calendario de {calendar.row.name}</strong>
                        <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setCalendar(null)} aria-label="Cerrar"><X size={16} /></button>
                    </div>
                    <div style={{ color: '#9aa', fontSize: '0.78rem' }}>{periodLabel(calendar.row)} · Meta semanal de simpatizantes (S) y contactos (C) contra lo logrado por todo su equipo.</div>
                    {!calendar.weeks && <div style={{ color: '#9aa' }}>Cargando...</div>}
                    {calendar.weeks && calendar.weeks.length === 0 && <div style={{ color: '#9aa' }}>Sin calendario: falta la meta o el periodo.</div>}
                    {calendar.weeks && calendar.weeks.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: '0.25rem 0.6rem', fontSize: '0.76rem', alignItems: 'center' }}>
                            <span style={{ color: '#9aa' }}>Semana</span><span style={{ color: '#9aa' }}>Fase</span><span style={{ color: '#9aa', textAlign: 'right' }}>S real/meta</span><span style={{ color: '#9aa', textAlign: 'right' }}>C real/meta</span>
                            {calendar.weeks.map(w => {
                                const past = w.period_end < new Date().toISOString().slice(0, 10);
                                const okS = w.real_simpatizantes >= w.meta_simpatizantes, okC = w.real_contactos >= w.meta_contactos;
                                const color = (ok: boolean) => (!past && !w.is_current) ? '#9aa' : ok ? 'var(--secondary)' : 'var(--primary)';
                                const cellStyle = w.is_current ? { background: 'rgba(0,212,255,0.12)', borderRadius: 4, padding: '0.15rem 0.2rem' } : { padding: '0.15rem 0.2rem' };
                                return [
                                    <span key={`${w.period_start}-a`} style={{ ...cellStyle, whiteSpace: 'nowrap', fontWeight: w.is_current ? 700 : 400 }}>{fdate(w.period_start)}{w.is_current ? ' ◀ hoy' : ''}</span>,
                                    <span key={`${w.period_start}-b`} style={{ ...cellStyle, color: w.phase ? '#ddd' : '#777' }}>{w.phase || 'sin fase'}</span>,
                                    <span key={`${w.period_start}-c`} style={{ ...cellStyle, textAlign: 'right', color: color(okS) }}>{fmt(w.real_simpatizantes)}/{fmt(w.meta_simpatizantes)}</span>,
                                    <span key={`${w.period_start}-d`} style={{ ...cellStyle, textAlign: 'right', color: color(okC) }}>{fmt(w.real_contactos)}/{fmt(w.meta_contactos)}</span>,
                                ];
                            })}
                        </div>
                    )}
                </Modal>
            )}

            {/* Calendario de campaña y parámetros (candidato / coord. de campaña) */}
            {showSettings && settings && (
                <Modal onClose={() => setShowSettings(false)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <strong>Calendario y cálculo de metas</strong>
                        <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setShowSettings(false)} aria-label="Cerrar"><X size={16} /></button>
                    </div>

                    <h4 style={{ margin: '0.3rem 0 0', fontFamily: 'Oswald, sans-serif' }}><CalendarDays size={15} /> CALENDARIO DE CAMPAÑA</h4>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <label className="flex-col" style={{ gap: '0.2rem', flex: 1, minWidth: 0 }}>Inicio de campaña
                            <input type="date" className="squishy-input" style={{ minWidth: 0, width: '100%' }} value={settings.campaign_start || ''} onChange={e => setSettings({ ...settings, campaign_start: e.target.value || null })} />
                        </label>
                        <label className="flex-col" style={{ gap: '0.2rem', flex: 1, minWidth: 0 }}>Día de la elección
                            <input type="date" className="squishy-input" style={{ minWidth: 0, width: '100%' }} value={settings.campaign_end || ''} onChange={e => setSettings({ ...settings, campaign_end: e.target.value || null })} />
                        </label>
                    </div>
                    <label className="flex-col" style={{ gap: '0.2rem' }}>Cómo se reparte la meta en el tiempo
                        <select className="squishy-input" value={settings.pacing || 'fases'} onChange={e => setSettings({ ...settings, pacing: e.target.value })}>
                            <option value="fases">Por fases (cada fase con su % de la meta)</option>
                            <option value="lineal">Parejo todos los días</option>
                        </select>
                    </label>

                    {(settings.pacing || 'fases') === 'fases' && (
                        <div className="flex-col" style={{ gap: '0.4rem' }}>
                            {phases.map((p, i) => (
                                <div key={i} className="tactile-card" style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        <input className="squishy-input" style={{ flex: 1 }} placeholder="Nombre de la fase" value={p.name}
                                            onChange={e => setPhases(phases.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                                        <input type="number" className="squishy-input" style={{ width: 72 }} min={0} max={100} value={p.weight} aria-label="% de la meta"
                                            onChange={e => setPhases(phases.map((x, j) => j === i ? { ...x, weight: Number(e.target.value) } : x))} />
                                        <span style={{ alignSelf: 'center' }}>%</span>
                                        <button className="squishy-btn" style={{ padding: '0.2rem 0.4rem' }} aria-label="Quitar fase"
                                            onClick={() => setPhases(phases.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                                        <input type="date" className="squishy-input" style={{ flex: 1, minWidth: 0, width: '100%', fontSize: '0.8rem', padding: '0.45rem 0.4rem' }} value={p.start_date} aria-label="Inicio de la fase"
                                            onChange={e => setPhases(phases.map((x, j) => j === i ? { ...x, start_date: e.target.value } : x))} />
                                        <input type="date" className="squishy-input" style={{ flex: 1, minWidth: 0, width: '100%', fontSize: '0.8rem', padding: '0.45rem 0.4rem' }} value={p.end_date} aria-label="Fin de la fase"
                                            onChange={e => setPhases(phases.map((x, j) => j === i ? { ...x, end_date: e.target.value } : x))} />
                                    </div>
                                </div>
                            ))}
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                <button className="squishy-btn" style={{ flex: 1 }} onClick={() => setPhases([...phases, {
                                    name: '', start_date: phases.length ? addDays(phases[phases.length - 1].end_date, 1) : (settings.campaign_start || ''),
                                    end_date: settings.campaign_end || '', weight: 0, sort: phases.length + 1,
                                }])}><Plus size={14} /> Agregar fase</button>
                                <button className="squishy-btn" style={{ flex: 1 }} onClick={applyTemplate}>Plantilla 3 fases</button>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: Math.round(phasesTotal) === 100 ? 'var(--secondary)' : 'var(--primary)' }}>
                                Las fases suman {phasesTotal}% de la meta{Math.round(phasesTotal) !== 100 ? ' (deberían sumar 100%)' : ''}. Los días sin fase (por ejemplo, veda) no cuentan para avanzar.
                            </div>
                        </div>
                    )}

                    <h4 style={{ margin: '0.5rem 0 0', fontFamily: 'Oswald, sans-serif' }}><Calculator size={15} /> CÁLCULO DE LA META</h4>
                    <label className="flex-col" style={{ gap: '0.2rem' }}>Tipo de proceso
                        <select className="squishy-input" value={settings.objective || 'votos'} onChange={e => setSettings({ ...settings, objective: e.target.value })}>
                            <option value="votos">Campaña constitucional: meta de votos</option>
                            <option value="encuesta">Aspirante: ganar una encuesta interna</option>
                            <option value="conocimiento">Aspirante: darse a conocer</option>
                        </select>
                    </label>
                    {(settings.objective || 'votos') !== 'votos' ? (<>
                        <label className="flex-col" style={{ gap: '0.2rem' }}>Personas a alcanzar (% de la lista nominal del territorio)
                            <input type="number" className="squishy-input" min={1} max={100} value={Math.round((settings.reach_target ?? 0.25) * 100)}
                                onChange={e => setSettings({ ...settings, reach_target: Number(e.target.value) / 100 })} />
                        </label>
                        <label className="flex-col" style={{ gap: '0.2rem' }}>Simpatizantes a registrar (% de las personas alcanzadas)
                            <input type="number" className="squishy-input" min={1} max={100} value={Math.round((settings.preference_target ?? 0.40) * 100)}
                                onChange={e => setSettings({ ...settings, preference_target: Number(e.target.value) / 100 })} />
                        </label>
                        <div style={{ fontSize: '0.75rem', background: 'rgba(255,176,0,0.1)', padding: '0.5rem', borderRadius: 8 }}>
                            ⚖️ Antes de la precampaña no se permiten llamados expresos al voto ni propaganda electoral: el trabajo de campo debe ser presentar al aspirante y escuchar a la gente. El INE fiscaliza los recursos de estos procesos, así que conviene documentar los gastos.
                        </div>
                    </>) : (<>
                    <label className="flex-col" style={{ gap: '0.2rem' }}>Método para la meta de votos
                        <select className="squishy-input" value={settings.method} onChange={e => setSettings({ ...settings, method: e.target.value })}>
                            <option value="ganador">Superar al ganador de 2024 por un margen</option>
                            <option value="participacion">Porcentaje de la votación esperada</option>
                        </select>
                    </label>
                    {settings.method === 'ganador' ? (
                        <label className="flex-col" style={{ gap: '0.2rem' }}>Margen sobre el ganador 2024 (%)
                            <input type="number" className="squishy-input" min={0} max={100} value={Math.round(settings.win_margin * 100)}
                                onChange={e => setSettings({ ...settings, win_margin: Number(e.target.value) / 100 })} />
                        </label>
                    ) : (
                        <label className="flex-col" style={{ gap: '0.2rem' }}>Porcentaje de la votación esperada (%)
                            <input type="number" className="squishy-input" min={5} max={100} value={Math.round(settings.target_share * 100)}
                                onChange={e => setSettings({ ...settings, target_share: Number(e.target.value) / 100 })} />
                        </label>
                    )}
                    <label className="flex-col" style={{ gap: '0.2rem' }}>Simpatizantes a registrar (% de la meta de votos)
                        <input type="number" className="squishy-input" min={1} max={100} value={Math.round(settings.supporter_ratio * 100)}
                            onChange={e => setSettings({ ...settings, supporter_ratio: Number(e.target.value) / 100 })} />
                    </label>
                    <label className="flex-col" style={{ gap: '0.2rem' }}>Contactos necesarios por cada simpatizante
                        <input type="number" className="squishy-input" min={1} max={20} step={0.5} value={settings.contacts_per_supporter}
                            onChange={e => setSettings({ ...settings, contacts_per_supporter: Number(e.target.value) })} />
                    </label>
                    </>)}
                    <div style={{ fontSize: '0.75rem', color: '#9aa' }}>Los parámetros de cálculo aplican a las metas que se calculen de aquí en adelante. El calendario aplica de inmediato al ritmo de todas las metas.</div>
                    <button className="squishy-btn primary" onClick={saveSettings}>Guardar</button>
                </Modal>
            )}
        </div>
    );
};

export default GoalsCascade;
