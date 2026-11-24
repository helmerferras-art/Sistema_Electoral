import { useEffect, useState } from 'react';
import { X, Save, BadgeCheck, History, SlidersHorizontal } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { KEY_LABEL, GROUPS } from './PlansEditor';

/** Servicios que se pueden marcar como contratados en una licencia (para el control de cobranza). */
export const SERVICES = [
    'Mapa y metas por sección', 'Recorridos y brigadas', 'Registro de simpatizantes', 'Encuestas y termómetro',
    'Proceso interno', 'Eventos', 'Mensajería SMS/WhatsApp', 'Asistente de IA', 'Día de la elección (casillas)',
    'Finanzas y gastos', 'Capacitación del equipo', 'Soporte prioritario', 'App Android', 'Identidad de campaña',
];
export const PLAN_LABEL: Record<string, string> = { arranque: 'Arranque', profesional: 'Profesional', a_medida: 'A la medida', demo: 'Demo' };
export const METHOD_LABEL: Record<string, string> = { transferencia: 'Transferencia', deposito: 'Depósito', efectivo: 'Efectivo', tarjeta: 'Tarjeta', otro: 'Otro' };
export const STATUS_LABEL: Record<string, string> = { pagado: 'Pagado', parcial: 'Pago parcial', pendiente: 'Pendiente', cortesia: 'Cortesía' };

const todayMx = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
const addMonths = (iso: string, m: number) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() + m); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
export const fmtDate = (iso?: string | null) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const money = (n?: number | null) => n === null || n === undefined ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

/** Estado de la vigencia para mostrar en tablas: vigente, por vencer, vencida o sin licencia. */
export const vigencia = (end?: string | null) => {
    if (!end) return { label: 'Sin licencia', tone: '' };
    const days = Math.round((new Date(end + 'T23:59:59').getTime() - Date.now()) / 86400_000);
    if (days < 0) return { label: `Venció ${fmtDate(end)}`, tone: 'bad' };
    if (days <= 15) return { label: `Vence en ${days} d`, tone: 'warn' };
    return { label: `Hasta ${fmtDate(end)}`, tone: 'ok' };
};

type Tenant = { id: string; name: string; plan: string | null; license_start?: string | null; license_end?: string | null; is_active?: boolean | null; suspended_reason?: string | null };

export const LicensePanel = ({ tenant, onClose, onSaved }: { tenant: Tenant; onClose: () => void; onSaved?: () => void }) => {
    const [tab, setTab] = useState<'registrar' | 'historial' | 'limites'>('registrar');
    const start0 = tenant.license_end && tenant.license_end >= todayMx()
        ? new Date(new Date(tenant.license_end + 'T12:00:00').getTime() + 86400_000).toISOString().slice(0, 10) : todayMx();
    const [f, setF] = useState({
        plan: tenant.plan && tenant.plan !== 'demo' ? tenant.plan : 'profesional', start: start0, end: addMonths(start0, 6),
        amount: '', method: 'transferencia', status: 'pagado', paid_at: todayMx(), reference: '', services: [] as string[], notes: '', sms: true,
    });
    const [history, setHistory] = useState<any[]>([]);
    const [planLimits, setPlanLimits] = useState<Record<string, number | null>>({});
    const [over, setOver] = useState<Record<string, string>>({});
    const [overOrig, setOverOrig] = useState<Record<string, string>>({});
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    const loadAll = async () => {
        const [h, pl, ov] = await Promise.all([
            supabase.from('licenses').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
            supabase.from('plan_limits').select('key, value').eq('plan', f.plan),
            supabase.from('tenant_limit_overrides').select('key, value').eq('tenant_id', tenant.id),
        ]);
        setHistory(h.data || []);
        setPlanLimits(Object.fromEntries((pl.data || []).map((r: any) => [r.key, r.value])));
        const o = Object.fromEntries((ov.data || []).map((r: any) => [r.key, r.value === null ? '∞' : String(r.value)]));
        setOver(o); setOverOrig(o);
        // Al renovar, propone los mismos servicios de la última licencia
        const last = (h.data || [])[0];
        if (last && !f.services.length) setF(s => ({ ...s, services: last.services || [], amount: last.amount ? String(last.amount) : s.amount }));
    };
    useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [tenant.id, f.plan]);

    const register = async () => {
        if (!f.start || !f.end || f.end < f.start) { setMsg('⚠️ Revisa las fechas: el fin debe ser posterior al inicio.'); return; }
        setBusy(true); setMsg('');
        const { data, error } = await supabase.rpc('fn_license_register', {
            p_tenant: tenant.id, p_plan: f.plan, p_start: f.start, p_end: f.end,
            p_amount: f.amount === '' ? null : Number(f.amount), p_method: f.status === 'cortesia' ? null : f.method,
            p_status: f.status, p_paid_at: f.status === 'pagado' || f.status === 'parcial' ? f.paid_at || null : null,
            p_reference: f.reference, p_services: f.services, p_notes: f.notes, p_send_sms: f.sms,
        });
        setBusy(false);
        if (error) { setMsg(`❌ ${error.message}`); return; }
        const r = data as any;
        setMsg(`✅ Licencia ${r.folio} registrada.${f.sms ? (r.sms ? ' Se envió el SMS al candidato.' : ' No se pudo enviar el SMS (sin teléfono o sin puente).') : ''}`);
        loadAll(); onSaved?.();
    };

    const saveLimits = async () => {
        setBusy(true); setMsg('');
        const keys = new Set([...Object.keys(over), ...Object.keys(overOrig)]);
        const errs: string[] = [];
        for (const k of keys) {
            const v = (over[k] ?? '').trim(); const o = overOrig[k] ?? '';
            if (v === o) continue;
            if (v === '') { const { error } = await supabase.from('tenant_limit_overrides').delete().eq('tenant_id', tenant.id).eq('key', k); if (error) errs.push(error.message); continue; }
            const value = v === '∞' ? null : Math.max(0, Math.round(Number(v)));
            if (v !== '∞' && Number.isNaN(Number(v))) continue;
            const { error } = await supabase.from('tenant_limit_overrides').upsert({ tenant_id: tenant.id, key: k, value, updated_at: new Date().toISOString() });
            if (error) errs.push(error.message);
        }
        if (keys.has('ia_diaria') && (over.ia_diaria ?? '') !== (overOrig.ia_diaria ?? '')) {
            const v = over.ia_diaria; const ia = v === '∞' ? 5000 : v ? Number(v) : planLimits.ia_diaria ?? 60;
            await supabase.from('tenants').update({ ai_daily_limit: ia }).eq('id', tenant.id);
        }
        setBusy(false);
        setMsg(errs.length ? `❌ ${errs[0]}` : '✅ Límites propios guardados. Aplican de inmediato.');
        loadAll();
    };

    const v = vigencia(tenant.license_end);
    const toggleService = (s: string) => setF(x => ({ ...x, services: x.services.includes(s) ? x.services.filter(y => y !== s) : [...x.services, s] }));
    const overDirty = JSON.stringify(over) !== JSON.stringify(overOrig);

    return (
        <div className="brand-overlay" onClick={onClose}>
            <div className="tactile-card lic-panel" onClick={e => e.stopPropagation()}>
                <div className="brand-editor-head">
                    <div>
                        <strong style={{ fontSize: '1.05rem' }}>Licencia · {tenant.name}</strong>
                        <div className="exec-muted" style={{ marginTop: 2 }}>
                            Plan {PLAN_LABEL[tenant.plan || ''] || tenant.plan || '—'} · <span className={`lic-tone ${v.tone}`}>{v.label}</span>
                            {tenant.is_active === false && <> · <span className="lic-tone bad">{tenant.suspended_reason === 'licencia_vencida' ? 'Pausada por vencimiento' : 'Suspendida'}</span></>}
                        </div>
                    </div>
                    <button className="exec-btn ghost" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
                </div>

                <div className="lic-tabs">
                    <button className={tab === 'registrar' ? 'on' : ''} onClick={() => setTab('registrar')}><BadgeCheck size={15} /> Registrar o renovar</button>
                    <button className={tab === 'historial' ? 'on' : ''} onClick={() => setTab('historial')}><History size={15} /> Historial ({history.length})</button>
                    <button className={tab === 'limites' ? 'on' : ''} onClick={() => setTab('limites')}><SlidersHorizontal size={15} /> Límites propios</button>
                </div>

                {tab === 'registrar' && (
                    <div className="lic-form">
                        <label>Plan
                            <select className="squishy-input" value={f.plan} onChange={e => setF(s => ({ ...s, plan: e.target.value }))}>
                                <option value="arranque">Arranque</option><option value="profesional">Profesional</option><option value="a_medida">A la medida</option>
                            </select>
                        </label>
                        <label>Inicio<input type="date" className="squishy-input" value={f.start} onChange={e => setF(s => ({ ...s, start: e.target.value }))} /></label>
                        <label>Fin
                            <input type="date" className="squishy-input" value={f.end} onChange={e => setF(s => ({ ...s, end: e.target.value }))} />
                            <span className="lic-quick">{[1, 3, 6, 12].map(m => <button key={m} type="button" onClick={() => setF(s => ({ ...s, end: addMonths(s.start, m) }))}>{m === 12 ? '1 año' : `${m} mes${m > 1 ? 'es' : ''}`}</button>)}</span>
                        </label>
                        <label>Monto (MXN)<input type="number" min={0} step="0.01" className="squishy-input" placeholder="0.00" value={f.amount} onChange={e => setF(s => ({ ...s, amount: e.target.value }))} /></label>
                        <label>Estado del pago
                            <select className="squishy-input" value={f.status} onChange={e => setF(s => ({ ...s, status: e.target.value }))}>
                                {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                        </label>
                        {f.status !== 'cortesia' && <label>Forma de pago
                            <select className="squishy-input" value={f.method} onChange={e => setF(s => ({ ...s, method: e.target.value }))}>
                                {Object.entries(METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                            </select>
                        </label>}
                        {(f.status === 'pagado' || f.status === 'parcial') && <label>Fecha de pago<input type="date" className="squishy-input" value={f.paid_at} onChange={e => setF(s => ({ ...s, paid_at: e.target.value }))} /></label>}
                        <label>Referencia o factura<input className="squishy-input" maxLength={80} placeholder="Ej. SPEI 123456 / Factura A-120" value={f.reference} onChange={e => setF(s => ({ ...s, reference: e.target.value }))} /></label>
                        <div className="lic-full">
                            <span>Servicios contratados</span>
                            <div className="lic-services">{SERVICES.map(s => (
                                <label key={s} className={f.services.includes(s) ? 'on' : ''}><input type="checkbox" checked={f.services.includes(s)} onChange={() => toggleService(s)} />{s}</label>
                            ))}</div>
                        </div>
                        <label className="lic-full">Notas<textarea className="squishy-input" rows={2} maxLength={500} value={f.notes} onChange={e => setF(s => ({ ...s, notes: e.target.value }))} /></label>
                        <label className="brand-check lic-full"><input type="checkbox" checked={f.sms} onChange={e => setF(s => ({ ...s, sms: e.target.checked }))} />
                            Avisar por SMS al candidato: “Tu plan {PLAN_LABEL[f.plan]} de {tenant.name} está activo del {fmtDate(f.start)} al {fmtDate(f.end)}”.</label>
                        <div className="lic-full lic-actions">
                            <span className="exec-muted">Al guardar se actualiza el plan y la vigencia, y la campaña se reactiva si estaba pausada.</span>
                            <button className="exec-btn primary-sm" disabled={busy} onClick={register}><Save size={14} /> {busy ? 'Guardando…' : 'Registrar licencia'}</button>
                        </div>
                    </div>
                )}

                {tab === 'historial' && (
                    <div className="exec-table-wrap">
                        <table className="exec-table">
                            <thead><tr><th>Folio</th><th>Plan</th><th>Vigencia</th><th className="num">Monto</th><th>Pago</th><th>Servicios</th></tr></thead>
                            <tbody>
                                {history.map(l => (
                                    <tr key={l.id}>
                                        <td className="exec-strong">{l.folio}<div className="exec-muted">{new Date(l.created_at).toLocaleDateString('es-MX')}</div></td>
                                        <td>{PLAN_LABEL[l.plan] || l.plan}</td>
                                        <td className="exec-muted">{fmtDate(l.start_date)} → {fmtDate(l.end_date)}</td>
                                        <td className="num">{money(l.amount)}</td>
                                        <td><span className={`exec-chip pay-${l.payment_status}`}>{STATUS_LABEL[l.payment_status]}</span>
                                            <div className="exec-muted">{[METHOD_LABEL[l.payment_method] || '', l.reference || ''].filter(Boolean).join(' · ')}</div></td>
                                        <td className="exec-muted" style={{ maxWidth: 260 }}>{(l.services || []).join(', ') || '—'}{l.notes && <div><i>{l.notes}</i></div>}</td>
                                    </tr>
                                ))}
                                {!history.length && <tr><td colSpan={6} className="exec-empty">Sin licencias registradas.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === 'limites' && (
                    <div>
                        <p className="exec-muted" style={{ margin: '0 0 .7rem' }}>
                            Valores solo para esta campaña; tienen prioridad sobre su plan ({PLAN_LABEL[f.plan]}). Deja vacío para usar el del plan,
                            o escribe <b>∞</b> para que no tenga límite.
                        </p>
                        <div className="exec-table-wrap">
                            <table className="exec-table plans-table">
                                <thead><tr><th>Límite</th><th className="num">Del plan</th><th className="num">Propio de la campaña</th></tr></thead>
                                <tbody>
                                    {GROUPS.map(([g, keys]) => [
                                        <tr key={g} className="plans-group"><td colSpan={3}>{g}</td></tr>,
                                        ...keys.map(k => (
                                            <tr key={k}>
                                                <td>{KEY_LABEL[k] || k}</td>
                                                <td className="num exec-muted">{planLimits[k] === undefined || planLimits[k] === null ? '∞' : planLimits[k]}</td>
                                                <td className="num"><input className={`squishy-input tc-input tc-num${(over[k] ?? '') !== (overOrig[k] ?? '') ? ' plans-changed' : ''}`} placeholder="—"
                                                    value={over[k] ?? ''} onChange={e => setOver(o => ({ ...o, [k]: e.target.value.replace(/[^0-9∞]/g, '') }))} /></td>
                                            </tr>
                                        )),
                                    ])}
                                </tbody>
                            </table>
                        </div>
                        <div className="lic-actions" style={{ marginTop: '.8rem' }}>
                            <span className="exec-muted">Los cambios aplican de inmediato y quedan en la bitácora.</span>
                            <button className="exec-btn primary-sm" disabled={busy || !overDirty} onClick={saveLimits}><Save size={14} /> Guardar límites propios</button>
                        </div>
                    </div>
                )}
                {msg && <div style={{ fontSize: '.85rem', marginTop: '.6rem' }}>{msg}</div>}
            </div>
        </div>
    );
};
