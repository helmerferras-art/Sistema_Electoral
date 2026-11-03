import { useEffect, useState, type CSSProperties } from 'react';
import { X, PhoneCall } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { FLAG_LABEL } from '../lib/verification';

type Sample = { supporter_id: string; name: string; phone: string; brigadista: string | null; registrado: string; alertas: string[]; validacion: string; prioridad: number };
type Quality = { recruiter_id: string | null; brigadista: string; registrados: number; auditados: number; confirmados: number; no_conoce: number; numero_invalido: number; alertas: number; tasa_confirmacion: number | null };
type LogRow = { id: string; action: string; rows_count: number | null; created_at: string; user_id: string | null; detail: any };

const OUTCOMES: [string, string, string][] = [
    ['confirmado', '✅ Sí lo visitaron', 'var(--secondary)'],
    ['no_conoce', '❓ No conoce a nadie', 'var(--primary)'],
    ['no_contesta', '📵 No contesta', '#9aa'],
    ['numero_invalido', '🚫 Número no existe', 'var(--primary)'],
    ['pidio_baja', '🙅 Pide que lo borren', '#9aa'],
];

const ACTION_LABEL: Record<string, string> = {
    exportacion_simpatizantes: 'Exportó la base con datos sensibles',
    auditoria_muestra: 'Pidió muestra de auditoría',
    borrado_datos_personales: 'Borró los datos personales de la campaña',
};

/**
 * Auditoría telefónica por muestreo + bitácora de accesos + borrado de datos al cerrar el proceso.
 * Para candidato, coordinación de campaña y comunicación digital (el borrado solo el candidato).
 */
export const AuditPanel = ({ onClose }: { onClose: () => void }) => {
    const { user } = useAuth();
    const [tab, setTab] = useState<'llamar' | 'calidad' | 'accesos'>('llamar');
    const [sample, setSample] = useState<Sample[]>([]);
    const [quality, setQuality] = useState<Quality[]>([]);
    const [log, setLog] = useState<LogRow[]>([]);
    const [names, setNames] = useState<Record<string, string>>({});
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [msg, setMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const [campaign, setCampaign] = useState('');
    const [purgeText, setPurgeText] = useState('');

    const canSeeLog = ['candidato', 'coordinador_campana', 'superadmin'].includes(user?.role || '');
    const canPurge = ['candidato', 'superadmin'].includes(user?.role || '');

    const loadSample = async () => {
        setLoading(true); setMsg('');
        const { data, error } = await supabase.rpc('fn_audit_sample', { p_n: 20 });
        setLoading(false);
        if (error) { setMsg(`❌ ${error.message}`); return; }
        setSample((data as Sample[]) || []);
        if (!data?.length) setMsg('No hay registros pendientes de auditar.');
    };

    const loadQuality = async () => {
        setLoading(true);
        const { data, error } = await supabase.rpc('fn_audit_quality', { p_days: 60 });
        setLoading(false);
        if (error) { setMsg(`❌ ${error.message}`); return; }
        setQuality((data as Quality[]) || []);
    };

    const loadLog = async () => {
        const { data } = await supabase.from('data_access_log').select('id, action, rows_count, created_at, user_id, detail')
            .order('created_at', { ascending: false }).limit(100);
        const rows = (data as LogRow[]) || [];
        setLog(rows);
        const ids = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[];
        if (ids.length) {
            const { data: us } = await supabase.from('users').select('id, name').in('id', ids);
            setNames(Object.fromEntries((us || []).map((u: any) => [u.id, u.name])));
        }
    };

    useEffect(() => {
        if (tab === 'llamar' && !sample.length) loadSample();
        if (tab === 'calidad') loadQuality();
        if (tab === 'accesos') loadLog();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    useEffect(() => {
        if (!user?.tenant_id) return;
        supabase.from('tenants').select('name').eq('id', user.tenant_id).maybeSingle().then(({ data }) => setCampaign((data as any)?.name || ''));
    }, [user?.tenant_id]);

    const record = async (s: Sample, outcome: string) => {
        const { error } = await supabase.rpc('fn_audit_record', { p_supporter_id: s.supporter_id, p_outcome: outcome, p_notes: notes[s.supporter_id] || null });
        if (error) { setMsg(`❌ ${error.message}`); return; }
        // "No contesta" se queda en la lista para volver a intentar después
        if (outcome !== 'no_contesta') setSample(prev => prev.filter(x => x.supporter_id !== s.supporter_id));
        else setSample(prev => [...prev.filter(x => x.supporter_id !== s.supporter_id), s]);
    };

    const purge = async () => {
        if (!window.confirm('Esto borra para siempre nombres, teléfonos, evidencias y ubicaciones exactas de TODA la campaña. Solo quedan los conteos por sección. ¿Continuar?')) return;
        setMsg('Borrando archivos de evidencia...');
        // 1) Archivos (fotos/audios) del almacenamiento; 2) registros en la base
        const paths: string[] = [];
        for (let from = 0; ; from += 1000) {
            const { data: ev, error: re } = await supabase.from('activity_evidence').select('storage_path')
                .eq('tenant_id', user!.tenant_id).order('id').range(from, from + 999);
            if (re) { setMsg(`❌ ${re.message}`); return; }
            paths.push(...(ev || []).map((e: any) => e.storage_path).filter(Boolean));
            if (!ev || ev.length < 1000) break;
        }
        for (let i = 0; i < paths.length; i += 100) {
            const { error: se } = await supabase.storage.from('activity_evidence').remove(paths.slice(i, i + 100));
            if (se) { setMsg(`❌ No se pudieron borrar los archivos: ${se.message}`); return; }
        }
        const { data, error } = await supabase.rpc('fn_purge_personal_data', { p_confirm: purgeText.trim() });
        if (error) { setMsg(`❌ ${error.message}`); return; }
        setMsg(`✅ Datos borrados: ${(data as any)?.simpatizantes ?? 0} simpatizantes anonimizados, ${(data as any)?.evidencias ?? 0} evidencias eliminadas.`);
        setPurgeText('');
    };

    const confirmPhrase = `BORRAR ${campaign.toUpperCase()}`;

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="tactile-card flex-col gap-2" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, width: '100%', maxHeight: '90vh', overflowY: 'auto', height: 'auto', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>🔎 Auditoría de calidad</strong>
                    <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className={`squishy-btn ${tab === 'llamar' ? 'primary' : ''}`} style={tabBtn} onClick={() => setTab('llamar')}>Llamar</button>
                    <button className={`squishy-btn ${tab === 'calidad' ? 'primary' : ''}`} style={tabBtn} onClick={() => setTab('calidad')}>Por brigadista</button>
                    {canSeeLog && <button className={`squishy-btn ${tab === 'accesos' ? 'primary' : ''}`} style={tabBtn} onClick={() => setTab('accesos')}>Datos</button>}
                </div>
                {msg && <div>{msg}</div>}
                {loading && <div style={{ color: '#9aa' }}>Cargando...</div>}

                {tab === 'llamar' && (
                    <>
                        <div style={{ color: '#9aa', fontSize: '0.78rem', background: 'rgba(255,255,255,0.04)', padding: '0.5rem', borderRadius: 8 }}>
                            Guion: “Buenas, le llamo del equipo de <b>{campaign || 'la campaña'}</b>. ¿Hace poco platicó con alguien de nuestro equipo en su colonia? Solo queremos confirmar que lo atendieron bien.”
                            <br />Primero salen los registros con alertas, luego los no validados, luego al azar.
                        </div>
                        {sample.map(s => (
                            <div key={s.supporter_id} className="flex-col" style={{ gap: '0.35rem', padding: '0.6rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                    <div>
                                        <b>{s.name}</b> <span style={{ color: '#9aa' }}>· {s.brigadista || 'sin brigadista'} · {s.registrado} · {s.validacion}</span>
                                    </div>
                                    <a href={`tel:${s.phone}`} className="squishy-btn mini" style={{ color: 'var(--tertiary)' }} aria-label={`Llamar a ${s.name}`}><PhoneCall size={14} /> {s.phone}</a>
                                </div>
                                {s.alertas?.length > 0 && (
                                    <div style={{ color: '#FFB000', fontSize: '0.75rem' }}>⚠️ {s.alertas.map(f => FLAG_LABEL[f] || f).join(' · ')}</div>
                                )}
                                <input className="squishy-input" placeholder="Nota (opcional)" value={notes[s.supporter_id] || ''}
                                    onChange={e => setNotes({ ...notes, [s.supporter_id]: e.target.value })} />
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                                    {OUTCOMES.map(([k, label, color]) => (
                                        <button key={k} className="squishy-btn mini" style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', color, borderColor: color }} onClick={() => record(s, k)}>{label}</button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <button className="squishy-btn" onClick={loadSample}>Nueva muestra</button>
                    </>
                )}

                {tab === 'calidad' && (
                    <>
                        <div style={{ color: '#9aa', fontSize: '0.78rem' }}>Últimos 60 días. “Confirmación” = de los que contestaron la llamada, cuántos dicen que sí los visitaron. Debajo de 70% conviene revisar con el brigadista.</div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead><tr style={{ color: '#9aa', textAlign: 'right' }}>
                                    <th style={{ ...th, textAlign: 'left' }}>Brigadista</th><th style={th}>Reg.</th><th style={th}>⚠️</th><th style={th}>Llam.</th><th style={th}>Confirm.</th><th style={th}>No conoce</th><th style={th}>Nº malo</th>
                                </tr></thead>
                                <tbody>{quality.map(q => {
                                    const rate = q.tasa_confirmacion;
                                    const color = rate == null ? '#9aa' : rate >= 0.85 ? 'var(--secondary)' : rate >= 0.7 ? '#FFB000' : 'var(--primary)';
                                    return (
                                        <tr key={q.recruiter_id || 'none'} style={{ textAlign: 'right', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                            <td style={{ ...td, textAlign: 'left' }}>{q.brigadista}</td><td style={td}>{q.registrados}</td>
                                            <td style={{ ...td, color: q.alertas ? '#FFB000' : undefined }}>{q.alertas}</td><td style={td}>{q.auditados}</td>
                                            <td style={{ ...td, color, fontWeight: 700 }}>{rate == null ? '—' : `${Math.round(rate * 100)}%`}</td>
                                            <td style={td}>{q.no_conoce}</td><td style={td}>{q.numero_invalido}</td>
                                        </tr>
                                    );
                                })}</tbody>
                            </table>
                        </div>
                        {!quality.length && !loading && <div style={{ color: '#9aa' }}>Sin registros en el periodo.</div>}
                    </>
                )}

                {tab === 'accesos' && canSeeLog && (
                    <>
                        <div style={{ color: '#9aa', fontSize: '0.78rem' }}>Quién ha sacado datos personales del sistema (exportaciones, muestras de auditoría, borrados).</div>
                        {log.map(r => (
                            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '0.3rem 0' }}>
                                <span>{ACTION_LABEL[r.action] || r.action} · <b>{names[r.user_id || ''] || '—'}</b></span>
                                <span style={{ color: '#9aa', whiteSpace: 'nowrap' }}>{r.rows_count ?? 0} reg · {new Date(r.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}</span>
                            </div>
                        ))}
                        {!log.length && <div style={{ color: '#9aa' }}>Sin accesos registrados.</div>}

                        {canPurge && (
                            <div className="flex-col" style={{ gap: '0.4rem', marginTop: '0.8rem', border: '1px solid var(--primary)', borderRadius: 10, padding: '0.7rem' }}>
                                <b style={{ color: 'var(--primary)' }}>Cierre del proceso: borrar datos personales</b>
                                <div style={{ fontSize: '0.78rem', color: '#bbb' }}>
                                    Al terminar la campaña o la encuesta, la ley pide no conservar datos que ya no se necesitan. Esto anonimiza a todos los simpatizantes
                                    (nombre, teléfono, documentos, ubicación exacta) y elimina fotos y audios de evidencia. Se conservan los conteos por sección para el histórico. <b>No se puede deshacer.</b>
                                </div>
                                <div style={{ fontSize: '0.78rem' }}>Para confirmar escribe: <code>{confirmPhrase}</code></div>
                                <input className="squishy-input" value={purgeText} onChange={e => setPurgeText(e.target.value)} placeholder={confirmPhrase} />
                                <button className="squishy-btn" style={{ borderColor: 'var(--primary)', color: 'var(--primary)' }}
                                    disabled={!campaign || purgeText.trim() !== confirmPhrase} onClick={purge}>Borrar datos personales</button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

const tabBtn: CSSProperties = { flex: 1, padding: '0.45rem 0.3rem', fontSize: '0.75rem', minWidth: 0 };
const th: CSSProperties = { padding: '0.3rem', fontWeight: 600 };
const td: CSSProperties = { padding: '0.3rem' };

export default AuditPanel;
