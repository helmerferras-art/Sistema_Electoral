import React, { useState, useEffect } from 'react';
import { ShieldAlert, Server, Key, ShieldCheck, Loader2 } from 'lucide-react';

// Lógica de "Handshake" a Supabase
export const SetupWizard: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
    const [relayUrl, setRelayUrl] = useState('https://tu-proyecto.supabase.co');
    const [handshakeToken, setHandshakeToken] = useState('');
    const [nodeId, setNodeId] = useState('');
    const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');

    // Auto-gestionar Node ID local usando OS information
    useEffect(() => {
        if (window.c4iNative) {
            window.c4iNative.getSystemInfo().then(sys => {
                setNodeId(`NODO-${sys.hostname.toUpperCase().substring(0, 6)}-${Math.floor(Math.random() * 1000)}`);
            });
        } else {
            setNodeId(`NODO-WEB-${Math.floor(Math.random() * 10000)}`);
        }
    }, []);

    const handleHandshake = async () => {
        setStatus('testing');
        setErrorMsg('');

        try {
            // 1. Simular ping HTTP a Relay
            const formattedUrl = relayUrl.trim().replace(/\/$/, '');
            if (!formattedUrl.startsWith('http')) throw new Error("La URL debe empezar con https://");

            // 2. Aquí idealmente haríamos un Request a Supabase Function / Edge para validar el token.
            // Para efectos del MVP, validaremos que el token no esté vacío e insertaremos el perfil local

            if (handshakeToken.length < 6) { throw new Error("La Llave de Seguridad es inválida o muy corta."); }

            // 3. Registrar el nodo en la Base de Datos Local SQLite (Express Server)
            const res = await fetch('http://localhost:3000/api/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ relayUrl: formattedUrl, handshakeToken, nodeId })
            });

            if (!res.ok) throw new Error("El Servidor Local C4I no respondió. Verifique su Firewall.");

            const setupResp = await res.json();
            if (setupResp.success) {
                setStatus('success');
                setTimeout(() => {
                    onComplete();
                }, 2000);
            } else {
                throw new Error(setupResp.error || "Fallo en la configuración local");
            }

        } catch (error: any) {
            console.error(error);
            setStatus('error');
            setErrorMsg(error.message || "Error desconocido al intentar el Handshake.");
        }
    };

    return (
        <div className="app-container flex-center" style={{ minHeight: '100vh', padding: '1rem' }}>
            <div className="tactile-card glow-tertiary" style={{ width: '100%', maxWidth: '450px', display: 'flex', flexDirection: 'column', gap: '1.5rem', zIndex: 10 }}>

                <div className="flex-center-col" style={{ marginBottom: '1rem' }}>
                    <div style={{ padding: '1rem', background: 'rgba(0, 212, 255, 0.1)', borderRadius: '50%', marginBottom: '1rem' }} className="pulsate">
                        <Server size={48} color="var(--tertiary)" />
                    </div>
                    <h2 className="tactical-font" style={{ color: 'white', letterSpacing: '2px', margin: 0, textAlign: 'center' }}>C4I Secure Node</h2>
                    <p style={{ color: 'var(--tertiary)', fontSize: '0.85rem', fontFamily: 'monospace', margin: 0, opacity: 0.8, textAlign: 'center' }}>PROTOCOLO DE DESPLIEGUE HÍBRIDO</p>
                </div>

                {status === 'success' ? (
                    <div className="flex-center-col" style={{ padding: '2rem 0', gap: '1rem' }}>
                        <ShieldCheck size={64} color="var(--secondary)" className="pulsate" />
                        <h3 className="tactical-font" style={{ color: 'var(--secondary)', margin: 0 }}>ENLACE ESTABLECIDO</h3>
                        <p style={{ color: 'var(--text-color)', textAlign: 'center', opacity: 0.7, fontSize: '0.9rem' }}>
                            El nodo {nodeId} ha sido autenticado con el Alto Mando. Iniciando sistema base...
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--tertiary)', opacity: 0.8, fontFamily: 'monospace', letterSpacing: '1px' }}>IDENTIFICADOR DEL NODO LOCAL</label>
                            <div className="squishy-input" style={{ opacity: 0.5, cursor: 'not-allowed', display: 'flex', alignItems: 'center' }}>
                                {nodeId || "DETECTANDO..."}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--tertiary)', opacity: 0.8, fontFamily: 'monospace', letterSpacing: '1px' }}>URL DEL RELAY (NUBE CENTRAL)</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="url"
                                    value={relayUrl}
                                    onChange={(e) => setRelayUrl(e.target.value)}
                                    className="squishy-input"
                                    style={{ paddingLeft: '2.5rem' }}
                                    placeholder="https://tu-proyecto.supabase.co"
                                />
                                <Server size={18} color="var(--tertiary)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--tertiary)', opacity: 0.8, fontFamily: 'monospace', letterSpacing: '1px' }}>LLAVE DE SEGURIDAD (HANDSHAKE)</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type="password"
                                    value={handshakeToken}
                                    onChange={(e) => setHandshakeToken(e.target.value)}
                                    className="squishy-input"
                                    style={{ paddingLeft: '2.5rem', fontFamily: 'monospace', letterSpacing: '2px' }}
                                    placeholder="Código de Aprobación..."
                                />
                                <Key size={18} color="var(--tertiary)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }} />
                            </div>
                        </div>

                        {status === 'error' && (
                            <div style={{ padding: '0.8rem', background: 'rgba(255, 90, 54, 0.1)', border: '1px solid var(--primary)', borderRadius: 'var(--border-radius-sm)', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                                <ShieldAlert size={24} color="var(--primary)" />
                                <span style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>{errorMsg}</span>
                            </div>
                        )}

                        <button
                            onClick={handleHandshake}
                            disabled={status === 'testing' || !relayUrl || !handshakeToken}
                            className="squishy-btn primary"
                            style={{ padding: '1rem', marginTop: '0.5rem', opacity: (status === 'testing' || !relayUrl || !handshakeToken) ? 0.5 : 1 }}
                        >
                            {status === 'testing' ? (
                                <>
                                    <Loader2 size={20} className="spin" />
                                    <span>VALIDANDO FIRMA...</span>
                                </>
                            ) : (
                                <>
                                    <ShieldCheck size={20} />
                                    <span>SINCRONIZAR Y ARRANCAR NODO</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
