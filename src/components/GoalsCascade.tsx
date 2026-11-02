import { useEffect, useState } from 'react';
import { Target, ChevronRight, ArrowLeft, Calculator, Settings, X, Users } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

type BoardRow = {
    user_id: string; name: string; role: string; is_root: boolean;
    territory_type: string | null; territory_zones: number;
    meta_votos: number | null; meta_simpatizantes: number | null; meta_contactos: number | null; method: string | null;
    avance_simpatizantes: number; avance_contactos: number; avance_convencidos: number; actividades: number;
    repartido_simpatizantes: number; equipo: number; sin_meta: number;
};
type Suggestion = {
    method: 'historico' | 'reparto' | 'sin_base'; sections_count?: number; sections_with_data?: number;
    lista_nominal?: number; votos_base?: number; ganador_base?: number; secciones_competidas?: number;
    meta_votos?: number; meta_simpatizantes?: number; meta_contactos?: number; repartido_entre?: number; mensaje?: string;
};

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

const Progress = ({ label, value, goal, color }: { label: string; value: number; goal: number | null; color: string }) => {
    const pct = goal && goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
    return (
        <div style={{ marginBottom: '0.45rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#bbb' }}>
                <span>{label}</span>
                <span>{fmt(value)} / {goal ? fmt(goal) : '—'} {goal ? <strong style={{ color }}>{pct}%</strong> : null}</span>
            </div>
            <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width .4s' }} />
            </div>
        </div>
    );
};

export const GoalsCascade = () => {
    const { user } = useAuth();
    const [stack, setStack] = useState<{ id: string | null; name: string }[]>([{ id: null, name: 'Mi meta' }]);
    const [rows, setRows] = useState<BoardRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editing, setEditing] = useState<{ row: BoardRow; suggestion: Suggestion | null; votos: number; simp: number; contactos: number; method: string; notes: string } | null>(null);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<any>(null);
    const [showSettings, setShowSettings] = useState(false);

    const root = stack[stack.length - 1];
    const canEditSettings = SETTINGS_ROLES.includes(user?.role || '');

    const load = async () => {
        setLoading(true); setError('');
        const { data, error: e } = await supabase.rpc('fn_goal_board', { p_root: root.id });
        if (e) setError(e.message); else setRows((data || []) as BoardRow[]);
        setLoading(false);
    };
    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [root.id]);

    useEffect(() => {
        if (!canEditSettings || !user?.tenant_id) return;
        supabase.from('goal_settings').select('*').eq('tenant_id', user.tenant_id).maybeSingle()
            .then(({ data }) => setSettings(data || {
                tenant_id: user.tenant_id, method: 'ganador', win_margin: 0.10, target_share: 0.50,
                supporter_ratio: 0.40, contacts_per_supporter: 3, campaign_start: null, campaign_end: null,
            }));
    }, [canEditSettings, user?.tenant_id]);

    const me = rows.find(r => r.is_root);
    const team = rows.filter(r => !r.is_root);
    const isMyself = root.id === null;
    const canEditRoot = !isMyself || SELF_GOAL_ROLES.includes(user?.role || '');

    const openEditor = async (row: BoardRow) => {
        setEditing({ row, suggestion: null, votos: row.meta_votos ?? 0, simp: row.meta_simpatizantes ?? 0, contactos: row.meta_contactos ?? 0, method: row.method || 'manual', notes: '' });
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
        setSaving(true);
        const { error: e } = await supabase.rpc('fn_set_goal', {
            p_user_id: editing.row.user_id, p_meta_votos: editing.votos, p_meta_simpatizantes: editing.simp,
            p_meta_contactos: editing.contactos, p_method: editing.method, p_notes: editing.notes || null,
        });
        setSaving(false);
        if (e) { alert(e.message); return; }
        setEditing(null);
        load();
    };

    const saveSettings = async () => {
        const { error: e } = await supabase.from('goal_settings').upsert({ ...settings, updated_at: new Date().toISOString() });
        if (e) { alert(e.message); return; }
        setShowSettings(false);
    };

    const repartoPct = me?.meta_simpatizantes ? Math.round((me.repartido_simpatizantes / me.meta_simpatizantes) * 100) : 0;

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
                {canEditSettings && stack.length === 1 && (
                    <button className="squishy-btn" style={{ padding: '0.3rem 0.5rem' }} onClick={() => setShowSettings(true)} aria-label="Parámetros de metas"><Settings size={16} /></button>
                )}
            </div>

            {loading && <div style={{ color: '#9aa' }}>Calculando avance...</div>}
            {error && <div style={{ color: 'var(--primary)' }}>❌ {error}</div>}

            {me && (
                <div className="tactile-card flex-col" style={{ gap: '0.3rem', borderColor: 'var(--tertiary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <strong>{me.name}</strong>
                        <span style={{ fontSize: '0.75rem', color: '#9aa' }}>
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
                            <div style={{ fontSize: '0.8rem', color: '#9aa' }}>Meta de votos del territorio: <strong style={{ color: '#fff' }}>{fmt(me.meta_votos)}</strong></div>
                            <Progress label="Simpatizantes registrados" value={me.avance_simpatizantes} goal={me.meta_simpatizantes} color="var(--secondary)" />
                            <Progress label="Personas contactadas (bitácora)" value={me.avance_contactos} goal={me.meta_contactos} color="var(--tertiary)" />
                            <div style={{ fontSize: '0.75rem', color: '#9aa' }}>Convencidos en campo: {fmt(me.avance_convencidos)} · {fmt(me.actividades)} actividades</div>
                            {me.equipo > 0 && (
                                <div style={{ fontSize: '0.78rem', marginTop: '0.3rem', color: repartoPct < 100 ? 'var(--primary)' : 'var(--secondary)' }}>
                                    Repartido a tu equipo: {fmt(me.repartido_simpatizantes)} de {fmt(me.meta_simpatizantes)} simpatizantes ({repartoPct}%)
                                    {me.sin_meta > 0 && ` · ${me.sin_meta} sin meta`}
                                </div>
                            )}
                        </>
                    )}
                    {canEditRoot && (
                        <button className="squishy-btn" style={{ marginTop: '0.4rem' }} onClick={() => openEditor(me)}>
                            <Calculator size={16} /> {me.meta_simpatizantes == null ? 'Calcular meta' : 'Ajustar meta'}
                        </button>
                    )}
                </div>
            )}

            {team.length > 0 && (
                <div className="flex-col" style={{ gap: '0.5rem' }}>
                    <h4 style={{ margin: '0.3rem 0 0', fontFamily: 'Oswald, sans-serif' }}><Users size={16} /> EQUIPO DIRECTO ({team.length})</h4>
                    {team.map(t => {
                        const pct = t.meta_simpatizantes ? Math.min(100, Math.round((t.avance_simpatizantes / t.meta_simpatizantes) * 100)) : null;
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
                                    </div>
                                    <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                                        {pct === null ? <span style={{ color: 'var(--primary)' }}>Sin meta</span>
                                            : <><strong style={{ color: pct >= 70 ? 'var(--secondary)' : pct >= 35 ? '#FFB000' : 'var(--primary)' }}>{pct}%</strong>
                                                <div style={{ color: '#9aa' }}>{fmt(t.avance_simpatizantes)}/{fmt(t.meta_simpatizantes)}</div></>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.45rem' }}>
                                    <button className="squishy-btn" style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem' }} onClick={() => openEditor(t)}>
                                        <Calculator size={14} /> {t.meta_simpatizantes == null ? 'Asignar meta' : 'Ajustar'}
                                    </button>
                                    {t.equipo > 0 && (
                                        <button className="squishy-btn" style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem' }}
                                            onClick={() => setStack([...stack, { id: t.user_id, name: t.name }])}>
                                            Ver su equipo <ChevronRight size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Editor de meta */}
            {editing && (
                <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="tactile-card flex-col gap-2" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong>Meta de {editing.row.name}</strong>
                            <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setEditing(null)} aria-label="Cerrar"><X size={16} /></button>
                        </div>

                        {!editing.suggestion && <div style={{ color: '#9aa', fontSize: '0.85rem' }}>Calculando con el histórico...</div>}
                        {editing.suggestion?.method === 'historico' && (
                            <div style={{ fontSize: '0.8rem', background: 'rgba(0,212,255,0.08)', padding: '0.6rem', borderRadius: 8 }}>
                                <strong>Cálculo histórico</strong> · {editing.suggestion.sections_count} secciones
                                ({editing.suggestion.sections_with_data} con datos 2024)<br />
                                Lista nominal: {fmt(editing.suggestion.lista_nominal)} · Votaron en 2024: {fmt(editing.suggestion.votos_base)}<br />
                                Votos del ganador 2024: {fmt(editing.suggestion.ganador_base)}
                                {(editing.suggestion.secciones_competidas ?? 0) > 0 && <><br />⚠️ {editing.suggestion.secciones_competidas} secciones muy competidas (margen menor a 10%)</>}
                                <br />Sugerido: <strong>{fmt(editing.suggestion.meta_votos)}</strong> votos · <strong>{fmt(editing.suggestion.meta_simpatizantes)}</strong> simpatizantes · <strong>{fmt(editing.suggestion.meta_contactos)}</strong> contactos
                            </div>
                        )}
                        {editing.suggestion?.method === 'reparto' && (
                            <div style={{ fontSize: '0.8rem', background: 'rgba(255,176,0,0.08)', padding: '0.6rem', borderRadius: 8 }}>
                                <strong>Sin territorio propio:</strong> se reparte lo que falta de la meta del superior entre {editing.suggestion.repartido_entre} persona(s) sin meta.<br />
                                Sugerido: <strong>{fmt(editing.suggestion.meta_simpatizantes)}</strong> simpatizantes · <strong>{fmt(editing.suggestion.meta_contactos)}</strong> contactos
                            </div>
                        )}
                        {editing.suggestion?.method === 'sin_base' && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--primary)' }}>{editing.suggestion.mensaje}</div>
                        )}
                        {editing.suggestion && editing.suggestion.method !== 'sin_base' && (
                            <button className="squishy-btn" onClick={applySuggestion}>Usar lo sugerido</button>
                        )}

                        {([['votos', 'Meta de votos'], ['simp', 'Meta de simpatizantes registrados'], ['contactos', 'Meta de personas contactadas']] as const).map(([k, label]) => (
                            <label key={k} style={{ display: 'flex', flexDirection: 'column', fontSize: '0.8rem', color: '#bbb', gap: '0.2rem' }}>
                                {label}
                                <input type="number" min={0} className="squishy-input" value={editing[k]}
                                    onChange={e => setEditing({ ...editing, [k]: Math.max(0, parseInt(e.target.value || '0', 10)), method: 'manual' })} />
                            </label>
                        ))}
                        <textarea className="squishy-input" rows={2} placeholder="Nota para esta meta (opcional)" value={editing.notes}
                            onChange={e => setEditing({ ...editing, notes: e.target.value })} />
                        <button className="squishy-btn primary" disabled={saving} onClick={saveGoal}>{saving ? 'Guardando...' : 'Guardar meta'}</button>
                    </div>
                </div>
            )}

            {/* Parámetros de cálculo (candidato / coord. de campaña) */}
            {showSettings && settings && (
                <div onClick={() => setShowSettings(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="tactile-card flex-col gap-2" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong>Cómo se calculan las metas</strong>
                            <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setShowSettings(false)} aria-label="Cerrar"><X size={16} /></button>
                        </div>
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
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <label className="flex-col" style={{ gap: '0.2rem', flex: 1 }}>Inicio de campaña
                                <input type="date" className="squishy-input" value={settings.campaign_start || ''} onChange={e => setSettings({ ...settings, campaign_start: e.target.value || null })} />
                            </label>
                            <label className="flex-col" style={{ gap: '0.2rem', flex: 1 }}>Día de la elección
                                <input type="date" className="squishy-input" value={settings.campaign_end || ''} onChange={e => setSettings({ ...settings, campaign_end: e.target.value || null })} />
                            </label>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#9aa' }}>El avance se cuenta desde el inicio de campaña. Los cambios aplican a las metas que se calculen de aquí en adelante.</div>
                        <button className="squishy-btn primary" onClick={saveSettings}>Guardar parámetros</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GoalsCascade;
