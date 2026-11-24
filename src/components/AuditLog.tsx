import { Fragment, useEffect, useState } from 'react';
import { RefreshCw, Download, Search, Archive } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * Bitácora de cambios importantes (quién, qué, cuándo) y respaldo de la configuración del sistema.
 * Nunca muestra llaves ni contraseñas: el registro las omite desde la base.
 */
const ENTITY_LABEL: Record<string, string> = { 'campaña': 'Campaña', plan: 'Plan', ia: 'IA', usuario: 'Usuario', demo: 'Demo' };
const ACTION_LABEL: Record<string, string> = { alta: 'Alta', cambio: 'Cambio', baja: 'Baja', respaldo: 'Respaldo', entrar_como: 'Entró como', demo: 'Demo' };
const FIELD_LABEL: Record<string, string> = {
    is_active: 'Activa', plan: 'Plan', ai_daily_limit: 'IA por día', ai_user_daily_limit: 'IA por persona', name: 'Nombre', role: 'Perfil',
    value: 'Valor', brand_color: 'Color', brand_slogan: 'Slogan', brand_short_name: 'Nombre corto', brand_photo_url: 'Foto', is_sandbox: 'Demo privada',
    provider: 'Proveedor', llave: 'Llave', tenant_id: 'Campaña', dia_d_active: 'Día D', brand_rights_ok: 'Derechos de imagen', brand_updated_at: 'Identidad actualizada',
};
const fmt = (v: unknown) => v === null || v === undefined ? '—' : typeof v === 'boolean' ? (v ? 'sí' : 'no') : typeof v === 'object' ? JSON.stringify(v) : String(v);

export const AuditLog = () => {
    const [rows, setRows] = useState<any[]>([]);
    const [entity, setEntity] = useState('');
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState<number | null>(null);
    const [msg, setMsg] = useState('');

    const load = async () => {
        setLoading(true);
        let qy = supabase.from('admin_audit_log').select('*').order('at', { ascending: false }).limit(300);
        if (entity) qy = qy.eq('entity', entity);
        const { data, error } = await qy;
        if (error) setMsg(`❌ ${error.message}`);
        setRows(data || []);
        setLoading(false);
    };
    useEffect(() => { load(); }, [entity]);

    const shown = rows.filter(r => !q || `${r.summary} ${r.actor_name}`.toLowerCase().includes(q.toLowerCase()));

    const download = (name: string, content: string, type: string) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], { type }));
        a.download = name; a.click(); URL.revokeObjectURL(a.href);
    };

    const exportCsv = () => {
        const head = ['fecha', 'quien', 'accion', 'tipo', 'que', 'detalle'];
        const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
        const lines = shown.map(r => [new Date(r.at).toLocaleString('es-MX'), r.actor_name, ACTION_LABEL[r.action] || r.action, ENTITY_LABEL[r.entity] || r.entity, r.summary, r.detail ? JSON.stringify(r.detail) : ''].map(esc).join(','));
        download(`bitacora_${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + [head.join(','), ...lines].join('\n'), 'text/csv;charset=utf-8');
    };

    const configBackup = async () => {
        setMsg('');
        const [t, p, a, u] = await Promise.all([
            supabase.from('tenants').select('id, name, slug, plan, is_active, cargo, estado, municipio, geographic_scope, ai_daily_limit, ai_user_daily_limit, brand_short_name, brand_slogan, brand_color, created_at, is_demo, is_sandbox'),
            supabase.from('plan_limits').select('plan, key, value'),
            supabase.from('ai_config').select('provider, is_active, created_at'),
            supabase.from('users').select('id', { count: 'exact', head: true }),
        ]);
        const payload = { generado: new Date().toISOString(), campañas: (t.data || []).filter((x: any) => !x.is_sandbox), planes: p.data || [], proveedores_ia: a.data || [], total_usuarios: u.count || 0,
            nota: 'Respaldo de configuración. No incluye llaves ni datos personales; para datos de una campaña usa su respaldo en Control de campañas.' };
        download(`configuracion_tlatoani_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
        await supabase.from('admin_audit_log').insert({ action: 'respaldo', entity: 'campaña', summary: 'Descargó el respaldo de configuración del sistema' });
        setMsg('✅ Respaldo de configuración descargado');
        load();
    };

    return (
        <div className="exec-overview">
            <div className="exec-toolbar">
                {msg && <span style={{ fontSize: '.85rem', marginRight: 'auto' }}>{msg}</span>}
                <div className="exec-search"><Search size={15} /><input placeholder="Buscar en la bitácora" value={q} onChange={e => setQ(e.target.value)} /></div>
                <select className="squishy-input tc-input" value={entity} onChange={e => setEntity(e.target.value)}>
                    <option value="">Todo</option>
                    {Object.entries(ENTITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className="exec-btn ghost" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /></button>
                <button className="exec-btn" onClick={exportCsv} disabled={!shown.length}><Download size={14} /> Exportar CSV</button>
                <button className="exec-btn" onClick={configBackup}><Archive size={14} /> Respaldo de configuración</button>
            </div>
            <section className="exec-panel">
                <div className="exec-table-wrap">
                    <table className="exec-table">
                        <thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Qué</th></tr></thead>
                        <tbody>
                            {shown.map(r => (
                                <Fragment key={r.id}>
                                    <tr onClick={() => setOpen(open === r.id ? null : r.id)} style={{ cursor: r.detail ? 'pointer' : 'default' }}>
                                        <td className="exec-muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                                        <td>{r.actor_name || '—'}</td>
                                        <td><span className={`exec-chip act-${r.action}`}>{ACTION_LABEL[r.action] || r.action}</span> <span className="exec-muted">{ENTITY_LABEL[r.entity] || r.entity}</span></td>
                                        <td><div className="exec-strong" style={{ fontWeight: 500 }}>{r.summary}</div>
                                            {r.detail && open !== r.id && <div className="exec-muted">{Object.keys(r.detail).map(k => FIELD_LABEL[k] || k).slice(0, 4).join(', ')} · ver detalle</div>}</td>
                                    </tr>
                                    {open === r.id && r.detail && (
                                        <tr className="audit-detail"><td colSpan={4}>
                                            {Object.entries(r.detail).map(([k, v]: [string, any]) => (
                                                <div key={k}><b>{FIELD_LABEL[k] || k}:</b> {v && typeof v === 'object' && 'antes' in v ? <>{fmt(v.antes)} → <b>{fmt(v.despues)}</b></> : fmt(v)}</div>
                                            ))}
                                        </td></tr>
                                    )}
                                </Fragment>
                            ))}
                            {!shown.length && <tr><td colSpan={4} className="exec-empty">{loading ? 'Cargando…' : 'Sin registros todavía. Los cambios desde hoy aparecerán aquí.'}</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
};
