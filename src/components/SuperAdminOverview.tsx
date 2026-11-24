import { useEffect, useState } from 'react';
import { Building2, Users, UserCheck, Footprints, Sparkles, MessageSquare, Briefcase, Bell, RefreshCw, ArrowRight, CircleCheck, CircleAlert } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

/**
 * Resumen ejecutivo del administrador del sistema: cómo va la plataforma completa de un vistazo.
 * Solo cuenta campañas reales (excluye demo y pruebas privadas).
 */
type Kpi = { label: string; value: number | string; sub?: string; icon: any; tone?: 'ok' | 'warn' | 'bad' | 'neutral' };
type Row = { id: string; name: string; plan: string; scope: string; users: number; supporters: number; active7: number; created: string };

const nf = new Intl.NumberFormat('es-MX');
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
const todayMx = () => { const s = new Date(); s.setUTCHours(6, 0, 0, 0); if (s > new Date()) s.setUTCDate(s.getUTCDate() - 1); return s.toISOString(); };
const PLAN_LABEL: Record<string, string> = { arranque: 'Arranque', profesional: 'Profesional', a_medida: 'A la medida', demo: 'Demo' };

export const SuperAdminOverview = ({ onGo }: { onGo: (tab: string) => void }) => {
    const { user } = useAuth();
    const [kpis, setKpis] = useState<Kpi[]>([]);
    const [rows, setRows] = useState<Row[]>([]);
    const [leads, setLeads] = useState<any[]>([]);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [health, setHealth] = useState<{ label: string; ok: boolean; detail: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [updated, setUpdated] = useState<Date | null>(null);

    const load = async () => {
        setLoading(true);
        const head = { count: 'exact' as const, head: true };
        const { data: tenants } = await supabase.from('tenants').select('id, name, plan, cargo, municipio, geographic_scope, created_at, is_active, is_demo, is_sandbox').order('created_at', { ascending: false });
        // Solo campañas de clientes: sin demos ni la cuenta del propio administrador
        const real = (tenants || []).filter((t: any) => !t.is_demo && !t.is_sandbox && t.id !== user?.tenant_id);
        const realIds = real.map((t: any) => t.id);

        const [usersQ, supTot, sup7, act7, aiOk, aiErr, smsOk, smsPend, smsFail, leads30, alertsQ, aiCfg, lastSms, leadsQ, alertList] = await Promise.all([
            realIds.length ? supabase.from('users').select('tenant_id, role, last_action_date, last_location_at').in('tenant_id', realIds) : Promise.resolve({ data: [] as any[] }),
            realIds.length ? supabase.from('supporters').select('id', head).in('tenant_id', realIds) : Promise.resolve({ count: 0 }),
            realIds.length ? supabase.from('supporters').select('id', head).in('tenant_id', realIds).gte('created_at', daysAgo(7)) : Promise.resolve({ count: 0 }),
            realIds.length ? supabase.from('field_activities').select('id', head).in('tenant_id', realIds).gte('created_at', daysAgo(7)) : Promise.resolve({ count: 0 }),
            supabase.from('ai_usage_log').select('id', head).eq('ok', true).gte('created_at', todayMx()),
            supabase.from('ai_usage_log').select('id', head).eq('ok', false).gte('created_at', todayMx()),
            supabase.from('gateway_commands').select('id', head).eq('status', 'completed').gte('created_at', todayMx()),
            supabase.from('gateway_commands').select('id', head).in('status', ['pending', 'processing']),
            supabase.from('gateway_commands').select('id', head).in('status', ['failed', 'error']).gte('created_at', daysAgo(1)),
            supabase.from('sales_leads').select('id', head).gte('created_at', daysAgo(30)),
            supabase.from('system_alerts').select('id', head).eq('is_read', false),
            supabase.from('ai_config').select('id', head).eq('is_active', true).neq('api_key', ''),
            supabase.from('gateway_commands').select('processed_at, created_at').eq('status', 'completed').order('created_at', { ascending: false }).limit(1),
            supabase.from('sales_leads').select('id, name, election_type, territory, status, created_at').order('created_at', { ascending: false }).limit(5),
            supabase.from('system_alerts').select('id, created_at, source, message, is_read').order('created_at', { ascending: false }).limit(5),
        ]);

        const users = ((usersQ as any).data || []).filter((u: any) => u.role !== 'superadmin');
        const since7 = Date.now() - 7 * 86400_000;
        const isActive = (u: any) => [u.last_action_date, u.last_location_at].some(d => d && new Date(d).getTime() >= since7);
        const active7 = users.filter(isActive).length;
        const new30 = real.filter((t: any) => new Date(t.created_at).getTime() >= Date.now() - 30 * 86400_000).length;
        const c = (q: any) => q?.count || 0;

        setKpis([
            { label: 'Campañas activas', value: real.filter((t: any) => t.is_active !== false).length, sub: `${new30} nuevas en 30 días`, icon: Building2 },
            { label: 'Personas en equipos', value: users.length, sub: `${nf.format(active7)} activas esta semana`, icon: Users },
            { label: 'Simpatizantes registrados', value: c(supTot), sub: `+${nf.format(c(sup7))} en 7 días`, icon: UserCheck },
            { label: 'Actividades de campo', value: c(act7), sub: 'últimos 7 días', icon: Footprints },
            { label: 'Consultas de IA hoy', value: c(aiOk), sub: c(aiErr) ? `${c(aiErr)} con error` : 'sin errores', icon: Sparkles, tone: c(aiErr) ? 'warn' : 'neutral' },
            { label: 'SMS enviados hoy', value: c(smsOk), sub: `${c(smsPend)} en cola · ${c(smsFail)} fallidos (24 h)`, icon: MessageSquare, tone: c(smsFail) ? 'warn' : 'neutral' },
            { label: 'Prospectos de venta', value: c(leads30), sub: 'últimos 30 días', icon: Briefcase },
            { label: 'Alertas sin leer', value: c(alertsQ), sub: c(alertsQ) ? 'requieren revisión' : 'todo en orden', icon: Bell, tone: c(alertsQ) ? 'bad' : 'ok' },
        ]);

        const last = ((lastSms as any).data?.[0]?.processed_at || (lastSms as any).data?.[0]?.created_at) as string | undefined;
        const minsAgo = last ? Math.round((Date.now() - new Date(last).getTime()) / 60000) : null;
        const { data: lic } = await supabase.from('tenants').select('license_end, is_active, is_demo, is_sandbox').not('license_end', 'is', null);
        const todayIso = new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
        const in15 = new Date(Date.now() + 15 * 86400_000).toISOString().slice(0, 10);
        const realLic = (lic || []).filter((t: any) => !t.is_demo && !t.is_sandbox);
        const expiring = realLic.filter((t: any) => t.license_end >= todayIso && t.license_end <= in15).length;
        const expired = realLic.filter((t: any) => t.license_end < todayIso).length;
        setHealth([
            { label: 'Licencias', ok: expired === 0 && expiring === 0, detail: expired || expiring ? `${expiring} vencen en 15 días · ${expired} vencidas` : 'Todas vigentes' },
            { label: 'Inteligencia artificial', ok: c(aiCfg) > 0, detail: c(aiCfg) ? `${c(aiCfg)} proveedor(es) con llave activa` : 'Sin llave configurada' },
            { label: 'Puente de SMS', ok: c(smsPend) < 20, detail: minsAgo === null ? 'Sin envíos registrados' : `Último envío hace ${minsAgo < 60 ? `${minsAgo} min` : `${Math.round(minsAgo / 60)} h`} · ${c(smsPend)} en cola` },
            { label: 'Alertas del sistema', ok: c(alertsQ) === 0, detail: c(alertsQ) ? `${c(alertsQ)} sin leer` : 'Sin pendientes' },
        ]);

        // Tabla de campañas
        const byT: Record<string, { users: number; active: number }> = {};
        users.forEach((u: any) => { const b = (byT[u.tenant_id] ||= { users: 0, active: 0 }); b.users++; if (isActive(u)) b.active++; });
        const supCounts = await Promise.all(real.slice(0, 40).map((t: any) =>
            supabase.from('supporters').select('id', head).eq('tenant_id', t.id).then(r => r.count || 0)));
        setRows(real.slice(0, 40).map((t: any, i: number) => ({
            id: t.id, name: t.name, plan: PLAN_LABEL[t.plan] || t.plan || '—',
            scope: [t.cargo, t.municipio || t.geographic_scope].filter(Boolean).join(' · ').replace(/_/g, ' ') || '—',
            users: byT[t.id]?.users || 0, active7: byT[t.id]?.active || 0, supporters: supCounts[i], created: t.created_at,
        })));
        setLeads((leadsQ as any).data || []);
        setAlerts((alertList as any).data || []);
        setUpdated(new Date());
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    return (
        <div className="exec-overview">
            <div className="exec-toolbar">
                <span className="exec-muted">{updated ? `Actualizado ${updated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}` : 'Cargando…'}</span>
                <button className="exec-btn ghost" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Actualizar</button>
            </div>

            <div className="exec-kpis">
                {(kpis.length ? kpis : Array.from({ length: 8 }, () => null)).map((k, i) => k ? (
                    <div key={k.label} className={`exec-kpi tone-${k.tone || 'neutral'}`}>
                        <div className="exec-kpi-top"><span>{k.label}</span><k.icon size={17} /></div>
                        <div className="exec-kpi-value">{typeof k.value === 'number' ? nf.format(k.value) : k.value}</div>
                        {k.sub && <div className="exec-kpi-sub">{k.sub}</div>}
                    </div>
                ) : <div key={i} className="exec-kpi skeleton" />)}
            </div>

            <div className="exec-grid">
                <section className="exec-panel span-2">
                    <header><h3>Campañas</h3><button className="exec-btn ghost" onClick={() => onGo('gestion')}>Nueva campaña <ArrowRight size={14} /></button></header>
                    <div className="exec-table-wrap">
                        <table className="exec-table">
                            <thead><tr><th>Campaña</th><th>Plan</th><th className="num">Equipo</th><th className="num">Activos 7 d</th><th className="num">Simpatizantes</th><th>Alta</th></tr></thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.id}>
                                        <td><div className="exec-strong">{r.name}</div><div className="exec-muted cap">{r.scope}</div></td>
                                        <td><span className="exec-chip">{r.plan}</span></td>
                                        <td className="num">{nf.format(r.users)}</td>
                                        <td className="num">{nf.format(r.active7)}</td>
                                        <td className="num">{nf.format(r.supporters)}</td>
                                        <td className="exec-muted">{new Date(r.created).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                    </tr>
                                ))}
                                {!rows.length && !loading && <tr><td colSpan={6} className="exec-empty">Aún no hay campañas de clientes.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="exec-panel">
                    <header><h3>Estado de la plataforma</h3></header>
                    <ul className="exec-health">
                        {health.map(h => (
                            <li key={h.label}>
                                {h.ok ? <CircleCheck size={18} className="ok" /> : <CircleAlert size={18} className="warn" />}
                                <div><div className="exec-strong">{h.label}</div><div className="exec-muted">{h.detail}</div></div>
                            </li>
                        ))}
                    </ul>
                    <div className="exec-quick">
                        <button className="exec-btn" onClick={() => onGo('inteligencia')}>Configurar IA</button>
                        <button className="exec-btn" onClick={() => onGo('comunicaciones')}>Mensajería</button>
                        <button className="exec-btn" onClick={() => onGo('usuarios')}>Administradores</button>
                    </div>
                </section>

                <section className="exec-panel">
                    <header><h3>Prospectos recientes</h3><button className="exec-btn ghost" onClick={() => onGo('ventas')}>Ver todos <ArrowRight size={14} /></button></header>
                    <ul className="exec-list">
                        {leads.map(l => (
                            <li key={l.id}>
                                <div><div className="exec-strong">{l.name || 'Sin nombre'}</div><div className="exec-muted cap">{[l.election_type, l.territory].filter(Boolean).join(' · ') || '—'}</div></div>
                                <span className="exec-muted">{new Date(l.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</span>
                            </li>
                        ))}
                        {!leads.length && <li className="exec-empty">Sin prospectos todavía.</li>}
                    </ul>
                </section>

                <section className="exec-panel span-2">
                    <header><h3>Alertas recientes</h3></header>
                    <ul className="exec-list">
                        {alerts.map(a => (
                            <li key={a.id}>
                                <div><div className={a.is_read ? '' : 'exec-strong'}>{a.message}</div><div className="exec-muted">{a.source || 'Sistema'}</div></div>
                                <span className="exec-muted">{new Date(a.created_at).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </li>
                        ))}
                        {!alerts.length && <li className="exec-empty">Sin alertas.</li>}
                    </ul>
                </section>
            </div>
        </div>
    );
};
