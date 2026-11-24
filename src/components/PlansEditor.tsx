import { Fragment, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Save, Undo2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * Límites de cada plan (tabla plan_limits). Celda vacía = sin límite.
 * Los cambios aplican de inmediato a todas las campañas de ese plan y quedan en la bitácora.
 */
const PLANS: [string, string][] = [['demo', 'Demo'], ['arranque', 'Arranque'], ['profesional', 'Profesional'], ['a_medida', 'A la medida']];

export const KEY_LABEL: Record<string, string> = {
    simpatizantes: 'Simpatizantes registrados',
    'rol:candidato': 'Cuentas de candidato(a)',
    'rol:coordinador_campana': 'Coordinación general',
    'rol:comunicacion': 'Comunicación',
    'rol:comunicacion_digital': 'Comunicación digital',
    'rol:coordinador_territorial': 'Coordinación territorial',
    'rol:coordinador': 'Coordinadores de zona',
    'rol:coordinador_logistica': 'Logística',
    'rol:lider': 'Líderes',
    brigadistas_por_lider: 'Brigadistas por líder',
    zonas_abiertas: 'Zonas de recorrido abiertas',
    guiones_activos: 'Guiones de campo activos',
    sondeos_activos: 'Sondeos activos',
    eventos_mes: 'Eventos por mes',
    casillas: 'Casillas (día de la elección)',
    ia_diaria: 'Consultas de IA por día',
    mensajeria: 'Mensajería SMS/WhatsApp (1 = sí, 0 = no)',
    exportar: 'Exportar datos (1 = sí, 0 = no)',
};
export const GROUPS: [string, string[]][] = [
    ['Equipo', ['rol:candidato', 'rol:coordinador_campana', 'rol:comunicacion', 'rol:comunicacion_digital', 'rol:coordinador_territorial', 'rol:coordinador', 'rol:coordinador_logistica', 'rol:lider', 'brigadistas_por_lider']],
    ['Operación', ['simpatizantes', 'zonas_abiertas', 'guiones_activos', 'sondeos_activos', 'eventos_mes', 'casillas']],
    ['Servicios', ['ia_diaria', 'mensajeria', 'exportar']],
];

type Cell = number | null;

export const PlansEditor = () => {
    const [orig, setOrig] = useState<Record<string, Cell>>({});
    const [vals, setVals] = useState<Record<string, string>>({});
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    const id = (plan: string, key: string) => `${plan}|${key}`;

    const load = async () => {
        setLoading(true); setMsg('');
        const [{ data }, { data: ts }] = await Promise.all([
            supabase.from('plan_limits').select('plan, key, value'),
            supabase.from('tenants').select('plan, is_sandbox'),
        ]);
        const o: Record<string, Cell> = {};
        (data || []).forEach((r: any) => { o[id(r.plan, r.key)] = r.value; });
        setOrig(o);
        setVals(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null ? '' : String(v)])));
        const c: Record<string, number> = {};
        (ts || []).filter((t: any) => !t.is_sandbox).forEach((t: any) => { c[t.plan || ''] = (c[t.plan || ''] || 0) + 1; });
        setCounts(c);
        setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const extraKeys = useMemo(() => {
        const known = new Set(GROUPS.flatMap(([, ks]) => ks));
        return [...new Set(Object.keys(orig).map(k => k.split('|')[1]))].filter(k => !known.has(k));
    }, [orig]);
    const groups: [string, string[]][] = extraKeys.length ? [...GROUPS, ['Otros', extraKeys]] : GROUPS;

    const changes = useMemo(() => {
        const out: { plan: string; key: string; value: number | null }[] = [];
        const all = new Set([...Object.keys(orig), ...Object.keys(vals)]);
        all.forEach(k => {
            const v = (vals[k] ?? '').trim();
            const nv = v === '' ? null : Number(v);
            const ov = orig[k] ?? null;
            if (nv !== ov && !(nv !== null && Number.isNaN(nv))) { const [plan, key] = k.split('|'); out.push({ plan, key, value: nv }); }
        });
        return out;
    }, [orig, vals]);

    const save = async () => {
        if (!changes.length) return;
        const affected = [...new Set(changes.map(c => c.plan))].map(p => `${PLANS.find(x => x[0] === p)?.[1] || p} (${counts[p] || 0} campañas)`).join(', ');
        if (!confirm(`Se aplicarán ${changes.length} cambio(s) de inmediato a: ${affected}. ¿Continuar?`)) return;
        setSaving(true); setMsg('');
        const ups = changes.filter(c => c.value !== null).map(c => ({ plan: c.plan, key: c.key, value: Math.max(0, Math.round(c.value as number)) }));
        const dels = changes.filter(c => c.value === null);
        const errs: string[] = [];
        if (ups.length) { const { error } = await supabase.from('plan_limits').upsert(ups, { onConflict: 'plan,key' }); if (error) errs.push(error.message); }
        for (const d of dels) { const { error } = await supabase.from('plan_limits').delete().eq('plan', d.plan).eq('key', d.key); if (error) errs.push(error.message); }
        // Si cambia la IA diaria de un plan, se actualiza el tope de las campañas de ese plan
        for (const c of changes.filter(x => x.key === 'ia_diaria')) {
            await supabase.from('tenants').update({ ai_daily_limit: c.value ?? 60 }).eq('plan', c.plan).eq('is_sandbox', false);
        }
        setSaving(false);
        if (errs.length) { setMsg(`❌ ${errs[0]}`); return; }
        setMsg(`✅ ${changes.length} cambio(s) guardado(s)`);
        load();
    };

    return (
        <div className="exec-overview">
            <div className="exec-toolbar">
                {msg && <span style={{ fontSize: '.85rem', marginRight: 'auto' }}>{msg}</span>}
                {changes.length > 0 && <button className="exec-btn ghost" onClick={() => setVals(Object.fromEntries(Object.entries(orig).map(([k, v]) => [k, v === null ? '' : String(v)])))}><Undo2 size={14} /> Descartar</button>}
                <button className="exec-btn ghost" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Actualizar</button>
                <button className="exec-btn primary-sm" onClick={save} disabled={saving || !changes.length}><Save size={14} /> Guardar {changes.length ? `(${changes.length})` : ''}</button>
            </div>
            <section className="exec-panel">
                <div className="exec-table-wrap">
                    <table className="exec-table plans-table">
                        <thead>
                            <tr><th>Límite</th>{PLANS.map(([p, l]) => <th key={p} className="num">{l}<div className="exec-muted" style={{ fontWeight: 400 }}>{counts[p] || 0} campañas</div></th>)}</tr>
                        </thead>
                        <tbody>
                            {groups.map(([g, keys]) => (
                                <Fragment key={g}>
                                    <tr className="plans-group"><td colSpan={PLANS.length + 1}>{g}</td></tr>
                                    {keys.map(k => (
                                        <tr key={k}>
                                            <td>{KEY_LABEL[k] || k}</td>
                                            {PLANS.map(([p]) => {
                                                const cid = id(p, k);
                                                const changed = (vals[cid] ?? '') !== (orig[cid] === undefined || orig[cid] === null ? '' : String(orig[cid]));
                                                return (
                                                    <td key={p} className="num">
                                                        <input type="number" min={0} className={`squishy-input tc-input tc-num${changed ? ' plans-changed' : ''}`} placeholder="∞"
                                                            value={vals[cid] ?? ''} onChange={e => setVals(v => ({ ...v, [cid]: e.target.value }))} />
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="exec-muted" style={{ marginTop: '.8rem' }}>Vacío (∞) = sin límite. Los cambios aplican de inmediato a las campañas de ese plan y quedan registrados en la bitácora.</div>
            </section>
        </div>
    );
};
