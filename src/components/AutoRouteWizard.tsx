import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, Sparkles, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

/**
 * Ruta automática: el operativo NO necesita conocer calles ni límites.
 * Elige la sección (o la busca por el nombre de una colonia) y el sistema arma la ruta:
 * nombre, colonias que la forman, punto de llegada, puertas meta y meta de simpatizantes.
 * Si la quiere trabajar con varias personas, la divide en partes iguales.
 */
export type RouteSection = {
    section_id: string; colonias: string | null; lista_nominal: number | null; viviendas_est: number | null;
    meta_simpatizantes: number | null; center_lat: number | null; center_lng: number | null;
    zonas_abiertas: number; simpatizantes: number;
};

const HOUSEHOLD = 2.6; // personas en lista nominal por vivienda (promedio aproximado)
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('es-MX');

/** Respaldo si la base aún no tiene fn_route_sections: arma la lista con padrón y colonias. */
const fallbackSections = async (q: string, tenantId?: string | null): Promise<RouteSection[]> => {
    const { data: t } = tenantId ? await supabase.from('tenants').select('position, geographic_scope').eq('id', tenantId).maybeSingle() : { data: null } as any;
    const scope = String(t?.geographic_scope || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    let secs: string[] | null = null;
    const isNum = /^\d+$/.test(q);
    if (q && !isNum) {
        const { data: cs } = await supabase.from('colonia_secciones').select('seccion').ilike('colonia', `%${q}%`).gte('porcentaje', 1).limit(200);
        secs = Array.from(new Set((cs || []).map((r: any) => String(r.seccion))));
        if (!secs.length) return [];
    }
    let pq = supabase.from('padron_electoral').select('section_id, municipality, lista_nominal, padron_total, year').order('section_id').limit(isNum ? 5 : 40);
    if (String(t?.position || '').toLowerCase().includes('municipal') && scope) pq = pq.eq('municipality', scope);
    if (isNum) pq = pq.eq('section_id', String(Number(q)));
    if (secs) pq = pq.in('section_id', secs);
    const { data: rows } = await pq;
    const list = Array.from(new Map((rows || []).map((r: any) => [r.section_id, r])).values()) as any[];
    if (!list.length) return [];
    const { data: cols } = await supabase.from('colonia_secciones').select('seccion, colonia, porcentaje')
        .in('seccion', list.map(r => Number(r.section_id))).gte('porcentaje', 5).order('porcentaje', { ascending: false });
    const { data: base } = await supabase.rpc('fn_section_baseline', { p_sections: list.map(r => String(r.section_id)), p_tenant_id: tenantId || null });
    const metaBy = new Map(((base || []) as any[]).map(x => [String(x.section_id), x.meta_simpatizantes as number]));
    return list.map(r => {
        const ln = r.lista_nominal || r.padron_total || 0;
        const c = (cols || []).filter((x: any) => String(x.seccion) === String(r.section_id)).map((x: any) => x.colonia).join(', ');
        return {
            section_id: String(r.section_id), colonias: c || null, lista_nominal: ln, viviendas_est: Math.ceil(ln / HOUSEHOLD),
            meta_simpatizantes: metaBy.get(String(r.section_id)) ?? null, center_lat: null, center_lng: null, zonas_abiertas: 0, simpatizantes: 0,
        };
    });
};

export const AutoRouteWizard = ({ team, onDone, onCancel }: {
    team: { id: string; name: string }[]; onDone: () => void; onCancel: () => void;
}) => {
    const { user } = useAuth();
    const [q, setQ] = useState('');
    const [results, setResults] = useState<RouteSection[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasRpc, setHasRpc] = useState(true);
    const [pick, setPick] = useState<RouteSection | null>(null);
    const [parts, setParts] = useState(1);
    const [due, setDue] = useState(plusDays(7));
    const [assignees, setAssignees] = useState<string[]>(['']);
    const [saving, setSaving] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const search = async (text: string) => {
        setLoading(true);
        const { data, error } = await supabase.rpc('fn_route_sections', { p_search: text || null, p_limit: 40 });
        if (error) {
            setHasRpc(false);
            setResults(await fallbackSections(text.trim(), user?.tenant_id));
        } else {
            setHasRpc(true);
            setResults((data || []) as RouteSection[]);
        }
        setLoading(false);
    };

    useEffect(() => { search(''); /* lista inicial de su territorio */ }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => search(q), 400);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { setAssignees(a => Array.from({ length: parts }, (_, i) => a[i] || '')); }, [parts]);

    const doors = pick ? Math.max(1, pick.viviendas_est || Math.ceil((pick.lista_nominal || 0) / HOUSEHOLD)) : 0;
    const metaSimp = pick?.meta_simpatizantes ?? (pick?.lista_nominal ? Math.ceil(pick.lista_nominal * 0.2) : null);
    const firstCols = (pick?.colonias || '').split(',').map(s => s.trim()).filter(Boolean);

    const create = async () => {
        if (!user || !pick) return;
        setSaving(true);
        const baseName = `Secc. ${pick.section_id}${firstCols[0] ? ` · ${firstCols[0]}` : ''}`;
        const notes = [
            firstCols.length ? `Colonias: ${firstCols.slice(0, 6).join(', ')}${firstCols.length > 6 ? '…' : ''}` : null,
            metaSimp ? `Meta de simpatizantes: ${fmt(Math.ceil(metaSimp / parts))}` : null,
            parts > 1 ? 'Repártanse la sección por manzanas; cada quien marca sus puertas.' : null,
        ].filter(Boolean).join(' · ');
        const rows = Array.from({ length: parts }, (_, i) => ({
            tenant_id: user.tenant_id, created_by: user.id, section_id: pick.section_id,
            name: parts > 1 ? `${baseName} (parte ${i + 1}/${parts})` : baseName,
            target_doors: Math.ceil(doors / parts), assigned_to: assignees[i] || null, due_date: due || null,
            notes: notes || null,
            ...(hasRpc ? {
                center_lat: pick.center_lat, center_lng: pick.center_lng,
                meta_simpatizantes: metaSimp ? Math.ceil(metaSimp / parts) : null, auto: true,
            } : {}),
        }));
        const { error } = await supabase.from('walk_zones').insert(rows);
        setSaving(false);
        if (error) { alert('No se pudo crear la ruta: ' + error.message); return; }
        onDone();
    };

    return (
        <div className="flex-col gap-1" style={{ background: 'rgba(0,0,0,0.25)', padding: '0.8rem', borderRadius: 8 }}>
            <div style={{ fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Sparkles size={16} color="var(--tertiary)" /> RUTA AUTOMÁTICA
            </div>

            {!pick && (
                <>
                    <div style={{ position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                        <input className="squishy-input" style={{ paddingLeft: 32, width: '100%' }} autoFocus
                            placeholder="Número de sección o nombre de colonia" value={q} onChange={e => setQ(e.target.value)} />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                        ¿No conoces la zona? Escribe el nombre de una colonia y te decimos qué sección es.
                    </div>
                    <div className="flex-col gap-1" style={{ maxHeight: 320, overflowY: 'auto' }}>
                        {loading && <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>Buscando…</div>}
                        {!loading && results.length === 0 && <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>Sin resultados en tu territorio.</div>}
                        {results.map(r => (
                            <button key={r.section_id} onClick={() => setPick(r)} className="squishy-btn"
                                style={{ textAlign: 'left', padding: '0.6rem', display: 'block', width: '100%' }}>
                                <div style={{ fontWeight: 700 }}>
                                    Sección {r.section_id}
                                    {r.zonas_abiertas > 0 && <span style={{ fontSize: '0.7rem', color: '#F59E0B', marginLeft: 6 }}>{r.zonas_abiertas} ruta(s) abierta(s)</span>}
                                </div>
                                {r.colonias && <div style={{ fontSize: '0.75rem', color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.colonias}</div>}
                                <div style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>
                                    {fmt(r.lista_nominal)} en lista · ~{fmt(r.viviendas_est)} casas
                                    {r.meta_simpatizantes ? ` · meta ${fmt(r.meta_simpatizantes)} simpatizantes` : ''}
                                    {r.simpatizantes ? ` · ${fmt(r.simpatizantes)} ya registrados` : ''}
                                </div>
                            </button>
                        ))}
                    </div>
                    <button type="button" className="squishy-btn" onClick={onCancel}>Cancelar</button>
                </>
            )}

            {pick && (
                <>
                    <div style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 8, padding: '0.6rem' }}>
                        <div style={{ fontWeight: 700 }}>Sección {pick.section_id}</div>
                        {firstCols.length > 0 && <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{firstCols.slice(0, 6).join(', ')}</div>}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
                            <div>Puertas meta<br /><strong style={{ fontSize: '1.1rem' }}>{fmt(Math.ceil(doors / parts))}</strong>{parts > 1 ? ' c/u' : ''}</div>
                            <div>Meta simpatizantes<br /><strong style={{ fontSize: '1.1rem' }}>{metaSimp ? fmt(Math.ceil(metaSimp / parts)) : '—'}</strong>{parts > 1 && metaSimp ? ' c/u' : ''}</div>
                        </div>
                        {pick.center_lat && pick.center_lng && (
                            <a href={`https://www.google.com/maps/dir/?api=1&destination=${pick.center_lat},${pick.center_lng}`} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--tertiary)' }}>
                                <MapPin size={14} /> Cómo llegar a la sección
                            </a>
                        )}
                    </div>

                    <label style={{ fontSize: '0.78rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={14} /> ¿Entre cuántas personas se trabaja?
                    </label>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                        {[1, 2, 3, 4, 6].map(n => (
                            <button key={n} type="button" className={`squishy-btn ${parts === n ? 'primary' : ''}`} style={{ flex: 1, padding: '0.45rem' }} onClick={() => setParts(n)}>{n}</button>
                        ))}
                    </div>
                    {Array.from({ length: parts }, (_, i) => (
                        <select key={i} className="squishy-input" value={assignees[i] || ''} onChange={e => setAssignees(a => a.map((x, j) => j === i ? e.target.value : x))}>
                            <option value="">{parts > 1 ? `Parte ${i + 1}: sin asignar` : 'Sin asignar (la trabajo yo)'}</option>
                            {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    ))}
                    <label style={{ fontSize: '0.78rem', color: '#94A3B8' }}>Fecha límite</label>
                    <input className="squishy-input" type="date" value={due} onChange={e => setDue(e.target.value)} />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="squishy-btn" style={{ flex: 1 }} onClick={() => setPick(null)}>Otra sección</button>
                        <button type="button" className="squishy-btn primary" style={{ flex: 2 }} disabled={saving} onClick={create}>
                            {saving ? 'Creando…' : parts > 1 ? `Crear ${parts} rutas` : 'Crear ruta'}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default AutoRouteWizard;
