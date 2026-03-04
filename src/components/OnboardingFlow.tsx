import { useState, useEffect } from 'react';
import { Shield, Target, WifiOff, ChevronRight, Play, Camera } from 'lucide-react';
import { ScannerINE } from './ScannerINE';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

interface Props {
    onComplete: () => void;
}

export const OnboardingFlow = ({ onComplete }: Props) => {
    const { user } = useAuth();
    const [step, setStep] = useState(0);
    const [agentName, setAgentName] = useState('');
    const [showScanner, setShowScanner] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Detailed Profile Data
    const [profileData, setProfileData] = useState({
        name: '',
        curp: '',
        clave_elector: '',
        domicilio: '',
        seccion: '',
        vigencia: '',
        photo_url: null as string | null
    });

    // Step 0: Loading Screen
    useEffect(() => {
        if (step === 0) {
            const timer = setTimeout(() => {
                setStep(1);
            }, 3500); // Fake sync time
            return () => clearTimeout(timer);
        }
    }, [step]);

    // Loading Screen (Niebla de Guerra)
    if (step === 0) {
        return (
            <div className="flex-center flex-col" style={{ height: '100vh', backgroundColor: 'var(--bg-color)', color: '#fff', position: 'relative', overflow: 'hidden' }}>
                {/* Cyberpunk grid background */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundImage: 'linear-gradient(rgba(0, 212, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 212, 255, 0.1) 1px, transparent 1px)', backgroundSize: '30px 30px', opacity: 0.3 }}></div>

                <div style={{
                    width: '180px',
                    height: '180px',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,90,54,0.2) 0%, rgba(15,18,24,1) 70%)',
                    border: '2px solid rgba(255,90,54,0.5)',
                    boxShadow: '0 0 30px rgba(255,90,54,0.4), inset 0 0 20px rgba(255,90,54,0.2)',
                    animation: 'pulse 2s infinite',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginBottom: '2rem',
                    position: 'relative'
                }}>
                    {/* Radar Sweep Line */}
                    <div style={{ position: 'absolute', top: '50%', left: '50%', width: '50%', height: '2px', background: 'linear-gradient(90deg, transparent, var(--primary))', transformOrigin: 'left center', animation: 'spin 3s linear infinite' }}></div>
                    <Shield size={64} color="var(--primary)" style={{ filter: 'drop-shadow(0 0 10px var(--primary))', zIndex: 2 }} />
                </div>
                <h2 style={{ fontFamily: 'Oswald, sans-serif', color: 'var(--primary)', marginBottom: '0.5rem', letterSpacing: '0.2em', textShadow: '0 0 10px var(--primary)', zIndex: 2 }}>CUARTEL GENERAL</h2>
                <p style={{ fontFamily: 'Inter, monospace', color: 'var(--tertiary)', textAlign: 'center', fontSize: '0.85rem', letterSpacing: '0.1em', zIndex: 2 }}>
                    &gt; SECURE CONNECTION ESTABLISHED<br />
                    &gt; DESPEJANDO NIEBLA DE GUERRA...
                </p>
                <style>{`
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    // Welcome Video / Avatar
    if (step === 1) {
        return (
            <div className="flex-center flex-col" style={{ height: '100vh', padding: '1.5rem', textAlign: 'center', backgroundColor: 'var(--bg-color)' }}>
                <div className="tactile-card" style={{ width: '100%', maxWidth: '400px', border: '1px solid var(--primary)', boxShadow: '0 0 20px rgba(255,90,54,0.1)' }}>
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', height: '200px', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '1.5rem', position: 'relative', overflow: 'hidden' }}>
                        {/* Mock Scanline */}
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,212,255,0.05) 2px, rgba(0,212,255,0.05) 4px)', pointerEvents: 'none' }}></div>
                        <div style={{ position: 'absolute', top: '10px', left: '10px', backgroundColor: 'rgba(255,0,0,0.2)', color: 'var(--primary)', border: '1px solid var(--primary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em', animation: 'pulse 2s infinite' }}>REC</div>
                        <Play size={48} color="var(--tertiary)" style={{ filter: 'drop-shadow(0 0 10px var(--tertiary))' }} />
                    </div>
                    <h2 style={{ color: 'var(--primary)', marginBottom: '1rem', textShadow: '0 0 10px rgba(255,90,54,0.3)' }}>¡BIENVENIDO A LA LEGIÓN!</h2>
                    <p style={{ marginBottom: '1.5rem', lineHeight: '1.6', color: 'var(--text-color)', fontFamily: 'Inter, sans-serif', fontSize: '0.95rem' }}>
                        "Chiapas no necesita más de lo mismo, necesita una legión. No eres un usuario más, eres un <strong style={{ color: 'var(--tertiary)' }}>Explorador de Territorio</strong>. Tu misión es iluminar el mapa y recuperar nuestra tierra."
                    </p>
                    <div className="flex-col gap-1">
                        <label style={{ fontWeight: 'bold', textAlign: 'left', color: '#64748B', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Identificación de Agente:</label>
                        <input
                            type="text"
                            className="squishy-input"
                            placeholder="Ej. JAGUAR99"
                            value={agentName}
                            onChange={(e) => setAgentName(e.target.value.toUpperCase())}
                            style={{ textAlign: 'center', letterSpacing: '0.2em', fontFamily: 'Oswald, sans-serif', fontSize: '1.2rem' }}
                        />
                    </div>
                    <button
                        className="squishy-btn primary"
                        style={{ width: '100%', marginTop: '1.5rem' }}
                        disabled={!agentName.trim()}
                        onClick={() => setStep(2)}
                    >
                        ACEPTAR MISIÓN
                    </button>
                </div>
            </div>
        );
    }

    // Tutorial - Las 3 Reglas
    if (step === 2) {
        return (
            <div className="flex-center flex-col" style={{ height: '100vh', padding: '1.5rem', backgroundColor: 'var(--bg-color)' }}>
                <h1 style={{ color: 'var(--text-color)', marginBottom: '2rem', textAlign: 'center', textShadow: '0 0 10px rgba(255,255,255,0.2)' }}>REGLAS DE OPERACIÓN</h1>

                <div className="flex-col gap-2" style={{ maxWidth: '400px' }}>
                    <div className="tactile-card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem' }}>
                        <div style={{ padding: '0.8rem', backgroundColor: 'rgba(255,90,54,0.1)', border: '1px solid rgba(255,90,54,0.3)', borderRadius: '8px', color: 'var(--primary)', boxShadow: '0 0 10px rgba(255,90,54,0.2) inset' }}>
                            <Target size={28} style={{ filter: 'drop-shadow(0 0 5px var(--primary))' }} />
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--primary)', fontSize: '1.1rem' }}>1. MAPEAR ES PODER</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8', fontFamily: 'Inter, sans-serif' }}>Cada aliado dañado es una zona asegurada. <strong style={{ color: 'var(--primary)' }}>+50 XP</strong> por confirmación.</p>
                        </div>
                    </div>

                    <div className="tactile-card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem' }}>
                        <div style={{ padding: '0.8rem', backgroundColor: 'rgba(0,230,118,0.1)', border: '1px solid rgba(0,230,118,0.3)', borderRadius: '8px', color: 'var(--secondary)', boxShadow: '0 0 10px rgba(0,230,118,0.2) inset' }}>
                            <Shield size={28} style={{ filter: 'drop-shadow(0 0 5px var(--secondary))' }} />
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--secondary)', fontSize: '1.1rem' }}>2. SUBE DE RANGO</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8', fontFamily: 'Inter, sans-serif' }}>Acumula 500 XP = <strong style={{ color: 'var(--secondary)' }}>GUARDIÁN</strong>. Acceso a recompensas élite.</p>
                        </div>
                    </div>

                    <div className="tactile-card" style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem' }}>
                        <div style={{ padding: '0.8rem', backgroundColor: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: '8px', color: 'var(--tertiary)', boxShadow: '0 0 10px rgba(0,212,255,0.2) inset' }}>
                            <WifiOff size={28} style={{ filter: 'drop-shadow(0 0 5px var(--tertiary))' }} />
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--tertiary)', fontSize: '1.1rem' }}>3. RADAR OFFLINE</h3>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94A3B8', fontFamily: 'Inter, sans-serif' }}>Captura en zona ciega. Sincroniza al restaurar conexión al satélite.</p>
                        </div>
                    </div>
                </div>

                <button
                    className="squishy-btn secondary"
                    style={{ width: '100%', maxWidth: '400px', marginTop: '2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                    onClick={() => setStep(3)}
                >
                    ENTENDIDO <ChevronRight size={20} />
                </button>
            </div>
        );
    }

    const handleScanComplete = (extractedData: any) => {
        setProfileData(prev => ({
            ...prev,
            name: extractedData.nombre || prev.name,
            domicilio: extractedData.domicilio || prev.domicilio,
            clave_elector: extractedData.clave_elector || prev.clave_elector,
            curp: extractedData.curp || prev.curp,
            seccion: extractedData.seccion || prev.seccion,
            vigencia: extractedData.vigencia || prev.vigencia,
            photo_url: extractedData.foto || prev.photo_url
        }));
        if (extractedData.nombre) setAgentName(extractedData.nombre);
        setShowScanner(false);
    };

    const handleFinalSubmit = async () => {
        setIsSaving(true);
        try {
            // Update the user profile in the database
            const { error } = await supabase
                .from('users')
                .update({
                    name: profileData.name || agentName,
                    curp: profileData.curp,
                    id_card_key: profileData.clave_elector, // Map based on your schema
                    address: profileData.domicilio,
                    seccion_id: profileData.seccion,
                    is_first_login: false,
                    photo_url: profileData.photo_url,
                    rank_name: 'Agente Verificado'
                })
                .eq('id', user?.id);

            if (error) throw error;
            onComplete();
        } catch (err) {
            console.error("Error saving profile:", err);
            alert("Error al guardar perfil. Intente de nuevo.");
        } finally {
            setIsSaving(false);
        }
    };

    // MISSION TUTORIAL / DATA COLLECTION
    if (step === 3) {
        return (
            <div className="flex-center flex-col" style={{ height: '100vh', padding: '1.5rem', backgroundColor: 'var(--bg-color)', backgroundImage: 'radial-gradient(circle at center, rgba(0, 212, 255, 0.05) 0%, transparent 60%)', overflowY: 'auto' }}>
                {showScanner && (
                    <ScannerINE
                        onScanComplete={handleScanComplete}
                        onCancel={() => setShowScanner(false)}
                    />
                )}

                <div className="tactile-card" style={{ maxWidth: '450px', width: '100%', border: '1px solid var(--tertiary)', boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)', marginTop: 'auto', marginBottom: 'auto' }}>
                    <div style={{ backgroundColor: 'rgba(0,212,255,0.1)', border: '1px solid var(--tertiary)', color: 'var(--tertiary)', padding: '0.4rem 1rem', borderRadius: '4px', display: 'inline-block', marginBottom: '1rem', fontWeight: 'bold', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em' }}>
                        ORDEN DE REGISTRO COMPLETO
                    </div>

                    <h2 style={{ marginBottom: '1rem', color: 'var(--text-color)', fontSize: '1.4rem' }}>IDENTIFICACIÓN DE LA LEGIÓN</h2>

                    <p style={{ marginBottom: '1.5rem', color: '#94A3B8', fontSize: '0.85rem' }}>
                        "Un agente sin rostro no puede liderar el territorio. Escanea tu identificación o completa tus datos manualmente para habilitar tu acceso al radar."
                    </p>

                    <div className="flex-col gap-3">
                        {!profileData.photo_url ? (
                            <button
                                type="button"
                                onClick={() => setShowScanner(true)}
                                className="squishy-btn primary"
                                style={{ padding: '1.5rem', border: '2px dashed var(--primary)', background: 'rgba(255,90,54,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <Camera size={32} />
                                <div style={{ fontFamily: 'Oswald', fontSize: '1rem' }}>AUTO-ESCANEO TÁCTICO (INE)</div>
                            </button>
                        ) : (
                            <div style={{ position: 'relative' }}>
                                <img src={profileData.photo_url} style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--primary)' }} alt="Profile Preview" />
                                <button
                                    onClick={() => setShowScanner(true)}
                                    style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', padding: '5px', color: 'white' }}
                                >
                                    <Camera size={16} />
                                </button>
                            </div>
                        )}

                        <div className="flex-col gap-2" style={{ textAlign: 'left' }}>
                            <div className="flex-col">
                                <label style={{ fontSize: '0.65rem', color: '#64748B', marginBottom: '2px', marginLeft: '5px' }}>NOMBRE</label>
                                <input
                                    value={profileData.name || agentName}
                                    onChange={e => { setProfileData({ ...profileData, name: e.target.value }); setAgentName(e.target.value); }}
                                    className="squishy-input"
                                    placeholder="Nombre del Agente"
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                <div className="flex-col">
                                    <label style={{ fontSize: '0.65rem', color: '#64748B', marginBottom: '2px', marginLeft: '5px' }}>CURP / CLAVE</label>
                                    <input
                                        value={profileData.curp || profileData.clave_elector}
                                        onChange={e => setProfileData({ ...profileData, curp: e.target.value })}
                                        className="squishy-input"
                                        placeholder="Identificación"
                                    />
                                </div>
                                <div className="flex-col">
                                    <label style={{ fontSize: '0.65rem', color: '#64748B', marginBottom: '2px', marginLeft: '5px' }}>SECCIÓN</label>
                                    <input
                                        value={profileData.seccion}
                                        onChange={e => setProfileData({ ...profileData, seccion: e.target.value })}
                                        className="squishy-input"
                                        placeholder="0000"
                                    />
                                </div>
                            </div>

                            <div className="flex-col">
                                <label style={{ fontSize: '0.65rem', color: '#64748B', marginBottom: '2px', marginLeft: '5px' }}>DOMICILIO</label>
                                <input
                                    value={profileData.domicilio}
                                    onChange={e => setProfileData({ ...profileData, domicilio: e.target.value })}
                                    className="squishy-input"
                                    placeholder="Dirección completa"
                                />
                            </div>
                        </div>

                        <button
                            className="squishy-btn primary"
                            style={{ width: '100%', fontSize: '1.1rem', padding: '1rem', marginTop: '0.5rem' }}
                            onClick={handleFinalSubmit}
                            disabled={isSaving || (!agentName && !profileData.name)}
                        >
                            {isSaving ? 'ENCRIPTANDO...' : 'SINCRO CON COMANDO CENTRAL'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};
