import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Lead = {
    id: string; created_at: string; name: string; phone: string | null; email: string | null; election_type: string | null;
    territory: string | null; structure_size: string | null; modules: string[] | null; election_date: string | null;
    message: string | null; source: string | null; status?: string | null;
};

/** Solicitudes de cotización (proyectos a la medida) que llegan desde la página pública. */
export const SalesLeads = () => {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [trials, setTrials] = useState<{ name: string; created_at: string; estado: string | null; municipio: string | null }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            supabase.from('sales_leads').select('*').order('created_at', { ascending: false }).limit(200),
            supabase.from('tenants').select('name, created_at, estado, municipio').eq('plan', 'arranque').order('created_at', { ascending: false }).limit(100),
        ]).then(([l, t]) => { setLeads((l.data as Lead[]) || []); setTrials((t.data as any[]) || []); setLoading(false); });
    }, []);

    if (loading) return <div style={{ padding: '1rem', color: '#94A3B8' }}>Cargando…</div>;
    const cell: React.CSSProperties = { padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', verticalAlign: 'top', fontSize: '0.85rem' };
    return (
        <div className="flex-col gap-2">
            <div className="tactile-card">
                <h3 style={{ marginTop: 0 }}>SOLICITUDES DE COTIZACIÓN ({leads.length})</h3>
                {leads.length === 0 ? <p style={{ color: '#94A3B8' }}>Aún no hay solicitudes.</p> : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead><tr>{['Fecha', 'Contacto', 'Elección', 'Estructura', 'Interés', 'Mensaje'].map(h => <th key={h} style={{ ...cell, color: 'var(--tertiary)' }}>{h}</th>)}</tr></thead>
                            <tbody>{leads.map(l => (
                                <tr key={l.id}>
                                    <td style={cell}>{new Date(l.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}<div style={{ color: '#64748B' }}>{l.source}</div></td>
                                    <td style={cell}><strong>{l.name}</strong>{l.phone && <div><a href={`https://wa.me/52${l.phone.replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noreferrer">{l.phone}</a></div>}{l.email && <div><a href={`mailto:${l.email}`}>{l.email}</a></div>}</td>
                                    <td style={cell}>{l.election_type}<div style={{ color: '#94A3B8' }}>{l.territory}</div>{l.election_date && <div style={{ color: '#94A3B8' }}>Elección: {l.election_date}</div>}</td>
                                    <td style={cell}>{l.structure_size}</td>
                                    <td style={cell}>{(l.modules || []).join(', ')}</td>
                                    <td style={{ ...cell, maxWidth: 280 }}>{l.message}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}
            </div>
            <div className="tactile-card">
                <h3 style={{ marginTop: 0 }}>CAMPAÑAS EN PLAN ARRANQUE ({trials.length})</h3>
                {trials.map(t => <div key={t.name + t.created_at} style={{ ...cell, display: 'flex', justifyContent: 'space-between', gap: '1rem' }}><span>{t.name}</span><span style={{ color: '#94A3B8' }}>{[t.municipio, t.estado].filter(Boolean).join(', ')} · {new Date(t.created_at).toLocaleDateString('es-MX')}</span></div>)}
            </div>
        </div>
    );
};

export default SalesLeads;
