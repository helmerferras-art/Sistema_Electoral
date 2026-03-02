import { useState, useEffect } from 'react';
import { getOfflineSupporters } from '../lib/indexedDB';
import { supabase } from '../lib/supabase';
import { Trophy, Shield, UserCheck, Flame, PersonStanding, Users, Radio, Smartphone, CheckCircle, MessageCircle, PhoneCall } from 'lucide-react';
import { LootBox } from './LootBox';
import { useAuth } from '../lib/AuthContext';
import { InviteLinkGenerator } from './InviteLinkGenerator';
import { TerritoryAssignmentModal } from './TerritoryAssignmentModal';
import { FieldPolls } from './FieldPolls';

export const BrigadistaDashboard = () => {
    const { user } = useAuth();
    const [activeSubTab, setActiveSubTab] = useState<'perfil' | 'online' | 'offline' | 'reclutar' | 'equipo' | 'encuestas'>('perfil');
    const [offlineList, setOfflineList] = useState<any[]>([]);
    const [onlineList, setOnlineList] = useState<any[]>([]);
    const [teamList, setTeamList] = useState<any[]>([]);
    const [assigningTerritoryTo, setAssigningTerritoryTo] = useState<any>(null);

    let targetRoleToInvite: 'coordinador' | 'lider' | 'brigadista' | null = null;
    if (user?.role === 'candidato') targetRoleToInvite = 'coordinador';
    else if (user?.role === 'coordinador') targetRoleToInvite = 'lider';
    else if (user?.role === 'lider') targetRoleToInvite = 'brigadista';

    const [agentContext, setAgentContext] = useState({ name: 'Agente', xp: 0, rank: 'Explorador', levelProgression: 0 });

    useEffect(() => {
        const agent = localStorage.getItem('legion_chiapas_agent');
        if (agent) setAgentContext(JSON.parse(agent));
        loadData();
    }, []);

    const loadData = async () => {
        const local = await getOfflineSupporters();
        setOfflineList(local);

        if (user?.id) {
            // 1. Get Pyramidal Team IDs
            let teamIds: string[] = [user.id];
            if (!['superadmin', 'candidato', 'coordinador_campana'].includes(user.role)) {
                const { data: teamFetch } = await supabase.rpc('get_team_ids', { root_user_id: user.id });
                if (teamFetch) teamIds = teamFetch;
            }

            // 2. Query Supporters for the entire team
            let query = supabase
                .from('supporters')
                .select('*')
                .order('created_at', { ascending: false });

            if (!['superadmin', 'candidato', 'coordinador_campana'].includes(user.role)) {
                query = query.in('recruiter_id', teamIds);
            }

            const { data } = await query.limit(50);
            if (data) setOnlineList(data);

            const { data: teamData } = await supabase
                .from('users')
                .select('*')
                .eq('parent_id', user.id)
                .order('created_at', { ascending: false });
            if (teamData) setTeamList(teamData);
        }
    };

    return (
        <div className="flex-col gap-4">
            {/* SUB-NAV TABS (Optimized for scrolling/thumb) */}
            <div className="scroll-tabs" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.2rem' }}>
                <button
                    className={`squishy-btn ${activeSubTab === 'perfil' ? 'primary' : ''}`}
                    onClick={() => setActiveSubTab('perfil')}
                    style={{ background: 'transparent', color: activeSubTab === 'perfil' ? 'var(--tertiary)' : '#64748B', whiteSpace: 'nowrap' }}
                >
                    <PersonStanding size={18} /> MI PERFIL
                </button>
                <button
                    className={`squishy-btn ${activeSubTab === 'offline' ? 'primary' : ''}`}
                    onClick={() => setActiveSubTab('offline')}
                    style={{ background: 'transparent', color: activeSubTab === 'offline' ? 'var(--primary)' : '#64748B', whiteSpace: 'nowrap' }}
                >
                    <Smartphone size={18} /> OFFLINE ({offlineList.length})
                </button>
                <button
                    className={`squishy-btn ${activeSubTab === 'online' ? 'primary' : ''}`}
                    onClick={() => setActiveSubTab('online')}
                    style={{ background: 'transparent', color: activeSubTab === 'online' ? 'var(--secondary)' : '#64748B', whiteSpace: 'nowrap' }}
                >
                    <Radio size={18} /> RED ACTIVA
                </button>
                {['candidato', 'coordinador', 'lider'].includes(user?.role || '') && (
                    <button
                        className={`squishy-btn ${activeSubTab === 'equipo' ? 'primary' : ''}`}
                        onClick={() => setActiveSubTab('equipo')}
                        style={{ background: 'transparent', color: activeSubTab === 'equipo' ? 'var(--accent)' : '#64748B', whiteSpace: 'nowrap' }}
                    >
                        <Users size={18} /> EQUIPO
                    </button>
                )}
                {targetRoleToInvite && (
                    <button
                        className={`squishy-btn ${activeSubTab === 'reclutar' ? 'primary' : ''}`}
                        onClick={() => setActiveSubTab('reclutar')}
                        style={{ background: 'transparent', color: activeSubTab === 'reclutar' ? 'var(--tertiary)' : '#64748B', whiteSpace: 'nowrap' }}
                    >
                        <Users size={18} /> RECLUTAR
                    </button>
                )}
                <button
                    className={`squishy-btn ${activeSubTab === 'encuestas' ? 'primary' : ''}`}
                    onClick={() => setActiveSubTab('encuestas')}
                    style={{ background: 'transparent', color: activeSubTab === 'encuestas' ? '#818cf8' : '#64748B', whiteSpace: 'nowrap' }}
                >
                    <Shield size={18} /> ENCUESTAS
                </button>
            </div>

            <main>
                {/* Perfil de Logros */}
                {activeSubTab === 'perfil' && (
                    <div className="flex-col gap-4">
                        <div className="tactile-card flex-col gap-2" style={{ alignItems: 'center', textAlign: 'center', border: '1px solid var(--tertiary)' }}>
                            <div className="flex-center" style={{ background: 'rgba(0,212,255,0.1)', border: '2px solid var(--tertiary)', width: '80px', height: '80px', borderRadius: '50%', marginBottom: '0.5rem' }}>
                                <Shield size={40} color="var(--tertiary)" />
                            </div>
                            <h2 style={{ margin: 0, fontFamily: 'Oswald', fontSize: '1.5rem' }}>{agentContext.name}</h2>
                            <p className="tactical-font" style={{ margin: 0, color: 'var(--tertiary)' }}>{agentContext.rank}</p>

                            <div className="flex-row-resp" style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginTop: '1rem', justifyContent: 'space-around' }}>
                                <div className="flex-col flex-center">
                                    <span style={{ fontSize: '1.5rem', fontFamily: 'Oswald', color: 'var(--primary)' }}>{agentContext.xp}</span>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B' }}>TOTAL XP</span>
                                </div>
                                <div className="flex-col flex-center">
                                    <span style={{ fontSize: '1.5rem', fontFamily: 'Oswald', color: 'var(--secondary)' }}>0</span>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B' }}>STREAK</span>
                                </div>
                            </div>
                        </div>

                        <h3 className="tactical-font" style={{ fontSize: '0.9rem', color: '#64748B', margin: '1rem 0 0.5rem 0' }}>// LOGROS</h3>
                        <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                            <div className="tactile-card flex-col flex-center" style={{ padding: '1rem', opacity: agentContext.xp > 0 ? 1 : 0.3 }}>
                                <Trophy size={32} color="var(--accent)" />
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', fontWeight: 'bold' }}>FUNDADOR</p>
                            </div>
                            <div className="tactile-card flex-col flex-center" style={{ padding: '1rem', opacity: 0.3 }}>
                                <Flame size={32} color="#64748B" />
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', fontWeight: 'bold' }}>STREAKER</p>
                            </div>
                            <div className="tactile-card flex-col flex-center" style={{ padding: '1rem', opacity: 0.3 }}>
                                <UserCheck size={32} color="#64748B" />
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', fontWeight: 'bold' }}>GUARDIÁN</p>
                            </div>
                        </div>

                        <LootBox />
                    </div>
                )}

                {/* Bandeja Offline */}
                {activeSubTab === 'offline' && (
                    <div className="flex-col gap-2">
                        {offlineList.length === 0 ? (
                            <div className="tactile-card flex-center flex-col" style={{ padding: '4rem 1rem', opacity: 0.5 }}>
                                <p>No hay datos pendientes de sincronización.</p>
                            </div>
                        ) : (
                            offlineList.map((sup, idx) => (
                                <div key={idx} className="tactile-card flex-row-resp" style={{ justifyContent: 'space-between', borderLeft: '4px solid var(--primary)' }}>
                                    <div>
                                        <p style={{ margin: 0, fontWeight: 'bold' }}>{sup.name}</p>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--primary)' }}>PENDIENTE DE SYNC</p>
                                    </div>
                                    <div style={{ color: 'var(--accent)' }}>{'⭐'.repeat(sup.commitment_level)}</div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Mi Red (Online) */}
                {activeSubTab === 'online' && (
                    <div className="flex-col gap-2">
                        {onlineList.length === 0 ? (
                            <div className="tactile-card flex-center flex-col" style={{ padding: '4rem 1rem', opacity: 0.5 }}>
                                <p>Tu red de aliados está vacía.</p>
                            </div>
                        ) : (
                            onlineList.map((sup, idx) => (
                                <div key={idx} className="tactile-card flex-row-resp" style={{ justifyContent: 'space-between', borderLeft: '4px solid var(--secondary)' }}>
                                    <div>
                                        <p style={{ margin: 0, fontWeight: 'bold' }}>{sup.name}</p>
                                        <div className="flex-row-resp" style={{ gap: '0.5rem', alignItems: 'center' }}>
                                            <CheckCircle size={12} color="var(--secondary)" />
                                            <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>ENCRIPTADO</span>
                                        </div>
                                    </div>
                                    <div className="flex-row-resp" style={{ gap: '0.5rem', alignItems: 'center' }}>
                                        <div style={{ color: 'var(--tertiary)' }}>{'⭐'.repeat(sup.commitment_level || 1)}</div>
                                        <a href={`tel:${sup.phone}`} className="squishy-btn mini" style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--tertiary)' }}>
                                            <PhoneCall size={14} />
                                        </a>
                                        <a
                                            href={`https://wa.me/${sup.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${sup.name}, ¿cómo estás? Te contacto del equipo de campaña.`)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="squishy-btn mini"
                                            style={{ background: 'rgba(37, 211, 102, 0.1)', color: '#25D366' }}
                                        >
                                            <MessageCircle size={14} />
                                        </a>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* Equipo Táctico */}
                {activeSubTab === 'equipo' && (
                    <div className="flex-col gap-2">
                        {teamList.map((tm, idx) => {
                            const isAssigned = tm.assigned_territory?.zone_ids?.length > 0;
                            return (
                                <div key={idx} className="tactile-card flex-col gap-4" style={{ borderLeft: '4px solid var(--accent)' }}>
                                    <div className="flex-row-resp" style={{ justifyContent: 'space-between' }}>
                                        <div>
                                            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1rem' }}>{tm.name}</p>
                                            <p className="tactical-font" style={{ margin: 0, fontSize: '0.7rem' }}>{tm.role.toUpperCase()}</p>
                                        </div>
                                        <div className="flex-row-resp" style={{ gap: '0.5rem' }}>
                                            <a href={`tel:${tm.phone}`} className="squishy-btn mini" style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--tertiary)' }}>
                                                <PhoneCall size={14} />
                                            </a>
                                            <a
                                                href={`https://wa.me/${tm.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${tm.name}, ¿qué tal el avance de hoy?`)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="squishy-btn mini"
                                                style={{ background: 'rgba(37, 211, 102, 0.1)', color: '#25D366' }}
                                            >
                                                <MessageCircle size={14} />
                                            </a>
                                            <button onClick={() => setAssigningTerritoryTo(tm)} className="squishy-btn mini secondary">
                                                {isAssigned ? 'EDITAR ZONA' : 'ASIGNAR'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Reclutamiento */}
                {activeSubTab === 'reclutar' && targetRoleToInvite && (
                    <div className="fade-in">
                        <InviteLinkGenerator targetRole={targetRoleToInvite} parentId={user?.id || ''} />
                    </div>
                )}

                {/* Encuestas */}
                {activeSubTab === 'encuestas' && (
                    <div className="fade-in">
                        <FieldPolls />
                    </div>
                )}
            </main>

            {assigningTerritoryTo && (
                <TerritoryAssignmentModal
                    targetUser={assigningTerritoryTo}
                    onClose={() => {
                        setAssigningTerritoryTo(null);
                        loadData();
                    }}
                />
            )}
        </div>
    );
};
