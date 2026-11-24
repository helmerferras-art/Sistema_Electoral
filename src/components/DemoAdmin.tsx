import { useEffect, useState } from 'react';
import { RefreshCw, Power, RotateCcw, Trash2, KeyRound, ExternalLink, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PALETTE } from '../lib/branding';

/** Llama a la función del servidor que maneja la demo (base aparte). */
export const demoAdmin = async (action: string, payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('demo-admin', { body: { action, ...payload } });
    if (error) {
        let msg = error.message; let ctx: any = null;
        try { ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* sin cuerpo */ }
        const e = new Error(msg) as Error & { needsKey?: boolean };
        e.needsKey = !!ctx?.needs_key;
        throw e;
    }
    return data;
};

const PORTRAITS = ['/demo-brand/k1.svg', '/demo-brand/k2.svg', '/demo-brand/k3.svg', '/demo-brand/k4.svg'];
const PROVIDERS = [['openrouter', 'OpenRouter'], ['openai', 'OpenAI'], ['gemini', 'Google Gemini'], ['groq', 'Groq']];
const ago = (iso?: string | null) => {
    if (!iso) return '—';
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`;
};

export const DemoAdmin = () => {
    const [data, setData] = useState<any>(null);
    const [needsKey, setNeedsKey] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState('');
    const [conv, setConv] = useState<{ leads: number; signups: number } | null>(null);
    const [aiForm, setAiForm] = useState({ provider: 'openrouter', key: '' });
    const [brands, setBrands] = useState<any[]>([]);

    const load = async () => {
        setLoading(true);
        try {
            const d = await demoAdmin('overview');
            setData(d); setBrands(d.brands || []); setNeedsKey(false); setMsg('');
        } catch (e: any) {
            // La llave falta, es la pública o la demo la rechaza: se muestran de nuevo los pasos para conectarla
            if (e.needsKey || /api key|llave/i.test(e.message || '')) { setNeedsKey(true); setMsg(`⚠️ ${e.message}`); }
            else setMsg(`❌ ${e.message}`);
        }
        const since = new Date(Date.now() - 30 * 86400_000).toISOString();
        const [l, s] = await Promise.all([
            supabase.from('sales_leads').select('id', { count: 'exact', head: true }).gte('created_at', since),
            supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('plan', 'arranque').gte('created_at', since),
        ]);
        setConv({ leads: l.count || 0, signups: s.count || 0 });
        setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const run = async (label: string, action: string, payload: Record<string, unknown> = {}, confirmText?: string) => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(label); setMsg('');
        try {
            const r = await demoAdmin(action, payload);
            setMsg(`✅ ${label}${typeof r?.purged === 'number' ? ` (${r.purged})` : ''}`);
            await load();
        } catch (e: any) { setMsg(`❌ ${e.message}`); }
        setBusy('');
    };

    if (needsKey) return (
        <div className="exec-panel" style={{ maxWidth: 760 }}>
            <header><h3>Conectar la demo con tu panel</h3></header>
            <p className="exec-muted" style={{ fontSize: '.88rem', lineHeight: 1.5 }}>
                La demo vive en una base de datos aparte. Para manejarla desde aquí, el servidor necesita su llave de servicio.
                Se guarda como secreto en Supabase: nunca llega al navegador ni a nadie del equipo. Solo se hace una vez.
            </p>
            <ol className="exec-steps">
                <li>Abre las llaves de la base de la demo y copia la <b>secret key</b> (o la llave <b>service_role</b>).
                    <a className="exec-btn ghost" href="https://supabase.com/dashboard/project/uukewfxjpeavsfeercmi/settings/api-keys" target="_blank" rel="noreferrer">Abrir llaves de la demo <ExternalLink size={13} /></a></li>
                <li>Abre los secretos de las funciones de <b>producción</b> y agrega uno nuevo:
                    nombre <code>DEMO_SERVICE_ROLE_KEY</code>, valor: la llave que copiaste. Guarda.
                    <a className="exec-btn ghost" href="https://supabase.com/dashboard/project/dlpbgbldfzxyxhbnmjfn/functions/secrets" target="_blank" rel="noreferrer">Abrir secretos de producción <ExternalLink size={13} /></a></li>
                <li>Regresa aquí y toca <b>Ya la guardé</b>.</li>
            </ol>
            <button className="exec-btn" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Ya la guardé</button>
            {msg && <div style={{ marginTop: '.8rem', fontSize: '.85rem' }}>{msg}</div>}
        </div>
    );

    const sb = data?.sandboxes || [];
    const active = sb.filter((s: any) => s.active).length;

    return (
        <div className="exec-overview">
            <div className="exec-toolbar">
                {msg && <span style={{ fontSize: '.85rem', marginRight: 'auto' }}>{msg}</span>}
                <button className="exec-btn ghost" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> Actualizar</button>
            </div>

            <div className="exec-kpis">
                <div className="exec-kpi"><div className="exec-kpi-top"><span>Visitantes en la demo ahora</span></div><div className="exec-kpi-value">{active}</div><div className="exec-kpi-sub">activos en los últimos 35 min</div></div>
                <div className="exec-kpi"><div className="exec-kpi-top"><span>Demos privadas abiertas</span></div><div className="exec-kpi-value">{sb.length}</div><div className="exec-kpi-sub">se cierran solas al quedar inactivas</div></div>
                <div className="exec-kpi"><div className="exec-kpi-top"><span>Consultas de IA en la demo hoy</span></div><div className="exec-kpi-value">{data?.ai_today ?? '—'}</div><div className="exec-kpi-sub">tope: 3 por visitante, 40 al día</div></div>
                <div className="exec-kpi tone-ok"><div className="exec-kpi-top"><span>Cuentas nuevas (30 días)</span></div><div className="exec-kpi-value">{conv?.signups ?? '—'}</div><div className="exec-kpi-sub">{conv ? `${conv.leads} prospectos dejaron sus datos` : ''}</div></div>
            </div>

            <div className="exec-grid">
                <section className="exec-panel span-2">
                    <header>
                        <h3>Demos privadas</h3>
                        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                            <button className="exec-btn" disabled={!!busy} onClick={() => run('Demos inactivas cerradas', 'purge_idle')}><Power size={14} /> Cerrar inactivas</button>
                            <button className="exec-btn" disabled={!!busy || !sb.length} onClick={() => run('Todas las demos cerradas', 'purge_all', {}, '¿Cerrar TODAS las demos privadas? Los visitantes que estén dentro saldrán de la demo.')}><Trash2 size={14} /> Cerrar todas</button>
                        </div>
                    </header>
                    <div className="exec-table-wrap">
                        <table className="exec-table">
                            <thead><tr><th>Campaña que probó</th><th>Inició</th><th>Última actividad</th><th>Estado</th><th>Red</th><th></th></tr></thead>
                            <tbody>
                                {sb.map((s: any) => (
                                    <tr key={s.id}>
                                        <td><div className="exec-strong">{String(s.name).replace('DEMO PRIVADA · ', '')}</div>{s.brand && <div className="exec-muted">Equipo {s.brand}</div>}</td>
                                        <td className="exec-muted">{ago(s.created_at)}</td>
                                        <td className="exec-muted">{ago(s.last_seen)}</td>
                                        <td><span className={`exec-chip ${s.active ? 'chip-ok' : ''}`}>{s.active ? 'Activa' : 'Inactiva'}</span></td>
                                        <td className="exec-muted">{s.ip || '—'}</td>
                                        <td className="num"><button className="exec-btn ghost" disabled={!!busy} onClick={() => run('Demo cerrada', 'purge', { tenant_id: s.id }, '¿Cerrar esta demo? Si el visitante sigue dentro, saldrá.')}>Cerrar</button></td>
                                    </tr>
                                ))}
                                {!sb.length && <tr><td colSpan={6} className="exec-empty">{loading ? 'Cargando…' : 'No hay demos abiertas en este momento.'}</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <div className="exec-quick">
                        <button className="exec-btn" disabled={!!busy} onClick={() => run('Campañas base reiniciadas', 'reset_base', {}, 'Esto borra y vuelve a crear las campañas base de la demo con datos limpios. Tarda unos segundos. ¿Continuar?')}>
                            <RotateCcw size={14} /> Reiniciar campañas base
                        </button>
                        <span className="exec-muted" style={{ alignSelf: 'center' }}>Úsalo si alguien dejó datos raros en la demo pública.</span>
                    </div>
                </section>

                <section className="exec-panel">
                    <header><h3>IA de la demo</h3></header>
                    <ul className="exec-list">
                        {(data?.ai || []).map((a: any) => (
                            <li key={a.provider}>
                                <div><div className="exec-strong" style={{ textTransform: 'capitalize' }}>{a.provider}</div><div className="exec-muted">{a.has_key ? 'Llave guardada' : 'Sin llave'}</div></div>
                                <button className="exec-btn ghost" disabled={!!busy || !a.has_key} onClick={() => run(a.is_active ? 'IA pausada' : 'IA activada', 'toggle_ai', { provider: a.provider, active: !a.is_active })}>
                                    {a.is_active ? 'Pausar' : 'Activar'}
                                </button>
                            </li>
                        ))}
                        {!(data?.ai || []).length && <li className="exec-empty">Sin proveedores. La IA de la demo no responde.</li>}
                    </ul>
                    <div className="flex-col" style={{ gap: '.5rem', marginTop: '.9rem', paddingTop: '.9rem', borderTop: '1px solid var(--ex-line)' }}>
                        <span className="exec-muted">Guardar o cambiar llave (usa una con poco saldo, solo para pruebas)</span>
                        <select value={aiForm.provider} onChange={e => setAiForm(f => ({ ...f, provider: e.target.value }))} className="squishy-input">
                            {PROVIDERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <input type="password" autoComplete="off" placeholder="Pega aquí la llave" value={aiForm.key} onChange={e => setAiForm(f => ({ ...f, key: e.target.value }))} className="squishy-input" />
                        <button className="exec-btn" disabled={!!busy || aiForm.key.length < 12} onClick={async () => { await run('Llave de IA guardada', 'set_ai', { provider: aiForm.provider, api_key: aiForm.key }); setAiForm(f => ({ ...f, key: '' })); }}>
                            <KeyRound size={14} /> Guardar llave
                        </button>
                    </div>
                </section>

                <section className="exec-panel span-3">
                    <header><h3>Identidad de las campañas ficticias</h3><span className="exec-muted">Las demos nuevas la toman al iniciar</span></header>
                    <div className="demo-brand-grid">
                        {brands.map((b, i) => (
                            <div key={b.k} className="demo-brand-card" style={{ ['--bp' as any]: b.color || '#FF5A36' }}>
                                <div className="demo-brand-head">
                                    {b.photo ? <img src={b.photo} alt="" /> : <div className="demo-brand-ph" />}
                                    <div style={{ minWidth: 0 }}><div className="exec-strong">{b.campaign}</div><div className="exec-muted">Equipo {b.short_name || '—'}</div></div>
                                </div>
                                <div className="demo-portraits">
                                    {PORTRAITS.map(p => <button key={p} className={b.photo === p ? 'on' : ''} onClick={() => setBrands(arr => arr.map((x, j) => j === i ? { ...x, photo: p } : x))}><img src={p} alt="Retrato ilustrado" /></button>)}
                                </div>
                                <input className="squishy-input" maxLength={40} placeholder="Nombre corto" value={b.short_name || ''} onChange={e => setBrands(arr => arr.map((x, j) => j === i ? { ...x, short_name: e.target.value } : x))} />
                                <input className="squishy-input" maxLength={90} placeholder="Slogan" value={b.slogan || ''} onChange={e => setBrands(arr => arr.map((x, j) => j === i ? { ...x, slogan: e.target.value } : x))} />
                                <div className="brand-palette">
                                    {PALETTE.map(p => <button key={p.hex} title={p.name} aria-label={p.name} className={`brand-swatch sm${(b.color || '').toUpperCase() === p.hex ? ' on' : ''}`} style={{ background: p.hex }}
                                        onClick={() => setBrands(arr => arr.map((x, j) => j === i ? { ...x, color: p.hex } : x))} />)}
                                </div>
                                <button className="exec-btn" disabled={!!busy} onClick={() => run(`Identidad de "${b.campaign}" guardada`, 'save_brand', { k: b.k, photo: b.photo, short_name: b.short_name, slogan: b.slogan, color: b.color })}>
                                    <Save size={14} /> Guardar
                                </button>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};
