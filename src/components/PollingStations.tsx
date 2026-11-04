import { useEffect, useMemo, useState } from 'react';
import { Vote, Camera, CheckCircle, AlertTriangle, MapPin, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { getPositionOnce, locationErrorText } from '../lib/location';
import { askAI, imageToDataUrl } from '../lib/aiProxy';
import { Sparkles } from 'lucide-react';

type Station = { id: string; section_id: string; tipo: string; address: string | null; lista_nominal: number | null };
type Watcher = { id: string; station_id: string; user_id: string; role: string; checked_in_at: string | null; users?: { name: string } | null };
type Option = { id: string; name: string; sort: number; is_ours: boolean; color: string | null };
type Tally = { id: string; station_id: string; captured_by: string | null; votes: Record<string, number>; nulos: number; no_registrados: number; total: number; photo_path: string | null; status: string; flags: string[]; created_at: string };
type Summary = { option_id: string; name: string; is_ours: boolean; color: string | null; votos: number; casillas_capturadas: number; casillas_totales: number; votos_totales: number; con_alertas: number };

const COMMAND = ['superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial'];
const FLAG: Record<string, string> = {
    suma_no_cuadra: 'La suma no cuadra con el total', excede_lista_nominal: 'Más votos que la lista nominal',
    sin_foto: 'Sin foto del acta', capturas_distintas: 'Otra captura de esta casilla no coincide',
};
const label = (s: Station) => `${s.section_id} ${s.tipo}`;

/** Parsea "1680, 1681-1685" → ['1680','1681',...] */
const parseSections = (txt: string) => {
    const out: string[] = [];
    txt.split(/[,\s]+/).filter(Boolean).forEach(part => {
        const m = part.match(/^(\d+)-(\d+)$/);
        if (m) { const a = Number(m[1]), b = Number(m[2]); for (let i = Math.min(a, b); i <= Math.max(a, b) && out.length < 500; i++) out.push(String(i)); }
        else if (/^\d+$/.test(part)) out.push(part);
    });
    return out;
};

/**
 * Casillas, representantes y actas: cada representante marca su llegada y captura el acta con foto;
 * el mando ve el conteo propio con alertas de consistencia.
 */
export const PollingStations = () => {
    const { user } = useAuth();
    const isCommand = !!user && COMMAND.includes(user.role);
    const [tab, setTab] = useState<'mis' | 'conteo' | 'config'>(isCommand ? 'conteo' : 'mis');
    const [stations, setStations] = useState<Station[]>([]);
    const [watchers, setWatchers] = useState<Watcher[]>([]);
    const [options, setOptions] = useState<Option[]>([]);
    const [tallies, setTallies] = useState<Tally[]>([]);
    const [summary, setSummary] = useState<Summary[]>([]);
    const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
    const [sectionsTxt, setSectionsTxt] = useState('');
    const [newOption, setNewOption] = useState('');
    const [assign, setAssign] = useState({ station: '', user: '', role: 'propietario' });
    const [capture, setCapture] = useState<Station | null>(null);

    const load = async () => {
        if (!user) return;
        const [st, w, o, t] = await Promise.all([
            supabase.from('polling_stations').select('id, section_id, tipo, address, lista_nominal').eq('tenant_id', user.tenant_id).order('section_id').order('tipo'),
            supabase.from('poll_watchers').select('id, station_id, user_id, role, checked_in_at, users(name)').eq('tenant_id', user.tenant_id),
            supabase.from('ballot_options').select('id, name, sort, is_ours, color').eq('tenant_id', user.tenant_id).order('sort'),
            supabase.from('tally_reports').select('id, station_id, captured_by, votes, nulos, no_registrados, total, photo_path, status, flags, created_at').eq('tenant_id', user.tenant_id),
        ]);
        setStations(((st.data || []) as Station[]).sort((a, b) => Number(a.section_id) - Number(b.section_id) || a.tipo.localeCompare(b.tipo)));
        setWatchers((w.data || []) as any);
        setOptions((o.data || []) as Option[]);
        setTallies((t.data || []) as any);
        if (isCommand) {
            const { data } = await supabase.rpc('fn_tally_summary');
            setSummary((data || []) as Summary[]);
            if (!team.length) {
                const { data: us } = await supabase.from('users').select('id, name').eq('tenant_id', user.tenant_id).eq('is_active', true).order('name');
                setTeam((us || []) as any);
            }
        }
    };

    useEffect(() => {
        load();
        if (!user?.tenant_id) return;
        const ch = supabase.channel('tally_reports_rt')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tally_reports', filter: `tenant_id=eq.${user.tenant_id}` }, () => load())
            .subscribe();
        return () => { supabase.removeChannel(ch); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const myStations = useMemo(() => stations.filter(s => watchers.some(w => w.station_id === s.id && w.user_id === user?.id)), [stations, watchers, user?.id]);

    const checkin = async (s: Station) => {
        try {
            const f = await getPositionOnce({ maxAgeMs: 30000 });
            await supabase.rpc('fn_watcher_checkin', { p_station: s.id, p_lat: f.lat, p_lng: f.lng });
            load();
        } catch (e) { alert(locationErrorText(e)); }
    };

    const generate = async () => {
        const list = parseSections(sectionsTxt);
        if (!list.length) return;
        const { data, error } = await supabase.rpc('fn_generate_stations', { p_sections: list });
        if (error) { alert('No se pudieron crear: ' + error.message); return; }
        alert(`Se crearon ${data} casillas (1 básica por sección y contiguas según la lista nominal).`);
        setSectionsTxt(''); load();
    };

    const addOption = async () => {
        if (!user || !newOption.trim()) return;
        await supabase.from('ballot_options').insert({ tenant_id: user.tenant_id, name: newOption.trim(), sort: options.length, is_ours: options.length === 0 });
        setNewOption(''); load();
    };
    const toggleOurs = async (o: Option) => { await supabase.from('ballot_options').update({ is_ours: !o.is_ours }).eq('id', o.id); load(); };
    const removeOption = async (o: Option) => {
        if (!window.confirm(`¿Quitar "${o.name}"? Las actas ya capturadas conservarán su cifra pero dejará de mostrarse.`)) return;
        await supabase.from('ballot_options').delete().eq('id', o.id); load();
    };
    const doAssign = async () => {
        if (!user || !assign.station || !assign.user) return;
        const { error } = await supabase.from('poll_watchers').insert({ tenant_id: user.tenant_id, station_id: assign.station, user_id: assign.user, role: assign.role });
        if (error) alert(error.code === '23505' ? 'Esa persona ya está asignada a esa casilla.' : error.message);
        setAssign({ station: '', user: '', role: 'propietario' }); load();
    };
    const unassign = async (w: Watcher) => { await supabase.from('poll_watchers').delete().eq('id', w.id); load(); };
    const setStatus = async (t: Tally, status: string) => { await supabase.from('tally_reports').update({ status }).eq('id', t.id); load(); };
    const openPhoto = async (path: string) => {
        const { data } = await supabase.storage.from('campaign_docs').createSignedUrl(path, 300);
        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    };

    if (!user) return null;
    const sum = summary[0];
    const totalOurs = summary.filter(s => s.is_ours).reduce((a, s) => a + Number(s.votos), 0);
    const totalVotes = summary.reduce((a, s) => a + Number(s.votos), 0);

    return (
        <div className="tactile-card flex-col gap-2" style={{ marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Vote color="var(--tertiary)" /> CASILLAS Y ACTAS</h3>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button className={`squishy-btn ${tab === 'mis' ? 'primary' : ''}`} style={tabBtn} onClick={() => setTab('mis')}>Mis casillas</button>
                {isCommand && <button className={`squishy-btn ${tab === 'conteo' ? 'primary' : ''}`} style={tabBtn} onClick={() => setTab('conteo')}>Conteo</button>}
                {isCommand && <button className={`squishy-btn ${tab === 'config' ? 'primary' : ''}`} style={tabBtn} onClick={() => setTab('config')}>Preparar</button>}
            </div>

            {/* ---------------- Representante */}
            {tab === 'mis' && (myStations.length === 0
                ? <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>No tienes casillas asignadas. Tu coordinación te asigna desde "Preparar".</div>
                : myStations.map(s => {
                    const w = watchers.find(x => x.station_id === s.id && x.user_id === user.id);
                    const mine = tallies.find(t => t.station_id === s.id && t.captured_by === user.id);
                    return (
                        <div key={s.id} style={card}>
                            <div style={{ fontWeight: 700 }}>Casilla {label(s)} <span style={{ fontWeight: 400, color: '#94A3B8' }}>· {w?.role}</span></div>
                            {s.address && <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>{s.address}</div>}
                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                                <button className="squishy-btn" style={{ flex: 1 }} disabled={!!w?.checked_in_at} onClick={() => checkin(s)}>
                                    <MapPin size={14} /> {w?.checked_in_at ? `Llegaste ${new Date(w.checked_in_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : 'Marcar llegada'}
                                </button>
                                <button className="squishy-btn primary" style={{ flex: 1 }} onClick={() => setCapture(s)}>
                                    <Camera size={14} /> {mine ? 'Corregir acta' : 'Capturar acta'}
                                </button>
                            </div>
                            {mine && (
                                <div style={{ fontSize: '0.8rem', marginTop: '0.4rem', color: mine.flags.length ? '#F59E0B' : 'var(--secondary)' }}>
                                    {mine.flags.length ? mine.flags.map(f => FLAG[f] || f).join(' · ') : 'Acta capturada sin alertas'}
                                </div>
                            )}
                        </div>
                    );
                }))}

            {/* ---------------- Conteo propio */}
            {tab === 'conteo' && isCommand && (
                <div className="flex-col gap-1">
                    {options.length === 0 ? <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>Primero registra las opciones de la boleta en "Preparar".</div> : (
                        <>
                            <div style={{ fontSize: '0.85rem' }}>
                                <strong>{sum?.casillas_capturadas || 0}</strong> de {sum?.casillas_totales || stations.length} casillas con acta
                                {sum && sum.con_alertas > 0 && <span style={{ color: '#F59E0B' }}> · {sum.con_alertas} con alertas</span>}
                                {totalVotes > 0 && <> · nuestra opción: <strong>{Math.round(totalOurs * 100 / totalVotes)}%</strong></>}
                            </div>
                            {summary.map(o => {
                                const pct = totalVotes ? Math.round(Number(o.votos) * 100 / totalVotes) : 0;
                                return (
                                    <div key={o.option_id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: o.is_ours ? 700 : 400 }}>
                                            <span>{o.name}</span><span>{Number(o.votos).toLocaleString('es-MX')} · {pct}%</span>
                                        </div>
                                        <div style={{ height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 4 }}>
                                            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 4, background: o.is_ours ? 'var(--primary)' : (o.color || '#64748B') }} />
                                        </div>
                                    </div>
                                );
                            })}
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Conteo propio a partir de las actas capturadas por el equipo. No sustituye los resultados oficiales.</div>
                        </>
                    )}
                    <div style={{ marginTop: '0.6rem', fontFamily: 'Oswald', fontSize: '0.9rem' }}>ACTAS POR REVISAR</div>
                    {tallies.filter(t => t.status !== 'validada').length === 0 && <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Nada pendiente.</div>}
                    {tallies.filter(t => t.status !== 'validada').sort((a, b) => b.flags.length - a.flags.length).map(t => {
                        const s = stations.find(x => x.id === t.station_id);
                        return (
                            <div key={t.id} style={{ ...card, borderLeft: `3px solid ${t.flags.length ? '#F59E0B' : 'var(--secondary)'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong>Casilla {s ? label(s) : '?'}</strong>
                                    <span style={{ fontSize: '0.8rem' }}>Total {t.total}</span>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>
                                    {options.map(o => `${o.name}: ${t.votes[o.id] ?? 0}`).join(' · ')} · Nulos {t.nulos}
                                </div>
                                {t.flags.length > 0 && <div style={{ fontSize: '0.78rem', color: '#F59E0B' }}><AlertTriangle size={12} /> {t.flags.map(f => FLAG[f] || f).join(' · ')}</div>}
                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                                    {t.photo_path && <button className="squishy-btn" style={mini} onClick={() => openPhoto(t.photo_path!)}>Ver foto</button>}
                                    <button className="squishy-btn primary" style={mini} onClick={() => setStatus(t, 'validada')}><CheckCircle size={12} /> Validar</button>
                                    <button className="squishy-btn" style={mini} onClick={() => setStatus(t, 'con_error')}>Marcar error</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ---------------- Preparación */}
            {tab === 'config' && isCommand && (
                <div className="flex-col gap-2">
                    <div style={card}>
                        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Opciones de la boleta</div>
                        {options.map(o => (
                            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', padding: '0.2rem 0' }}>
                                <span style={{ flex: 1 }}>{o.name}</span>
                                <label style={{ fontSize: '0.75rem', display: 'flex', gap: '0.2rem', alignItems: 'center' }}><input type="checkbox" checked={o.is_ours} onChange={() => toggleOurs(o)} /> nuestra</label>
                                <button onClick={() => removeOption(o)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }} aria-label="Quitar"><Trash2 size={14} /></button>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.3rem' }}>
                            <input className="squishy-input" placeholder="Partido, coalición o candidatura" value={newOption} onChange={e => setNewOption(e.target.value)} />
                            <button className="squishy-btn primary" onClick={addOption}><Plus size={16} /></button>
                        </div>
                    </div>

                    <div style={card}>
                        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Casillas ({stations.length})</div>
                        <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginBottom: '0.3rem' }}>Escribe secciones o rangos (ej. 1680, 1690-1702). Se crea una básica por sección y contiguas según la lista nominal; ajusta con el encarte oficial del INE.</div>
                        <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <input className="squishy-input" placeholder="Secciones" value={sectionsTxt} onChange={e => setSectionsTxt(e.target.value)} />
                            <button className="squishy-btn primary" onClick={generate}>Crear</button>
                        </div>
                    </div>

                    <div style={card}>
                        <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Representantes</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                            <select className="squishy-input" value={assign.station} onChange={e => setAssign({ ...assign, station: e.target.value })}>
                                <option value="">Casilla</option>
                                {stations.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}
                            </select>
                            <select className="squishy-input" value={assign.role} onChange={e => setAssign({ ...assign, role: e.target.value })}>
                                <option value="propietario">Propietario</option><option value="suplente">Suplente</option><option value="general">General</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                            <select className="squishy-input" value={assign.user} onChange={e => setAssign({ ...assign, user: e.target.value })}>
                                <option value="">Persona del equipo</option>
                                {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <button className="squishy-btn primary" onClick={doAssign}>Asignar</button>
                        </div>
                        <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: '0.5rem' }}>
                            {stations.map(s => {
                                const ws = watchers.filter(w => w.station_id === s.id);
                                const hasTally = tallies.some(t => t.station_id === s.id);
                                return (
                                    <div key={s.id} style={{ fontSize: '0.8rem', padding: '0.3rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <strong>{label(s)}</strong>{s.lista_nominal ? ` · LN ~${s.lista_nominal}` : ''}{hasTally ? ' · acta ✓' : ''}
                                        {ws.length === 0 ? <span style={{ color: '#F59E0B' }}> · sin representante</span> : ws.map(w => (
                                            <span key={w.id}> · {w.users?.name} ({w.role}{w.checked_in_at ? ', llegó' : ''})
                                                <button onClick={() => unassign(w)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }} aria-label="Quitar">×</button></span>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {capture && <TallyForm station={capture} options={options} existing={tallies.find(t => t.station_id === capture.id && t.captured_by === user.id)}
                tenantId={user.tenant_id} onClose={() => { setCapture(null); load(); }} />}
        </div>
    );
};

const TallyForm = ({ station, options, existing, tenantId, onClose }: { station: Station; options: Option[]; existing?: Tally; tenantId: string; onClose: () => void }) => {
    const [votes, setVotes] = useState<Record<string, string>>(() => Object.fromEntries(options.map(o => [o.id, existing ? String(existing.votes[o.id] ?? '') : ''])));
    const [nulos, setNulos] = useState(existing ? String(existing.nulos) : '');
    const [noReg, setNoReg] = useState(existing ? String(existing.no_registrados) : '');
    const [total, setTotal] = useState(existing ? String(existing.total) : '');
    const [incidents, setIncidents] = useState('');
    const [photo, setPhoto] = useState<File | null>(null);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<string[] | null>(null);
    const [reading, setReading] = useState(false);
    const [aiNote, setAiNote] = useState('');

    // La IA lee la foto y propone las cifras; el representante las revisa contra el acta antes de enviar
    const readWithAI = async () => {
        if (!photo) return;
        setReading(true); setAiNote('');
        try {
            const image = await imageToDataUrl(photo);
            const res = await askAI<any>('acta', { image, options: options.map(o => o.name) });
            const d = res.data;
            if (!d || d.legible === false) { setAiNote('La IA no pudo leer el acta. Captura las cifras a mano.'); return; }
            const str = (v: unknown) => (typeof v === 'number' && v >= 0 ? String(Math.round(v)) : '');
            const next: Record<string, string> = { ...votes };
            let missing = 0;
            options.forEach(o => { const v = str(d.votos?.[o.name]); if (v === '') missing++; next[o.id] = v || next[o.id]; });
            setVotes(next);
            if (str(d.nulos)) setNulos(str(d.nulos));
            if (str(d.no_registrados)) setNoReg(str(d.no_registrados));
            if (str(d.total)) setTotal(str(d.total));
            setAiNote(`Cifras propuestas por la IA${missing ? ` (${missing} no se leyeron)` : ''}. Revisa cada una contra el acta antes de enviar.${d.notas ? ' ' + d.notas : ''}`);
        } catch (e: any) {
            setAiNote('No se pudo usar la IA: ' + e.message);
        } finally { setReading(false); }
    };
    const n = (v: string) => Math.max(0, parseInt(v || '0', 10) || 0);
    const sum = Object.values(votes).reduce((a, v) => a + n(v), 0) + n(nulos) + n(noReg);

    const submit = async () => {
        setSending(true);
        let path: string | null = existing?.photo_path || null;
        if (photo) {
            const ext = (photo.name.split('.').pop() || 'jpg').toLowerCase();
            const p = `${tenantId}/actas/${station.id}/${crypto.randomUUID()}.${ext}`;
            const { error } = await supabase.storage.from('campaign_docs').upload(p, photo, { contentType: photo.type || 'image/jpeg' });
            if (error) { alert('No se pudo subir la foto: ' + error.message); setSending(false); return; }
            path = p;
        }
        const { data, error } = await supabase.rpc('fn_submit_tally', {
            p_station: station.id, p_votes: Object.fromEntries(options.map(o => [o.id, n(votes[o.id])])),
            p_nulos: n(nulos), p_no_registrados: n(noReg), p_total: total === '' ? sum : n(total), p_photo_path: path, p_incidents: incidents || null,
        });
        setSending(false);
        if (error || (data as any)?.estado !== 'ok') { alert('No se pudo guardar: ' + (error?.message || (data as any)?.estado)); return; }
        setResult(((data as any).alertas || []) as string[]);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 2000, overflowY: 'auto', padding: '1rem' }}>
            <div className="tactile-card flex-col gap-1" style={{ maxWidth: 460, margin: '0 auto' }}>
                <h3 style={{ margin: 0, fontFamily: 'Oswald' }}>Acta · casilla {label(station)}</h3>
                <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Toma una foto legible del acta y copia las cifras tal como aparecen (o deja que la IA las proponga y revísalas).</div>
                <label className="squishy-btn" style={{ textAlign: 'center', cursor: 'pointer', marginTop: '0.3rem' }}>
                    <Camera size={14} /> {photo ? photo.name : existing?.photo_path ? 'Cambiar foto del acta' : 'Foto del acta'}
                    <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => setPhoto(e.target.files?.[0] || null)} />
                </label>
                {photo && (
                    <button type="button" className="squishy-btn" disabled={reading} onClick={readWithAI} style={{ display: 'flex', justifyContent: 'center', gap: '0.3rem', alignItems: 'center' }}>
                        <Sparkles size={14} /> {reading ? 'Leyendo el acta...' : 'Llenar cifras con IA'}
                    </button>
                )}
                {aiNote && <div style={{ fontSize: '0.78rem', color: '#F59E0B' }}>{aiNote}</div>}
                {options.map(o => (
                    <div key={o.id} style={rowS}><span style={{ flex: 1 }}>{o.name}</span>
                        <input className="squishy-input" style={numS} inputMode="numeric" value={votes[o.id]} onChange={e => setVotes({ ...votes, [o.id]: e.target.value.replace(/\D/g, '') })} /></div>
                ))}
                <div style={rowS}><span style={{ flex: 1 }}>Candidaturas no registradas</span><input className="squishy-input" style={numS} inputMode="numeric" value={noReg} onChange={e => setNoReg(e.target.value.replace(/\D/g, ''))} /></div>
                <div style={rowS}><span style={{ flex: 1 }}>Votos nulos</span><input className="squishy-input" style={numS} inputMode="numeric" value={nulos} onChange={e => setNulos(e.target.value.replace(/\D/g, ''))} /></div>
                <div style={rowS}><span style={{ flex: 1, fontWeight: 700 }}>Total del acta</span><input className="squishy-input" style={numS} inputMode="numeric" placeholder={String(sum)} value={total} onChange={e => setTotal(e.target.value.replace(/\D/g, ''))} /></div>
                {total !== '' && n(total) !== sum && <div style={{ fontSize: '0.8rem', color: '#F59E0B' }}>La suma de tus cifras es {sum}; revisa antes de enviar.</div>}
                <textarea className="squishy-input" rows={2} placeholder="Incidentes (opcional)" value={incidents} onChange={e => setIncidents(e.target.value)} />
                {result ? (
                    <>
                        <div style={{ textAlign: 'center', color: result.length ? '#F59E0B' : 'var(--secondary)', fontWeight: 700 }}>
                            {result.length ? result.map(f => FLAG[f] || f).join(' · ') : 'Acta guardada sin alertas'}
                        </div>
                        <button className="squishy-btn primary" onClick={onClose}>Listo</button>
                    </>
                ) : (
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="squishy-btn" style={{ flex: 1 }} onClick={onClose}>Cancelar</button>
                        <button className="squishy-btn primary" style={{ flex: 2 }} disabled={sending} onClick={submit}>{sending ? 'Enviando...' : 'Enviar acta'}</button>
                    </div>
                )}
            </div>
        </div>
    );
};

const tabBtn: React.CSSProperties = { flex: 1, padding: '0.45rem', fontSize: '0.8rem' };
const card: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '0.7rem' };
const mini: React.CSSProperties = { padding: '0.3rem 0.6rem', fontSize: '0.75rem', display: 'flex', gap: '0.2rem', alignItems: 'center' };
const rowS: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem' };
const numS: React.CSSProperties = { width: 90, textAlign: 'right' };

export default PollingStations;
