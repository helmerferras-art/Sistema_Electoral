import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Camera, MapPin, CheckCircle, ArrowLeft, AlertCircle } from 'lucide-react';

const CATEGORIES = [
    'Agua y Drenaje',
    'Pavimentación y Baches',
    'Seguridad Ciudadana',
    'Alumbrado Público',
    'Salud y Clínicas',
    'Limpieza y Basura',
    'Educación / Escuelas',
    'Parques y Jardines',
    'Otros'
];

export const PetitionsForm = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const tenantId = searchParams.get('t');

    const [formData, setFormData] = useState({
        description: '',
        category: CATEGORIES[0],
        is_anonymous: false,
        latitude: null as number | null,
        longitude: null as number | null,
        affects_count: 1
    });

    const [files, setFiles] = useState<File[]>([]);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [locationStatus, setLocationStatus] = useState<'none' | 'fetching' | 'success' | 'error'>('none');

    const handleLocation = () => {
        setLocationStatus('fetching');
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setFormData(prev => ({ ...prev, latitude: pos.coords.latitude, longitude: pos.coords.longitude }));
                    setLocationStatus('success');
                },
                () => setLocationStatus('error'),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            setFiles(prev => [...prev, ...newFiles].slice(0, 3)); // Max 3 files

            const urls = newFiles.map(file => URL.createObjectURL(file));
            setPreviewUrls(prev => [...prev, ...urls].slice(0, 3));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId) return;

        setLoading(true);
        try {
            // 1. Insertar la demanda
            const { data: petition, error: pError } = await supabase
                .from('petitions')
                .insert([{
                    tenant_id: tenantId,
                    description: formData.description,
                    category: formData.category,
                    is_anonymous: formData.is_anonymous,
                    latitude: formData.latitude,
                    longitude: formData.longitude,
                    affects_count: formData.affects_count,
                    priority: formData.affects_count > 50 ? 'alta' : 'media'
                }])
                .select()
                .single();

            if (pError) throw pError;

            // 2. Subir Archivos (Simulado para MVP, en prod usaría Supabase Storage)
            // Para este entorno, solo guardaremos referencias simuladas si no hay bucket configurado
            if (files.length > 0 && petition) {
                const mediaEntries = files.map((file, idx) => ({
                    petition_id: petition.id,
                    file_url: `https://storage.nemia.lat/temp/${petition.id}_${idx}_${file.name}`,
                    file_type: file.type
                }));

                await supabase.from('petition_media').insert(mediaEntries);
            }

            setStatus('success');
        } catch (err) {
            console.error("Error submitting petition:", err);
            setStatus('error');
        } finally {
            setLoading(false);
        }
    };

    if (status === 'success') {
        return (
            <div className="flex-center flex-col" style={{ height: '80vh', textAlign: 'center', padding: '2rem' }}>
                <div style={{ color: 'var(--secondary)', marginBottom: '1.5rem' }}><CheckCircle size={80} /></div>
                <h2 style={{ fontFamily: 'Oswald', color: 'white' }}>¡REPORTE RECIBIDO!</h2>
                <p style={{ color: '#94A3B8', marginBottom: '2rem' }}>Gracias por participar. Tu demanda ha sido registrada en el sistema NEMIA y el equipo del candidato comenzará la gestión ante las autoridades correspondientes.</p>
                <button onClick={() => navigate(-1)} className="squishy-btn primary">VOLVER AL INICIO</button>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '1rem' }}>
            <button
                onClick={() => navigate(-1)}
                style={{ background: 'none', border: 'none', color: '#64748B', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', cursor: 'pointer' }}
            >
                <ArrowLeft size={20} /> VOLVER
            </button>

            <h1 style={{ fontFamily: 'Oswald', color: 'white', marginBottom: '0.5rem' }}>NUEVA GESTIÓN SOCIAL</h1>
            <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '2rem' }}>Reporta necesidades de tu comunidad para que NEMIA las canalice a los niveles de gobierno correctos.</p>

            <form onSubmit={handleSubmit} className="flex-col gap-4">
                <div className="flex-col">
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>CATEGORÍA DE LA DEMANDA</label>
                    <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="squishy-input"
                        style={{ background: 'rgba(255,255,255,0.05)', color: 'white' }}
                    >
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>

                <div className="flex-col">
                    <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>DESCRIPCIÓN DETALLADA</label>
                    <textarea
                        required
                        placeholder="Ej: Hay un bache profundo en la calle 5 de Mayo que afecta el tránsito..."
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="squishy-input"
                        style={{ minHeight: '120px', resize: 'vertical' }}
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="flex-col">
                        <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>UBICACIÓN (GPS)</label>
                        <button
                            type="button"
                            onClick={handleLocation}
                            className={`squishy-btn ${locationStatus === 'success' ? 'secondary' : ''}`}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.8rem' }}
                        >
                            <MapPin size={18} /> {locationStatus === 'success' ? 'UBICACIÓN FIJADA' : 'RASTREAR GPS'}
                        </button>
                    </div>
                    <div className="flex-col">
                        <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.5rem' }}>FOTOS / EVIDENCIA</label>
                        <label className="squishy-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                            <Camera size={18} /> SUBIR FOTOS
                            <input type="file" multiple accept="image/*" onChange={handleFileChange} hidden />
                        </label>
                    </div>
                </div>

                {previewUrls.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                        {previewUrls.map((url, i) => (
                            <img key={i} src={url} style={{ width: '80px', height: '80px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--primary)' }} />
                        ))}
                    </div>
                )}

                <div style={{ background: 'rgba(255, 90, 54, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255, 90, 54, 0.1)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}>
                        <input
                            type="number"
                            min="1"
                            value={formData.affects_count}
                            onChange={(e) => setFormData({ ...formData, affects_count: parseInt(e.target.value) })}
                            className="squishy-input"
                            style={{ width: '80px', padding: '0.5rem' }}
                        />
                        <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>Aproximadamente cuántas personas se ven afectadas.</span>
                    </label>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer', padding: '0.5rem' }}>
                    <input
                        type="checkbox"
                        checked={formData.is_anonymous}
                        onChange={(e) => setFormData({ ...formData, is_anonymous: e.target.checked })}
                        style={{ width: '20px', height: '20px', accentColor: 'var(--primary)' }}
                    />
                    <span style={{ fontSize: '0.9rem', color: 'white' }}>Reportar de forma anónima</span>
                </label>

                {status === 'error' && (
                    <div style={{ color: '#FF4B4B', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 'bold' }}>
                        <AlertCircle size={20} /> Error al enviar reporte. Reintenta.
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading || !tenantId}
                    className="squishy-btn primary"
                    style={{ marginTop: '1rem', padding: '1.2rem', fontSize: '1.2rem', fontFamily: 'Oswald' }}
                >
                    {loading ? 'ENVIANDO...' : 'ENVIAR REPORTE CIUDADANO'}
                </button>
            </form>
        </div>
    );
};
