import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { MessageCircle, Clock, Users, ExternalLink, X } from 'lucide-react';

export const PetitionsManager = () => {
    const { user } = useAuth();
    const [petitions, setPetitions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [selectedPetition, setSelectedPetition] = useState<any>(null);

    useEffect(() => {
        if (user?.tenant_id) {
            fetchPetitions();
        }
    }, [user, filterStatus]);

    const fetchPetitions = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('petitions')
                .select('*, reporter:users(name, phone)')
                .in('tenant_id', user?.tenantScope || [])
                .order('created_at', { ascending: false });

            if (filterStatus !== 'all') {
                query = query.eq('status', filterStatus);
            }

            const { data } = await query;
            setPetitions(data || []);
        } catch (error) {
            console.error('Error fetching petitions:', error);
        } finally {
            setLoading(false);
        }
    };

    const updatePetition = async (id: string, updates: any) => {
        try {
            const { error } = await supabase
                .from('petitions')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
            fetchPetitions();
            if (selectedPetition?.id === id) {
                setSelectedPetition({ ...selectedPetition, ...updates });
            }
        } catch (error) {
            console.error('Error updating petition:', error);
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'pendiente': return { bg: 'rgba(255, 90, 54, 0.1)', color: 'var(--primary)', label: 'PENDIENTE' };
            case 'en_proceso': return { bg: 'rgba(0, 212, 255, 0.1)', color: 'var(--tertiary)', label: 'EN PROCESO' };
            case 'resuelto': return { bg: 'rgba(37, 211, 102, 0.1)', color: '#25D366', label: 'RESUELTO' };
            case 'rechazado': return { bg: 'rgba(255, 255, 255, 0.05)', color: '#666', label: 'RECHAZADO' };
            default: return { bg: 'gray', color: 'white', label: status };
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: selectedPetition ? '1fr 400px' : '1fr', gap: '1rem', height: 'calc(100vh - 200px)' }}>

            {/* LIST AREA */}
            <div className="flex-col gap-4" style={{ overflowY: 'auto', paddingRight: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {['all', 'pendiente', 'en_proceso', 'resuelto'].map(s => (
                            <button
                                key={s}
                                onClick={() => setFilterStatus(s)}
                                className={`tactile-badge ${filterStatus === s ? 'active' : ''}`}
                                style={{
                                    cursor: 'pointer',
                                    background: filterStatus === s ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                                    color: filterStatus === s ? 'white' : '#888',
                                    border: 'none',
                                    fontSize: '0.7rem'
                                }}
                            >
                                {s.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {loading ? (
                    <div style={{ color: 'var(--primary)', fontFamily: 'Oswald' }}>SINCRONIZANDO DEMANDAS...</div>
                ) : petitions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#666' }}>No hay demandas sociales registradas en este sector.</div>
                ) : (
                    petitions.map(p => {
                        const style = getStatusStyle(p.status);
                        return (
                            <div
                                key={p.id}
                                className={`tactile-card ${selectedPetition?.id === p.id ? 'active' : ''}`}
                                onClick={() => setSelectedPetition(p)}
                                style={{
                                    cursor: 'pointer',
                                    borderLeft: `4px solid ${p.priority === 'alta' ? 'red' : style.color}`,
                                    position: 'relative'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.6rem', color: '#888', fontFamily: 'monospace' }}>#{p.id.slice(0, 8)}</span>
                                    <span style={{
                                        backgroundColor: style.bg,
                                        color: style.color,
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold',
                                        letterSpacing: '0.05em'
                                    }}>{style.label}</span>
                                </div>

                                <h4 style={{ margin: '0 0 0.5rem 0', fontFamily: 'Oswald', color: 'white' }}>{p.category.toUpperCase()}</h4>
                                <p style={{ fontSize: '0.9rem', color: '#ccc', margin: '0 0 1rem 0', lineClamp: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {p.description}
                                </p>

                                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#666', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.5rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <Users size={12} /> {p.affects_count} afectados
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <Clock size={12} /> {new Date(p.created_at).toLocaleDateString()}
                                    </span>
                                    {p.is_emergency && <span style={{ color: 'red', fontWeight: 'bold' }}>⚠️ EMERGENCIA</span>}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* DETAIL / GESTION AREA */}
            {selectedPetition && (
                <div className="tactile-card" style={{ border: '1px solid var(--primary)', background: 'rgba(10, 15, 25, 0.98)', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ fontFamily: 'Oswald', color: 'white', margin: 0 }}>DETALLE DE GESTIÓN</h3>
                        <X size={20} color="#666" style={{ cursor: 'pointer' }} onClick={() => setSelectedPetition(null)} />
                    </div>

                    <div className="flex-col gap-4">
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                            <label style={{ fontSize: '0.7rem', color: '#888', textTransform: 'uppercase' }}>Reportado por</label>
                            <div style={{ color: 'white', fontWeight: 'bold' }}>{selectedPetition.is_anonymous ? 'Ciudadano Anónimo' : (selectedPetition.reporter?.name || 'Usuario NEMIA')}</div>
                            {selectedPetition.reporter?.phone && !selectedPetition.is_anonymous && (
                                <a href={`https://wa.me/${selectedPetition.reporter.phone}`} target="_blank" className="flex-center" style={{ marginTop: '0.5rem', background: '#25D366', color: 'white', padding: '0.5rem', borderRadius: '4px', textDecoration: 'none', fontSize: '0.8rem', gap: '0.5rem' }}>
                                    <MessageCircle size={16} /> ENVIAR ESTATUS POR WHATSAPP
                                </a>
                            )}
                        </div>

                        <div className="flex-col">
                            <label style={{ fontSize: '0.7rem', color: '#888' }}>ASIGNAR NIVEL DE GOBIERNO</label>
                            <select
                                value={selectedPetition.government_level || ''}
                                onChange={(e) => updatePetition(selectedPetition.id, { government_level: e.target.value })}
                                className="squishy-input"
                                style={{ fontSize: '0.85rem' }}
                            >
                                <option value="">Sin asignar</option>
                                <option value="municipal">MUNICIPAL (Ayuntamiento)</option>
                                <option value="estatal">ESTATAL (Gobierno de Chiapas)</option>
                                <option value="federal">FEDERAL (SEDATU / Bienestar)</option>
                            </select>
                        </div>

                        <div className="flex-col">
                            <label style={{ fontSize: '0.7rem', color: '#888' }}>OFICINA / DEPENDENCIA RESPONSABLE</label>
                            <input
                                type="text"
                                placeholder="Ej: Secretaría de Obras Públicas"
                                value={selectedPetition.assigned_office || ''}
                                onChange={(e) => updatePetition(selectedPetition.id, { assigned_office: e.target.value })}
                                className="squishy-input"
                                style={{ fontSize: '0.85rem' }}
                            />
                        </div>

                        <div className="flex-col">
                            <label style={{ fontSize: '0.7rem', color: '#888' }}>ESTATUS DE LA GESTIÓN</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <button
                                    onClick={() => updatePetition(selectedPetition.id, { status: 'en_proceso' })}
                                    className={`squishy-btn mini ${selectedPetition.status === 'en_proceso' ? 'primary' : ''}`}
                                    style={{ fontSize: '0.7rem' }}
                                >EN PROCESO</button>
                                <button
                                    onClick={() => updatePetition(selectedPetition.id, { status: 'resuelto' })}
                                    className={`squishy-btn mini ${selectedPetition.status === 'resuelto' ? 'secondary' : ''}`}
                                    style={{ fontSize: '0.7rem' }}
                                >FINALIZADO / RESUELTO</button>
                            </div>
                        </div>

                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginTop: '1rem' }}>
                            <button className="squishy-btn" style={{ width: '100%', fontSize: '0.8rem', opacity: 0.7 }}>
                                <ExternalLink size={14} /> VER UBICACIÓN EN EL RADAR
                            </button>
                            <p style={{ fontSize: '0.65rem', color: '#555', marginTop: '1rem', textAlign: 'center' }}>
                                Los reportes de transparencia PDF se generan automáticamente al finalizar la gestión.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
