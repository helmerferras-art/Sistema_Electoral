import { useState, useEffect } from 'react';
import { Gift, Download, CheckCircle, Lock, Star } from 'lucide-react';

interface AgentContext {
    name: string;
    xp: number;
    rank: string;
    levelProgression: number;
}

export const LootBox = () => {
    const [agentContext, setAgentContext] = useState<AgentContext>({ name: '', xp: 0, rank: 'Explorador', levelProgression: 0 });
    const [claimedLoot, setClaimedLoot] = useState<number[]>([]);

    useEffect(() => {
        const agent = localStorage.getItem('legion_chiapas_agent');
        if (agent) {
            setAgentContext(JSON.parse(agent));
        }

        const claimed = localStorage.getItem('legion_chiapas_claimed_loot');
        if (claimed) {
            setClaimedLoot(JSON.parse(claimed));
        }
    }, []);

    const lootTiers = [
        {
            id: 1,
            name: "Kit Digital Bronce",
            xpRequired: 100,
            description: "Fondos de pantalla exclusivos y marco para foto de perfil en WhatsApp.",
            color: "#cd7f32"
        },
        {
            id: 2,
            name: "Nivel Plata: Zoom VIP",
            xpRequired: 500,
            description: "Acceso a reunión estratégica mensual por Zoom con el equipo de campaña.",
            color: "#C0C0C0"
        },
        {
            id: 3,
            name: "Nivel Oro: Merch Oficial",
            xpRequired: 1500,
            description: "Gorra y playera de la Legión. Entregada en tu municipio.",
            color: "#FFD700"
        },
        {
            id: 4,
            name: "Cena Diamante",
            xpRequired: 5000,
            description: "Cena privada con el Candidato y los 10 mejores líderes del estado.",
            color: "#b9f2ff"
        }
    ];

    const handleClaim = (tierId: number) => {
        const newClaimed = [...claimedLoot, tierId];
        setClaimedLoot(newClaimed);
        localStorage.setItem('legion_chiapas_claimed_loot', JSON.stringify(newClaimed));
        alert('¡Logística notificada! Te contactaremos pronto para entregar tu recompensa.');
    };

    return (
        <div className="flex-col gap-2" style={{ padding: '0.5rem' }}>
            <div className="tactile-card" style={{ background: 'linear-gradient(135deg, rgba(15,18,24,0.9) 0%, rgba(30,35,46,0.9) 100%)', color: 'var(--text-color)', border: '1px solid var(--tertiary)' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--tertiary)', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em' }}>
                    <Gift size={28} style={{ filter: 'drop-shadow(0 0 5px var(--tertiary))' }} /> SUMINISTROS TÁCTICOS
                </h2>
                <p style={{ color: '#94A3B8', fontFamily: 'Inter, sans-serif', fontSize: '0.9rem', lineHeight: '1.5' }}>Canjea tu Energía (XP) por suministros reales. Tu XP no se gasta, solo se acumula para desbloquear accesos de mayor nivel.</p>
                <div style={{ backgroundColor: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(0,212,255,0.3)', boxShadow: 'inset 0 0 10px rgba(0,212,255,0.1)' }}>
                    <span style={{ fontWeight: 'bold', color: '#94A3B8', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.05em' }}>ENERGÍA TOTAL MOSTRADA:</span>
                    <span style={{ fontSize: '1.8rem', fontWeight: '900', color: 'var(--tertiary)', fontFamily: 'Oswald, sans-serif', textShadow: '0 0 10px rgba(0,212,255,0.5)' }}>{agentContext.xp} XP</span>
                </div>
            </div>

            <div className="flex-col gap-1">
                {lootTiers.map(tier => {
                    const isUnlocked = agentContext.xp >= tier.xpRequired;
                    const isClaimed = claimedLoot.includes(tier.id);

                    return (
                        <div key={tier.id} className="tactile-card" style={{
                            borderLeft: `4px solid ${tier.color}`,
                            opacity: isUnlocked ? 1 : 0.5,
                            position: 'relative',
                            overflow: 'hidden',
                            background: isUnlocked ? 'rgba(30, 35, 46, 0.8)' : 'rgba(0,0,0,0.5)',
                            border: `1px solid ${isUnlocked ? 'rgba(255,255,255,0.1)' : 'transparent'}`,
                            borderLeftWidth: '4px'
                        }}>
                            {!isUnlocked && (
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10, backdropFilter: 'blur(2px)' }}>
                                    <Lock size={48} color={tier.color} opacity={0.6} style={{ filter: `drop-shadow(0 0 10px ${tier.color})` }} />
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 2 }}>
                                <div style={{ flex: 1, paddingRight: '1rem' }}>
                                    <h3 style={{ margin: '0 0 0.5rem 0', color: tier.color, fontFamily: 'Oswald, sans-serif', letterSpacing: '0.05em', textShadow: `0 0 5px ${tier.color}40` }}>{tier.name.toUpperCase()}</h3>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8', fontFamily: 'Inter, sans-serif', lineHeight: '1.4' }}>
                                        {tier.description}
                                    </p>
                                </div>
                                <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', border: `1px solid ${tier.color}40`, padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', color: tier.color, fontFamily: 'Oswald, sans-serif', letterSpacing: '0.05em' }}>
                                    <Star size={14} style={{ filter: `drop-shadow(0 0 5px ${tier.color})` }} /> {tier.xpRequired}
                                </div>
                            </div>

                            <div style={{ marginTop: '1rem', position: 'relative', zIndex: 2 }}>
                                {isClaimed ? (
                                    <button className="squishy-btn" style={{ width: '100%', backgroundColor: 'rgba(0,230,118,0.1)', color: 'var(--secondary)', border: '1px solid var(--secondary)', display: 'flex', justifyContent: 'center', gap: '0.5rem', cursor: 'default', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em' }} disabled>
                                        <CheckCircle size={20} /> SUMINISTRO ENVIADO
                                    </button>
                                ) : (
                                    <button
                                        className="squishy-btn primary"
                                        style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem', opacity: isUnlocked ? 1 : 0.3, backgroundColor: isUnlocked ? 'transparent' : '', border: `1px solid ${tier.color}`, color: isUnlocked ? tier.color : '#64748B', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em', boxShadow: isUnlocked ? `0 0 15px ${tier.color}40 inset` : 'none' }}
                                        disabled={!isUnlocked}
                                        onClick={() => handleClaim(tier.id)}
                                    >
                                        <Download size={20} /> SOLICITAR EXTRACCIÓN
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
