import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PieChart, Plus, CheckCircle, Clock, Map as MapIcon, BarChart3, X, MessageSquareText } from 'lucide-react';
import { loadPolls, type Poll } from '../lib/engagement';

type DraftQ = { text: string; options: string[]; showIfQ: number | null; showIfO: number | null };
type ResultRow = { question_id: string; question_text: string; q_sort: number; option_id: string; option_text: string; o_sort: number; section_id: string | null; total: number; validadas: number };

const emptyQ = (): DraftQ => ({ text: '', options: ['', ''], showIfQ: null, showIfO: null });

/**
 * Guiones de visita y sondeos.
 * - Guion: lo sigue el brigadista al registrar a una persona; sus respuestas quedan ligadas al registro y a la sección.
 * - Sondeo: medición suelta que el equipo levanta en campo.
 * Las preguntas pueden ramificarse: "mostrar solo si en la pregunta N se eligió X".
 */
export const C4IPollManager = () => {
    const { user } = useAuth();
    const [polls, setPolls] = useState<Poll[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [kind, setKind] = useState<'guion' | 'sondeo'>('guion');
    const [title, setTitle] = useState('');
    const [desc, setDesc] = useState('');
    const [intro, setIntro] = useState('');
    const [closing, setClosing] = useState('');
    const [questions, setQuestions] = useState<DraftQ[]>([emptyQ()]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [results, setResults] = useState<{ poll: Poll; rows: ResultRow[] } | null>(null);
    const [section, setSection] = useState('');

    const fetchPolls = async () => {
        if (!user?.tenantScope?.length) return;
        try { setPolls(await loadPolls(user.tenantScope)); } catch (e) { console.error('Error fetching polls:', e); }
        setLoading(false);
    };

    useEffect(() => { fetchPolls(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.tenant_id]);

    const handleViewMap = (poll: Poll) => {
        localStorage.setItem('radar_poll_mode', JSON.stringify({ pollId: poll.id, title: poll.title }));
        window.dispatchEvent(new CustomEvent('changeTab', { detail: 'map' }));
    };

    const setQ = (i: number, patch: Partial<DraftQ>) => setQuestions(qs => qs.map((q, k) => k === i ? { ...q, ...patch } : q));

    const resetForm = () => {
        setIsCreating(false); setTitle(''); setDesc(''); setIntro(''); setClosing(''); setQuestions([emptyQ()]); setKind('guion');
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setSaving(true);
        try {
            // Un solo guion activo por campaña
            if (kind === 'guion') {
                await supabase.from('polls').update({ active: false }).eq('tenant_id', user.tenant_id).eq('kind', 'guion').eq('active', true);
            }
            const { data: poll, error } = await supabase.from('polls').insert({
                tenant_id: user.tenant_id, title, description: desc || null, kind, active: true, created_by: user.id,
                script_intro: kind === 'guion' ? intro || null : null, script_closing: kind === 'guion' ? closing || null : null,
            }).select().single();
            if (error) throw error;

            const qIds: string[] = [];
            const optIds: string[][] = [];
            const valid = questions.filter(q => q.text.trim());
            for (let i = 0; i < valid.length; i++) {
                const q = valid[i];
                const { data: qd, error: qe } = await supabase.from('poll_questions')
                    .insert({ poll_id: poll.id, question_text: q.text.trim(), sort: i }).select().single();
                if (qe) throw qe;
                qIds.push(qd.id);
                const opts = q.options.map(o => o.trim()).filter(Boolean).map((o, k) => ({ question_id: qd.id, option_text: o, sort: k }));
                const { data: od, error: oe } = await supabase.from('poll_options').insert(opts).select('id, sort');
                if (oe) throw oe;
                optIds.push((od || []).sort((a: any, b: any) => a.sort - b.sort).map((o: any) => o.id));
            }
            // Ramificación: se resuelve al final, cuando ya existen las opciones de las preguntas anteriores
            for (let i = 0; i < valid.length; i++) {
                const q = valid[i];
                if (q.showIfQ !== null && q.showIfO !== null && q.showIfQ < i) {
                    const target = optIds[q.showIfQ]?.[q.showIfO];
                    if (target) await supabase.from('poll_questions').update({ show_if_option: target }).eq('id', qIds[i]);
                }
            }
            resetForm();
            fetchPolls();
        } catch (error: any) {
            alert('Error al crear: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (poll: Poll) => {
        if (!poll.active && poll.kind === 'guion' && user) {
            await supabase.from('polls').update({ active: false }).eq('tenant_id', user.tenant_id).eq('kind', 'guion').eq('active', true);
        }
        const { error } = await supabase.from('polls').update({ active: !poll.active }).eq('id', poll.id);
        if (!error) fetchPolls();
    };

    const openResults = async (poll: Poll) => {
        const { data, error } = await supabase.rpc('fn_poll_results', { p_poll: poll.id });
        if (error) { alert('No se pudieron cargar los resultados: ' + error.message); return; }
        setSection('');
        setResults({ poll, rows: (data || []) as ResultRow[] });
    };

    if (loading) return <div style={{ color: 'var(--tertiary)' }}>Cargando...</div>;

    // ---------------------------------------------------------------- Resultados
    if (results) {
        const sections = Array.from(new Set(results.rows.map(r => r.section_id).filter(Boolean) as string[])).sort((a, b) => Number(a) - Number(b));
        const rows = section ? results.rows.filter(r => r.section_id === section) : results.rows;
        return (
            <div className="flex-col gap-3">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontFamily: 'Oswald' }}>{results.poll.title}</h3>
                    <button onClick={() => setResults(null)} aria-label="Cerrar" style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}><X size={22} /></button>
                </div>
                {sections.length > 0 && (
                    <select className="squishy-input" value={section} onChange={e => setSection(e.target.value)}>
                        <option value="">Todas las secciones</option>
                        {sections.map(s => <option key={s} value={s}>Sección {s}</option>)}
                    </select>
                )}
                {results.poll.poll_questions.map(q => {
                    const opts = q.poll_options.map(o => {
                        const rs = rows.filter(r => r.option_id === o.id);
                        return { ...o, total: rs.reduce((a, r) => a + Number(r.total), 0), validadas: rs.reduce((a, r) => a + Number(r.validadas), 0) };
                    });
                    const sum = opts.reduce((a, o) => a + o.total, 0);
                    return (
                        <div key={q.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '0.8rem' }}>
                            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{q.question_text} <span style={{ color: '#94A3B8', fontWeight: 400 }}>· {sum} respuestas</span></div>
                            {opts.map(o => {
                                const pct = sum ? Math.round(o.total * 100 / sum) : 0;
                                return (
                                    <div key={o.id} style={{ marginBottom: '0.4rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', gap: '0.5rem' }}>
                                            <span>{o.option_text}</span><span>{pct}% · {o.total} <span style={{ color: '#94A3B8' }}>({o.validadas} validadas)</span></span>
                                        </div>
                                        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--tertiary)', borderRadius: 3 }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>"Validadas" son respuestas de visitas que la persona confirmó desde su celular: son las más confiables.</div>
            </div>
        );
    }

    // ---------------------------------------------------------------- Lista y creación
    return (
        <div className="flex-col gap-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: 'white', fontFamily: 'Oswald', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <PieChart color="var(--tertiary)" /> GUIONES Y SONDEOS
                </h3>
                {!isCreating && (
                    <button className="primary-btn" onClick={() => setIsCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                        <Plus size={16} /> NUEVO
                    </button>
                )}
            </div>

            {isCreating && (
                <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '1.2rem', borderRadius: '8px', border: '1px solid var(--tertiary)' }}>
                    <form onSubmit={handleCreate} className="flex-col gap-2">
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="button" className={`squishy-btn ${kind === 'guion' ? 'primary' : ''}`} style={{ flex: 1 }} onClick={() => setKind('guion')}>Guion de visita</button>
                            <button type="button" className={`squishy-btn ${kind === 'sondeo' ? 'primary' : ''}`} style={{ flex: 1 }} onClick={() => setKind('sondeo')}>Sondeo</button>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                            {kind === 'guion'
                                ? 'El brigadista lo sigue en cada visita y las respuestas quedan ligadas al registro y a la sección. Solo hay un guion activo a la vez.'
                                : 'Medición suelta que el equipo levanta en campo, sin registrar a la persona.'}
                        </div>
                        <input type="text" required placeholder="Título" value={title} onChange={e => setTitle(e.target.value)} className="squishy-input" />
                        <textarea placeholder="Objetivo (para el equipo)" value={desc} onChange={e => setDesc(e.target.value)} className="squishy-input" rows={2} />
                        {kind === 'guion' && (
                            <>
                                <textarea placeholder={'Lo que dice el brigadista al presentarse. Ej.: "Buenas tardes, soy ___ del equipo de ___. ¿Me regala un minuto?"'} value={intro} onChange={e => setIntro(e.target.value)} className="squishy-input" rows={3} />
                                <textarea placeholder={'Cierre. Ej.: "Gracias. Le dejo este QR para que confirme que platicamos."'} value={closing} onChange={e => setClosing(e.target.value)} className="squishy-input" rows={2} />
                            </>
                        )}

                        <h5 style={{ color: '#94A3B8', margin: '0.5rem 0 0' }}>PREGUNTAS</h5>
                        {questions.map((q, qi) => (
                            <div key={qi} style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '6px', borderLeft: '2px solid rgba(255,255,255,0.2)' }}>
                                <input required type="text" placeholder={`Pregunta ${qi + 1}`} value={q.text} onChange={e => setQ(qi, { text: e.target.value })} className="squishy-input" style={{ marginBottom: '0.5rem' }} />
                                <div className="flex-col" style={{ gap: '0.3rem', paddingLeft: '0.8rem' }}>
                                    {q.options.map((opt, oi) => (
                                        <input key={oi} required type="text" placeholder={`Opción ${oi + 1}`} value={opt}
                                            onChange={e => setQ(qi, { options: q.options.map((o, k) => k === oi ? e.target.value : o) })}
                                            className="squishy-input" style={{ padding: '0.4rem', fontSize: '0.85rem' }} />
                                    ))}
                                    <button type="button" onClick={() => setQ(qi, { options: [...q.options, ''] })} style={{ background: 'none', border: 'none', color: 'var(--tertiary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer' }}>+ Añadir opción</button>
                                </div>
                                {qi > 0 && (
                                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8rem', marginTop: '0.4rem', color: '#94A3B8' }}>
                                        Mostrar solo si en la pregunta
                                        <select className="squishy-input" style={{ width: 'auto', padding: '0.25rem' }} value={q.showIfQ ?? ''}
                                            onChange={e => setQ(qi, { showIfQ: e.target.value === '' ? null : Number(e.target.value), showIfO: null })}>
                                            <option value="">(siempre)</option>
                                            {questions.slice(0, qi).map((_, k) => <option key={k} value={k}>{k + 1}</option>)}
                                        </select>
                                        {q.showIfQ !== null && (
                                            <>se eligió
                                                <select className="squishy-input" style={{ width: 'auto', padding: '0.25rem' }} value={q.showIfO ?? ''}
                                                    onChange={e => setQ(qi, { showIfO: e.target.value === '' ? null : Number(e.target.value) })}>
                                                    <option value="">elige</option>
                                                    {questions[q.showIfQ].options.map((o, k) => o.trim() ? <option key={k} value={k}>{o}</option> : null)}
                                                </select>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        <div style={{ display: 'flex', gap: '0.6rem' }}>
                            <button type="button" onClick={() => setQuestions([...questions, emptyQ()])} className="squishy-btn secondary" style={{ flex: 1, padding: '0.6rem' }}>+ PREGUNTA</button>
                            <button type="submit" disabled={saving} className="primary-btn" style={{ flex: 2, padding: '0.6rem' }}>{saving ? 'GUARDANDO...' : 'PUBLICAR AL EQUIPO'}</button>
                        </div>
                        <button type="button" onClick={resetForm} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.8rem' }}>Cancelar</button>
                    </form>
                </div>
            )}

            {!isCreating && (
                <div className="flex-col" style={{ gap: '0.8rem' }}>
                    {polls.length === 0 ? (
                        <div style={{ color: '#64748B', textAlign: 'center', padding: '1.5rem' }}>Aún no hay guiones ni sondeos. Crea un guion para que cada visita deje información útil.</div>
                    ) : polls.map(poll => (
                        <div key={poll.id} className="tactile-card" style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '0.9rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--tertiary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        {poll.kind === 'guion' ? <><MessageSquareText size={12} /> GUION DE VISITA</> : <><PieChart size={12} /> SONDEO</>}
                                    </div>
                                    <h4 style={{ margin: '0.2rem 0 0', color: 'white' }}>{poll.title}</h4>
                                    {poll.description && <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '0.2rem' }}>{poll.description}</div>}
                                    <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <Clock size={12} /> {poll.created_at ? new Date(poll.created_at).toLocaleDateString('es-MX') : ''} · {poll.poll_questions.length} preguntas
                                    </div>
                                </div>
                                {poll.active
                                    ? <span style={{ alignSelf: 'flex-start', color: '#10B981', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4, border: '1px solid #10B981', padding: '2px 6px', borderRadius: 4 }}><CheckCircle size={12} /> ACTIVO</span>
                                    : <span style={{ alignSelf: 'flex-start', color: '#EF4444', fontSize: '0.7rem', border: '1px solid #EF4444', padding: '2px 6px', borderRadius: 4 }}>CERRADO</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                                <button onClick={() => openResults(poll)} className="squishy-btn primary" style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><BarChart3 size={14} /> RESULTADOS</button>
                                <button onClick={() => handleViewMap(poll)} className="squishy-btn" style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><MapIcon size={14} /> MAPA</button>
                                <button onClick={() => toggle(poll)} className="squishy-btn" style={{ padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}>{poll.active ? 'CERRAR' : 'REABRIR'}</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
