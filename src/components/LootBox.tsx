import { useEffect, useState } from 'react';
import { Gift, Download, CheckCircle, Lock, Star, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

type Tier = { id: string; name: string; description: string | null; xp_required: number; color: string; sort: number };
type Claim = { tier_id: string; claimed_at: string; delivered_at: string | null };
type Ledger = { points: number; reason: string; created_at: string };

const REASON: Record<string, string> = {
    visita_validada: 'Visita validada', validacion_limpia: 'Validación sin alertas', guion_aplicado: 'Guion aplicado',
    actividad_campo: 'Actividad de campo', capacitacion: 'Módulo de capacitación aprobado',
    asistente_evento: 'Asistente en tu evento', invitado_asistio: 'Tu invitado llegó al evento',
};

/**
 * Recompensas por puntos. Los puntos los otorga el servidor (visitas validadas, capacitación, eventos)
 * y el canje se registra en la base de datos: ya no se pueden alterar desde el teléfono.
 */
export const LootBox = () => {
    const { user } = useAuth();
    const [xp, setXp] = useState<number>(user?.xp || 0);
    const [tiers, setTiers] = useState<Tier[]>([]);
    const [claims, setClaims] = useState<Claim[]>([]);
    const [ledger, setLedger] = useState<Ledger[]>([]);
    const [busy, setBusy] = useState<string | null>(null);
    // Líderes: recompensas de su equipo pendientes de entregar
    const [toDeliver, setToDeliver] = useState<{ id: string; claimed_at: string; users: { name: string } | null; reward_tiers: { name: string } | null }[]>([]);

    const load = async () => {
        if (!user?.id) return;
        const [u, t, c, l] = await Promise.all([
            supabase.from('users').select('xp').eq('id', user.id).single(),
            supabase.from('reward_tiers').select('id, name, description, xp_required, color, sort').eq('active', true).order('xp_required'),
            supabase.from('reward_claims').select('tier_id, claimed_at, delivered_at').eq('user_id', user.id),
            supabase.from('xp_ledger').select('points, reason, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(8),
        ]);
        if (u.data) setXp(u.data.xp || 0);
        setTiers((t.data || []) as Tier[]);
        setClaims((c.data || []) as Claim[]);
        setLedger((l.data || []) as Ledger[]);
        if (user.role !== 'brigadista') {
            const { data } = await supabase.from('reward_claims')
                .select('id, claimed_at, users!reward_claims_user_id_fkey(name), reward_tiers(name)')
                .is('delivered_at', null).neq('user_id', user.id).order('claimed_at');
            setToDeliver((data || []) as any);
        }
    };

    const deliver = async (id: string) => {
        const { data } = await supabase.rpc('fn_deliver_reward', { p_claim: id });
        if (data) setToDeliver(prev => prev.filter(x => x.id !== id));
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

    const claim = async (tier: Tier) => {
        setBusy(tier.id);
        const { data, error } = await supabase.rpc('fn_claim_reward', { p_tier: tier.id });
        setBusy(null);
        const estado = (data as any)?.estado;
        if (error || estado !== 'ok') {
            alert(estado === 'faltan_puntos' ? 'Aún no tienes los puntos necesarios.' : 'No se pudo solicitar. Intenta de nuevo.');
            return;
        }
        alert('Listo. Avisamos a tu líder para coordinar la entrega.');
        load();
    };

    return (
        <div className="flex-col gap-2" style={{ padding: '0.5rem' }}>
            <div className="tactile-card" style={{ background: 'linear-gradient(135deg, rgba(15,18,24,0.9) 0%, rgba(30,35,46,0.9) 100%)', color: 'var(--text-color)', border: '1px solid var(--tertiary)' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--tertiary)', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em', marginTop: 0 }}>
                    <Gift size={28} /> RECOMPENSAS
                </h2>
                <p style={{ color: '#94A3B8', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                    Sumas puntos cuando la persona valida tu visita, al aprobar la capacitación y cuando tus invitados llegan a un evento. Los puntos no se gastan.
                </p>
                <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(0,212,255,0.3)' }}>
                    <span style={{ fontWeight: 'bold', color: '#94A3B8', fontFamily: 'Oswald, sans-serif' }}>TUS PUNTOS</span>
                    <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--tertiary)', fontFamily: 'Oswald, sans-serif' }}>{xp}</span>
                </div>
                {ledger.length > 0 && (
                    <div style={{ marginTop: '0.8rem' }}>
                        {ledger.map((l, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94A3B8', padding: '0.2rem 0' }}>
                                <span>{REASON[l.reason] || l.reason} · {new Date(l.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                                <span style={{ color: 'var(--secondary)' }}>+{l.points}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {toDeliver.length > 0 && (
                <div className="tactile-card" style={{ border: '1px solid var(--primary)' }}>
                    <div style={{ fontFamily: 'Oswald, sans-serif', marginBottom: '0.5rem' }}>POR ENTREGAR A TU EQUIPO</div>
                    {toDeliver.map(d => (
                        <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.85rem' }}>
                            <span>{d.users?.name} · {d.reward_tiers?.name}</span>
                            <button className="squishy-btn" style={{ padding: '0.3rem 0.6rem' }} onClick={() => deliver(d.id)}>Entregada</button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex-col gap-1">
                {tiers.map(tier => {
                    const unlocked = xp >= tier.xp_required;
                    const c = claims.find(x => x.tier_id === tier.id);
                    return (
                        <div key={tier.id} className="tactile-card" style={{ borderLeft: `4px solid ${tier.color}`, opacity: unlocked || c ? 1 : 0.6, position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ margin: '0 0 0.4rem 0', color: tier.color, fontFamily: 'Oswald, sans-serif' }}>{tier.name.toUpperCase()}</h3>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8', lineHeight: 1.4 }}>{tier.description}</p>
                                </div>
                                <div style={{ border: `1px solid ${tier.color}66`, padding: '0.3rem 0.6rem', borderRadius: 4, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4, color: tier.color, fontFamily: 'Oswald, sans-serif' }}>
                                    {unlocked ? <Star size={14} /> : <Lock size={14} />} {tier.xp_required}
                                </div>
                            </div>
                            <div style={{ marginTop: '0.8rem' }}>
                                {c ? (
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', color: c.delivered_at ? 'var(--secondary)' : '#94A3B8', fontFamily: 'Oswald, sans-serif' }}>
                                        {c.delivered_at ? <><CheckCircle size={18} /> ENTREGADA</> : <><Clock size={18} /> SOLICITADA · TU LÍDER COORDINA LA ENTREGA</>}
                                    </div>
                                ) : (
                                    <button className="squishy-btn" disabled={!unlocked || busy === tier.id} onClick={() => claim(tier)}
                                        style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', border: `1px solid ${tier.color}`, color: unlocked ? tier.color : '#64748B', background: 'transparent', fontFamily: 'Oswald, sans-serif' }}>
                                        <Download size={18} /> {unlocked ? 'SOLICITAR' : `FALTAN ${tier.xp_required - xp} PUNTOS`}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default LootBox;
