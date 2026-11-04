import { useEffect, useState } from 'react';
import { GraduationCap, CheckCircle, ChevronRight, X, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { loadMyTraining, trainingPending, type TrainingModule } from '../lib/engagement';

type TeamRow = { user_id: string; name: string; role: string; aprobados: number; requeridos: number };

const COMMAND = ['candidato', 'coordinador_campana', 'superadmin'];
const LEADERS = ['candidato', 'coordinador_campana', 'coordinador_territorial', 'coordinador', 'lider', 'superadmin'];

/**
 * Capacitación en la app: módulos cortos con examen calificado en el servidor.
 * Si la campaña lo exige, el registro de simpatizantes se habilita al aprobar los obligatorios.
 */
export const TrainingCenter = ({ onChange, startOpen = false }: { onChange?: (pending: boolean) => void; startOpen?: boolean }) => {
    const { user } = useAuth();
    const [mods, setMods] = useState<TrainingModule[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(startOpen);
    const [active, setActive] = useState<TrainingModule | null>(null);
    const [answers, setAnswers] = useState<number[]>([]);
    const [result, setResult] = useState<{ estado: string; correctas: number; total: number; incorrectas: number[] } | null>(null);
    const [sending, setSending] = useState(false);
    const [team, setTeam] = useState<TeamRow[] | null>(null);
    const [required, setRequired] = useState(false);

    const refresh = async () => {
        try {
            const m = await loadMyTraining();
            setMods(m);
            setRequired(!!m[0]?.training_required);
            onChange?.(trainingPending(m));
        } catch (e) { console.warn('Capacitación no disponible:', e); }
        setLoading(false);
    };

    useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

    const startModule = (m: TrainingModule) => { setActive(m); setAnswers(m.quiz.map(() => -1)); setResult(null); };

    const submit = async () => {
        if (!active) return;
        setSending(true);
        const { data, error } = await supabase.rpc('fn_submit_training', { p_module: active.id, p_answers: answers });
        setSending(false);
        if (error) { alert('No se pudo enviar: ' + error.message); return; }
        setResult(data as any);
        if ((data as any)?.estado === 'aprobado') refresh();
    };

    const loadTeam = async () => {
        const { data, error } = await supabase.rpc('fn_team_training');
        if (!error) setTeam((data || []) as TeamRow[]);
    };

    const toggleRequired = async () => {
        if (!user?.tenant_id) return;
        const next = !required;
        const { error } = await supabase.from('tenants').update({ training_required: next }).eq('id', user.tenant_id);
        if (error) { alert('No se pudo cambiar: ' + error.message); return; }
        setRequired(next);
        refresh();
    };

    if (loading || mods.length === 0) return null;
    const passed = mods.filter(m => m.passed_at).length;
    const pending = trainingPending(mods);

    // ---------- Un módulo abierto
    if (active) {
        const ready = answers.every(a => a >= 0);
        return (
            <div className="tactile-card flex-col gap-2" style={{ border: '1px solid var(--tertiary)', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontFamily: 'Oswald', color: 'var(--tertiary)' }}>{active.title}</h3>
                    <button onClick={() => setActive(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={22} /></button>
                </div>
                {active.body.split(/\n\n+/).map((p, i) => <p key={i} style={{ margin: 0, lineHeight: 1.5 }}>{p}</p>)}

                <div style={{ fontFamily: 'Oswald', color: '#94A3B8', marginTop: '0.6rem' }}>EXAMEN RÁPIDO</div>
                {active.quiz.map((q, qi) => (
                    <div key={qi} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '0.7rem',
                        border: result?.incorrectas?.includes(qi) ? '1px solid var(--primary)' : '1px solid transparent' }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>{qi + 1}. {q.q}</div>
                        {q.options.map((o, oi) => (
                            <label key={oi} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', padding: '0.3rem 0', cursor: 'pointer' }}>
                                <input type="radio" name={`q${qi}`} checked={answers[qi] === oi}
                                    onChange={() => { const a = [...answers]; a[qi] = oi; setAnswers(a); setResult(null); }} />
                                <span>{o}</span>
                            </label>
                        ))}
                    </div>
                ))}
                {result && (
                    <div style={{ textAlign: 'center', fontWeight: 700, color: result.estado === 'aprobado' ? 'var(--secondary)' : 'var(--primary)' }}>
                        {result.estado === 'aprobado'
                            ? `Aprobado (${result.correctas}/${result.total}). +25 puntos la primera vez.`
                            : `${result.correctas} de ${result.total} correctas. Revisa las marcadas y vuelve a intentar.`}
                    </div>
                )}
                {result?.estado === 'aprobado'
                    ? <button className="squishy-btn primary" onClick={() => setActive(null)} style={{ padding: '0.8rem' }}>Volver a la capacitación</button>
                    : <button className="squishy-btn primary" disabled={!ready || sending} onClick={submit} style={{ padding: '0.8rem' }}>{sending ? 'Calificando...' : 'Enviar respuestas'}</button>}
            </div>
        );
    }

    // ---------- Resumen (tarjeta) y lista
    return (
        <div className="tactile-card flex-col gap-1" style={{ border: `1px solid ${pending ? 'var(--primary)' : 'rgba(255,255,255,0.1)'}`, marginBottom: '1rem' }}>
            <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                <GraduationCap size={22} color={pending ? 'var(--primary)' : 'var(--tertiary)'} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'Oswald', letterSpacing: '0.05em' }}>CAPACITACIÓN · {passed}/{mods.length}</div>
                    <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                        {pending ? 'Aprueba los módulos para habilitar el registro.' : passed === mods.length ? 'Completa. Gracias por prepararte.' : 'Módulos de 3 minutos con examen corto.'}
                    </div>
                </div>
                <ChevronRight size={18} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {open && (
                <div className="flex-col gap-1" style={{ marginTop: '0.6rem' }}>
                    {mods.map(m => (
                        <button key={m.id} onClick={() => startModule(m)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', width: '100%', textAlign: 'left', padding: '0.6rem', borderRadius: 8,
                                background: 'rgba(255,255,255,0.04)', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                            {m.passed_at ? <CheckCircle size={18} color="var(--secondary)" /> : <GraduationCap size={18} color="#64748B" />}
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600 }}>{m.title}{m.required ? '' : ' (opcional)'}</div>
                                {m.summary && <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{m.summary}</div>}
                            </div>
                            <ChevronRight size={16} />
                        </button>
                    ))}

                    {user && LEADERS.includes(user.role) && (
                        <div style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.6rem' }}>
                            {COMMAND.includes(user.role) && (
                                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '0.5rem' }}>
                                    <input type="checkbox" checked={required} onChange={toggleRequired} />
                                    Exigir la capacitación antes de registrar simpatizantes
                                </label>
                            )}
                            {team === null ? (
                                <button className="squishy-btn" onClick={loadTeam} style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.4rem' }}>
                                    <Users size={16} /> Ver avance de mi equipo
                                </button>
                            ) : team.length === 0 ? (
                                <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Aún no hay personas en tu equipo.</div>
                            ) : (
                                <div className="flex-col" style={{ gap: '0.2rem', maxHeight: 260, overflowY: 'auto' }}>
                                    {team.map(t => (
                                        <div key={t.user_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '0.3rem 0.2rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <span>{t.name}</span>
                                            <span style={{ color: t.aprobados >= t.requeridos ? 'var(--secondary)' : '#94A3B8' }}>
                                                {t.aprobados >= t.requeridos ? 'Capacitado' : `${t.aprobados}/${t.requeridos}`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TrainingCenter;
