import { useEffect, useState } from 'react';
import { Share2, PhoneCall } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

type Leader = { supporter_id: string; name: string; phone: string | null; section_id: string | null; recruiter: string | null; referidos: number; segundo_nivel: number };

/**
 * Red de referidos: simpatizantes que más personas sumaron con su enlace personal.
 * Son candidatos naturales a líderes de manzana o de sección.
 */
export const ReferralNetwork = () => {
    const { user } = useAuth();
    const [rows, setRows] = useState<Leader[] | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!open || rows) return;
        supabase.rpc('fn_referral_leaders', { p_limit: 30 }).then(({ data }) => setRows((data || []) as Leader[]));
    }, [open, rows]);

    if (!user || user.role === 'brigadista') return null;

    return (
        <div className="tactile-card" style={{ marginTop: '1rem' }}>
            <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', width: '100%', padding: 0 }}>
                <Share2 color="var(--tertiary)" />
                <span style={{ fontFamily: 'Oswald', fontSize: '1.1rem', flex: 1, textAlign: 'left' }}>RED DE REFERIDOS</span>
                <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>{open ? 'Ocultar' : 'Ver'}</span>
            </button>
            {open && (
                <div style={{ marginTop: '0.7rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>
                        Cada persona que valida su visita recibe un enlace para invitar a sus conocidos. Quienes más suman son posibles líderes de manzana.
                    </div>
                    {rows === null ? <div style={{ color: '#94A3B8' }}>Cargando...</div>
                        : rows.length === 0 ? <div style={{ color: '#94A3B8', fontSize: '0.85rem' }}>Aún nadie ha invitado a otras personas.</div>
                            : rows.map((r, i) => (
                                <div key={r.supporter_id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.45rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ width: 22, textAlign: 'right', color: '#64748B', fontSize: '0.8rem' }}>{i + 1}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.name}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{r.section_id ? `Secc. ${r.section_id}` : 'Sin sección'}{r.recruiter ? ` · Lo registró ${r.recruiter}` : ''}</div>
                                    </div>
                                    <div style={{ textAlign: 'right', fontSize: '0.8rem' }}>
                                        <div><strong>{r.referidos}</strong> invitados</div>
                                        {r.segundo_nivel > 0 && <div style={{ color: '#94A3B8' }}>+{r.segundo_nivel} de ellos</div>}
                                    </div>
                                    {r.phone && <a href={`tel:${r.phone}`} aria-label="Llamar" style={{ color: 'var(--tertiary)' }}><PhoneCall size={16} /></a>}
                                </div>
                            ))}
                </div>
            )}
        </div>
    );
};

export default ReferralNetwork;
