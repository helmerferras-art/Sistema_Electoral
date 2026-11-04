import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { CreditCard, Plus, Paperclip, AlertTriangle, Download, Settings, CheckCircle } from 'lucide-react';

type Tx = {
    id: string; transaction_type: 'ingreso' | 'egreso'; amount: number; category: string; concept: string | null; description: string | null;
    reference_date: string; proveedor: string | null; rfc: string | null; cfdi_uuid: string | null; payment_method: string | null;
    receipt_path: string | null; evidence_path: string | null; donor_name: string | null; donor_key: string | null; created_at: string;
};
type Compliance = {
    tope_gasto: number | null; limite_aportacion: number | null; egresos: number; ingresos: number;
    sin_comprobante: number; sin_rfc: number; aportaciones_sin_aportante: number;
    aportantes_sobre_limite: { nombre: string; total: number }[]; por_concepto: { concepto: string; total: number }[];
};

/**
 * Conceptos de gasto agrupados como suelen reportarse en la fiscalización de campañas.
 * Es una agrupación de referencia: el área contable debe validarla contra el catálogo vigente del SIF del INE.
 */
const CONCEPTS = [
    'Propaganda impresa (lonas, volantes, carteles)', 'Propaganda utilitaria (playeras, gorras, artículos)', 'Bardas y espectaculares',
    'Propaganda en internet y redes sociales', 'Producción de mensajes y video', 'Eventos y mítines (renta, sonido, templetes)',
    'Transporte y combustible', 'Alimentos del equipo', 'Renta de inmuebles y servicios', 'Pago a personal y honorarios',
    'Representantes y estructura del día de la elección', 'Encuestas y estudios', 'Otros gastos operativos',
];
const INCOME = ['Aportación de simpatizante', 'Aportación del candidato', 'Financiamiento del partido', 'Otros ingresos'];
const PAYMENT = ['Transferencia', 'Cheque', 'Tarjeta', 'Efectivo'];
const RFC_RE = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const UUID_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i;
const money = (v: number | null | undefined) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(v || 0));
const COMMAND = ['candidato', 'coordinador_campana', 'superadmin'];

/** Finanzas de campaña con criterios de fiscalización: tope de gasto, comprobantes y límite de aportaciones. */
export const C4IFinanceManager = () => {
    const { user } = useAuth();
    const [txs, setTxs] = useState<Tx[]>([]);
    const [comp, setComp] = useState<Compliance | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [settings, setSettings] = useState(false);
    const [limits, setLimits] = useState({ tope: '', aportacion: '' });
    const [filter, setFilter] = useState<'todos' | 'pendientes'>('todos');
    const [form, setForm] = useState({
        type: 'egreso' as 'ingreso' | 'egreso', amount: '', concept: CONCEPTS[0], income: INCOME[0], description: '',
        date: new Date().toISOString().slice(0, 10), proveedor: '', rfc: '', cfdi: '', payment: PAYMENT[0], donor: '', donorKey: '',
    });
    const [receipt, setReceipt] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        if (!user?.tenant_id) return;
        const [{ data, error }, { data: c }] = await Promise.all([
            supabase.from('campaign_finances').select('*').eq('tenant_id', user.tenant_id).order('reference_date', { ascending: false }),
            supabase.rpc('fn_finance_compliance'),
        ]);
        if (error) console.error('Finanzas:', error.message);
        setTxs((data || []) as Tx[]);
        setComp((c as Compliance) || null);
        if (c) setLimits({ tope: (c as any).tope_gasto ?? '', aportacion: (c as any).limite_aportacion ?? '' });
        setLoading(false);
    };
    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.tenant_id]);

    const upload = async (file: File) => {
        const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
        const path = `${user!.tenant_id}/fiscal/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from('campaign_docs').upload(path, file, { contentType: file.type || 'application/octet-stream' });
        if (error) throw error;
        return path;
    };

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        const amount = parseFloat(form.amount.replace(/,/g, ''));
        if (!(amount > 0)) { alert('Escribe un monto válido.'); return; }
        const rfc = form.rfc.trim().toUpperCase();
        if (rfc && !RFC_RE.test(rfc)) { alert('El RFC no tiene un formato válido.'); return; }
        if (form.cfdi && !UUID_RE.test(form.cfdi.trim())) { alert('El folio fiscal (UUID del CFDI) no tiene un formato válido.'); return; }
        setSaving(true);
        try {
            const receipt_path = receipt ? await upload(receipt) : null;
            const isOut = form.type === 'egreso';
            const { error } = await supabase.from('campaign_finances').insert({
                tenant_id: user.tenant_id, created_by: user.id, transaction_type: form.type, amount,
                category: isOut ? form.concept : form.income, concept: isOut ? form.concept : form.income,
                description: form.description || null, reference_date: form.date,
                proveedor: isOut ? form.proveedor.trim() || null : null, rfc: rfc || null, cfdi_uuid: form.cfdi.trim().toUpperCase() || null,
                payment_method: form.payment, receipt_path,
                donor_name: !isOut ? form.donor.trim() || null : null, donor_key: !isOut ? form.donorKey.trim().toUpperCase() || null : null,
            });
            if (error) throw error;
            setCreating(false); setReceipt(null);
            setForm(f => ({ ...f, amount: '', description: '', proveedor: '', rfc: '', cfdi: '', donor: '', donorKey: '' }));
            load();
        } catch (err: any) { alert('No se pudo guardar: ' + err.message); }
        setSaving(false);
    };

    const attach = async (tx: Tx, file: File) => {
        try {
            const path = await upload(file);
            await supabase.from('campaign_finances').update({ receipt_path: path }).eq('id', tx.id);
            load();
        } catch (err: any) { alert('No se pudo subir: ' + err.message); }
    };
    const openFile = async (path: string) => {
        const { data } = await supabase.storage.from('campaign_docs').createSignedUrl(path, 300);
        if (data?.signedUrl) window.open(data.signedUrl, '_blank');
    };
    const saveLimits = async () => {
        if (!user) return;
        const { error } = await supabase.from('tenants').update({
            tope_gasto: limits.tope === '' ? null : Number(limits.tope), limite_aportacion: limits.aportacion === '' ? null : Number(limits.aportacion),
        }).eq('id', user.tenant_id);
        if (error) alert('No se pudo guardar: ' + error.message); else { setSettings(false); load(); }
    };
    const exportCsv = () => {
        const head = ['fecha', 'tipo', 'concepto', 'monto', 'proveedor', 'rfc', 'cfdi_uuid', 'forma_pago', 'aportante', 'clave_aportante', 'comprobante', 'descripcion'];
        const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = txs.map(t => [t.reference_date, t.transaction_type, t.concept || t.category, t.amount, t.proveedor, t.rfc, t.cfdi_uuid, t.payment_method,
            t.donor_name, t.donor_key, t.receipt_path ? 'sí' : 'no', t.description].map(esc).join(','));
        const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `finanzas_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    };

    if (loading) return <div style={{ color: 'var(--tertiary)' }}>Cargando finanzas...</div>;
    if (!comp) return <div className="tactile-card">Solo el candidato, la coordinación de campaña y la coordinación de logística pueden ver las finanzas.</div>;

    const pctTope = comp.tope_gasto ? Math.round(comp.egresos * 100 / comp.tope_gasto) : null;
    const topeColor = pctTope === null ? '#64748B' : pctTope >= 90 ? '#EF4444' : pctTope >= 75 ? '#F59E0B' : 'var(--secondary)';
    const pending = (t: Tx) => t.transaction_type === 'egreso' ? !t.receipt_path || !t.rfc : !t.donor_name;
    const shown = filter === 'pendientes' ? txs.filter(pending) : txs;
    const maxConcept = Math.max(1, ...comp.por_concepto.map(c => Number(c.total)));

    return (
        <div className="flex-col gap-3">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h3 style={{ color: 'white', fontFamily: 'Oswald', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CreditCard color="var(--tertiary)" /> FINANZAS Y FISCALIZACIÓN
                </h3>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {user && COMMAND.includes(user.role) && <button className="squishy-btn" style={mini} onClick={() => setSettings(!settings)}><Settings size={14} /> Límites</button>}
                    <button className="squishy-btn" style={mini} onClick={exportCsv}><Download size={14} /> CSV</button>
                    {!creating && <button className="primary-btn" style={mini} onClick={() => setCreating(true)}><Plus size={14} /> Movimiento</button>}
                </div>
            </div>

            {settings && (
                <div style={box}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <label style={lbl}>Tope de gasto de campaña (MXN)<input className="squishy-input" inputMode="decimal" value={limits.tope} onChange={e => setLimits({ ...limits, tope: e.target.value.replace(/[^\d.]/g, '') })} /></label>
                        <label style={lbl}>Límite por aportante (MXN)<input className="squishy-input" inputMode="decimal" value={limits.aportacion} onChange={e => setLimits({ ...limits, aportacion: e.target.value.replace(/[^\d.]/g, '') })} /></label>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '0.4rem 0' }}>Usa las cifras que aprobó la autoridad electoral para esta elección.</div>
                    <button className="squishy-btn primary" onClick={saveLimits}>Guardar</button>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.7rem' }}>
                <div style={kpi}>
                    <div style={kpiLbl}>Gasto ejercido</div>
                    <div style={kpiVal}>{money(comp.egresos)}</div>
                    {comp.tope_gasto ? (
                        <>
                            <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, marginTop: '0.4rem' }}>
                                <div style={{ width: `${Math.min(100, pctTope!)}%`, height: '100%', background: topeColor, borderRadius: 3 }} />
                            </div>
                            <div style={{ fontSize: '0.75rem', color: topeColor, marginTop: '0.2rem' }}>{pctTope}% del tope de {money(comp.tope_gasto)}</div>
                        </>
                    ) : <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Define el tope de gasto en "Límites".</div>}
                </div>
                <div style={kpi}>
                    <div style={kpiLbl}>Ingresos</div>
                    <div style={kpiVal}>{money(comp.ingresos)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Saldo {money(comp.ingresos - comp.egresos)}</div>
                </div>
                <div style={{ ...kpi, borderColor: comp.sin_comprobante + comp.sin_rfc + comp.aportaciones_sin_aportante + comp.aportantes_sobre_limite.length ? '#F59E0B' : 'rgba(255,255,255,0.1)' }}>
                    <div style={kpiLbl}>Pendientes para fiscalización</div>
                    <div style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
                        <div>{comp.sin_comprobante} gastos sin comprobante</div>
                        <div>{comp.sin_rfc} gastos sin RFC del proveedor</div>
                        <div>{comp.aportaciones_sin_aportante} aportaciones sin aportante</div>
                    </div>
                </div>
            </div>

            {comp.aportantes_sobre_limite.length > 0 && (
                <div style={{ ...box, borderColor: '#EF4444', color: '#FCA5A5', fontSize: '0.85rem' }}>
                    <AlertTriangle size={14} /> Aportantes que rebasan el límite de {money(comp.limite_aportacion)}: {comp.aportantes_sobre_limite.map(a => `${a.nombre} (${money(a.total)})`).join(', ')}
                </div>
            )}

            {comp.por_concepto.length > 0 && (
                <div style={box}>
                    <div style={{ fontFamily: 'Oswald', marginBottom: '0.4rem' }}>GASTO POR CONCEPTO</div>
                    {comp.por_concepto.map(c => (
                        <div key={c.concepto} style={{ marginBottom: '0.35rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', gap: '0.5rem' }}><span>{c.concepto}</span><span>{money(c.total)}</span></div>
                            <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                                <div style={{ width: `${Math.round(Number(c.total) * 100 / maxConcept)}%`, height: '100%', background: 'var(--tertiary)', borderRadius: 3 }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {creating && (
                <form onSubmit={save} className="flex-col gap-1" style={box}>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" className={`squishy-btn ${form.type === 'egreso' ? 'primary' : ''}`} style={{ flex: 1 }} onClick={() => setForm({ ...form, type: 'egreso' })}>Gasto</button>
                        <button type="button" className={`squishy-btn ${form.type === 'ingreso' ? 'primary' : ''}`} style={{ flex: 1 }} onClick={() => setForm({ ...form, type: 'ingreso' })}>Ingreso</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                        <input className="squishy-input" inputMode="decimal" placeholder="Monto" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} required />
                        <input className="squishy-input" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                    </div>
                    {form.type === 'egreso' ? (
                        <>
                            <select className="squishy-input" value={form.concept} onChange={e => setForm({ ...form, concept: e.target.value })}>{CONCEPTS.map(c => <option key={c}>{c}</option>)}</select>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.4rem' }}>
                                <input className="squishy-input" placeholder="Proveedor" value={form.proveedor} onChange={e => setForm({ ...form, proveedor: e.target.value })} />
                                <input className="squishy-input" placeholder="RFC" value={form.rfc} onChange={e => setForm({ ...form, rfc: e.target.value.toUpperCase() })} />
                            </div>
                            <input className="squishy-input" placeholder="Folio fiscal (UUID del CFDI)" value={form.cfdi} onChange={e => setForm({ ...form, cfdi: e.target.value })} />
                        </>
                    ) : (
                        <>
                            <select className="squishy-input" value={form.income} onChange={e => setForm({ ...form, income: e.target.value })}>{INCOME.map(c => <option key={c}>{c}</option>)}</select>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.4rem' }}>
                                <input className="squishy-input" placeholder="Nombre del aportante" value={form.donor} onChange={e => setForm({ ...form, donor: e.target.value })} />
                                <input className="squishy-input" placeholder="RFC del aportante" value={form.donorKey} onChange={e => setForm({ ...form, donorKey: e.target.value.toUpperCase() })} />
                            </div>
                        </>
                    )}
                    <select className="squishy-input" value={form.payment} onChange={e => setForm({ ...form, payment: e.target.value })}>{PAYMENT.map(c => <option key={c}>{c}</option>)}</select>
                    {form.payment === 'Efectivo' && <div style={{ fontSize: '0.75rem', color: '#F59E0B' }}>Los pagos y aportaciones en efectivo tienen restricciones en la fiscalización; confírmalo con tu contador.</div>}
                    <textarea className="squishy-input" rows={2} placeholder="Descripción" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                    <label className="squishy-btn" style={{ textAlign: 'center', cursor: 'pointer' }}>
                        <Paperclip size={14} /> {receipt ? receipt.name : form.type === 'egreso' ? 'Adjuntar factura (PDF o XML)' : 'Adjuntar recibo o ficha de depósito'}
                        <input type="file" accept="application/pdf,.xml,text/xml,image/*" style={{ display: 'none' }} onChange={e => setReceipt(e.target.files?.[0] || null)} />
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button type="button" className="squishy-btn" style={{ flex: 1 }} onClick={() => setCreating(false)}>Cancelar</button>
                        <button type="submit" className="squishy-btn primary" style={{ flex: 2 }} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                </form>
            )}

            <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button className={`squishy-btn ${filter === 'todos' ? 'primary' : ''}`} style={mini} onClick={() => setFilter('todos')}>Todos ({txs.length})</button>
                <button className={`squishy-btn ${filter === 'pendientes' ? 'primary' : ''}`} style={mini} onClick={() => setFilter('pendientes')}>Con pendientes ({txs.filter(pending).length})</button>
            </div>
            {shown.length === 0 && <div style={{ color: '#64748B', textAlign: 'center', padding: '1.5rem' }}>Sin movimientos.</div>}
            {shown.map(t => (
                <div key={t.id} style={{ ...box, borderLeft: `3px solid ${t.transaction_type === 'egreso' ? '#EF4444' : '#10B981'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t.concept || t.category}</div>
                            <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                                {new Date(t.reference_date + 'T12:00').toLocaleDateString('es-MX')} · {t.payment_method || 'sin forma de pago'}
                                {t.proveedor ? ` · ${t.proveedor}` : ''}{t.rfc ? ` (${t.rfc})` : ''}{t.donor_name ? ` · ${t.donor_name}` : ''}
                            </div>
                            {t.description && <div style={{ fontSize: '0.78rem', color: '#bbb' }}>{t.description}</div>}
                        </div>
                        <div style={{ fontWeight: 700, whiteSpace: 'nowrap', color: t.transaction_type === 'egreso' ? '#FCA5A5' : '#6EE7B7' }}>
                            {t.transaction_type === 'egreso' ? '−' : '+'}{money(t.amount)}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.4rem', fontSize: '0.75rem' }}>
                        {t.receipt_path
                            ? <button className="squishy-btn" style={mini} onClick={() => openFile(t.receipt_path!)}><CheckCircle size={12} /> Comprobante</button>
                            : <label className="squishy-btn" style={{ ...mini, cursor: 'pointer', borderColor: '#F59E0B', color: '#F59E0B' }}>
                                <Paperclip size={12} /> Adjuntar comprobante
                                <input type="file" accept="application/pdf,.xml,text/xml,image/*" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && attach(t, e.target.files[0])} />
                            </label>}
                        {t.transaction_type === 'egreso' && !t.rfc && <span style={{ color: '#F59E0B' }}>Falta RFC</span>}
                        {t.transaction_type === 'ingreso' && !t.donor_name && <span style={{ color: '#F59E0B' }}>Falta aportante</span>}
                    </div>
                </div>
            ))}
            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Los conceptos son una agrupación de referencia. Valida el registro con tu contador frente al catálogo vigente del Sistema Integral de Fiscalización del INE.</div>
        </div>
    );
};

const mini: React.CSSProperties = { padding: '0.35rem 0.6rem', fontSize: '0.78rem', display: 'flex', gap: '0.3rem', alignItems: 'center' };
const box: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '0.8rem' };
const kpi: React.CSSProperties = { ...box, display: 'flex', flexDirection: 'column' };
const kpiLbl: React.CSSProperties = { fontSize: '0.75rem', color: '#94A3B8', fontFamily: 'Oswald', letterSpacing: '0.05em' };
const kpiVal: React.CSSProperties = { fontSize: '1.5rem', fontWeight: 700, fontFamily: 'Oswald' };
const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.75rem', color: '#94A3B8' };
