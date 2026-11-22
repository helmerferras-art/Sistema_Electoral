import { useEffect, useMemo, useState } from 'react';
import { Crown, Gauge, MapPin, Plus, RefreshCw, Shuffle, Trash2, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { DEFAULT_WEIGHTS, loadContest, loadThermometer, marginOfError, type Contest, type Rival, type ThermoResult } from '../lib/internal';

/**
 * Proceso interno (vista de mando): configura el proceso y los rivales internos, y muestra el termómetro
 * con las 8 variables. Igual que en la metodología publicada para las coordinaciones, en cada variable el
 * puntaje completo es para quien tiene el porcentaje más alto, por mínima que sea la diferencia.
 */
const MAX_RIVALS = 5;
const fmtPts = (n: number) => (Math.round(n * 100) / 100).toString();
const daysTo = (d: string | null | undefined) => d ? Math.ceil((new Date(d + 'T12:00').getTime() - Date.now()) / 86400000) : null;

type SampleSec = { section_id: string; colonias: string | null; lista_nominal: number | null };

export const InternalProcess = () => {
    const { user } = useAuth();
    const [contest, setContest] = useState<Contest | null>(null);
    const [rivals, setRivals] = useState<Rival[]>([]);
    const [result, setResult] = useState<ThermoResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState<number | null>(null);
    const [onlySampled, setOnlySampled] = useState(false);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ self_name: '', process_label: 'Coordinación', coalition_label: 'Morena, PT o PVEM', template: 'morena_pt_pvem', survey_date: '' });
    const [newRival, setNewRival] = useState('');
    const [sample, setSample] = useState<SampleSec[]>([]);
    const [open, setOpen] = useState(true);

    const load = async () => {
        if (!user?.tenant_id) return;
        setLoading(true);
        const { contest: c, rivals: r } = await loadContest(user.tenant_id);
        setContest(c); setRivals(r);
        if (c) {
            setForm({ self_name: c.self_name, process_label: c.process_label, coalition_label: c.coalition_label, template: c.template, survey_date: c.survey_date || '' });
            try { setResult(await loadThermometer(days, onlySampled)); } catch (e) { console.warn(e); }
        } else {
            setForm(f => ({ ...f, self_name: user.role === 'candidato' ? user.name || '' : f.self_name }));
            setEditing(true);
            setOpen(false); // Campañas que no están en proceso interno: queda plegado
        }
        setLoading(false);
    };
    useEffect(() => { load(); }, [user?.tenant_id, days, onlySampled]); // eslint-disable-line react-hooks/exhaustive-deps

    const saveContest = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.tenant_id) return;
        const { error } = await supabase.from('internal_contest').upsert({
            tenant_id: user.tenant_id, self_name: form.self_name.trim(), process_label: form.process_label.trim() || 'Coordinación',
            coalition_label: form.coalition_label.trim() || 'el partido', template: form.template,
            weights: contest?.weights || DEFAULT_WEIGHTS, survey_date: form.survey_date || null, active: true, updated_at: new Date().toISOString(),
        });
        if (error) { alert('No se pudo guardar: ' + error.message); return; }
        setEditing(false); load();
    };

    const addRival = async () => {
        if (!user?.tenant_id || newRival.trim().length < 2) return;
        const { error } = await supabase.from('internal_rivals').insert({ tenant_id: user.tenant_id, name: newRival.trim(), sort: rivals.length + 1 });
        if (error) { alert('No se pudo agregar: ' + error.message); return; }
        setNewRival(''); load();
    };
    const removeRival = async (r: Rival) => {
        if (!confirm(`¿Quitar a ${r.name}? Sus respuestas ya levantadas dejarán de contarse.`)) return;
        await supabase.from('internal_rivals').delete().eq('id', r.id);
        load();
    };

    /** Muestra aleatoria: secciones al azar, con más probabilidad las que tienen más lista nominal. */
    const drawSample = async () => {
        const { data } = await supabase.rpc('fn_route_sections', { p_search: null, p_limit: 200 });
        const pool = ((data || []) as SampleSec[]).filter(s => (s.lista_nominal || 0) > 0);
        const picked: SampleSec[] = [];
        const left = [...pool];
        while (picked.length < Math.min(10, pool.length)) {
            const tot = left.reduce((a, s) => a + (s.lista_nominal || 0), 0);
            let x = Math.random() * tot;
            const i = left.findIndex(s => (x -= (s.lista_nominal || 0)) <= 0);
            picked.push(left.splice(i < 0 ? 0 : i, 1)[0]);
        }
        setSample(picked.sort((a, b) => Number(a.section_id) - Number(b.section_id)));
    };

    const persons = useMemo(() => [...(result?.persons || [])].sort((a, b) => b.score - a.score), [result]);
    const me = persons.find(p => p.is_self);
    const leader = persons[0];
    const moe = marginOfError(Number(result?.n || 0));
    const left = daysTo(contest?.survey_date);

    // Variable que más conviene trabajar: la de mayor peso que hoy se pierde
    const focus = useMemo(() => (result?.variables || [])
        .filter(v => v.weight > 0 && !(v.results.find(r => r.is_self)?.points))
        .sort((a, b) => b.weight - a.weight)[0], [result]);

    if (!user) return null;

    return (
        <div className="tactile-card flex-col gap-2" style={{ marginBottom: '1rem' }}>
            <button onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Gauge color="var(--tertiary)" /> PROCESO INTERNO{contest ? ` · ${contest.process_label.toUpperCase()}` : loading ? '' : ' (configurar)'}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>{open ? 'Ocultar' : 'Ver'}</span>
            </button>
            {!open ? null : loading ? <div style={{ color: '#94A3B8' }}>Cargando…</div> : (
                <>
                    {(editing || !contest) ? (
                        <form onSubmit={saveContest} className="flex-col gap-1" style={{ background: 'rgba(0,0,0,0.25)', padding: '0.8rem', borderRadius: 8 }}>
                            <div style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                                Configura el proceso de definición en el que participas. El termómetro mide las mismas variables que la encuesta oficial para que sepas dónde ganas y dónde no.
                            </div>
                            <input className="squishy-input" placeholder="Tu nombre como aparecerá en la encuesta" value={form.self_name} onChange={e => setForm({ ...form, self_name: e.target.value })} required minLength={2} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                <input className="squishy-input" placeholder="Proceso (ej. Coordinación distrital local)" value={form.process_label} onChange={e => setForm({ ...form, process_label: e.target.value })} />
                                <input className="squishy-input" placeholder="Partido o coalición" value={form.coalition_label} onChange={e => setForm({ ...form, coalition_label: e.target.value })} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                <select className="squishy-input" value={form.template} onChange={e => setForm({ ...form, template: e.target.value })}>
                                    <option value="morena_pt_pvem">Metodología de encuesta Morena · PT · PVEM</option>
                                    <option value="generico">Otro partido (mismas variables, pesos editables después)</option>
                                </select>
                                <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Fecha probable de la encuesta
                                    <input className="squishy-input" type="date" value={form.survey_date} onChange={e => setForm({ ...form, survey_date: e.target.value })} style={{ width: '100%' }} />
                                </label>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                {contest && <button type="button" className="squishy-btn" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancelar</button>}
                                <button type="submit" className="squishy-btn primary" style={{ flex: 2 }}>Guardar</button>
                            </div>
                        </form>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.82rem', color: '#cbd5e1' }}>
                            <span>{contest.self_name} · {contest.coalition_label}{left !== null ? ` · ${left > 0 ? `faltan ${left} días para la encuesta` : 'fecha de encuesta cumplida'}` : ''}</span>
                            <button className="squishy-btn" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }} onClick={() => setEditing(true)}>Editar</button>
                        </div>
                    )}

                    {contest && (
                        <>
                            {/* Rivales internos */}
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.6rem' }}>
                                <div style={{ fontFamily: 'Oswald', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}><Users size={14} /> CON QUIÉN COMPITES ({rivals.length}/{MAX_RIVALS})</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.4rem' }}>
                                    {rivals.map(r => (
                                        <span key={r.id} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '0.2rem 0.6rem', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            {r.name}
                                            <button onClick={() => removeRival(r)} aria-label={`Quitar a ${r.name}`} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 0 }}><Trash2 size={12} /></button>
                                        </span>
                                    ))}
                                </div>
                                {rivals.length < MAX_RIVALS && (
                                    <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
                                        <input className="squishy-input" style={{ flex: 1 }} placeholder="Nombre de otro aspirante" value={newRival} onChange={e => setNewRival(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRival(); } }} />
                                        <button className="squishy-btn primary" onClick={addRival} style={{ padding: '0.3rem 0.7rem' }}><Plus size={16} /></button>
                                    </div>
                                )}
                                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '0.3rem' }}>Solo nombres públicos de aspirantes registrados. No se guardan datos personales de nadie.</div>
                            </div>

                            {/* Marcador */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                <div style={{ fontFamily: 'Oswald', fontSize: '1rem' }}>SI LA ENCUESTA FUERA HOY</div>
                                <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <select className="squishy-input" style={{ padding: '0.25rem', fontSize: '0.78rem', width: 'auto' }} value={days ?? ''} onChange={e => setDays(e.target.value ? Number(e.target.value) : null)}>
                                        <option value="">Todo</option><option value="30">30 días</option><option value="14">14 días</option><option value="7">7 días</option>
                                    </select>
                                    <label style={{ fontSize: '0.75rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <input type="checkbox" checked={onlySampled} onChange={e => setOnlySampled(e.target.checked)} /> Solo muestra aleatoria
                                    </label>
                                    <button className="squishy-btn" onClick={load} aria-label="Actualizar" style={{ padding: '0.25rem 0.5rem' }}><RefreshCw size={14} /></button>
                                </div>
                            </div>

                            {!result?.n ? (
                                <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>Aún no hay entrevistas. Tu equipo las levanta desde Campo → "Termómetro".</div>
                            ) : (
                                <>
                                    <div className="flex-col gap-1">
                                        {persons.map(p => (
                                            <div key={p.pid}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                                    <span style={{ fontWeight: p.is_self ? 700 : 400, color: p.is_self ? 'var(--tertiary)' : undefined }}>
                                                        {p.pid === leader?.pid && p.score > 0 && <Crown size={13} color="#F59E0B" style={{ verticalAlign: -2, marginRight: 3 }} />}{p.name}{p.is_self ? ' (tú)' : ''}
                                                    </span>
                                                    <strong>{fmtPts(p.score)} / 10</strong>
                                                </div>
                                                <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4 }}>
                                                    <div style={{ width: `${Math.min(100, p.score * 10)}%`, height: '100%', borderRadius: 4, background: p.is_self ? 'var(--tertiary)' : '#64748B' }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                                        {result.n} entrevistas ({result.n_sampled} de muestra aleatoria){moe ? ` · margen de error aproximado ±${moe} puntos porcentuales` : ''}.
                                        {Number(result.n) < 100 && ' Con menos de 100 entrevistas el resultado todavía es poco confiable.'}
                                    </div>
                                    {me && leader && (
                                        <div style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 8, padding: '0.6rem', fontSize: '0.85rem' }}>
                                            {leader.pid === me.pid
                                                ? <>Vas arriba por <strong>{fmtPts(me.score - (persons[1]?.score || 0))}</strong> puntos.</>
                                                : <>Vas abajo por <strong>{fmtPts(leader.score - me.score)}</strong> puntos frente a {leader.name}.</>}
                                            {focus && <> La variable que más te conviene trabajar es <strong>{focus.label.toLowerCase()}</strong> (vale {fmtPts(focus.weight)} puntos).</>}
                                        </div>
                                    )}

                                    {/* Variables */}
                                    <div className="flex-col gap-1">
                                        {(result.variables || []).map(v => {
                                            const max = Math.max(...v.results.map(r => r.pct), 1);
                                            return (
                                                <div key={v.key} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '0.5rem 0.6rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                                                        <strong>{v.label}</strong>
                                                        <span style={{ color: '#94A3B8' }}>{v.weight > 0 ? `vale ${fmtPts(v.weight)} pts` : 'filtro (no suma puntos)'}</span>
                                                    </div>
                                                    {v.results.map(r => (
                                                        <div key={r.pid} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, 38%) 1fr 48px', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.is_self ? 'var(--tertiary)' : '#cbd5e1' }}>{r.name}</span>
                                                            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                                                                <div style={{ width: `${(r.pct / max) * 100}%`, height: '100%', borderRadius: 3, background: r.points > 0 ? '#10B981' : r.is_self ? 'var(--tertiary)' : '#475569' }} />
                                                            </div>
                                                            <span style={{ textAlign: 'right' }}>{r.pct}%{r.points > 0 ? ' ★' : ''}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Reconocimiento por sección */}
                                    {(result.sections || []).some(s => s.n >= 3) && (
                                        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.6rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ fontFamily: 'Oswald', fontSize: '0.85rem' }}>DONDE MENOS TE CONOCEN</div>
                                                <button className="squishy-btn" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}
                                                    onClick={() => { try { localStorage.setItem('tl_map_mode', 'reconocimiento'); } catch { /* */ } window.dispatchEvent(new CustomEvent('changeTab', { detail: 'map' })); }}>
                                                    <MapPin size={12} /> Ver en el mapa
                                                </button>
                                            </div>
                                            {(result.sections || []).filter(s => s.n >= 3).slice(0, 8).map(s => (
                                                <div key={s.section_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <span>Sección {s.section_id} <span style={{ color: '#64748B' }}>({s.n} entrevistas)</span></span>
                                                    <span><strong style={{ color: s.conoce_self < (s.conoce_rival || 0) ? '#EF4444' : '#10B981' }}>{s.conoce_self}%</strong>
                                                        <span style={{ color: '#64748B' }}> vs {s.conoce_rival ?? 0}% del rival más conocido</span></span>
                                                </div>
                                            ))}
                                            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: 4 }}>Solo secciones con 3 entrevistas o más. Crea rutas automáticas en ellas desde Campo → Rutas de visita.</div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Muestra aleatoria */}
                            <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.6rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontFamily: 'Oswald', fontSize: '0.85rem' }}>MUESTRA DE ESTA SEMANA</div>
                                    <button className="squishy-btn" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }} onClick={drawSample}>
                                        <Shuffle size={12} /> {sample.length ? 'Sortear otra' : 'Sortear secciones'}
                                    </button>
                                </div>
                                {sample.length > 0 ? (
                                    <>
                                        <div style={{ fontSize: '0.78rem', color: '#cbd5e1', margin: '0.3rem 0' }}>
                                            Levanten 10 entrevistas en cada sección, en viviendas al azar (una de cada 5 casas), con un equipo distinto al de promoción y marcando "parte de la muestra".
                                        </div>
                                        {sample.map(s => (
                                            <div key={s.section_id} style={{ fontSize: '0.78rem', padding: '0.2rem 0' }}>
                                                <strong>Sección {s.section_id}</strong>{s.colonias ? <span style={{ color: '#94A3B8' }}> · {s.colonias.split(',').slice(0, 3).join(',')}</span> : null}
                                            </div>
                                        ))}
                                    </>
                                ) : (
                                    <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 4 }}>
                                        Si tus brigadistas entrevistan solo a conocidos, el resultado sale inflado. El sorteo elige secciones al azar según el tamaño de su lista nominal.
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default InternalProcess;
