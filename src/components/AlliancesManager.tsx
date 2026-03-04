import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Users, Check, X, ShieldAlert, Network, ArrowRight, RefreshCw } from 'lucide-react';
import { CHIAPAS_MUNICIPIOS } from '../lib/chiapas_municipios';
import { CHIAPAS_DISTRITOS_FEDERALES, CHIAPAS_DISTRITOS_LOCALES } from '../lib/chiapas_distritos';

function areGeographicallyConvergent(
    supPos: string, supScope: string,
    infPos: string, infScope: string
): boolean {
    const isStatewide = (p: string) => ['gubernatura', 'senaduria'].includes(p);
    if (isStatewide(supPos) || isStatewide(infPos)) return true;

    const getMunId = (scope: string) => {
        if (!scope) return null;
        const norm = scope.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return (CHIAPAS_MUNICIPIOS as any)[norm];
    };

    const getDistrictNum = (scope: string) => scope ? scope.replace(/\D/g, '') : null;

    const checkMunDist = (munScope: string, distPos: string, distScope: string) => {
        const mId = getMunId(munScope);
        if (!mId) return false; // FAIL CLOSED (Si el diccionario no lo reconoce, bloquea la anexión)
        const dNum = getDistrictNum(distScope);
        if (!dNum) return false; // FAIL CLOSED

        const map = distPos === 'diputacion_local' ? CHIAPAS_DISTRITOS_LOCALES : CHIAPAS_DISTRITOS_FEDERALES;
        const distArr = (map as any)[dNum];
        return distArr ? distArr.includes(mId) : false;
    };

    if (infPos === 'presidencia_municipal' && ['diputacion_local', 'diputacion_federal'].includes(supPos)) {
        return checkMunDist(infScope, supPos, supScope);
    }
    if (supPos === 'presidencia_municipal' && ['diputacion_local', 'diputacion_federal'].includes(infPos)) {
        return checkMunDist(supScope, infPos, infScope);
    }

    if (infPos === 'presidencia_municipal' && supPos === 'presidencia_municipal') {
        return infScope === supScope;
    }

    return true; // fallback
}

interface AllianceRequest {
    id: string;
    superior_tenant_id: string;
    inferior_tenant_id: string;
    status: 'pending' | 'approved' | 'rejected';
    created_at: string;
    inferior_tenant: { name: string; geographic_scope: string };
    superior_tenant: { name: string; geographic_scope: string };
}


export const AlliancesManager = () => {
    const { user, tenantScope } = useAuth();
    const [incomingRequests, setIncomingRequests] = useState<AllianceRequest[]>([]);
    const [outgoingRequests, setOutgoingRequests] = useState<AllianceRequest[]>([]);

    // For joining with a code
    const [inputCode, setInputCode] = useState('');
    const [isRequesting, setIsRequesting] = useState(false);
    const [loading, setLoading] = useState(true);

    const [activeAlliances, setActiveAlliances] = useState<any[]>([]);

    // Derived secret code from true database query
    const [mySecretCode, setMySecretCode] = useState<string | null>(null);

    useEffect(() => {
        if (!user?.tenant_id) return;
        fetchData();
    }, [user?.tenant_id, tenantScope]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Incoming (inferior wants to join US)
            const { data: incoming } = await supabase
                .from('tenant_alliances')
                .select('*, inferior_tenant:tenants!inferior_tenant_id(name, geographic_scope)')
                .eq('superior_tenant_id', user?.tenant_id)
                .in('status', ['pending', 'approved']);

            if (incoming) {
                setIncomingRequests(incoming.filter(r => r.status === 'pending'));
                setActiveAlliances(incoming.filter(r => r.status === 'approved'));
            }

            // 2. Fetch Outgoing (WE want to join a superior)
            const { data: outgoing } = await supabase
                .from('tenant_alliances')
                .select('*, superior_tenant:tenants!superior_tenant_id(name, geographic_scope)')
                .eq('inferior_tenant_id', user?.tenant_id);

            if (outgoing) {
                setOutgoingRequests(outgoing);
            }

            // 3. Fetch our own active secret code
            const { data: myTenant } = await supabase
                .from('tenants')
                .select('alliance_code')
                .eq('id', user?.tenant_id)
                .single();

            if (myTenant) {
                setMySecretCode(myTenant.alliance_code);
            }

        } catch (error) {
            console.error("Error fetching alliances:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateRequest = async () => {
        if (!inputCode.trim() || !user?.tenant_id) return;
        setIsRequesting(true);
        try {
            // Find the tenant by exactly matching the dynamic code (using maybeSingle to avoid throw on 0 rows)
            const { data: superiorMatch, error: matchError } = await supabase
                .from('tenants')
                .select('id, name, position, geographic_scope')
                .eq('alliance_code', inputCode.trim().toUpperCase())
                .maybeSingle();

            if (matchError || !superiorMatch) {
                alert("Código de alianza inválido, ha expirado o ya fue utilizado. Verifica que lo escribiste bien.");
                setIsRequesting(false);
                return;
            }

            if (superiorMatch.id === user.tenant_id) {
                alert("No puedes usar tu propio código sobre ti mismo.");
                setIsRequesting(false);
                return;
            }

            // check geographical convergence
            const { data: myTenantInfo } = await supabase
                .from('tenants')
                .select('position, geographic_scope')
                .eq('id', user.tenant_id)
                .single();

            if (myTenantInfo && !areGeographicallyConvergent(superiorMatch.position, superiorMatch.geographic_scope, myTenantInfo.position, myTenantInfo.geographic_scope)) {
                alert(`No es posible realizar esta coalición debido a falta de convergencia territorial. (Tu jurisdicción: ${myTenantInfo.geographic_scope}, Jurisdicción Superior: ${superiorMatch.geographic_scope})`);
                setIsRequesting(false);
                return;
            }

            // check if already pending/approved
            const { data: existing } = await supabase
                .from('tenant_alliances')
                .select('id, status')
                .eq('superior_tenant_id', superiorMatch.id)
                .eq('inferior_tenant_id', user.tenant_id);

            // Filter out rejected ones - we allow re-applying if they give us a new code
            const activeExisting = existing?.filter(e => e.status !== 'rejected') || [];

            if (activeExisting.length > 0) {
                alert("Ya existe una solicitud previa o una alianza en curso con este comando.");
                setIsRequesting(false);
                return;
            }

            // Clean up any old rejected request first
            if (existing && existing.filter(e => e.status === 'rejected').length > 0) {
                await supabase.from('tenant_alliances')
                    .delete()
                    .eq('superior_tenant_id', superiorMatch.id)
                    .eq('inferior_tenant_id', user.tenant_id)
                    .eq('status', 'rejected');
            }

            const { error: insertError } = await supabase
                .from('tenant_alliances')
                .insert({
                    superior_tenant_id: superiorMatch.id,
                    inferior_tenant_id: user.tenant_id,
                    status: 'pending' // Regresamos a pending por petición el usuario
                });

            if (insertError) {
                alert("Error técnico al crear la solicitud: " + insertError.message);
                setIsRequesting(false);
                return;
            }

            // Try to consume the code (best effort)
            await supabase.from('tenants').update({ alliance_code: null }).eq('id', superiorMatch.id);

            alert(`¡Solicitud enviada a ${superiorMatch.name}! Espera pacientemente a que la aprueben.`);
            setInputCode('');
            fetchData();
        } catch (e: any) {
            alert("Error crítico de sistema: " + e.message);
        } finally {
            setIsRequesting(false);
        }
    };

    const handleAction = async (id: string, newStatus: 'approved' | 'rejected') => {
        try {
            const { error } = await supabase
                .from('tenant_alliances')
                .update({ status: newStatus })
                .eq('id', id);

            if (error) throw error;

            // Si aprobamos/rechazamos, consumimos nuestro propio código de alianza por seguridad (One-Time-Use garantizado)
            await supabase.from('tenants').update({ alliance_code: null }).eq('id', user?.tenant_id);
            setMySecretCode(null);

            alert(`Solicitud ${newStatus === 'approved' ? 'Aprobada' : 'Rechazada'}.`);
            fetchData();
        } catch (e: any) {
            alert("Error al procesar la alianza: " + e.message);
        }
    };

    const handleGenerateCode = async () => {
        const newCode = Math.random().toString(36).substring(2, 8).toUpperCase() + Math.random().toString(36).substring(2, 4).toUpperCase();
        try {
            const { error } = await supabase
                .from('tenants')
                .update({ alliance_code: newCode })
                .eq('id', user?.tenant_id);
            if (error) throw error;
            setMySecretCode(newCode);
        } catch (e: any) {
            alert('Error generando código: ' + e.message);
        }
    };

    const handleDissolve = async (id: string) => {
        if (!confirm("¿Está seguro de disolver esta alianza publicamente? La estructura ya no compartirá datos.")) return;
        try {
            const { error } = await supabase
                .from('tenant_alliances')
                .delete()
                .eq('id', id);

            if (error) throw error;
            alert("Alianza disuelta exitosamente. Por favor actualice (F5) su sesión para reflejar los límites territoriales.");
            fetchData();
        } catch (e: any) {
            alert("Error: " + e.message);
        }
    }

    if (loading) {
        return <div style={{ color: 'var(--tertiary)' }}>Sincronizando Federaciones...</div>;
    }

    if (user?.role !== 'superadmin' && user?.role !== 'candidato') {
        return (
            <div className="bg-panel/50 border border-white/5 p-8 rounded-xl flex flex-col items-center justify-center text-center space-y-4">
                <ShieldAlert className="w-16 h-16 text-red-500/50" />
                <h3 className="text-xl font-bold text-white">ACCESO RESTRINGIDO</h3>
                <p className="text-white/60 max-w-md">
                    El Protocolo de Federaciones y Alianzas Territoriales es de uso exclusivo para el Alto Mando (Candidatos y Administradores). Su nivel de acceso actual no permite gestionar coaliciones.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-col gap-4">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: '1px solid rgba(0, 212, 255, 0.2)', paddingBottom: '1rem' }}>
                <Network size={32} color="var(--tertiary)" />
                <div>
                    <h2 style={{ fontFamily: 'Oswald', color: 'white', margin: 0, letterSpacing: '0.05em' }}>
                        FEDERACIÓN DE CAMPAÑAS (SUMA DE ESTRUCTURAS)
                    </h2>
                    <p style={{ color: '#94A3B8', margin: 0, fontSize: '0.9rem' }}>
                        Solicita sumarte a proyectos políticos de mayor jerarquía, o administra las campañas subordinadas a ti.
                    </p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>

                <div className="tactile-card" style={{ border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(255,90,54,0.05), rgba(0,0,0,0.5))' }}>
                    <h3 style={{ color: 'var(--primary)', fontFamily: 'Oswald', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ArrowRight size={20} /> VINCULARSE A UNA CAMPAÑA
                    </h3>
                    <p style={{ color: '#ccc', fontSize: '0.85rem', marginBottom: '1rem' }}>
                        Solicita a un candidato superior el <strong>código secreto de alianza</strong> para integrar tu estructura a su radar estratégico.
                    </p>

                    <div className="flex-col gap-2">
                        <input
                            type="text"
                            className="squishy-input text-center"
                            placeholder="Ej. A1B2C3D4"
                            value={inputCode}
                            onChange={e => setInputCode(e.target.value.toUpperCase())}
                            style={{ fontFamily: 'monospace', letterSpacing: '4px', fontSize: '1.2rem', textTransform: 'uppercase' }}
                            maxLength={8}
                        />
                        <button
                            className="squishy-btn primary"
                            onClick={handleCreateRequest}
                            disabled={!inputCode || inputCode.length < 4 || isRequesting}
                            style={{ marginTop: '0.5rem' }}
                        >
                            {isRequesting ? 'VALIDANDO CÓDIGO...' : 'VINCULAR ESTRUCTURAS'}
                        </button>
                    </div>

                    {/* Active Outgoing */}
                    {outgoingRequests.length > 0 && (
                        <div style={{ marginTop: '1.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                            <h4 style={{ color: '#888', margin: '0 0 0.5rem 0', fontSize: '0.8rem' }}>CAMPAÑAS A LAS QUE PERTENEZCO</h4>
                            {outgoingRequests.map(r => (
                                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', padding: '0.5rem 1rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
                                    <span style={{ color: 'white', fontSize: '0.9rem' }}>{r.superior_tenant?.name}</span>
                                    {r.status === 'pending' && <span style={{ color: 'var(--tertiary)', fontSize: '0.75rem', border: '1px solid var(--tertiary)', padding: '2px 6px', borderRadius: '12px' }}>PENDIENTE</span>}
                                    {r.status === 'approved' && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ color: '#10B981', fontSize: '0.75rem', border: '1px solid #10B981', padding: '2px 6px', borderRadius: '12px' }}>ACTIVA</span>
                                            <button onClick={() => handleDissolve(r.id)} title="Romper Alianza" style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer' }}><X size={16} /></button>
                                        </div>
                                    )}
                                    {r.status === 'rejected' && <span style={{ color: '#EF4444', fontSize: '0.75rem', border: '1px solid #EF4444', padding: '2px 6px', borderRadius: '12px' }}>RECHAZADA</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 2. Manage Subordinates (Ingoing requests & Active Alliances) */}
                <div className="tactile-card" style={{ border: '1px solid var(--tertiary)' }}>
                    <h3 style={{ color: 'var(--tertiary)', fontFamily: 'Oswald', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <ShieldAlert size={20} /> CAMPAÑAS SUBORDINADAS
                    </h3>

                    {/* Share my code */}
                    <div style={{ marginBottom: '1.5rem', padding: '1.5rem', backgroundColor: 'rgba(0, 212, 255, 0.05)', borderRadius: '8px', border: '1px dashed var(--tertiary)', textAlign: 'center' }}>
                        <h4 style={{ color: '#ccc', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>CREAR CÓDIGO DE COALICIÓN (SOLO UN USO)</h4>
                        <p style={{ color: '#666', fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '1rem' }}>
                            Genera un código dinámico de 8 caracteres y compártelo por WhatsApp. Una vez que la otra parte lo use o lo apruebes, el código se autodestruirá por seguridad.
                        </p>

                        {!mySecretCode ? (
                            <button className="squishy-btn primary align-center" onClick={handleGenerateCode} style={{ margin: '0 auto' }}>
                                <RefreshCw size={16} /> GENERAR CÓDIGO SEGURO
                            </button>
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <div style={{
                                        letterSpacing: '6px', fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--tertiary)',
                                        padding: '1rem 2rem', backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: '8px', border: '1px solid rgba(0, 212, 255, 0.3)'
                                    }}>
                                        {mySecretCode}
                                    </div>
                                    <button
                                        className="squishy-btn highlight-border"
                                        onClick={() => { navigator.clipboard.writeText(mySecretCode); alert("Código copiado al portapapeles"); }}
                                        title="Copiar al Portapapeles"
                                        style={{ height: '100%' }}
                                    >
                                        COPIAR
                                    </button>
                                </div>
                                <button className="squishy-btn mini" onClick={handleGenerateCode} style={{ fontSize: '0.75rem', color: '#ff8a80', borderColor: 'transparent' }}>
                                    <RefreshCw size={12} /> REVOCAR Y GENERAR UNO NUEVO
                                </button>
                            </div>
                        )}

                    </div>

                    {/* Incoming pending requests */}
                    <div style={{ marginBottom: '1.5rem', marginTop: '1rem' }}>
                        <h4 style={{ color: '#ccc', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>NUEVAS SOLICITUDES EN REVISIÓN</h4>
                        {incomingRequests.length === 0 ? (
                            <p style={{ color: '#666', fontSize: '0.8rem', fontStyle: 'italic' }}>No hay solicitudes de anexión pendientes.</p>
                        ) : (
                            incomingRequests.map(r => (
                                <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', backgroundColor: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.2)', padding: '1rem', borderRadius: '8px', marginBottom: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
                                        <Users size={16} color="var(--tertiary)" />
                                        <span style={{ fontWeight: 'bold' }}>{r.inferior_tenant?.name}</span>
                                    </div>
                                    <span style={{ color: '#888', fontSize: '0.8rem' }}>Jurisdicción: {r.inferior_tenant?.geographic_scope}</span>

                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                        <button onClick={() => handleAction(r.id, 'approved')} className="squishy-btn primary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', gap: '0.3rem', backgroundColor: '#10B981', color: 'white', borderColor: '#10B981' }}>
                                            <Check size={16} /> APROBAR COALICIÓN
                                        </button>
                                        <button onClick={() => handleAction(r.id, 'rejected')} className="squishy-btn secondary" style={{ flex: 1, padding: '0.4rem', fontSize: '0.8rem', display: 'flex', justifyContent: 'center', gap: '0.3rem', color: '#EF4444', borderColor: '#EF4444' }}>
                                            <X size={16} /> RECHAZAR
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Active Alliances */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                        <h4 style={{ color: '#10B981', margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>ALIANZAS ACTIVAS INTEGRADAS A TU RADAR</h4>
                        {activeAlliances.length === 0 ? (
                            <p style={{ color: '#666', fontSize: '0.8rem', fontStyle: 'italic' }}>No lideras ninguna coalición territorial activa.</p>
                        ) : (
                            activeAlliances.map(r => (
                                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.05)', borderLeft: '3px solid #10B981', padding: '0.5rem 1rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
                                    <div>
                                        <div style={{ color: 'white', fontSize: '0.9rem', fontWeight: 'bold' }}>{r.inferior_tenant?.name}</div>
                                        <div style={{ color: '#888', fontSize: '0.75rem' }}>{r.inferior_tenant?.geographic_scope}</div>
                                    </div>
                                    <button onClick={() => handleDissolve(r.id)} className="squishy-btn mini" style={{ color: '#EF4444', borderColor: 'rgba(239, 68, 68, 0.5)' }}>Desvincular</button>
                                </div>
                            ))
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};
