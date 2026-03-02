import { useState, useEffect } from 'react';
import { saveOfflineSupporter, getOfflineSupporters } from '../lib/indexedDB';
import { setupSyncListeners, syncOfflineData } from '../lib/syncService';
import { Trophy, X, User, Camera } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { WhatsAppQR } from './WhatsAppQR';
import { ScannerINE } from './ScannerINE';

export const RegistroForm = () => {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        curp: '',
        clave_elector: '',
        domicilio: '',
        seccion: '',
        vigencia: '',
        birth_date: '',
        photo_url: null as string | null,
        latitude: null as number | null,
        longitude: null as number | null,
        commitment_level: 1
    });

    const [isSaving, setIsSaving] = useState(false);
    const [offlineCount, setOfflineCount] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [xpGained, setXpGained] = useState<number | null>(null);
    const [showQR, setShowQR] = useState(false);
    const [showScanner, setShowScanner] = useState(false);
    const [registrationMode, setRegistrationMode] = useState<'MANUAL' | 'OCR'>('MANUAL');
    const [candidateInfo, setCandidateInfo] = useState({ name: 'Candidato', phone: '' });

    useEffect(() => {
        setupSyncListeners();
        updateOfflineCount();

        // Public registration: Try to get tenant_id from URL if not logged in
        if (!user) {
            const params = new URLSearchParams(window.location.search);
            const tId = params.get('t');
            if (tId) (window as any)._publicTenantId = tId;
        }

        fetchCandidateInfo();
    }, [user]);

    const fetchCandidateInfo = async () => {
        const tId = user?.tenant_id || (window as any)._publicTenantId;
        if (!tId) return;
        try {
            const { data } = await supabase
                .from('users')
                .select('name, phone')
                .eq('tenant_id', tId)
                .eq('role', 'candidato')
                .maybeSingle();

            if (data) {
                setCandidateInfo({
                    name: data.name,
                    phone: data.phone || ''
                });
            } else {
                const { data: tenant } = await supabase
                    .from('tenants')
                    .select('name')
                    .eq('id', tId)
                    .single();
                if (tenant) setCandidateInfo(prev => ({ ...prev, name: tenant.name }));
            }
        } catch (e) {
            console.error("Error fetching candidate info:", e);
        }
    };

    const updateOfflineCount = async () => {
        const supporters = await getOfflineSupporters();
        setOfflineCount(supporters.length);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleGPS = () => {
        setStatusMessage('Obteniendo ubicación...');
        if ('geolocation' in navigator) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    setFormData(prev => ({
                        ...prev,
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude
                    }));
                    setStatusMessage('📍 Ubicación capturada');
                },
                (error) => {
                    console.error("Error getting location:", error);
                    setStatusMessage('❌ Error al obtener GPS');
                },
                { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
            );
        } else {
            setStatusMessage('Geolocalización no soportada');
        }
    };

    const handleScanComplete = (extractedData: any) => {
        setFormData(prev => {
            let formattedBirthDate = '';
            if (extractedData.fecha_nacimiento && extractedData.fecha_nacimiento.includes('/')) {
                const parts = extractedData.fecha_nacimiento.split('/');
                if (parts.length === 3) {
                    formattedBirthDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
            }

            return {
                ...prev,
                name: extractedData.nombre || prev.name,
                domicilio: extractedData.domicilio || prev.domicilio,
                clave_elector: extractedData.clave_elector || prev.clave_elector,
                curp: extractedData.curp || prev.curp,
                seccion: extractedData.seccion || prev.seccion,
                vigencia: extractedData.vigencia || prev.vigencia,
                birth_date: formattedBirthDate || prev.birth_date,
                photo_url: extractedData.foto || prev.photo_url
            };
        });
        setShowScanner(false);
        setStatusMessage('✅ Datos extraídos del INE correctamente');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name || !formData.phone) {
            setStatusMessage('⚠️ Nombre y Teléfono son requeridos');
            return;
        }

        try {
            setIsSaving(true);
            setStatusMessage('Verificando registro...');

            // 1. Verificar duplicados en tiempo real (Proactivo)
            const { data: existingSupporter, error: checkError } = await supabase
                .from('supporters')
                .select('id')
                .eq('phone', formData.phone)
                .maybeSingle();

            if (checkError) {
                console.error("Error verificando duplicados:", checkError);
            }

            if (existingSupporter) {
                setStatusMessage('⚠️ Este número ya se encuentra registrado');
                setIsSaving(false);
                return;
            }

            setStatusMessage('Guardando...');

            const tenantId = user?.tenant_id || (window as any)._publicTenantId;
            const tacticalCode = Math.floor(100000 + Math.random() * 900000).toString();

            const supporterData = {
                name: formData.name,
                phone: formData.phone,
                curp: formData.curp,
                clave_elector: formData.clave_elector,
                domicilio: formData.domicilio,
                seccion_id: formData.seccion,
                vigencia: formData.vigencia,
                birth_date: formData.birth_date || null,
                photo_evidence_url: formData.photo_url,
                latitude: formData.latitude,
                longitude: formData.longitude,
                commitment_level: formData.commitment_level,
                tenant_id: tenantId,
                recruiter_id: user?.id || null
            };

            await saveOfflineSupporter(supporterData);

            if (navigator.onLine) {
                await syncOfflineData();

                // --- INTEGRACION C4I: Crear cuenta de acceso ---
                const cleanPhone = formData.phone.replace(/\D/g, '').slice(-10);
                await supabase.from('users').upsert([{
                    name: formData.name,
                    phone: cleanPhone.startsWith('+') ? cleanPhone : `+52${cleanPhone}`,
                    role: 'brigadista',
                    rank_name: 'Recluta Voluntario',
                    tenant_id: tenantId,
                    is_first_login: true,
                    temp_code: tacticalCode,
                    code_sent: false
                }], { onConflict: 'phone' });
                console.log(`C4I: Perfil de usuario y código táctico (${tacticalCode}) creados para ${cleanPhone}.`);
            }

            let earnedXp = 50;
            if (formData.commitment_level === 5) earnedXp += 50;
            if (formData.latitude) earnedXp += 20;
            if (formData.photo_url) earnedXp += 30;

            const savedAgent = localStorage.getItem('gamefi_agent_context');
            if (savedAgent) {
                const agent = JSON.parse(savedAgent);
                agent.xp += earnedXp;
                localStorage.setItem('gamefi_agent_context', JSON.stringify(agent));
                window.dispatchEvent(new Event('storage'));
            }

            setXpGained(user ? earnedXp : null);
            setShowQR(!!user); // Solo mostrar QR de contacto si es reclutamiento asistido

            if (!user) {
                setStatusMessage('✅ ¡Gracias por sumarte! Un representante validará tu registro pronto.');
            } else {
                setStatusMessage(`✅ Recluta Confirmado. +${earnedXp} XP`);
            }

            setFormData({
                name: '',
                phone: '',
                curp: '',
                clave_elector: '',
                domicilio: '',
                seccion: '',
                vigencia: '',
                birth_date: '',
                photo_url: null,
                latitude: null,
                longitude: null,
                commitment_level: 1
            });
            updateOfflineCount();

            setTimeout(() => {
                setStatusMessage('');
                setXpGained(null);
            }, 3000);

        } catch (error) {
            console.error('Error saving supporter:', error);
            setStatusMessage('❌ Error al guardar');
        } finally {
            setIsSaving(false);
        }
    };

    const handleManualSync = async () => {
        if (!navigator.onLine) {
            setStatusMessage('⚠️ Estás offline. Conéctate para sincronizar.');
            return;
        }
        setStatusMessage('Sincronizando...');
        await syncOfflineData();
        await updateOfflineCount();
        setStatusMessage('✅ Sincronización completa');
        setTimeout(() => setStatusMessage(''), 3000);
    };

    return (
        <div style={{ position: 'relative' }}>
            {showScanner && (
                <ScannerINE
                    onScanComplete={handleScanComplete}
                    onCancel={() => setShowScanner(false)}
                />
            )}

            {xpGained !== null && (
                <div style={{
                    position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
                    backgroundColor: 'var(--tertiary)', color: 'white', padding: '1rem 2rem',
                    borderRadius: '30px', fontWeight: 'bold', fontSize: '2rem',
                    boxShadow: '0 10px 25px rgba(255,230,109,0.5)', zIndex: 100,
                    animation: 'floatUp 2s ease-out forwards', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                    <Trophy size={32} /> +{xpGained} XP
                </div>
            )}

            <form onSubmit={handleSubmit} className="tactile-card flex-col gap-1" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontFamily: 'Oswald, sans-serif', color: 'var(--text-color)', margin: 0, fontSize: '1.4rem' }}>
                        <span style={{ color: 'var(--primary)' }}>//</span> REGISTRO DE ALIADO
                    </h2>
                    {offlineCount > 0 && (
                        <div className="tactile-badge" style={{ backgroundColor: 'rgba(255,90,54,0.2)', color: 'var(--primary)', borderColor: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 0 10px rgba(255,90,54,0.3)' }} onClick={handleManualSync}>
                            <span>{offlineCount} Pendientes</span>
                            <span style={{ fontSize: '1.2em' }}>↻</span>
                        </div>
                    )}
                </div>

                {/* Mode Selector */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <button
                        type="button"
                        onClick={() => setRegistrationMode('OCR')}
                        className={`squishy-btn ${registrationMode === 'OCR' ? 'primary' : ''}`}
                        style={{ flex: 1, padding: '0.6rem', fontSize: '0.85rem' }}
                    >
                        <Camera size={16} /> ESCÁNER INE
                    </button>
                    <button
                        type="button"
                        onClick={() => setRegistrationMode('MANUAL')}
                        className={`squishy-btn ${registrationMode === 'MANUAL' ? 'secondary' : ''}`}
                        style={{ flex: 1, padding: '0.6rem', fontSize: '0.85rem' }}
                    >
                        <User size={16} /> MANUAL
                    </button>
                </div>

                {registrationMode === 'OCR' && !formData.name && (
                    <button
                        type="button"
                        onClick={() => setShowScanner(true)}
                        className="squishy-btn primary"
                        style={{ padding: '2rem', marginBottom: '1rem', border: '2px dashed var(--primary)', background: 'rgba(255,90,54,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Camera size={48} />
                        <div style={{ fontFamily: 'Oswald', fontSize: '1.2rem' }}>ABRIR ESCÁNER DE CREDENCIAL</div>
                    </button>
                )}

                <div className="flex-col gap-1">
                    {formData.photo_url && (
                        <div style={{ position: 'relative', width: '100%', marginBottom: '1rem' }}>
                            <img
                                src={formData.photo_url}
                                alt="INE Preview"
                                style={{ width: '100%', borderRadius: '12px', border: '1px solid var(--primary)', filter: 'brightness(0.9)' }}
                            />
                            <div style={{ position: 'absolute', bottom: '10px', left: '10px', backgroundColor: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: '4px', color: 'var(--tertiary)', fontSize: '0.7rem', fontFamily: 'Oswald' }}>
                                EVIDENCIA INE CAPTURADA
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowScanner(true)}
                                style={{
                                    marginTop: '0.5rem',
                                    width: '100%',
                                    padding: '0.5rem',
                                    fontSize: '0.8rem',
                                    fontFamily: 'Oswald',
                                    backgroundColor: 'rgba(255,90,54,0.1)',
                                    border: '1px solid var(--primary)',
                                    color: 'var(--primary)',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <Camera size={16} /> VOLVER A ESCANEAR / REINTENTAR
                            </button>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div className="flex-col">
                            <label style={{ fontSize: '0.7rem', color: '#94A3B8', marginLeft: '0.5rem' }}>NOMBRE COMPLETO</label>
                            <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="squishy-input" placeholder="Nombre" required />
                        </div>
                        <div className="flex-col">
                            <label style={{ fontSize: '0.7rem', color: '#94A3B8', marginLeft: '0.5rem' }}>TELÉFONO CELULAR</label>
                            <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="squishy-input" placeholder="Manual: 10 dígitos" required />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div className="flex-col">
                            <label style={{ fontSize: '0.7rem', color: '#94A3B8', marginLeft: '0.5rem' }}>CURP</label>
                            <input type="text" name="curp" value={formData.curp} onChange={handleInputChange} className="squishy-input" placeholder="CURP" />
                        </div>
                        <div className="flex-col">
                            <label style={{ fontSize: '0.7rem', color: '#94A3B8', marginLeft: '0.5rem' }}>CLAVE ELECTOR</label>
                            <input type="text" name="clave_elector" value={formData.clave_elector} onChange={handleInputChange} className="squishy-input" placeholder="Clave Elector" />
                        </div>
                    </div>

                    <div className="flex-col">
                        <label style={{ fontSize: '0.7rem', color: '#94A3B8', marginLeft: '0.5rem' }}>DOMICILIO REGISTRADO</label>
                        <input type="text" name="domicilio" value={formData.domicilio} onChange={handleInputChange} className="squishy-input" placeholder="Calle, Número, Colonia" />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        <div className="flex-col">
                            <label style={{ fontSize: '0.7rem', color: '#94A3B8', marginLeft: '0.5rem' }}>FECHA NAC.</label>
                            <input type="date" name="birth_date" value={formData.birth_date} onChange={handleInputChange} className="squishy-input" />
                        </div>
                        <div className="flex-col">
                            <label style={{ fontSize: '0.7rem', color: '#94A3B8', marginLeft: '0.5rem' }}>SECCIÓN</label>
                            <input type="text" name="seccion" value={formData.seccion} onChange={handleInputChange} className="squishy-input" placeholder="0000" />
                        </div>
                        <div className="flex-col">
                            <label style={{ fontSize: '0.7rem', color: '#94A3B8', marginLeft: '0.5rem' }}>VIGENCIA</label>
                            <input type="text" name="vigencia" value={formData.vigencia} onChange={handleInputChange} className="squishy-input" placeholder="20XX" />
                        </div>
                    </div>

                    <div style={{ padding: '0.5rem 0', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', paddingInline: '1rem', marginTop: '0.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, fontFamily: 'Oswald, sans-serif', color: '#94A3B8', letterSpacing: '0.05em' }}>NIVEL DE COMPROMISO</label>
                        <input
                            type="range"
                            name="commitment_level"
                            min="1"
                            max="5"
                            value={formData.commitment_level}
                            onChange={handleInputChange}
                            style={{ width: '100%', accentColor: 'var(--primary)' }}
                        />
                        <div style={{ textAlign: 'center', fontWeight: 'bold', color: 'var(--primary)', filter: 'drop-shadow(0 0 5px var(--primary))', fontSize: '1.2rem', marginTop: '0.5rem' }}>
                            {'⭐'.repeat(formData.commitment_level)}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button
                            type="button"
                            className={`squishy-btn ${formData.latitude ? 'secondary' : ''}`}
                            style={{ flex: 1, padding: '0.8rem', fontSize: '0.9rem' }}
                            onClick={handleGPS}
                        >
                            {formData.latitude ? '📍 COORDENADAS FIJAS' : '📍 RASTREAR GPS'}
                        </button>
                    </div>

                    {statusMessage && (
                        <div style={{ textAlign: 'center', fontWeight: 'bold', padding: '0.5rem', color: statusMessage.includes('❌') ? 'red' : 'inherit' }}>
                            {statusMessage}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="squishy-btn primary"
                        style={{ marginTop: '1rem', padding: '1rem', fontSize: '1.2rem', boxShadow: '0 0 20px rgba(255,90,54,0.3)', width: '100%' }}
                        disabled={isSaving}
                    >
                        {isSaving ? 'ENCRIPTANDO...' : 'REGISTRAR ALIADO'}
                    </button>
                </div>
            </form>

            {/* QR MODAL */}
            {showQR && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 2000,
                    padding: '1rem', backdropFilter: 'blur(5px)'
                }}>
                    <div className="tactile-card" style={{
                        maxWidth: '400px', width: '100%', position: 'relative',
                        border: '2px solid var(--primary)', animation: 'fadeInScale 0.3s ease-out'
                    }}>
                        <button
                            onClick={() => setShowQR(false)}
                            style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}
                        >
                            <X size={24} />
                        </button>

                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{
                                background: 'var(--primary)', color: 'white', padding: '0.5rem',
                                borderRadius: '50%', width: '50px', height: '50px',
                                margin: '0 auto 1rem', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', boxShadow: '0 0 15px var(--primary)'
                            }}>
                                <User size={30} />
                            </div>
                            <h2 style={{ fontFamily: 'Oswald', margin: 0, fontSize: '1.5rem', color: 'white' }}>
                                ¡REGISTRO EXITOSO!
                            </h2>
                            <p style={{ color: 'var(--tertiary)', fontWeight: 'bold' }}>
                                +{xpGained} XP GANADOS
                            </p>
                        </div>

                        <WhatsAppQR
                            phone={candidateInfo.phone || '5219611234567'}
                            candidateName={candidateInfo.name}
                            message={`Hola ${candidateInfo.name}, me da gusto saludarte. Me acabo de registrar a través de ${user?.name}. ¡Estamos en contacto!`}
                        />

                        <button
                            className="squishy-btn"
                            onClick={() => setShowQR(false)}
                            style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', backgroundColor: 'transparent', border: '1px solid #64748B', color: '#64748B' }}
                        >
                            CONTINUAR AL SIGUIENTE REGISTRO
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
