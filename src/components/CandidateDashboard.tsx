import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { C4IFinanceManager } from './C4IFinanceManager';
import { SecuritySettings } from './SecuritySettings';

import {
    Activity, TrendingUp, Users, DollarSign, BrainCircuit, MessageSquare,
    BarChart2, Globe, ShieldCheck
} from 'lucide-react';
import {
    ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    AreaChart, Area, PieChart as RechartsPieChart, Pie, Cell, BarChart, Bar
} from 'recharts';

export const CandidateDashboard = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'pulso' | 'monitoreo' | 'activismo' | 'finanzas' | 'predicciones' | 'seguridad'>('pulso');

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        meta: 0,
        brecha: 0,
        cobertura: 0,
        penetracion: 0,
        convencidos: 0,
        padronTotal: 0,
        totalSecciones: 0,
        seccionesConSimpatizantes: 0
    });
    const [tenantInfo, setTenantInfo] = useState<any>(null);
    const [realSentiment, setRealSentiment] = useState<any[]>([]);


    // Process Historical Real Data for Charts
    const [historicalComparison, setHistoricalComparison] = useState<any[]>([]);

    // Process Demographics Data
    const [demographicsData, setDemographicsData] = useState<any[]>([
        { age: '18-24', nosotros: 0, oponenteA: 0 },
        { age: '25-34', nosotros: 0, oponenteA: 0 },
        { age: '35-44', nosotros: 0, oponenteA: 0 },
        { age: '45-54', nosotros: 0, oponenteA: 0 },
        { age: '55+', nosotros: 0, oponenteA: 0 },
    ]);

    useEffect(() => {
        loadC4IData();
    }, [user]);

    const loadC4IData = async () => {
        if (!user?.tenant_id) return;
        setLoading(true);
        try {
            const { data: tenant } = await supabase.from('tenants').select('*').eq('id', user.tenant_id).single();
            if (tenant) setTenantInfo(tenant);

            // Force target query to always use Gubernatura 2024 to get Eduardo Ramirez's votes
            const histElectionType = 'gubernatura';

            const { data: results } = await supabase
                .from('historical_election_results')
                .select('*')
                .eq('election_year', 2024)
                .eq('election_type', histElectionType)
                .ilike('municipality', `%${tenant?.geographic_scope || 'TUXTLA GUTIERREZ'}%`);

            const { data: padron } = await supabase
                .from('padron_electoral')
                .select('*')
                .ilike('municipality', `%${tenant?.geographic_scope || 'TUXTLA GUTIERREZ'}%`)
                .eq('year', 2024);

            const { data: supporters } = await supabase
                .from('supporters')
                .select('id, section_id, curp, birth_date')
                .or(`tenant_id.eq.${user.tenant_id},tenant_id.is.null`)
                .eq('commitment_level', 5);

            if (results && results.length > 0) {
                // Aggregate Party Totals for the whole scope
                const partyTotals: Record<string, number> = {};
                const nameMapping: Record<string, string> = {};

                results.forEach(r => {
                    const partyResults = r.party_results as Record<string, number>;
                    const candidateNames = r.candidate_names as Record<string, string>;
                    Object.entries(partyResults || {}).forEach(([party, votes]) => {
                        partyTotals[party] = (partyTotals[party] || 0) + votes;
                        if (candidateNames?.[party]) nameMapping[party] = candidateNames[party];
                    });
                });

                const chartData = Object.entries(partyTotals)
                    .map(([party, votes]) => ({
                        name: nameMapping[party] || party,
                        votos: votes,
                        fullPartyName: party
                    }))
                    .sort((a, b) => b.votos - a.votos)
                    .slice(0, 5); // Top 5

                setHistoricalComparison(chartData);

                let totalTarget = 0;
                let totalWinning = 0;

                results.forEach((r: any) => {
                    let ramirezVotes = 0;
                    if (r.candidate_names && r.party_results) {
                        Object.entries(r.candidate_names).forEach(([party, name]) => {
                            if (String(name).includes('RAMIREZ')) {
                                ramirezVotes += ((r.party_results as Record<string, number>)[party] || 0);
                            }
                        });
                    }
                    if (ramirezVotes === 0) ramirezVotes = r.target_votes_calculated || 0;
                    totalTarget += ramirezVotes;
                    totalWinning += (r.winning_votes || 0);
                });

                const totalPadron = padron?.reduce((acc, p) => acc + (p.padron_total || 0), 0) || 0;

                const uniqueSecciones = new Set(results.map(r => r.section_id));
                const uniqueSupporterSecciones = new Set(supporters?.map(s => s.section_id) || []);

                setStats({
                    meta: totalTarget,
                    brecha: totalTarget - totalWinning,
                    cobertura: uniqueSecciones.size > 0 ? (uniqueSupporterSecciones.size / uniqueSecciones.size) * 100 : 0,
                    penetracion: totalPadron > 0 ? ((supporters?.length || 0) / totalPadron) * 100 : 0,
                    convencidos: supporters?.length || 0,
                    padronTotal: totalPadron,
                    totalSecciones: uniqueSecciones.size,
                    seccionesConSimpatizantes: uniqueSupporterSecciones.size
                });
            }

            // Fetch Real Sentiment from social_inbox
            const { data: inboxData } = await supabase
                .from('social_inbox')
                .select('sentiment')
                .eq('tenant_id', user.tenant_id);

            if (inboxData) {
                const counts = inboxData.reduce((acc: any, curr: any) => {
                    const s = curr.sentiment || 'neutro';
                    acc[s] = (acc[s] || 0) + 1;
                    return acc;
                }, { positivo: 0, neutro: 0, negativo: 0 });

                const total = inboxData.length || 1;
                setRealSentiment([
                    { name: 'Positivo', value: Math.round((counts.positivo / total) * 100), color: '#10B981' },
                    { name: 'Neutro', value: Math.round((counts.neutro / total) * 100), color: '#64748B' },
                    { name: 'Negativo', value: Math.round((counts.negativo / total) * 100), color: '#EF4444' }
                ]);
            }

            // Calculate Demographics
            let ageGroupsPadron: Record<string, number> = { '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
            if (padron) {
                padron.forEach((p: any) => {
                    if (p.edad_rangos) {
                        Object.entries(p.edad_rangos as Record<string, number>).forEach(([range, count]) => {
                            if (ageGroupsPadron[range] !== undefined) {
                                ageGroupsPadron[range] += count;
                            } else if (range === '65 y más' || Object.keys(ageGroupsPadron).some(k => range.includes(k.split('-')[0]) && k !== '55+')) {
                                // Fallback mapping if detailed, group into 55+ if doesn't fit standard
                                ageGroupsPadron['55+'] += count;
                            }
                        });
                    }
                });
            }

            let ageGroupsSupporters: Record<string, number> = { '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55+': 0 };
            const currentYear = new Date().getFullYear();

            supporters?.forEach(s => {
                let age = 0;
                if (s.birth_date) {
                    age = currentYear - new Date(s.birth_date).getFullYear();
                } else if (s.curp && s.curp.length >= 10) {
                    const yearStr = s.curp.substring(4, 6);
                    let year = parseInt(yearStr);
                    // Heuristic: CURP year < 24 implies 2000s, else 1900s
                    year += year < 25 ? 2000 : 1900;
                    age = currentYear - year;
                }

                if (age >= 18 && age <= 24) ageGroupsSupporters['18-24']++;
                else if (age >= 25 && age <= 34) ageGroupsSupporters['25-34']++;
                else if (age >= 35 && age <= 44) ageGroupsSupporters['35-44']++;
                else if (age >= 45 && age <= 54) ageGroupsSupporters['45-54']++;
                else if (age >= 55) ageGroupsSupporters['55+']++;
            });

            const processedDemoData = [
                { age: '18-24', nosotros: ageGroupsSupporters['18-24'], oponenteA: Math.max(0, ageGroupsPadron['18-24'] - ageGroupsSupporters['18-24']) },
                { age: '25-34', nosotros: ageGroupsSupporters['25-34'], oponenteA: Math.max(0, ageGroupsPadron['25-34'] - ageGroupsSupporters['25-34']) },
                { age: '35-44', nosotros: ageGroupsSupporters['35-44'], oponenteA: Math.max(0, ageGroupsPadron['35-44'] - ageGroupsSupporters['35-44']) },
                { age: '45-54', nosotros: ageGroupsSupporters['45-54'], oponenteA: Math.max(0, ageGroupsPadron['45-54'] - ageGroupsSupporters['45-54']) },
                { age: '55+', nosotros: ageGroupsSupporters['55+'], oponenteA: Math.max(0, ageGroupsPadron['55+'] - ageGroupsSupporters['55+']) },
            ];

            setDemographicsData(processedDemoData);

        } catch (error) {
            console.error("Error loading C4I Data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Keep mock data for others for now
    const intentionData = [
        { date: '1 Feb', nosotros: 32, oponenteA: 28, oponenteB: 15, indecisos: 25 },
        { date: '8 Feb', nosotros: 34, oponenteA: 27, oponenteB: 14, indecisos: 25 },
        { date: '15 Feb', nosotros: 36, oponenteA: 29, oponenteB: 12, indecisos: 23 },
        { date: '22 Feb', nosotros: 39, oponenteA: 28, oponenteB: 11, indecisos: 22 },
        { date: '1 Mar', nosotros: 42, oponenteA: 26, oponenteB: 10, indecisos: 22 },
    ];

    const sentimentData = realSentiment.length > 0 ? realSentiment : [
        { name: 'Positivo', value: 65, color: '#10B981' },
        { name: 'Neutro', value: 20, color: '#64748B' },
        { name: 'Negativo', value: 15, color: '#EF4444' }
    ];




    // Removed mock financeData

    if (loading) {
        return (
            <div className="flex-center flex-col" style={{ height: '80vh', gap: '1rem' }}>
                <Activity className="spin" size={48} color="var(--tertiary)" />
                <p style={{ color: '#888', fontFamily: 'Oswald' }}>SINCRONIZANDO INTELIGENCIA ELECTORAL...</p>
            </div>
        );
    }

    return (
        <div className="flex-col gap-2" style={{ paddingBottom: '5rem' }}>
            {/* Header */}
            <div style={{ padding: '1rem', backgroundColor: 'rgba(15,18,24,0.8)', borderBottom: '1px solid rgba(0,212,255,0.2)', marginBottom: '1rem' }}>
                <h1 style={{ fontFamily: 'Oswald', color: 'white', margin: 0, fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <ShieldCheck color="var(--tertiary)" size={28} />
                    C4I: {tenantInfo?.name || 'CENTRO DE COMANDO'}
                </h1>
                <p style={{ color: '#888', margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>Vista Ejecutiva: {tenantInfo?.geographic_scope || 'Jurisdicción Local'}</p>
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0 1rem', paddingBottom: '0.5rem', scrollbarWidth: 'none' }}>
                <TabButton active={activeTab === 'pulso'} onClick={() => setActiveTab('pulso')} icon={<Activity size={18} />} label="El Pulso" />
                <TabButton active={activeTab === 'monitoreo'} onClick={() => setActiveTab('monitoreo')} icon={<Globe size={18} />} label="Monitoreo" />
                <TabButton active={activeTab === 'activismo'} onClick={() => setActiveTab('activismo')} icon={<Users size={18} />} label="Activismo" />
                <TabButton active={activeTab === 'finanzas'} onClick={() => setActiveTab('finanzas')} icon={<DollarSign size={18} />} label="Recursos" />
                <TabButton active={activeTab === 'predicciones'} onClick={() => setActiveTab('predicciones')} icon={<BrainCircuit size={18} />} label="Futuro" />
                <TabButton active={activeTab === 'seguridad'} onClick={() => setActiveTab('seguridad')} icon={<ShieldCheck size={18} />} label="Seguridad" />

            </div>

            {/* Dashboard Content Container */}
            <div style={{ padding: '0 1rem', position: 'relative' }}>
                <div className="scanline"></div>
                {activeTab === 'pulso' && <PulsoModule data={intentionData} stats={stats} historicalComparison={historicalComparison} />}
                {activeTab === 'monitoreo' && <MonitoreoModule sentimentData={sentimentData} />}
                {activeTab === 'activismo' && <ActivismoModule demoData={demographicsData} stats={stats} />}
                {activeTab === 'finanzas' && <C4IFinanceManager />}
                {activeTab === 'predicciones' && <PrediccionesModule data={intentionData} stats={stats} />}
                {activeTab === 'seguridad' && <SecuritySettings />}

            </div>

        </div>
    );
};

// --- Sub-Modules ---

const TabButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
    <button
        onClick={onClick}
        style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.6rem 1.2rem',
            backgroundColor: active ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${active ? 'var(--tertiary)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '8px',
            color: active ? 'var(--tertiary)' : '#888',
            fontFamily: 'Oswald',
            whiteSpace: 'nowrap',
            transition: 'all 0.2s',
            cursor: 'pointer'
        }}
    >
        {icon} {label}
    </button>
);

const PulsoModule = ({ data, stats, historicalComparison }: { data: any[], stats: any, historicalComparison: any[] }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Tactical Metric Cards */}
        <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div className="tactile-card flex-col flex-center glow-tertiary" style={{ borderLeft: '4px solid var(--tertiary)' }}>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#888' }}>META ELECTORAL</p>
                <p style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'Oswald', color: 'var(--tertiary)' }}>{stats.meta.toLocaleString()}</p>
                <p style={{ margin: 0, fontSize: '0.6rem', color: '#64748B' }}>Votos Calculados</p>
            </div>
            <div className="tactile-card flex-col flex-center glow-primary" style={{ borderLeft: '4px solid var(--primary)' }}>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#888' }}>BRECHA HISTÓRICA</p>
                <p style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'Oswald', color: 'var(--primary)' }}>+{stats.brecha.toLocaleString()}</p>
                <p style={{ margin: 0, fontSize: '0.6rem', color: '#64748B' }}>vs Ganador Anterior</p>
            </div>
            <div className="tactile-card flex-col flex-center glow-secondary" style={{ borderLeft: '4px solid var(--secondary)' }}>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#888' }}>COBERTURA SECCIONAL</p>
                <p style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'Oswald', color: 'var(--secondary)' }}>{stats.cobertura.toFixed(1)}%</p>
                <p style={{ margin: 0, fontSize: '0.6rem', color: '#64748B' }}>{stats.seccionesConSimpatizantes}/{stats.totalSecciones} Secciones</p>
            </div>
            <div className="tactile-card flex-col flex-center glow-success" style={{ borderLeft: '4px solid #10B981', background: 'rgba(16, 185, 129, 0.05)' }}>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#888' }}>PENETRACIÓN REAL</p>
                <p style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'Oswald', color: '#10B981' }}>{stats.penetracion.toFixed(2)}%</p>
                <p style={{ margin: 0, fontSize: '0.6rem', color: '#64748B' }}>Convencidos / Padrón</p>
            </div>

        </div>

        <DashboardCard title="Intención de Voto (Tracking Diario)" icon={<TrendingUp />} glowColor="var(--tertiary)">

            <div style={{ height: '300px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis dataKey="date" stroke="#888" />
                        <YAxis stroke="#888" />
                        <Tooltip contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid var(--tertiary)' }} />
                        <Legend />
                        <Line type="monotone" dataKey="nosotros" stroke="var(--tertiary)" strokeWidth={3} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="opponenteA" stroke="#EF4444" strokeWidth={2} />
                        <Line type="monotone" dataKey="indecisos" stroke="#64748B" strokeDasharray="5 5" />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </DashboardCard>

        {historicalComparison && historicalComparison.length > 0 && (
            <DashboardCard title="Distribución Real de Votos 2024" icon={<BarChart2 />} glowColor="var(--tertiary)">

                <div style={{ height: '300px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={historicalComparison} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="name" stroke="#888" fontSize={10} interval={0} angle={-15} textAnchor="end" />
                            <YAxis stroke="#888" />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid var(--tertiary)' }}
                                formatter={(value: any) => [value?.toLocaleString() + ' votos', 'Votación']}
                            />
                            <Bar dataKey="votos" fill="var(--tertiary)" radius={[4, 4, 0, 0]}>
                                {historicalComparison.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--tertiary)' : 'rgba(255,255,255,0.1)'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </DashboardCard>
        )}
    </div>
);

const MonitoreoModule = ({ sentimentData }: { sentimentData: any[] }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <DashboardCard title="Sentimiento de Redes (Real)" icon={<MessageSquare />} glowColor="var(--secondary)">

                <div style={{ height: '250px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <RechartsPieChart>
                            <Pie data={sentimentData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                {sentimentData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#1A1D24', border: 'none' }} />
                            <Legend />
                        </RechartsPieChart>
                    </ResponsiveContainer>
                </div>
            </DashboardCard>
            <DashboardCard title="Temas Candentes (Keywords)" icon={<Globe />} glowColor="var(--primary)">

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '1rem' }}>
                    {['#Seguridad', 'Economía Local', 'Corrupción', '#Debate2026', 'Transporte', 'Agua Potable'].map((tag, i) => (
                        <span key={i} style={{
                            padding: '0.4rem 0.8rem',
                            backgroundColor: i < 2 ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                            color: i < 2 ? 'var(--tertiary)' : '#ccc',
                            borderRadius: '16px', fontSize: '0.85rem'
                        }}>
                            {tag}
                        </span>
                    ))}
                </div>
            </DashboardCard>
        </div>
    </div>
);

const ActivismoModule = ({ demoData, stats }: { demoData: any[], stats: any }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            <DashboardCard title="Demografía de Base Convencida" icon={<BarChart2 />} glowColor="var(--tertiary)">

                <div style={{ height: '300px', width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={demoData} margin={{ top: 20, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="age" stroke="#888" />
                            <YAxis stroke="#888" />
                            <Tooltip contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid var(--tertiary)' }} />
                            <Legend />
                            <Bar dataKey="nosotros" fill="var(--tertiary)" radius={[4, 4, 0, 0]} />
                            <Bar dataKey="oponenteA" fill="#EF4444" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </DashboardCard>

            <DashboardCard title="Audit de Cobertura Territorial" icon={<Globe />} glowColor="var(--secondary)">

                <div className="flex-col gap-4" style={{ height: '300px', justifyContent: 'center' }}>
                    <div className="flex-col flex-center">
                        <p style={{ margin: 0, fontSize: '3rem', color: 'var(--secondary)', fontFamily: 'Oswald' }}>
                            {stats.seccionesConSimpatizantes}
                        </p>
                        <p style={{ margin: 0, color: '#888' }}>Secciones con Presencia</p>
                        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginTop: '1rem' }}>
                            <div style={{ width: `${stats.cobertura}%`, height: '100%', background: 'var(--secondary)', borderRadius: '4px' }} />
                        </div>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'var(--secondary)' }}>{stats.cobertura.toFixed(1)}% de Cobertura Total</p>
                    </div>
                </div>
            </DashboardCard>
        </div>
    </div>
);

// FinanzasModule removed in favor of C4IFinanceManager

const PrediccionesModule = ({ data, stats }: { data: any[], stats: any }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <DashboardCard title="Modelo Predictivo: Simulación Día D" icon={<BrainCircuit />} glowColor="var(--tertiary)">

            <div style={{ height: '300px', width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorNosotros" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="var(--tertiary)" stopOpacity={0.8} />
                                <stop offset="95%" stopColor="var(--tertiary)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="date" stroke="#888" />
                        <YAxis stroke="#888" />
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <Tooltip contentStyle={{ backgroundColor: '#1A1D24', border: '1px solid var(--tertiary)' }} />
                        <Area type="monotone" dataKey="nosotros" stroke="var(--tertiary)" fillOpacity={1} fill="url(#colorNosotros)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10B981', borderRadius: '8px', marginTop: '1rem' }}>
                <h4 style={{ color: '#10B981', margin: '0 0 0.5rem 0' }}>Conclusión de la IA Algorítmica</h4>
                <p style={{ color: '#ccc', fontSize: '0.9rem', margin: 0 }}>
                    Basado en {stats.convencidos} convencidos registrados sobre un padrón de {stats.padronTotal.toLocaleString()} ({stats.penetracion.toFixed(2)}% penetración).
                    Para alcanzar la meta de <strong>{stats.meta.toLocaleString()}</strong> votos, se requiere acelerar el reclutamiento en las {stats.totalSecciones - stats.seccionesConSimpatizantes} secciones sin cobertura.
                </p>
            </div>
        </DashboardCard>
    </div>
);

// --- Shared Components ---

const DashboardCard = ({ title, icon, children, glowColor }: { title: string, icon: React.ReactNode, children: React.ReactNode, glowColor?: string }) => (
    <div className="tactile-card" style={{
        padding: '1.2rem',
        backgroundColor: 'rgba(20,25,35,0.7)',
        border: '1px solid rgba(255,255,255,0.05)',
        boxShadow: glowColor ? `0 0 15px ${glowColor}15` : 'none',
        position: 'relative',
        overflow: 'hidden'
    }}>
        <h3 style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            margin: '0 0 1rem 0', fontFamily: 'Oswald', color: 'white',
            fontSize: '1.2rem',
            textShadow: glowColor ? `0 0 8px ${glowColor}80` : 'none'
        }}>
            {icon} {title}
        </h3>
        {children}
    </div>
);

