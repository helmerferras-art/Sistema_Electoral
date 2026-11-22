import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Download, LogIn, Save, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { USER_COLUMNS } from '../lib/userColumns';

/**
 * Control de cada campaña: plan, estado (activa/suspendida), topes de IA, respaldo y entrar como su administrador.
 * Cada cambio queda en la bitácora (los de la tabla tenants por disparador; respaldos y accesos se registran aquí).
 */
export const PLAN_OPTIONS: [string, string][] = [['arranque', 'Arranque (gratis)'], ['profesional', 'Profesional'], ['a_medida', 'A la medida']];
const ADMIN_ROLES = ['candidato', 'coordinador_campana'];

type T = {
    id: string; name: string; plan: string | null; is_active: boolean | null; ai_daily_limit: number | null; ai_user_daily_limit: number | null;
    cargo?: string | null; municipio?: string | null; geographic_scope?: string | null; brand_photo_url?: string | null; brand_short_name?: string | null;
    created_at: string; is_demo?: boolean; is_sandbox?: boolean;
};

export const logAdmin = (action: string, entity: string, summary: string, tenant_id?: string, detail?: unknown) =>
    supabase.from('admin_audit_log').insert({ action, entity, summary, tenant_id: tenant_id || null, detail: detail ?? null });

export const TenantControl = () => {
    const { user, impersonateUser } = useAuth();
    const [rows, setRows] = useState<T[]>([]);
    const [edits, setEdits] = useState<Record<string, Partial<T>>>({});
    const [stats, setStats] = useState<Record<string, { users: number; supporters: number; admin?: any }>>({});
    const [q, setQ] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState('');

    const load = async () => {
        setLoading(true);
        const { data } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
        const list = ((data || []) as T[]).filter(t => !t.is_sandbox);
        setRows(list); setEdits({});
        const ids = list.map(t => t.id);
        const { data: us } = ids.length ? await supabase.from('users').select('id, tenant_id, name, phone, role, is_active, xp, rank_name, assigned_territory').in('tenant_id', ids) : { data: [] as any[] };
        const sup = await Promise.all(list.map(t => supabase.from('supporters').select('id', { count: 'exact', head: true }).eq('tenant_id', t.id).then(r => r.count || 0)));
        const st: typeof stats = {};
        list.forEach((t, i) => {
            const mine = (us || []).filter((u: any) => u.tenant_id === t.id && u.role !== 'superadmin');
            const admin = (us || []).find((u: any) => u.tenant_id === t.id && u.role === 'candidato') || (us || []).find((u: any) => u.tenant_id === t.id && ADMIN_ROLES.includes(u.role));
            st[t.id] = { users: mine.length, supporters: sup[i], admin };
        });
        setStats(st);
        setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const shown = useMemo(() => rows.filter(t => !q || `${t.name} ${t.municipio || ''} ${t.brand_short_name || ''}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);
    const val = <K extends keyof T>(t: T, k: K): T[K] => (edits[t.id]?.[k] !== undefined ? edits[t.id]![k] as T[K] : t[k]);
    const set = (id: string, patch: Partial<T>) => setEdits(e => ({ ...e, [id]: { ...e[id], ...patch } }));
    const dirty = (id: string) => !!edits[id] && Object.keys(edits[id]!).length > 0;

    const save = async (t: T) => {
        const patch = edits[t.id]; if (!patch) return;
        if (patch.is_active === false && t.is_active !== false && !confirm(`¿Suspender "${t.name}"? Su equipo verá un aviso y no podrá trabajar hasta que la reactives.`)) return;
        setBusy(t.id); setMsg('');
        const { data, error } = await supabase.from('tenants').update(patch).eq('id', t.id).select('id');
        setBusy('');
        if (error || !data?.length) { setMsg(`❌ ${error?.message || 'No se guardó (permisos)'}`); return; }
        setMsg(`✅ "${t.name}" actualizada`);
        load();
    };

    const backup = async (t: T) => {
        setBusy(t.id + ':b'); setMsg('');
        try {
            const [{ data: users }, { data: supporters }, { data: assignments }] = await Promise.all([
                supabase.from('users').select(USER_COLUMNS).eq('tenant_id', t.id),
                supabase.rpc('fn_supporters_export', { p_tenant_id: t.id }),
                supabase.from('resource_assignments').select('*').eq('tenant_id', t.id),
            ]);
            const blob = new Blob([JSON.stringify({ generado: new Date().toISOString(), campaña: t.name, campaña_id: t.id, usuarios: users || [], simpatizantes: supporters || [], asignaciones: assignments || [] }, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `respaldo_${t.name.replace(/[^\wáéíóúñ]+/gi, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
            a.click(); URL.revokeObjectURL(a.href);
            await logAdmin('respaldo', 'campaña', `Descargó el respaldo de ${t.name}`, t.id, { usuarios: users?.length || 0, simpatizantes: (supporters as any[])?.length || 0 });
            setMsg(`✅ Respaldo de "${t.name}" descargado`);
        } catch (e: any) { setMsg(`❌ ${e.message}`); }
        setBusy('');
    };

    const enterAs = async (t: T) => {
        const admin = stats[t.id]?.admin;
        if (!admin) { setMsg('Esta campaña no tiene candidato ni coordinación general.'); return; }
        if (!confirm(`Vas a ver la app como ${admin.name} (${t.name}). Todo lo que hagas quedará a su nombre. ¿Continuar?`)) return;
        await logAdmin('entrar_como', 'campaña', `Entró como ${admin.name} en ${t.name}`, t.id);
        await impersonateUser(admin);
        window.location.href = '/';
    };

    return (
        <div className="exec-overview">
            <div className="exec-toolbar">
                {msg && <span style={{ fontSize: '.85rem', marginRight: 'auto' }}>{msg}</span>}
                <div className="exec-search"><Search size={15} /><input placeholder="Buscar campaña" value={q} onChange={e => setQ(e.target.value)} /></div>
                <button className="exec-btn ghost" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Actualizar</button>
            </div>
            <section className="exec-panel">
                <div className="exec-table-wrap">
                    <table className="exec-table tc-table">
                        <thead><tr>
                            <th>Campaña</th><th>Estado</th><th>Plan</th><th className="num">IA / día</th><th className="num">IA por persona</th>
                            <th className="num">Equipo</th><th className="num">Simpatizantes</th><th></th>
                        </tr></thead>
                        <tbody>
                            {shown.map(t => {
                                const s = stats[t.id];
                                const active = val(t, 'is_active') !== false;
                                const own = t.id === user?.tenant_id;
                                return (
                                    <tr key={t.id} className={active ? '' : 'tc-off'}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                                                {t.brand_photo_url ? <img src={t.brand_photo_url} alt="" className="tc-avatar" /> : <div className="tc-avatar tc-avatar-empty">{t.name.charAt(0)}</div>}
                                                <div style={{ minWidth: 0 }}>
                                                    <div className="exec-strong">{t.name}{own && <span className="exec-chip" style={{ marginLeft: 6 }}>Tu cuenta</span>}{t.is_demo && <span className="exec-chip" style={{ marginLeft: 6 }}>Demo</span>}</div>
                                                    <div className="exec-muted cap">{[t.cargo, t.municipio || t.geographic_scope].filter(Boolean).join(' · ').replace(/_/g, ' ') || '—'}{s?.admin ? ` · ${s.admin.name}` : ''}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <label className="tc-switch" title={active ? 'Activa' : 'Suspendida'}>
                                                <input type="checkbox" checked={active} disabled={own} onChange={e => set(t.id, { is_active: e.target.checked })} />
                                                <span /> <em>{active ? 'Activa' : 'Suspendida'}</em>
                                            </label>
                                        </td>
                                        <td>
                                            <select className="squishy-input tc-input" value={val(t, 'plan') || ''} onChange={e => set(t.id, { plan: e.target.value })}>
                                                {!PLAN_OPTIONS.some(([v]) => v === val(t, 'plan')) && <option value={val(t, 'plan') || ''}>{val(t, 'plan') || '—'}</option>}
                                                {PLAN_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                            </select>
                                        </td>
                                        <td className="num"><input type="number" min={0} max={5000} className="squishy-input tc-input tc-num" value={val(t, 'ai_daily_limit') ?? ''} onChange={e => set(t.id, { ai_daily_limit: e.target.value === '' ? 0 : Number(e.target.value) })} /></td>
                                        <td className="num"><input type="number" min={0} max={500} className="squishy-input tc-input tc-num" value={val(t, 'ai_user_daily_limit') ?? ''} onChange={e => set(t.id, { ai_user_daily_limit: e.target.value === '' ? 0 : Number(e.target.value) })} /></td>
                                        <td className="num">{s ? s.users : '…'}</td>
                                        <td className="num">{s ? s.supporters.toLocaleString('es-MX') : '…'}</td>
                                        <td className="num" style={{ whiteSpace: 'nowrap' }}>
                                            {dirty(t.id) && <button className="exec-btn primary-sm" disabled={busy === t.id} onClick={() => save(t)}><Save size={13} /> Guardar</button>}
                                            <button className="exec-btn ghost" title="Descargar respaldo" disabled={busy === t.id + ':b'} onClick={() => backup(t)}><Download size={14} /></button>
                                            {!own && <button className="exec-btn ghost" title="Entrar como su administrador" onClick={() => enterAs(t)}><LogIn size={14} /></button>}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!shown.length && <tr><td colSpan={8} className="exec-empty">{loading ? 'Cargando…' : 'Sin campañas.'}</td></tr>}
                        </tbody>
                    </table>
                </div>
                <div className="exec-muted" style={{ marginTop: '.8rem' }}>
                    Suspender bloquea la app para todo el equipo de esa campaña (verán un aviso). Los topes de IA cuentan consultas exitosas por día.
                    Para cambiar los límites de un plan completo, usa <b>Planes y límites</b>.
                </div>
            </section>
        </div>
    );
};
