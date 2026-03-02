import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '../lib/supabase';
import { Clock, Users } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// SVG Icons for public map
const createIcon = (color: string) => L.divIcon({
    html: `<div style="background-color: ${color}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${color}"></div>`,
    className: 'custom-petition-icon',
    iconSize: [12, 12]
});

const ICONS = {
    pendiente: createIcon('#FF5A36'),
    en_proceso: createIcon('#00D4FF'),
    resuelto: createIcon('#25D366'),
    rechazado: createIcon('#666')
};

export const PublicMapView = () => {
    const [searchParams] = useSearchParams();
    const tenantId = searchParams.get('t');
    const [petitions, setPetitions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (tenantId) fetchPublicPetitions();
    }, [tenantId]);

    const fetchPublicPetitions = async () => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('petitions')
                .select('*')
                .eq('tenant_id', tenantId)
                .not('latitude', 'is', null);
            setPetitions(data || []);
        } catch (e) {
            console.error("Error fetching public map data:", e);
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div style={{ color: 'white', textAlign: 'center', padding: '2rem' }}>Cargando mapa social...</div>;
    if (!tenantId) return <div style={{ color: 'white', textAlign: 'center', padding: '2rem' }}>Error: ID de campaña no especificado.</div>;

    return (
        <div style={{ height: '600px', width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            <MapContainer center={[16.75, -93.12]} zoom={13} style={{ height: '100%', width: '100%', background: '#0a0f19' }}>
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                {petitions.map(p => (
                    <Marker
                        key={p.id}
                        position={[p.latitude, p.longitude]}
                        icon={ICONS[p.status as keyof typeof ICONS] || ICONS.pendiente}
                    >
                        <Popup>
                            <div style={{ minWidth: '200px', fontFamily: 'Inter, sans-serif' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <strong style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>{p.category.toUpperCase()}</strong>
                                    <span style={{ fontSize: '0.7rem', color: '#666' }}>#{p.id.slice(0, 6)}</span>
                                </div>
                                <p style={{ fontSize: '0.85rem', margin: '0 0 1rem 0' }}>{p.description}</p>
                                <div style={{ display: 'flex', gap: '0.8rem', fontSize: '0.75rem', color: '#444', borderTop: '1px solid #eee', paddingTop: '0.5rem' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Clock size={12} /> {p.status.replace('_', ' ')}</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><Users size={12} /> {p.affects_count} afectados</span>
                                </div>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    );
};
