import { useEffect, useState } from 'react';
import { Route, Plus, DoorOpen, CheckCircle, X, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { getPositionOnce } from '../lib/location';

type Zone = { id: string; name: string; section_id: string; notes: string | null; target_doors: number | null; assigned_to: string | null; due_date: string | null; status: string; created_by: string | null };
type Progress = { zone_id: string; puertas: number; registrados: number; no_estaba: number; volver_pendientes: number; no_interesa: number; ultima: string | null };
type Knock = { offline_id: string; tenant_id: string; zone_id: string; user_id: string; outcome: string; note: string | null; latitude: number | null; longitude: number | null; captured_at: string };
type Revisit = { id: string; note: string | null; revisit_on: string | null; captured_at: string; latitude: number | null; longitude: number | null };

const OUTCOMES: { id: string; label: string; color: string }[] = [
    { id: 'no_estaba', label: 'No estaba', color: '#64748B' },
    { id: 'volver', label: 'Volver', color: '#F59E0B' },
    { id: 'no_interesa', label: 'No le interesa', color: '#EF4444' },
    { id: 'no_abrio', label: 'No abrió', color: '#475569' },
];
const QUEUE_KEY = 'tlatoani_knock_queue';
const ACTIVE_KEY = 'tlatoani_active_zone';

const readQueue = (): Knock[] => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } };
const writeQueue = (q: Knock[]) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* sin espacio */ } };

/** Sube las puertas guardadas sin señal. */
export const syncKnocks = async () => {
    const q = readQueue();
    if (!q.length || !navigator.onLine) return 0;
    const { error } = await supabase.from('door_knocks').upsert(q, { onConflict: 'offline_id', ignoreDuplicates: true });
    if (error) { console.warn('No se pudieron subir las puertas:', error.message); return 0; }
    writeQueue([]);
    return q.length;
};

/** Registra una puerta de la zona activa (lo usa también el registro de simpatizantes). */
export const logKnock = async (outcome: string, note?: string) => {
    let zone: { id: string; tenant_id: string; user_id: string } | null = null;
    try { zone = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null'); } catch { zone = null; }
    if (!zone) return false;
    let lat: number | null = null, lng: number | null = null;
    try { const f = await getPositionOnce({ maxAgeMs: 30000, timeoutMs: 8000 }); lat = f.lat; lng = f.lng; } catch { /* sin GPS */ }
    const k: Knock = {
        offline_id: crypto.randomUUID(), tenant_id: zone.tenant_id, zone_id: zone.id, user_id: zone.user_id, outcome,
        note: note?.trim().slice(0, 140) || null, latitude: lat, longitude: lng, captured_at: new Date().toISOString(),
    };
    writeQueue([...readQueue(), k]);
    syncKnocks();
    return true;
};

/**
 * Rutas de visita: el líder asigna zonas (parte de una sección) y el brigadista marca el resultado de cada puerta.
 * Las notas son para ubicar la casa ("casa azul, portón negro"), nunca datos personales.
 */
export const WalkZones = () => {
    const { user } = useAuth();
    const [zones, setZones] = useState<Zone[]>([]);
    const [progress, setProgress] = useState<Record<string, Progress>>({});
    const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ name: '', section: '', target: '', assigned: '', due: '', notes: '' });
    const [active, setActive] = useState<string | null>(() => { try { return JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null')?.id || null; } catch { return null; } });
    const [note, setNote] = useState('');
    const [pending, setPending] = useState(readQueue().length);
    const [revisits, setRevisits] = useState<Revisit[]>([]);
    const [flash, setFlash] = useState('');
    const isLeader = !!user && user.role !== 'brigadista';

    const load = async () => {
        if (!user) return;
        await syncKnocks(); setPending(readQueue().length);
        const [{ data: z }, { data: p }] = await Promise.all([
            supabase.from('walk_zones').select('*').eq('status', 'abierta').order('created_at', { ascending: false }),
            supabase.rpc('fn_zone_progress'),
        ]);
        setZones((z || []) as Zone[]);
        setProgress(Object.fromEntries(((p || []) as Progress[]).map(x => [x.zone_id, x])));
        if (isLeader && team.length === 0) {
            const { data: ids } = await supabase.rpc('get_team_ids', { root_user_id: user.id });
            const list = ((ids || []) as any[]).map(r => r.user_id ?? r.id ?? r).filter((id: string) => id !== user.id);
            if (list.length) {
                const { data: us } = await supabase.from('users').select('id, name').in('id', list).order('name');
                setTeam((us || []) as any);
            }
        }
    };

    const loadRevisits = async (zoneId: string) => {
        const { data } = await supabase.from('door_knocks').select('id, note, revisit_on, captured_at, latitude, longitude')
            .eq('zone_id', zoneId).eq('outcome', 'volver').is('resolved_at', null).order('revisit_on');
        setRevisits((data || []) as Revisit[]);
    };

    useEffect(() => {
        load();
        const onOnline = () => load();
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    useEffect(() => { if (active) loadRevisits(active); }, [active]);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const { error } = await supabase.from('walk_zones').insert({
            tenant_id: user.tenant_id, created_by: user.id, name: form.name.trim(), section_id: form.section.trim(),
            target_doors: form.target ? Number(form.target) : null, assigned_to: form.assigned || null,
            due_date: form.due || null, notes: form.notes.trim() || null,
        });
        if (error) { alert('No se pudo crear: ' + error.message); return; }
        setCreating(false); setForm({ name: '', section: '', target: '', assigned: '', due: '', notes: '' });
        load();
    };

    const startZone = (z: Zone) => {
        if (!user) return;
        if (active === z.id) { localStorage.removeItem(ACTIVE_KEY); setActive(null); return; }
        localStorage.setItem(ACTIVE_KEY, JSON.stringify({ id: z.id, tenant_id: user.tenant_id, user_id: user.id, name: z.name }));
        setActive(z.id);
    };

    const knock = async (outcome: string) => {
        await logKnock(outcome, note);
        setNote(''); setPending(readQueue().length);
        setFlash(OUTCOMES.find(o => o.id === outcome)?.label || 'Guardado');
        setTimeout(() => setFlash(''), 1500);
        setTimeout(load, 800);
    };

    const resolve = async (id: string) => {
        await supabase.from('door_knocks').update({ resolved_at: new Date().toISOString() }).eq('id', id);
        setRevisits(r => r.filter(x => x.id !== id));
        load();
    };

    const closeZone = async (z: Zone) => {
        if (!window.confirm(`¿Cerrar la zona "${z.name}"?`)) return;
        await supabase.from('walk_zones').update({ status: 'cerrada' }).eq('id', z.id);
        load();
    };

    if (!user) return null;
    if (!zones.length && !isLeader) return null;

    return (
        <div className="tactile-card flex-col gap-2" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Route color="var(--tertiary)" /> RUTAS DE VISITA
                </h3>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    {pending > 0 && <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>{pending} sin subir</span>}
                    {isLeader && !creating && (
                        <button className="squishy-btn primary" style={{ padding: '0.35rem 0.6rem', display: 'flex', gap: '0.3rem', alignItems: 'center' }} onClick={() => setCreating(true)}>
                            <Plus size={16} /> Zona
                        </button>
                    )}
                </div>
            </div>

            {creating && (
                <form onSubmit={create} className="flex-col gap-1" style={{ background: 'rgba(0,0,0,0.25)', padding: '0.8rem', borderRadius: 8 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.4rem' }}>
                        <input className="squishy-input" placeholder="Nombre (ej. Manzanas 1 a 4)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                        <input className="squishy-input" placeholder="Sección" inputMode="numeric" value={form.section} onChange={e => setForm({ ...form, section: e.target.value.replace(/\D/g, '') })} required />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                        <input className="squishy-input" type="number" min="1" placeholder="Puertas meta" value={form.target} onChange={e => setForm({ ...form, target: e.target.value })} />
                        <input className="squishy-input" type="date" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })} />
                    </div>
                    <select className="squishy-input" value={form.assigned} onChange={e => setForm({ ...form, assigned: e.target.value })}>
                        <option value="">Sin asignar (la trabajo yo)</option>
                        {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <textarea className="squishy-input" rows={2} placeholder="Límites de la zona: calles entre las que se trabaja" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="squishy-btn" style={{ flex: 1 }} onClick={() => setCreating(false)}>Cancelar</button>
                        <button type="submit" className="squishy-btn primary" style={{ flex: 2 }}>Crear zona</button>
                    </div>
                </form>
            )}

            {zones.length === 0 && !creating && <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>Divide tus secciones en zonas y asígnalas a tu equipo.</div>}

            {zones.map(z => {
                const p = progress[z.id];
                const pct = z.target_doors && p ? Math.min(100, Math.round(p.puertas * 100 / z.target_doors)) : null;
                const mine = z.assigned_to === user.id || (!z.assigned_to && z.created_by === user.id);
                const assignee = team.find(t => t.id === z.assigned_to)?.name;
                return (
                    <div key={z.id} style={{ background: active === z.id ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.04)', border: active === z.id ? '1px solid var(--tertiary)' : '1px solid transparent', borderRadius: 8, padding: '0.7rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <div>
                                <div style={{ fontWeight: 700 }}>{z.name} · Secc. {z.section_id}</div>
                                <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                                    {assignee ? `${assignee} · ` : ''}{z.due_date ? `Para el ${new Date(z.due_date + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : 'Sin fecha'}
                                </div>
                                {z.notes && <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{z.notes}</div>}
                            </div>
                            {isLeader && (z.created_by === user.id || ['candidato', 'coordinador_campana', 'coordinador_territorial'].includes(user.role)) && (
                                <button onClick={() => closeZone(z)} aria-label="Cerrar zona" style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', alignSelf: 'flex-start' }}><X size={18} /></button>
                            )}
                        </div>
                        <div style={{ fontSize: '0.8rem', marginTop: '0.4rem' }}>
                            <strong>{p?.puertas || 0}</strong>{z.target_doors ? `/${z.target_doors}` : ''} puertas · <strong>{p?.registrados || 0}</strong> registros · <strong>{p?.volver_pendientes || 0}</strong> por volver · {p?.no_estaba || 0} sin respuesta
                        </div>
                        {pct !== null && (
                            <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginTop: '0.3rem' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--tertiary)', borderRadius: 3 }} />
                            </div>
                        )}
                        {mine && (
                            <button className={`squishy-btn ${active === z.id ? '' : 'primary'}`} style={{ width: '100%', marginTop: '0.5rem', padding: '0.55rem' }} onClick={() => startZone(z)}>
                                {active === z.id ? 'Terminar recorrido' : 'Trabajar esta zona'}
                            </button>
                        )}

                        {active === z.id && (
                            <div className="flex-col gap-1" style={{ marginTop: '0.6rem' }}>
                                <input className="squishy-input" maxLength={140} placeholder="Referencia de la casa (opcional): casa azul, portón negro" value={note} onChange={e => setNote(e.target.value)} />
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                                    {OUTCOMES.map(o => (
                                        <button key={o.id} className="squishy-btn" onClick={() => knock(o.id)} style={{ padding: '0.7rem', border: `1px solid ${o.color}`, color: o.color, display: 'flex', justifyContent: 'center', gap: '0.3rem', alignItems: 'center' }}>
                                            <DoorOpen size={16} /> {o.label}
                                        </button>
                                    ))}
                                </div>
                                <button className="squishy-btn primary" style={{ padding: '0.7rem' }}
                                    onClick={() => window.dispatchEvent(new CustomEvent('changeTab', { detail: 'profile' }))}>
                                    Quiere registrarse → ir al registro
                                </button>
                                {flash && <div style={{ textAlign: 'center', color: 'var(--secondary)', fontSize: '0.85rem' }}><CheckCircle size={14} /> {flash}</div>}
                                {revisits.length > 0 && (
                                    <div style={{ marginTop: '0.4rem' }}>
                                        <div style={{ fontFamily: 'Oswald', fontSize: '0.85rem', color: '#F59E0B' }}>POR VOLVER</div>
                                        {revisits.map(rv => (
                                            <div key={rv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                                <span>
                                                    {rv.note || 'Sin referencia'}{rv.revisit_on ? ` · ${new Date(rv.revisit_on + 'T12:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : ''}
                                                    {rv.latitude && <> · <a href={`https://maps.google.com/?q=${rv.latitude},${rv.longitude}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tertiary)' }}>mapa</a></>}
                                                </span>
                                                <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem', display: 'flex', gap: '0.2rem', alignItems: 'center' }} onClick={() => resolve(rv.id)}><RotateCcw size={12} /> Ya volví</button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default WalkZones;
