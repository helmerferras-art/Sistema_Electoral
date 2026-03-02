import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PackageOpen, Camera, CheckCircle2, MapPin } from 'lucide-react';

export default function MySupplies() {
    const { user } = useAuth();
    const [assignments, setAssignments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploadingId, setUploadingId] = useState<string | null>(null);

    useEffect(() => {
        if (!user || !user.id) return;
        fetchMySupplies();
    }, [user]);

    const fetchMySupplies = async () => {
        setLoading(true);
        try {
            // Fetch assignments for this specific user
            // We also fetch logs to see if they already verified it
            const { data } = await supabase
                .from('resource_assignments')
                .select(`
                    id, assigned_date, is_loot, resource_id,
                    resources(name, type, total_cost),
                    logs:resource_logs(id, photo_url, timestamp, latitude, longitude)
                `)
                .eq('assigned_to', user?.id) // Assuming online for now (MVP)
                .order('assigned_date', { ascending: false });

            if (data) setAssignments(data);
        } catch (error) {
            console.error("Error fetching my supplies", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUploadEvidence = async (assignment: any) => {
        setUploadingId(assignment.id);

        try {
            // 1. Get GPS Location
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
            });

            // 2. MVP: Simulate Photo Upload (In real app, trigger <input type="file" accept="image/*" capture="environment" />)
            // For MVP, we'll just register the log with GPS and a placeholder text/URL
            const simulatedPhotoUrl = `https://picsum.photos/seed/${assignment.id}/400/300`;

            // 3. Insert Log
            const { error } = await supabase.from('resource_logs').insert([{
                tenant_id: user?.tenant_id,
                assignment_id: assignment.id,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                photo_url: simulatedPhotoUrl,
                notes: 'Evidencia geo-etiquetada subida correctamente.'
            }]);

            if (error) throw error;

            alert("Evidencia registrada. ¡Recurso verificado en campo!");
            await fetchMySupplies();

        } catch (error: any) {
            console.error(error);
            alert("Error al validar: Asegúrate de dar permisos de GPS al navegador. " + error.message);
        } finally {
            setUploadingId(null);
        }
    };

    return (
        <div className="animate-fade-in" style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto', color: 'white' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
                <PackageOpen size={32} color="#F59E0B" />
                <div>
                    <h2 style={{ margin: 0, fontFamily: 'Oswald', fontSize: '2rem', letterSpacing: '0.05em' }}>MIS SUMINISTROS</h2>
                    <p style={{ margin: 0, color: '#aaa', fontSize: '0.9rem' }}>Recursos asignados que requieren validación en campo</p>
                </div>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#888' }}>Cargando mochila táctica...</div>
            ) : assignments.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    <div style={{ color: '#888', marginBottom: '1rem' }}>No tienes recursos asignados actualmente.</div>
                    <div style={{ fontSize: '0.8rem', color: '#555' }}>Contacta a tu coordinador si esperas material.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {assignments.map(assign => {
                        const isVerified = assign.logs && assign.logs.length > 0;

                        return (
                            <div key={assign.id} style={{
                                backgroundColor: isVerified ? 'rgba(16, 185, 129, 0.05)' : 'rgba(0,0,0,0.4)',
                                border: `1px solid ${isVerified ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                                borderRadius: '12px',
                                padding: '1.5rem',
                                position: 'relative',
                                overflow: 'hidden'
                            }}>
                                {/* Verified Badge Top Right */}
                                {isVerified && (
                                    <div style={{ position: 'absolute', top: 0, right: 0, backgroundColor: '#10B981', color: 'black', padding: '0.2rem 1rem', fontSize: '0.7rem', fontWeight: 'bold', borderBottomLeftRadius: '8px' }}>
                                        <CheckCircle2 size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                        COMPROBADO
                                    </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#00D4FF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {assign.resources?.type} {assign.is_loot && '🌟 (LOOT)'}
                                        </div>
                                        <div style={{ fontWeight: 'bold', fontSize: '1.3rem', marginTop: '0.2rem' }}>
                                            CANTIDAD: {1} {/* Defaulting to 1 as column is missing in DB */} x {assign.resources?.name || 'Recurso Desconocido'}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#888', marginTop: '0.5rem' }}>
                                            Asignado el: {new Date(assign.assigned_date).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>

                                {isVerified ? (
                                    <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <img src={assign.logs[0].photo_url} alt="Evidencia" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #333' }} />
                                        <div>
                                            <div style={{ fontSize: '0.85rem', color: '#10B981', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <MapPin size={14} /> Geolocalización Activa
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '4px', fontFamily: 'monospace' }}>
                                                {assign.logs[0].latitude.toFixed(6)}, {assign.logs[0].longitude.toFixed(6)}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleUploadEvidence(assign)}
                                        disabled={uploadingId === assign.id}
                                        style={{
                                            width: '100%',
                                            padding: '1rem',
                                            backgroundColor: 'transparent',
                                            color: '#00D4FF',
                                            border: '2px dashed rgba(0, 212, 255, 0.4)',
                                            borderRadius: '8px',
                                            fontWeight: 'bold',
                                            cursor: uploadingId === assign.id ? 'wait' : 'pointer',
                                            display: 'flex',
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            transition: 'all 0.2s',
                                            marginTop: '0.5rem'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.1)'}
                                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        {uploadingId === assign.id ? (
                                            'Obteniendo GPS & Foto...'
                                        ) : (
                                            <>
                                                <Camera size={20} /> INICIAR FOTO-VALIDACIÓN
                                            </>
                                        )}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
