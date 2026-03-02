import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ShieldAlert, Target, Activity as ActivityIcon, HeartPulse, Eye, Shield, Zap, DollarSign, Trophy, UserPlus, X, MessageCircle, PhoneCall } from 'lucide-react';
import { C4IPollManager } from './C4IPollManager';
import { C4IFinanceManager } from './C4IFinanceManager';
import { C4IPredictiveOracle } from './C4IPredictiveOracle';
import { PetitionsManager } from './PetitionsManager';

interface MetricTotals {
    totalSupporters: number;
    newThisWeek: number;
    historicalTarget: number;
    lvl5Commitments: number;
    sectionCoverage: { total: number, covered: number };
    historicalContext?: { winner_party: string, winner_votes: number, second_party: string, second_votes: number };
    demographics: {
        padron_total: number,
        padron_hombres: number,
        padron_mujeres: number,
        total_voters: number,
        age_groups: Record<string, number>
    };
}

export const HighCommandDashboard = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'pulso' | 'monitoreo' | 'activismo' | 'recursos' | 'futuro' | 'gestiones'>('pulso');

    // Data for Activismo / Pulso
    const [metrics, setMetrics] = useState<MetricTotals>({
        totalSupporters: 0,
        newThisWeek: 0,
        historicalTarget: 1,
        lvl5Commitments: 0,
        sectionCoverage: { total: 0, covered: 0 },
        demographics: { padron_total: 0, padron_hombres: 0, padron_mujeres: 0, total_voters: 0, age_groups: {} }
    });
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [fullTeam, setFullTeam] = useState<any[]>([]);
    const [roiData, setRoiData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Dia D Master Switch State
    const [diaDActive, setDiaDActive] = useState(false);
    const [isTogglingDiaD, setIsTogglingDiaD] = useState(false);

    const [isAddingUser, setIsAddingUser] = useState(false);
    const [newUserForm, setNewUserForm] = useState({ name: '', phone: '', role: 'coordinador' });
    const [isSubmittingUser, setIsSubmittingUser] = useState(false);

    useEffect(() => {
        if (user && user.tenant_id) {
            fetchMetrics();
        } else if (user) {
            // Stop loading if user exists but no tenant_id found yet
            setLoading(false);
        }
    }, [user]);

    const fetchMetrics = async () => {
        setLoading(true);
        try {
            // 1. Fetch Total Supporters
            const { count: totalSupporters } = await supabase
                .from('supporters')
                .select('*', { count: 'exact', head: true })
                .or(`tenant_id.eq.${user?.tenant_id},tenant_id.is.null`);

            // 2. Fetch New This Week
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            const { count: newThisWeek } = await supabase
                .from('supporters')
                .select('*', { count: 'exact', head: true })
                .or(`tenant_id.eq.${user?.tenant_id},tenant_id.is.null`)
                .gte('created_at', oneWeekAgo.toISOString());

            // 3. Fetch Lvl 5 Commitments
            const { count: lvl5Commitments } = await supabase
                .from('supporters')
                .select('*', { count: 'exact', head: true })
                .or(`tenant_id.eq.${user?.tenant_id},tenant_id.is.null`)
                .eq('commitment_level', 5);

            // 4. Fetch Tenant Info to get municipality/geographic_scope and position
            const { data: tenantInfo } = await supabase
                .from('tenants')
                .select('geographic_scope, position')
                .eq('id', user?.tenant_id)
                .single();

            const municipality = tenantInfo?.geographic_scope;
            const position = tenantInfo?.position;

            // 5. Fetch Historical Target filtered by municipality and election type
            // Map tenant position to election_type
            let histElectionType = 'ayuntamiento';
            if (position === 'gubernatura') histElectionType = 'gubernatura';
            if (position === 'diputacion_local') histElectionType = 'diputacion_local';
            if (position === 'diputacion_federal') histElectionType = 'diputacion_federal';
            if (position === 'senaduria') histElectionType = 'senaduria';
            if (position === 'presidencia') histElectionType = 'presidencia';

            const query = supabase
                .from('historical_election_results')
                .select('target_votes_calculated, total_votes, candidate_names, party_results')
                .eq('election_year', 2024)
                .eq('election_type', 'gubernatura');

            if (municipality) {
                query.ilike('municipality', `%${municipality}%`);
            }

            const { data: historicalData } = await query;

            // Recalculate Target based on Eduardo Ramirez's Gubernatura votes
            let historicalTarget = 0;
            if (historicalData) {
                historicalData.forEach(r => {
                    let ramirezVotes = 0;
                    if (r.candidate_names && r.party_results) {
                        Object.entries(r.candidate_names).forEach(([party, name]) => {
                            if (String(name).includes('RAMIREZ')) {
                                ramirezVotes += ((r.party_results as Record<string, number>)[party] || 0);
                            }
                        });
                    }
                    if (ramirezVotes === 0) ramirezVotes = r.target_votes_calculated || 0;
                    historicalTarget += ramirezVotes;
                });
            }
            if (historicalTarget === 0) historicalTarget = 1;

            // 5. Calculate Section Coverage
            const { data: coveredSections } = await supabase
                .from('supporters')
                .select('section_id')
                .or(`tenant_id.eq.${user?.tenant_id},tenant_id.is.null`);

            const uniqueCovered = new Set(coveredSections?.map(s => s.section_id)).size;

            // 6. Fetch Historical Context and Demographics
            const { data: contextData } = await supabase
                .from('historical_election_results')
                .select('party_results, winning_votes, second_place_votes, section_id, padron_total, padron_hombres, padron_mujeres, total_votes, padron_edad_rangos')
                .eq('election_year', 2024)
                .eq('election_type', histElectionType)
                .ilike('municipality', `%${municipality}%`);

            let winnerVotesTotal = 0;
            let secondVotesTotal = 0;
            let padronTotal = 0;
            let padronHombres = 0;
            let padronMujeres = 0;
            let totalVoters = 0;
            let ageGroups: Record<string, number> = {};

            // Heuristic: Identifying parties from the first record's JSONB
            let winnerParty = 'GANADOR';
            let secondParty = '2DO LUGAR';

            if (contextData && contextData.length > 0) {
                winnerVotesTotal = contextData.reduce((acc, r) => acc + (r.winning_votes || 0), 0);
                secondVotesTotal = contextData.reduce((acc, r) => acc + (r.second_place_votes || 0), 0);
                padronTotal = contextData.reduce((acc, r) => acc + (r.padron_total || 0), 0);
                padronHombres = contextData.reduce((acc, r) => acc + (r.padron_hombres || 0), 0);
                padronMujeres = contextData.reduce((acc, r) => acc + (r.padron_mujeres || 0), 0);
                totalVoters = contextData.reduce((acc, r) => acc + (r.total_votes || 0), 0);

                // Aggregate age groups
                contextData.forEach(r => {
                    if (r.padron_edad_rangos) {
                        Object.entries(r.padron_edad_rangos as Record<string, number>).forEach(([range, count]) => {
                            ageGroups[range] = (ageGroups[range] || 0) + count;
                        });
                    }
                });

                // Extract party names from the first available record with party_results
                const sample = contextData.find(r => r.party_results && Object.keys(r.party_results).length > 0);
                if (sample) {
                    const sortedParties = Object.entries(sample.party_results as Record<string, number>).sort((a, b) => b[1] - a[1]);
                    if (sortedParties[0]) winnerParty = sortedParties[0][0];
                    if (sortedParties[1]) secondParty = sortedParties[1][0];
                }
            }

            // 6.b Fetch Real Demographics from padron_electoral
            const { data: realPadronData } = await supabase
                .from('padron_electoral')
                .select('padron_total, hombres, mujeres, edad_rangos')
                .ilike('municipality', `%${municipality}%`)
                .eq('year', 2024);

            if (realPadronData && realPadronData.length > 0) {
                padronTotal = realPadronData.reduce((acc, r) => acc + (r.padron_total || 0), 0);
                padronHombres = realPadronData.reduce((acc, r) => acc + (r.hombres || 0), 0);
                padronMujeres = realPadronData.reduce((acc, r) => acc + (r.mujeres || 0), 0);

                // Clear and re-aggregate age groups from real padron data
                ageGroups = {};
                realPadronData.forEach(r => {
                    if (r.edad_rangos) {
                        Object.entries(r.edad_rangos as Record<string, number>).forEach(([range, count]) => {
                            ageGroups[range] = (ageGroups[range] || 0) + count;
                        });
                    }
                });
            }

            setMetrics({
                totalSupporters: totalSupporters || 0,
                newThisWeek: newThisWeek || 0,
                historicalTarget: historicalTarget || 1,
                lvl5Commitments: lvl5Commitments || 0,
                sectionCoverage: { total: historicalData?.length || 0, covered: uniqueCovered },
                historicalContext: {
                    winner_party: winnerParty,
                    winner_votes: winnerVotesTotal,
                    second_party: secondParty,
                    second_votes: secondVotesTotal
                },
                demographics: {
                    padron_total: padronTotal,
                    padron_hombres: padronHombres,
                    padron_mujeres: padronMujeres,
                    total_voters: totalVoters,
                    age_groups: ageGroups
                }
            });

            // 5. Fetch Leaderboard
            const { data: topUsers } = await supabase
                .from('users')
                .select('id, name, rank_name, xp, phone')
                .eq('tenant_id', user?.tenant_id)
                .order('xp', { ascending: false })
                .limit(5);

            if (topUsers) setLeaderboard(topUsers);

            // 5b. Fetch Full Team for Activismo
            const { data: teamData } = await supabase
                .from('users')
                .select('id, name, rank_name, xp, phone, role')
                .eq('tenant_id', user?.tenant_id)
                .order('name', { ascending: true });

            if (teamData) setFullTeam(teamData);

            // 6. Fetch Inactive Leaders
            // Placeholder for inactive leaders logic if needed in future
            /*
            const { data: inactive } = await supabase
                .from('users')
                .select('id, name, rank_name, last_action_date, phone')
                .eq('tenant_id', user?.tenant_id)
                .lte('last_action_date', oneWeekAgo.toISOString())
                .in('role', ['coordinador', 'lider']);

            if (inactive) setInactiveLeaders(inactive);
            */

            // 7. Fetch ROI Data (Using campaign_finances for total expenses vs recruiters)
            const { data: expenses } = await supabase
                .from('campaign_finances')
                .select('amount, category')
                .eq('tenant_id', user?.tenant_id)
                .eq('transaction_type', 'egreso');

            const { data: recruitCounts } = await supabase
                .from('supporters')
                .select('recruiter_id')
                .eq('tenant_id', user?.tenant_id)
                .not('recruiter_id', 'is', null);

            const { data: allUsers } = await supabase
                .from('users')
                .select('id, name, role')
                .eq('tenant_id', user?.tenant_id);

            if (expenses && recruitCounts && allUsers) {
                const userEfficiency: Record<string, { cost: number, recruits: number, name: string, role: string }> = {};

                allUsers.forEach(u => {
                    userEfficiency[u.id] = { cost: 0, recruits: 0, name: u.name, role: u.role };
                });

                // Calculate total campaign expenses
                const totalEgresos = expenses.reduce((sum, r) => sum + Number(r.amount), 0);

                // Distribute expenses evenly among active recruiters for a baseline ROI
                // In a perfect system, expenses would be tied to specific users, but for now we average it out 
                // to give a general Operation Cost Per Voter (CPV)

                recruitCounts.forEach((rc: any) => {
                    if (userEfficiency[rc.recruiter_id]) {
                        userEfficiency[rc.recruiter_id].recruits++;
                    }
                });

                const activeRecruitersCount = Object.values(userEfficiency).filter(u => u.recruits > 0).length || 1;
                const averageCostPerRecruiter = totalEgresos / activeRecruitersCount;

                Object.keys(userEfficiency).forEach(k => {
                    if (userEfficiency[k].recruits > 0) {
                        userEfficiency[k].cost = averageCostPerRecruiter;
                    }
                });

                const roiList = Object.values(userEfficiency)
                    .filter(u => u.cost > 0 || u.recruits > 0)
                    .map(u => ({
                        ...u,
                        roi: u.recruits > 0 ? (u.cost / u.recruits).toFixed(2) : u.cost.toFixed(2)
                    }))
                    .sort((a, b) => Number(a.roi) - Number(b.roi));

                setRoiData(roiList);
            }
        } catch (error) {
            console.error("Error fetching High Command metrics", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmittingUser(true);
        try {
            const phoneStr = newUserForm.phone.startsWith('+52') ? newUserForm.phone : `+52${newUserForm.phone}`;

            // Generar Código Táctico de 6 dígitos
            const tacticalCode = Math.floor(100000 + Math.random() * 900000).toString();

            const { error } = await supabase.from('users').insert([{
                tenant_id: user?.tenant_id,
                name: newUserForm.name,
                phone: phoneStr,
                role: newUserForm.role,
                rank_name: 'Recluta Nivel 1',
                parent_id: user?.id,
                temp_code: tacticalCode,
                is_first_login: true,
                xp: 0
            }]);

            if (error) {
                if (error.code === '23505') throw new Error("Este número de teléfono ya está registrado.");
                throw error;
            }

            alert("Operador reclutado exitosamente.");
            setIsAddingUser(false);
            setNewUserForm({ name: '', phone: '', role: 'coordinador' });
            fetchMetrics();
        } catch (error: any) {
            alert(error.message);
        } finally {
            setIsSubmittingUser(false);
        }
    };

    const handleToggleDiaD = async () => {
        if (!confirm(`¿Estás seguro de que deseas ${diaDActive ? 'DESACTIVAR' : 'ACTIVAR'} el Operativo DÍA D a nivel global? Esto afectará las pantallas de todos los usuarios en campo inmediatamente.`)) return;

        setIsTogglingDiaD(true);
        try {
            const newState = !diaDActive;
            const { error } = await supabase
                .from('tenants')
                .update({ dia_d_active: newState })
                .eq('id', user?.tenant_id);

            if (error) throw error;
            setDiaDActive(newState);
            alert(`Operativo DÍA D ${newState ? 'ACTIVADO' : 'DESACTIVADO'}.`);
        } catch (err: any) {
            alert('Error al cambiar estado del Día D: ' + err.message);
        } finally {
            setIsTogglingDiaD(false);
        }
    };

    if (loading) {
        return <div className="flex-center" style={{ padding: '2rem', color: 'var(--primary)', fontFamily: 'Oswald' }}>INICIALIZANDO C4I...</div>;
    }

    return (
        <div className={`flex-col gap-4 ${diaDActive ? 'dia-d-neon-bg' : ''}`} style={{ animation: 'fadeIn 0.5s ease-out', position: 'relative' }}>
            {diaDActive && <div className="red-alert-overlay"></div>}
            <div className="scanline"></div>

            {/* C4I HEADER */}
            <header className="tactile-card" style={{
                background: diaDActive
                    ? 'linear-gradient(135deg, rgba(30,0,0,0.95) 0%, rgba(60,0,0,0.95) 100%)'
                    : 'linear-gradient(135deg, rgba(10,15,25,0.95) 0%, rgba(20,25,35,0.95) 100%)',
                padding: '1.5rem',
                border: diaDActive ? '1px solid #EF4444' : '1px solid rgba(0, 212, 255, 0.3)',
                boxShadow: diaDActive ? '0 0 30px rgba(239,68,68,0.2)' : '0 8px 32px rgba(0,212,255,0.1)',
                position: 'relative', overflow: 'hidden'

            }}>
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundImage: 'linear-gradient(rgba(0, 212, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 212, 255, 0.05) 1px, transparent 1px)',
                    backgroundSize: '20px 20px', pointerEvents: 'none'
                }} />

                <div className="flex-row-resp" style={{ position: 'relative', zIndex: 1, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ padding: '0.8rem', background: 'rgba(0,212,255,0.1)', borderRadius: '12px', border: '1px solid var(--tertiary)' }}>
                            <Target size={28} color="var(--tertiary)" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'white', textShadow: diaDActive ? '0 0 10px #EF4444' : 'none' }}>
                                {diaDActive ? 'DÍA D: COMANDO DE ASALTO' : 'C4I STRATEGIC'}
                            </h1>
                            <p className="tactical-font" style={{ margin: 0, color: diaDActive ? '#EF4444' : 'var(--tertiary)', fontSize: '0.8rem' }}>ACCESO: {user?.role}</p>
                        </div>

                    </div>
                    {['superadmin', 'candidato', 'coordinador_campana'].includes(user?.role || '') && (
                        <button onClick={() => setIsAddingUser(true)} className="squishy-btn primary">
                            <UserPlus size={18} /> RECLUTAR
                        </button>
                    )}
                </div>

                {/* Tabs selection (Scrollable) */}
                <div className="scroll-tabs" style={{ marginTop: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    {[
                        { id: 'pulso', label: 'EL PULSO', icon: <HeartPulse size={18} /> },
                        { id: 'monitoreo', label: 'MONITOREO', icon: <Eye size={18} /> },
                        { id: 'activismo', label: 'ACTIVISMO', icon: <Shield size={18} /> },
                        { id: 'recursos', label: 'RECURSOS', icon: <DollarSign size={18} /> },
                        { id: 'futuro', label: 'FUTURO', icon: <Zap size={18} /> },
                        { id: 'gestiones', label: 'GESTIÓN SOCIAL', icon: <MessageCircle size={18} /> }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            style={{
                                background: 'transparent', border: 'none',
                                color: activeTab === tab.id ? 'var(--primary)' : '#64748B',
                                padding: '0.8rem 1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                                fontFamily: 'Oswald, sans-serif', fontSize: '0.9rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                            }}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            {/* MASTER SWITCH: BOTÓN DE PÁNICO DÍA D */}
            {['superadmin', 'candidato', 'coordinador_campana'].includes(user?.role || '') && (
                <button
                    onClick={handleToggleDiaD}
                    disabled={isTogglingDiaD}
                    className={`squishy-btn ${diaDActive ? '' : 'danger'}`}
                    style={{
                        width: '100%', padding: '1.2rem', fontSize: '1.2rem',
                        backgroundColor: diaDActive ? 'rgba(239, 68, 68, 0.1)' : '#EF4444',
                        border: diaDActive ? '2px solid #EF4444' : 'none',
                        color: diaDActive ? '#EF4444' : 'white',
                        animation: diaDActive ? 'pulse-red 2s infinite' : 'none'
                    }}
                >
                    <ShieldAlert size={24} />
                    {diaDActive ? 'OPERATIVO DÍA D ACTIVO (DESACTIVAR)' : 'ACTIVAR DÍA D GLOBAL'}
                </button>
            )}

            {/* CONTENT MODULES */}
            <main style={{ minHeight: '60vh', position: 'relative' }}>

                {activeTab === 'pulso' && (
                    <div className="responsive-grid">
                        <div className="tactile-card flex-col glow-primary" style={{ gap: '1.5rem', gridColumn: 'span 1', borderTop: '2px solid var(--primary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ color: 'var(--primary)', marginBottom: 0 }}>METAS ESTRATÉGICAS</h3>
                                <span className="tactile-badge" style={{ color: 'var(--tertiary)', textShadow: '0 0 5px var(--tertiary)' }}>{metrics.totalSupporters} / {metrics.historicalTarget}</span>
                            </div>


                            {/* Global Advance */}
                            <div className="flex-col gap-1">
                                <div className="flex-row-resp" style={{ justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                    <span style={{ color: '#94A3B8' }}>AVANCE DE SIMPATIZANTES</span>
                                    <span style={{ color: 'var(--primary)' }}>{((metrics.totalSupporters / metrics.historicalTarget) * 100).toFixed(1)}%</span>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${Math.min((metrics.totalSupporters / metrics.historicalTarget) * 100, 100)}%`, height: '100%',
                                        background: 'linear-gradient(90deg, var(--primary) 0%, #00d4ff 100%)',
                                        transition: 'width 1s ease-out'
                                    }} />
                                </div>
                            </div>

                            {/* Real Effectiveness (Lvl 5) */}
                            <div className="flex-col gap-1">
                                <div className="flex-row-resp" style={{ justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                    <span style={{ color: '#94A3B8' }}>EFECTIVIDAD REAL (NIVEL 5)</span>
                                    <span style={{ color: 'var(--tertiary)' }}>{((metrics.lvl5Commitments / metrics.historicalTarget) * 100).toFixed(1)}%</span>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                                    <div style={{
                                        width: `${Math.min((metrics.lvl5Commitments / metrics.historicalTarget) * 100, 100)}%`, height: '100%',
                                        background: 'linear-gradient(90deg, var(--tertiary) 0%, #00ff88 100%)',
                                        transition: 'width 1s ease-out'
                                    }} />
                                </div>
                            </div>

                            <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '0.5rem' }}>
                                <div style={{ background: 'rgba(0, 212, 255, 0.03)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(0, 212, 255, 0.1)' }}>
                                    <p className="tactical-font" style={{ fontSize: '0.6rem', color: '#94A3B8', margin: 0 }}>COBERTURA TERRITORIAL</p>
                                    <p style={{ fontSize: '1.4rem', margin: 0, fontFamily: 'Oswald', color: 'var(--tertiary)' }}>
                                        {metrics.sectionCoverage.covered} <span style={{ fontSize: '0.8rem', color: '#64748B' }}>/ {metrics.sectionCoverage.total} SECC</span>
                                    </p>
                                </div>
                                <div style={{ background: 'rgba(255, 90, 54, 0.03)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255, 90, 54, 0.1)' }}>
                                    <p className="tactical-font" style={{ fontSize: '0.6rem', color: '#94A3B8', margin: 0 }}>BRECHA HISTÓRICA</p>
                                    <p style={{ fontSize: '1.4rem', margin: 0, fontFamily: 'Oswald', color: 'var(--secondary)' }}>
                                        {metrics.historicalContext ? (metrics.historicalContext.winner_votes - metrics.historicalContext.second_votes).toLocaleString() : '---'}
                                        <span style={{ fontSize: '0.6rem', color: '#64748B', display: 'block' }}>VOTOS DE DIFERENCIA</span>
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* DEMOGRAPHIC ANALYSIS */}
                        <div className="tactile-card flex-col glow-secondary" style={{ gap: '1.5rem', gridColumn: 'span 1', borderTop: '2px solid var(--secondary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ color: 'var(--primary)', marginBottom: 0 }}>ANÁLISIS DEMOGRÁFICO</h3>
                                <span className="tactile-badge" style={{ color: 'var(--primary)', textShadow: '0 0 5px var(--primary)' }}>PADRÓN: {metrics.demographics.padron_total.toLocaleString()}</span>
                            </div>


                            {/* Gender Distribution and Turnout */}
                            <div className="flex-col gap-2">
                                <div className="flex-row-resp" style={{ justifyContent: 'space-between', fontSize: '0.7rem', color: '#94A3B8' }}>
                                    <span>DISTRIBUCIÓN DE GÉNERO</span>
                                    <span>{metrics.demographics.padron_hombres.toLocaleString()} H | {metrics.demographics.padron_mujeres.toLocaleString()} M</span>
                                </div>
                                <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', height: '24px', borderRadius: '12px', overflow: 'hidden', display: 'flex' }}>
                                    <div style={{
                                        width: `${(metrics.demographics.padron_hombres / (metrics.demographics.padron_total || 1)) * 100}%`, height: '100%',
                                        background: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'white', fontWeight: 'bold'
                                    }}>
                                        {((metrics.demographics.padron_hombres / (metrics.demographics.padron_total || 1)) * 100).toFixed(0)}% H
                                    </div>
                                    <div style={{
                                        width: `${(metrics.demographics.padron_mujeres / (metrics.demographics.padron_total || 1)) * 100}%`, height: '100%',
                                        background: '#EC4899', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'white', fontWeight: 'bold'
                                    }}>
                                        {((metrics.demographics.padron_mujeres / (metrics.demographics.padron_total || 1)) * 100).toFixed(0)}% M
                                    </div>
                                </div>
                                <div style={{
                                    marginTop: '0.5rem',
                                    padding: '0.8rem',
                                    background: 'rgba(16, 185, 129, 0.05)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(16, 185, 129, 0.2)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ fontSize: '0.7rem', color: '#6EE7B7', fontWeight: 'bold' }}>PARTICIPACIÓN HISTÓRICA (2024):</span>
                                    <span style={{ fontSize: '1.2rem', fontFamily: 'Oswald', color: '#10B981' }}>{metrics.demographics.total_voters.toLocaleString()} VOTOS</span>
                                </div>
                            </div>

                            {/* Age Groups Analysis */}
                            <div className="flex-col gap-2">
                                <p className="tactical-font" style={{ fontSize: '0.6rem', color: '#94A3B8', margin: 0 }}>RANGOS DE EDAD ESTRATÉGICOS</p>
                                <div className="flex-col gap-1">
                                    {Object.entries(metrics.demographics.age_groups)
                                        .sort((a, b) => b[1] - a[1])
                                        .slice(0, 4)
                                        .map(([range, count], idx) => (
                                            <div key={idx} className="flex-col gap-1">
                                                <div className="flex-row-resp" style={{ justifyContent: 'space-between', fontSize: '0.6rem' }}>
                                                    <span style={{ color: '#E2E8F0' }}>{range}</span>
                                                    <span style={{ color: 'var(--tertiary)' }}>{count.toLocaleString()}</span>
                                                </div>
                                                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{
                                                        width: `${(count / (metrics.demographics.padron_total || 1)) * 100 * 5}%`, // Scaled for visibility
                                                        height: '100%', background: 'var(--tertiary)', opacity: 0.8
                                                    }} />
                                                </div>
                                            </div>
                                        ))}
                                    {Object.keys(metrics.demographics.age_groups).length === 0 && (
                                        <p style={{ fontSize: '0.7rem', color: '#64748B', textAlign: 'center', padding: '1rem' }}>
                                            No hay datos de edad disponibles para este territorio.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="tactile-card glow-tertiary" style={{ gridColumn: 'span 2', borderTop: '2px solid var(--tertiary)' }}>
                            <C4IPollManager />
                        </div>

                    </div>
                )}

                {activeTab === 'monitoreo' && (
                    <div className="flex-col gap-4">
                        <div className="responsive-grid">
                            <div className="tactile-card glow-secondary" style={{ borderLeft: '4px solid var(--secondary)' }}>
                                <p className="tactical-font" style={{ color: 'var(--secondary)', fontSize: '0.8rem' }}>POSITIVO</p>
                                <p style={{ fontSize: '2.5rem', fontFamily: 'Oswald', textShadow: '0 0 10px var(--secondary)' }}>68%</p>
                            </div>
                            <div className="tactile-card" style={{ borderLeft: '4px solid #64748B' }}>
                                <p className="tactical-font" style={{ color: '#64748B', fontSize: '0.8rem' }}>NEUTRO</p>
                                <p style={{ fontSize: '2.5rem', fontFamily: 'Oswald' }}>20%</p>
                            </div>
                            <div className="tactile-card glow-primary" style={{ borderLeft: '4px solid var(--primary)' }}>
                                <p className="tactical-font" style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>NEGATIVO</p>
                                <p style={{ fontSize: '2.5rem', fontFamily: 'Oswald', textShadow: '0 0 10px var(--primary)' }}>12%</p>
                            </div>

                        </div>
                        <div className="tactile-card flex-col flex-center glow-tertiary" style={{ minHeight: '300px', textAlign: 'center', border: '1px solid var(--tertiary)' }}>
                            <ActivityIcon size={48} className="spin" color="var(--tertiary)" style={{ opacity: 0.8, marginBottom: '1rem' }} />
                            <h3 style={{ textShadow: '0 0 10px var(--tertiary)' }}>RADAR DE REPUTACIÓN</h3>
                            <p style={{ maxWidth: '500px', color: '#ccc' }}>
                                Escaneo de redes sociales y portales de noticias en tiempo real. Algoritmo de sentimiento Bayesiano activo.
                            </p>
                        </div>

                    </div>
                )}

                {activeTab === 'activismo' && (
                    <div className="responsive-grid" style={{ gridTemplateColumns: '1fr' }}>
                        <div className="tactile-card glow-secondary">
                            <h3 className="flex-row-resp" style={{ justifyContent: 'space-between' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textShadow: '0 0 8px gold' }}><Trophy size={20} color="gold" /> TOP OPERADORES</span>
                            </h3>

                            <div className="flex-col gap-2" style={{ marginTop: '1rem' }}>
                                {leaderboard.map((lider: any) => (
                                    <div key={lider.id} className="flex-row-resp" style={{ justifyContent: 'space-between', padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', alignItems: 'center' }}>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ margin: 0, fontWeight: 'bold' }}>{lider.name}</p>
                                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--tertiary)' }}>{lider.rank_name}</p>
                                        </div>
                                        <div className="flex-row-resp" style={{ gap: '0.8rem', alignItems: 'center' }}>
                                            <p style={{ fontFamily: 'Oswald', fontSize: '1.2rem', margin: 0, marginRight: '1rem' }}>{lider.xp} XP</p>
                                            <a href={`tel:${lider.phone}`} className="squishy-btn mini" style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--tertiary)' }}>
                                                <PhoneCall size={16} />
                                            </a>
                                            <a
                                                href={`https://wa.me/${lider.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${lider.name}, ¿cómo va el avance de hoy?`)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="squishy-btn mini"
                                                style={{ background: 'rgba(37, 211, 102, 0.1)', color: '#25D366' }}
                                            >
                                                <MessageCircle size={16} />
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* FULL STRATEGIC TEAM */}
                        <div className="tactile-card flex-col gap-4 glow-primary">
                            <h3 className="tactical-font" style={{ color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', textShadow: '0 0 8px var(--primary)' }}>// EQUIPO ESTRATÉGICO INTEGRAL</h3>

                            <div className="flex-col gap-2">
                                {fullTeam.length === 0 ? <p style={{ color: '#64748B', textAlign: 'center' }}>No hay operadores registrados aún.</p> : fullTeam.map((member) => (
                                    <div key={member.id} className="flex-row-resp" style={{ justifyContent: 'space-between', padding: '0.8rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', alignItems: 'center', borderLeft: member.role === 'coordinador_campana' ? '3px solid var(--secondary)' : '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{ fontWeight: 'bold' }}>{member.name}</span>
                                                <span style={{ fontSize: '0.6rem', padding: '2px 4px', borderRadius: '4px', background: 'rgba(0,212,255,0.1)', color: 'var(--tertiary)' }}>{member.role.toUpperCase()}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}>{member.phone || 'Sin teléfono'}</p>
                                        </div>
                                        <div className="flex-row-resp" style={{ gap: '0.5rem' }}>
                                            <a href={`tel:${member.phone}`} className="squishy-btn mini" style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--tertiary)', padding: '0.4rem' }}>
                                                <PhoneCall size={14} />
                                            </a>
                                            <a
                                                href={`https://wa.me/${member.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${member.name}, contacto del Comando Central.`)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="squishy-btn mini"
                                                style={{ background: 'rgba(37, 211, 102, 0.1)', color: '#25D366', padding: '0.4rem' }}
                                            >
                                                <MessageCircle size={14} />
                                            </a>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'recursos' && (
                    <div className="flex-col gap-4">
                        <div className="tactile-card glow-tertiary" style={{ overflowX: 'auto', borderTop: '2px solid var(--tertiary)' }}>
                            <h3 style={{ textShadow: '0 0 10px var(--tertiary)' }}>EFICIENCIA DE RECURSOS (ROI)</h3>

                            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#64748B' }}>
                                        <th style={{ padding: '0.5rem' }}>OPERADOR</th>
                                        <th style={{ padding: '0.5rem' }}>INVERSIÓN</th>
                                        <th style={{ padding: '0.5rem' }}>RECLUTAS</th>
                                        <th style={{ padding: '0.5rem' }}>ROI (CPV)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {roiData.map((item: any, idx: number) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <td style={{ padding: '0.8rem 0.5rem' }}>{item.name}</td>
                                            <td style={{ padding: '0.5rem' }}>${Number(item.cost).toLocaleString()}</td>
                                            <td style={{ padding: '0.5rem' }}>{item.recruits}</td>
                                            <td style={{ padding: '0.5rem', color: Number(item.roi) < 50 ? 'var(--secondary)' : 'var(--primary)' }}>${item.roi}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <C4IFinanceManager />
                    </div>
                )}

                {activeTab === 'futuro' && (
                    <div className="tactile-card">
                        <C4IPredictiveOracle />
                    </div>
                )}

                {activeTab === 'gestiones' && (
                    <div className="tactile-card">
                        <PetitionsManager />
                    </div>
                )}
            </main>

            {/* MODAL RECLUTAMIENTO */}
            {isAddingUser && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '1rem' }}>
                    <div className="tactile-card" style={{ width: '100%', maxWidth: '450px', border: '1px solid var(--primary)' }}>
                        <div className="flex-row-resp" style={{ justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                            <h3 style={{ margin: 0 }}>RECLUTAR OPERADOR</h3>
                            <X size={24} style={{ cursor: 'pointer' }} onClick={() => setIsAddingUser(false)} />
                        </div>
                        <form onSubmit={handleAddUser} className="flex-col gap-4">
                            <input
                                placeholder="Nombre Completo"
                                value={newUserForm.name}
                                onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                                className="squishy-input"
                                required
                            />
                            <input
                                placeholder="Teléfono (10 dígitos)"
                                value={newUserForm.phone}
                                onChange={e => setNewUserForm({ ...newUserForm, phone: e.target.value.replace(/\D/g, '') })}
                                className="squishy-input"
                                maxLength={10}
                                required
                            />
                            <select
                                value={newUserForm.role}
                                onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })}
                                className="squishy-input"
                                style={{ background: '#0F1218' }}
                            >
                                <option value="coordinador">Coordinador</option>
                                <option value="lider">Líder</option>
                                <option value="brigadista">Brigadista</option>
                                {['superadmin', 'candidato'].includes(user?.role || '') && (
                                    <>
                                        <option value="coordinador_campana">Coordinador de Campaña</option>
                                        <option value="comunicacion_digital">Comando Digital</option>
                                        <option value="coordinador_logistica">Logística</option>
                                    </>
                                )}
                            </select>
                            <button type="submit" disabled={isSubmittingUser} className="squishy-btn primary">
                                {isSubmittingUser ? 'RECLUTANDO...' : 'CONFIRMAR'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
