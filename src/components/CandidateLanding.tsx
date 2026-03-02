import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Users, AlertTriangle, Map, ChevronRight, Activity } from 'lucide-react';

export const CandidateLanding = () => {
    const { slug } = useParams<{ slug: string }>();
    const navigate = useNavigate();
    const [tenant, setTenant] = useState<any>(null);
    const [candidate, setCandidate] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ supports: 0, petitions: 0, resolved: 0 });

    useEffect(() => {
        fetchLandingData();
    }, [slug]);

    const fetchLandingData = async () => {
        if (!slug) return;
        setLoading(true);
        try {
            // 1. Encontrar el tenant por slug
            const { data: tenantData, error: tenantError } = await supabase
                .from('tenants')
                .select('*')
                .eq('slug', slug)
                .single();

            if (tenantError || !tenantData) {
                console.error("Tenant not found for slug:", slug);
                setLoading(false);
                return;
            }

            setTenant(tenantData);

            // 2. Encontrar al candidato (owner o role=candidato)
            const { data: candidateData } = await supabase
                .from('users')
                .select('name, photo_url, role')
                .eq('tenant_id', tenantData.id)
                .eq('role', 'candidato')
                .maybeSingle();

            setCandidate(candidateData);

            // 3. Obtener estadísticas básicas
            const { count: supportsCount } = await supabase
                .from('supporters')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantData.id);

            // Asumimos que 'petitions' ya existe o fallará silenciosamente
            const { count: petitionsCount } = await supabase
                .from('petitions')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantData.id);

            const { count: resolvedCount } = await supabase
                .from('petitions')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantData.id)
                .eq('status', 'resuelto');

            setStats({
                supports: supportsCount || 0,
                petitions: petitionsCount || 0,
                resolved: resolvedCount || 0
            });

        } catch (e) {
            console.error("Error loading landing:", e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-center flex-col" style={{ height: '100vh', background: 'var(--bg-color)' }}>
                <div className="pulsate" style={{ fontSize: '2rem', color: 'var(--primary)', fontFamily: 'Oswald' }}>NEMIA</div>
                <p style={{ color: '#888' }}>Cargando plataforma social...</p>
            </div>
        );
    }

    if (!tenant) {
        return (
            <div className="flex-center flex-col" style={{ height: '100vh', background: 'var(--bg-color)', padding: '2rem', textAlign: 'center' }}>
                <AlertTriangle size={64} color="var(--primary)" />
                <h1 style={{ fontFamily: 'Oswald', color: 'white' }}>PLATAFORMA NO ENCONTRADA</h1>
                <p style={{ color: '#888' }}>El enlace que seguiste no pertenece a ningún candidato activo en NEMIA.</p>
                <button onClick={() => navigate('/login')} className="squishy-btn primary" style={{ marginTop: '1rem' }}>IR AL PORTAL NEMIA</button>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-color)', color: 'white', paddingBottom: '4rem' }}>
            {/* HEROS SECTION */}
            <div style={{
                background: 'linear-gradient(180deg, rgba(255, 90, 54, 0.1) 0%, rgba(10, 15, 25, 0) 100%)',
                padding: '4rem 2rem 2rem',
                textAlign: 'center',
                borderBottom: '1px solid rgba(255, 90, 54, 0.2)'
            }}>
                <div style={{
                    fontSize: '0.9rem',
                    color: 'var(--primary)',
                    fontFamily: 'Oswald',
                    letterSpacing: '0.2em',
                    marginBottom: '1rem'
                }}>BIENVENIDO A NEMIA</div>

                <h1 style={{ fontFamily: 'Oswald', fontSize: '3rem', margin: '0 0 0.5rem 0', textTransform: 'uppercase' }}>
                    {candidate?.name || tenant.name}
                </h1>
                <p style={{ color: '#94A3B8', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto 2rem' }}>
                    Transformando {tenant.geographic_scope} con gestión social transparente y participación ciudadana.
                </p>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <Link to={`/sumate?t=${tenant.id}`} className="squishy-btn primary" style={{ padding: '1rem 2rem', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Users size={20} /> SUMARME AL PROYECTO
                    </Link>
                </div>
            </div>

            {/* QUICK ACTIONS */}
            <div style={{ padding: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>

                <div className="tactile-card" style={{ border: '1px solid rgba(0, 212, 255, 0.2)', cursor: 'pointer' }} onClick={() => navigate(`/reportar?t=${tenant.id}`)}>
                    <div style={{ color: 'var(--tertiary)', marginBottom: '1rem' }}><Map size={32} /></div>
                    <h3 style={{ fontFamily: 'Oswald', margin: '0 0 0.5rem 0' }}>REPORTAR DEMANDA</h3>
                    <p style={{ fontSize: '0.9rem', color: '#94A3B8' }}>Baches, falta de agua, seguridad o servicios públicos. Tu reporte será gestionado directamente.</p>
                    <div style={{ marginTop: '1rem', color: 'var(--tertiary)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        INICIAR REPORTE <ChevronRight size={14} />
                    </div>
                </div>

                <div className="tactile-card" style={{ border: '1px solid rgba(255, 230, 109, 0.2)', cursor: 'pointer' }} onClick={() => navigate(`/mapa-social?t=${tenant.id}`)}>
                    <div style={{ color: 'var(--secondary)', marginBottom: '1rem' }}><Activity size={32} /></div>
                    <h3 style={{ fontFamily: 'Oswald', margin: '0 0 0.5rem 0' }}>RADAR DE RESULTADOS</h3>
                    <p style={{ fontSize: '0.9rem', color: '#94A3B8' }}>Visualiza las necesidades resueltas y los reportes activos en tiempo real en {tenant.geographic_scope}.</p>
                    <div style={{ marginTop: '1rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.2rem', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        VER MAPA PÚBLICO <ChevronRight size={14} />
                    </div>
                </div>

            </div>

            {/* STATS SECTION */}
            <div style={{ padding: '4rem 2rem', background: 'rgba(255,255,255,0.02)', marginTop: '2rem' }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto', textAlign: 'center' }}>
                    <h2 style={{ fontFamily: 'Oswald', marginBottom: '3rem' }}>IMPACTO SOCIAL EN {tenant.geographic_scope.toUpperCase()}</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2rem' }}>
                        <div>
                            <div style={{ fontSize: '2.5rem', fontFamily: 'Oswald', color: 'var(--primary)' }}>{stats.supports}</div>
                            <div style={{ color: '#64748B', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Aliados Sumados</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '2.5rem', fontFamily: 'Oswald', color: 'var(--tertiary)' }}>{stats.petitions}</div>
                            <div style={{ color: '#64748B', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Demandas Reportadas</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '2.5rem', fontFamily: 'Oswald', color: 'var(--secondary)' }}>{stats.resolved}</div>
                            <div style={{ color: '#64748B', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Casos Resueltos</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* FOOTER */}
            <footer style={{ padding: '4rem 2rem', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '1.2rem', fontFamily: 'Oswald', color: 'white', marginBottom: '0.5rem' }}>NEMIA.LAT</div>
                <p style={{ color: '#64748B', fontSize: '0.8rem' }}>Plataforma de Gestión Social y Transparencia © 2026</p>
                <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '1rem', fontSize: '0.7rem' }}>
                    <Link to="/terminos" style={{ color: '#94A3B8' }}>Términos de Uso</Link>
                    <Link to="/privacidad" style={{ color: '#94A3B8' }}>Aviso de Privacidad</Link>
                </div>
            </footer>
        </div>
    );
};
