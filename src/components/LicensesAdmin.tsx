import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Download, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LicensePanel, PLAN_LABEL, STATUS_LABEL, METHOD_LABEL, fmtDate, money, vigencia } from './LicensePanel';

/** Control de licencias y cobranza de todas las campañas de clientes. */
export const LicensesAdmin = () => {
    const [lics, setLics] = useState<any[]>([]);
    const [tenants, setTenants] = useState<any[]>([]);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState<any | null>(null);

    const load = async () => {
        setLoading(true);
        const [l, t] = await Promise.all([
            supabase.from('licenses').select('*').order('created_at', { ascending: false }).limit(1000),
            supabase.from('tenants').select('id, name, plan, license_start, license_end, is_active, suspended_reason, is_demo, is_sandbox'),
        ]);
        setLics(l.data || []); setTenants((t.data || []).filter((x: any) => !x.is_sandbox && !x.is_demo));
        setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const tName = (id: string) => tenants.find(t => t.id === id)?.name || '—';
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const yearStart = `${now.getFullYear()}-01-01`;
    const paid = (l: any) => l.payment_status === 'pagado' || l.payment_status === 'parcial';
    const sum = (arr: any[]) => arr.reduce((a, l) => a + (Number(l.amount) || 0), 0);

    const kpis = useMemo(() => {
        const withLic = tenants.filter(t => t.license_end);
        return {
            mes: sum(lics.filter(l => paid(l) && (l.paid_at || '') >= monthStart)),
            anio: sum(lics.filter(l => paid(l) && (l.paid_at || '') >= yearStart)),
            pendiente: sum(lics.filter(l => l.payment_status === 'pendiente' || l.payment_status === 'parcial')),
            activas: withLic.filter(t => vigencia(t.license_end).tone === 'ok' || vigencia(t.license_end).tone === 'warn').length,
            porVencer: withLic.filter(t => vigencia(t.license_end).tone === 'warn').length,
            vencidas: withLic.filter(t => vigencia(t.license_end).tone === 'bad').length,
        };
    }, [lics, tenants]);

    const shown = lics.filter(l => (!status || l.payment_status === status) &&
        (!q || `${l.folio} ${tName(l.tenant_id)} ${l.reference || ''}`.toLowerCase().includes(q.toLowerCase())));

    const exportCsv = () => {
        const esc = (s: unknown) => `"${String(s ?? '').replace(/"/g, '""')}"`;
        const head = ['folio', 'campaña', 'plan', 'inicio', 'fin', 'monto', 'estado_pago', 'forma_pago', 'fecha_pago', 'referencia', 'servicios', 'notas', 'registrada'];
        const rows = shown.map(l => [l.folio, tName(l.tenant_id), PLAN_LABEL[l.plan] || l.plan, l.start_date, l.end_date, l.amount ?? '', STATUS_LABEL[l.payment_status],
            METHOD_LABEL[l.payment_method] || '', l.paid_at || '', l.reference || '', (l.services || []).join('; '), l.notes || '', l.created_at?.slice(0, 10)].map(esc).join(','));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + [head.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }));
        a.download = `licencias_${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
    };

    const soon = tenants.filter(t => t.license_end && vigencia(t.license_end).tone !== 'ok').sort((a, b) => a.license_end.localeCompare(b.license_end));

    return (
        <div className="exec-overview">
            <div className="exec-toolbar">
                <div className="exec-search"><Search size={15} /><input placeholder="Folio, campaña o referencia" value={q} onChange={e => setQ(e.target.value)} /></div>
                <select className="squishy-input tc-input" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">Todos los pagos</option>{Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <button className="exec-btn ghost" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /></button>
                <button className="exec-btn" onClick={exportCsv} disabled={!shown.length}><Download size={14} /> Exportar CSV</button>
            </div>

            <div className="exec-kpis">
                <div className="exec-kpi tone-ok"><div className="exec-kpi-top"><span>Cobrado este mes</span></div><div className="exec-kpi-value">{money(kpis.mes)}</div><div className="exec-kpi-sub">en el año: {money(kpis.anio)}</div></div>
                <div className={`exec-kpi ${kpis.pendiente ? 'tone-warn' : ''}`}><div className="exec-kpi-top"><span>Por cobrar</span></div><div className="exec-kpi-value">{money(kpis.pendiente)}</div><div className="exec-kpi-sub">licencias pendientes o con pago parcial</div></div>
                <div className="exec-kpi"><div className="exec-kpi-top"><span>Licencias vigentes</span></div><div className="exec-kpi-value">{kpis.activas}</div><div className="exec-kpi-sub">{kpis.porVencer} vencen en 15 días</div></div>
                <div className={`exec-kpi ${kpis.vencidas ? 'tone-bad' : ''}`}><div className="exec-kpi-top"><span>Vencidas</span></div><div className="exec-kpi-value">{kpis.vencidas}</div><div className="exec-kpi-sub">se pausan solas al vencer</div></div>
            </div>

            <div className="exec-grid">
                <section className="exec-panel span-2">
                    <header><h3>Licencias registradas</h3></header>
                    <div className="exec-table-wrap">
                        <table className="exec-table">
                            <thead><tr><th>Folio</th><th>Campaña</th><th>Plan</th><th>Vigencia</th><th className="num">Monto</th><th>Pago</th></tr></thead>
                            <tbody>
                                {shown.map(l => (
                                    <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(tenants.find(t => t.id === l.tenant_id) || null)}>
                                        <td className="exec-strong">{l.folio}</td>
                                        <td>{tName(l.tenant_id)}</td>
                                        <td>{PLAN_LABEL[l.plan] || l.plan}</td>
                                        <td className="exec-muted">{fmtDate(l.start_date)} → {fmtDate(l.end_date)}</td>
                                        <td className="num">{money(l.amount)}</td>
                                        <td><span className={`exec-chip pay-${l.payment_status}`}>{STATUS_LABEL[l.payment_status]}</span></td>
                                    </tr>
                                ))}
                                {!shown.length && <tr><td colSpan={6} className="exec-empty">{loading ? 'Cargando…' : 'Aún no hay licencias. Regístralas desde Control de campañas → Licencia.'}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </section>
                <section className="exec-panel">
                    <header><h3>Vencimientos próximos</h3></header>
                    <ul className="exec-list">
                        {soon.map(t => { const v = vigencia(t.license_end); return (
                            <li key={t.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(t)}>
                                <div><div className="exec-strong">{t.name}</div><div className="exec-muted">Plan {PLAN_LABEL[t.plan] || t.plan}</div></div>
                                <span className={`lic-tone ${v.tone}`}>{v.label}</span>
                            </li>
                        ); })}
                        {!soon.length && <li className="exec-empty">Ninguna licencia vence en los próximos 15 días.</li>}
                    </ul>
                    <p className="exec-muted" style={{ marginTop: '.8rem' }}>Cada mañana el sistema avisa por SMS al candidato 7 días antes y pausa la campaña el día que vence.</p>
                </section>
            </div>
            {open && <LicensePanel tenant={open} onClose={() => setOpen(null)} onSaved={load} />}
        </div>
    );
};
