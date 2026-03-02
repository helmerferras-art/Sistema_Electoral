import { useState, useEffect, useRef } from 'react';
import { Smartphone, Zap, Globe, Activity, Loader2, RefreshCw } from 'lucide-react';
import { bridgeDiscovery } from '../lib/bridgeDiscovery';

// --- Safe Text Component to prevent 3rd party DOM manipulation errors ---
const SafeText = ({ children, style }: { children: React.ReactNode, style?: React.CSSProperties }) => (
    <span translate="no" className="notranslate" style={style}>{children}</span>
);

interface Device {
    id: string;
    model: string;
    battery: number;
    signal: number; // 0-4
    status: 'connected' | 'busy' | 'disconnected' | 'unauthorized' | 'offline';
    sentToday: number;
}

const DeviceConfig = ({ deviceId, initialConfig, onLog }: { deviceId: string, initialConfig?: any, onLog: (m: string, t: any) => void }) => {
    const [waX, setWaX] = useState('');
    const [waY, setWaY] = useState('');
    const [smsX, setSmsX] = useState('');
    const [smsY, setSmsY] = useState('');
    const [alias, setAlias] = useState('');
    const initialized = useRef(false); // Only load from config once — prevents 10s poll from overwriting user edits

    useEffect(() => {
        if (initialConfig && !initialized.current) {
            initialized.current = true; // Lock: never overwrite again after first load
            if (initialConfig.waTap) {
                setWaX(initialConfig.waTap.x?.toString() || '');
                setWaY(initialConfig.waTap.y?.toString() || '');
            }
            if (initialConfig.smsTap) {
                setSmsX(initialConfig.smsTap.x?.toString() || '');
                setSmsY(initialConfig.smsTap.y?.toString() || '');
            }
            setAlias(initialConfig.alias || '');
        }
    }, [initialConfig]);

    const saveGeneralConfig = async () => {
        try {
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (!baseUrl) throw new Error("Bridge not found");

            await fetch(`${baseUrl}/set-device-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, config: { alias } })
            });
            onLog(`Alias "${alias || deviceId}" guardado`, 'success');
        } catch (e) {
            onLog("Error al guardar alias", 'err');
        }
    };

    const saveConfig = async (type: 'wa' | 'sms') => {
        const xVal = type === 'wa' ? waX : smsX;
        const yVal = type === 'wa' ? waY : smsY;

        if (xVal === '' || yVal === '') {
            return onLog("Ingresa coordenadas X e Y primero", 'err');
        }

        const config = type === 'wa'
            ? { waTap: { x: parseInt(xVal.toString()), y: parseInt(yVal.toString()) } }
            : { smsTap: { x: parseInt(xVal.toString()), y: parseInt(yVal.toString()) } };

        try {
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (!baseUrl) throw new Error("Bridge not found");

            await fetch(`${baseUrl}/set-device-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, config })
            });
            onLog(`Calibración ${type.toUpperCase()} guardada para ${deviceId}`, 'success');
        } catch (e) {
            onLog("Error al guardar calibración", 'err');
        }
    };

    const testTap = async (type: 'wa' | 'sms') => {
        const x = type === 'wa' ? waX : smsX;
        const y = type === 'wa' ? waY : smsY;
        if (!x || !y) return onLog("Ingresa coordenadas primero", 'err');

        onLog(`Probando toque en ${x}, ${y}...`, 'info');
        try {
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (!baseUrl) throw new Error("Bridge not found");

            const res = await fetch(`${baseUrl}/retry-keys`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId, x, y })
            });
            if (!res.ok) {
                const data = await res.json();
                onLog(`Error: ${data.error} (${data.details || ''})`, 'err');
            } else {
                onLog(`Toque enviado a ${deviceId}`, 'success');
            }
        } catch (e) {
            onLog("Fallo de conexión con el puente", 'err');
        }
    };

    return (
        <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '0.5rem' }}>
            {/* PARTE 1: IDENTIFICACIÓN */}
            <div className="flex-col gap-2" style={{ marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                <div className="flex-col">
                    <label style={{ fontSize: '0.6rem', color: '#94A3B8' }}>NOMBRE/ALIAS</label>
                    <div className="flex-row gap-2">
                        <input type="text" value={alias} placeholder="Ej: Celular 1" style={{ flex: 1, fontSize: '0.7rem', padding: '4px', background: '#0a0d11', border: '1px solid #334155', color: 'white' }} onChange={(e) => setAlias(e.target.value)} />
                        <button className="squishy-btn mini" onClick={saveGeneralConfig} style={{ fontSize: '0.55rem', padding: '4px 8px', background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>OK</button>
                    </div>
                </div>
            </div>

            <span style={{ fontSize: '0.65rem', color: '#EAB308', display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                📍 CALIBRACIÓN DE TOQUE (ADB TAP)
            </span>
            <div className="flex-col gap-3">
                <div className="flex-row gap-2" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="flex-row gap-2" style={{ alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', width: '25px', color: '#94A3B8' }}>WA:</span>
                        <input type="number" value={waX} placeholder="X" style={{ width: '45px', fontSize: '0.7rem', padding: '2px', background: '#0a0d11', border: '1px solid #334155', color: 'white' }} onChange={(e) => setWaX(e.target.value)} />
                        <input type="number" value={waY} placeholder="Y" style={{ width: '45px', fontSize: '0.7rem', padding: '2px', background: '#0a0d11', border: '1px solid #334155', color: 'white' }} onChange={(e) => setWaY(e.target.value)} />
                    </div>
                    <div className="flex-row gap-2">
                        <button className="squishy-btn mini" onClick={() => saveConfig('wa')} style={{ fontSize: '0.55rem', padding: '2px 6px', background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>GUARDAR</button>
                        <button className="squishy-btn mini" onClick={() => testTap('wa')} style={{ fontSize: '0.55rem', padding: '2px 6px', background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>PROBAR</button>
                    </div>
                </div>
                <div className="flex-row gap-2" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="flex-row gap-2" style={{ alignItems: 'center' }}>
                        <span style={{ fontSize: '0.6rem', width: '25px', color: '#94A3B8' }}>SMS:</span>
                        <input type="number" value={smsX} placeholder="X" style={{ width: '45px', fontSize: '0.7rem', padding: '2px', background: '#0a0d11', border: '1px solid #334155', color: 'white' }} onChange={(e) => setSmsX(e.target.value)} />
                        <input type="number" value={smsY} placeholder="Y" style={{ width: '45px', fontSize: '0.7rem', padding: '2px', background: '#0a0d11', border: '1px solid #334155', color: 'white' }} onChange={(e) => setSmsY(e.target.value)} />
                    </div>
                    <div className="flex-row gap-2">
                        <button className="squishy-btn mini" onClick={() => saveConfig('sms')} style={{ fontSize: '0.55rem', padding: '2px 6px', background: 'rgba(16,185,129,0.1)', color: '#10B981' }}>GUARDAR</button>
                        <button className="squishy-btn mini" onClick={() => testTap('sms')} style={{ fontSize: '0.55rem', padding: '2px 6px', background: 'rgba(56,189,248,0.1)', color: '#38bdf8' }}>PROBAR</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const SmsGatewayDashboard = () => {
    const [devices, setDevices] = useState<Device[]>([]);
    const [deviceConfigs, setDeviceConfigs] = useState<any>({});
    const [globalGmail, setGlobalGmail] = useState('');
    const [logs, setLogs] = useState<{ id: string; msg: string; type: 'info' | 'success' | 'err' }[]>([]);
    const [connecting, setConnecting] = useState(false);
    const [bridgeConnected, setBridgeConnected] = useState(false);
    const [autoSync, setAutoSync] = useState(true);
    const initialLoadDone = useRef(false);

    // Simulation for demo purposes, but ready to connect to local bridge
    useEffect(() => {
        fetchDevices();
        const interval = setInterval(fetchDevices, 10000); // Check every 10s
        return () => clearInterval(interval);
    }, []);

    const fetchDevices = async () => {
        try {
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (!baseUrl) {
                setBridgeConnected(false);
                setDevices([]);
                return;
            }

            // Attempt to connect to local bridge
            const res = await fetch(`${baseUrl}/status`).catch(() => null);
            if (res && res.ok) {
                const data = await res.json();
                setDevices(data.devices);
                setBridgeConnected(true);

                // Fetch configs
                const cfgRes = await fetch(`${baseUrl}/device-configs`).catch(() => null);
                if (cfgRes && cfgRes.ok) {
                    const cfgData = await cfgRes.json();
                    setDeviceConfigs(cfgData);
                    if (cfgData.GLOBAL?.gmail && !initialLoadDone.current) {
                        setGlobalGmail(cfgData.GLOBAL.gmail);
                        initialLoadDone.current = true;
                    }
                }
            } else {
                setBridgeConnected(false);
                setDevices([]);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const addLog = (msg: string, type: 'info' | 'success' | 'err' = 'info') => {
        setLogs((prev: any) => [{ id: Math.random().toString(36), msg, type }, ...prev].slice(0, 20));
    };

    const handleRefresh = () => {
        setConnecting(true);
        addLog("Escaneando puertos ADB...", 'info');
        setTimeout(() => {
            fetchDevices();
            setConnecting(false);
            addLog("Dispositivos sincronizados correctamente", 'success');
        }, 1500);
    };

    const saveGlobalGmail = async () => {
        try {
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (!baseUrl) throw new Error("Bridge not found");

            await fetch(`${baseUrl}/set-device-config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: 'GLOBAL', config: { gmail: globalGmail } })
            });
            addLog(`Cuenta Gmail global "${globalGmail}" guardada`, 'success');
        } catch (e) {
            addLog("Error al guardar Gmail global", 'err');
        }
    };

    return (
        <div className="flex-col gap-6 notranslate" translate="no" style={{ width: '100%' }}>

            {/* CONFIGURACIÓN GLOBAL */}
            <div className="tactile-card" style={{ borderLeft: '4px solid var(--tertiary)', background: 'rgba(0, 212, 255, 0.03)' }}>
                <div className="flex-row-resp" style={{ gap: '1rem', alignItems: 'center' }}>
                    <div style={{ background: 'var(--tertiary)', color: 'black', padding: '0.6rem', borderRadius: '50%' }}><Globe size={20} /></div>
                    <div style={{ flex: 1 }}>
                        <h4 style={{ margin: 0, color: 'var(--tertiary)', fontFamily: 'Oswald' }}>CONFIGURACIÓN GLOBAL</h4>
                        <div className="flex-row gap-4" style={{ marginTop: '0.5rem', alignItems: 'flex-end' }}>
                            <div className="flex-col" style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.7rem', color: '#94A3B8', marginBottom: '4px' }}>CUENTA GMAIL (SINCRO CONTACTOS)</label>
                                <input
                                    type="email"
                                    value={globalGmail}
                                    className="squishy-input"
                                    placeholder="ejemplo@gmail.com"
                                    style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                                    onChange={(e) => setGlobalGmail(e.target.value)}
                                />
                            </div>
                            <button
                                className="squishy-btn"
                                onClick={saveGlobalGmail}
                                style={{ height: '38px', padding: '0 2rem', background: 'var(--tertiary)', color: 'black', border: 'none' }}
                            >
                                GUARDAR
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {!bridgeConnected ? (
                <div className="tactile-card" style={{
                    border: '1px solid #EAB308',
                    background: 'rgba(234, 179, 8, 0.05)',
                    padding: '1.5rem',
                    borderLeft: '10px solid #EAB308'
                }}>
                    <div className="flex-row-resp" style={{ gap: '1.5rem', alignItems: 'center' }}>
                        <div style={{
                            background: '#EAB308',
                            color: 'black',
                            padding: '1rem',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Zap size={32} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <h3 style={{ margin: 0, color: '#EAB308', fontFamily: 'Oswald' }}><SafeText>PUENTE DESCONECTADO (MODO AUTO)</SafeText></h3>
                                <div className="flex-row" style={{ gap: '0.5rem', alignItems: 'center', background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: '20px' }}>
                                    <span style={{ fontSize: '0.7rem', color: autoSync ? '#10B981' : '#64748B' }}><SafeText>{autoSync ? 'ON' : 'OFF'}</SafeText></span>
                                    <input type="checkbox" checked={autoSync} onChange={() => setAutoSync(!autoSync)} style={{ cursor: 'pointer' }} title="Intentar arranque automático" />
                                </div>
                            </div>
                            <p style={{ margin: '0.5rem 0', color: '#CBD5E1', fontSize: '0.9rem' }}>
                                <SafeText>He vinculado el arranque del puente directamente con la aplicación. Si ves este mensaje, intenta reiniciar </SafeText><code>npm run dev</code><SafeText> o usa el botón de abajo.</SafeText>
                            </p>
                            <div className="flex-row" style={{ gap: '1rem', marginTop: '1rem' }}>
                                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.8rem', borderRadius: '8px', flex: 1, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block' }}><SafeText>ESTADO</SafeText></span>
                                    <span style={{ fontSize: '0.85rem', color: '#EAB308' }}><SafeText>Buscando Bridge en puertos 5000-5010...</SafeText></span>
                                </div>
                                <button
                                    className="squishy-btn"
                                    onClick={() => window.open('file:///c:/Proyecto_Electoral/INICIAR_PUENTE.bat')}
                                    style={{ flex: 1, background: 'var(--accent)', border: 'none', color: 'white', fontSize: '0.85rem' }}
                                >
                                    <SafeText>Lanzar Bridge Manual 🚀</SafeText>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="tactile-card" style={{
                    border: '1px solid #10B981',
                    background: 'rgba(16, 185, 129, 0.05)',
                    padding: '1rem',
                    borderLeft: '10px solid #10B981',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                }}>
                    <div style={{ background: '#10B981', color: 'white', padding: '0.5rem', borderRadius: '50%' }}><Activity size={20} /></div>
                    <div>
                        <h4 style={{ margin: 0, color: '#10B981', fontFamily: 'Oswald' }}><SafeText>PUENTE ACTIVO Y SINCRONIZADO</SafeText></h4>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}><SafeText>El hardware local está respondiendo correctamente. Listo para envíos masivos y automatización IA.</SafeText></p>
                    </div>
                </div>
            )}

            {/* 1. TOP STATS */}
            <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                <div className="tactile-card" style={{ borderLeft: '4px solid var(--secondary)' }}>
                    <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}><SafeText>TOTAL SMS HOY</SafeText></p>
                            <h2 style={{ margin: 0, fontFamily: 'Oswald' }}>
                                <SafeText>{devices.reduce((acc: number, d: Device) => acc + d.sentToday, 0).toString()}</SafeText>
                            </h2>
                        </div>
                        <Activity color="var(--secondary)" size={24} />
                    </div>
                </div>
                <div className="tactile-card" style={{ borderLeft: '4px solid var(--tertiary)' }}>
                    <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}><SafeText>DISPOSITIVOS ACTIVOS</SafeText></p>
                            <h2 style={{ margin: 0, fontFamily: 'Oswald' }}>
                                <SafeText>{devices.filter((d: Device) => d.status !== 'disconnected').length} / 10</SafeText>
                            </h2>
                        </div>
                        <Smartphone color="var(--tertiary)" size={24} />
                    </div>
                </div>
                <div className="flex-center">
                    <button
                        className="squishy-btn"
                        onClick={handleRefresh}
                        disabled={connecting}
                        style={{ width: '100%', height: '100%', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        {connecting ? <Loader2 className="spin" /> : <><RefreshCw size={18} /> <SafeText>ACTUALIZAR HARDWARE</SafeText></>}
                    </button>
                </div>
            </div>

            <div className="responsive-grid" style={{ gridTemplateColumns: '1.5fr 1fr' }}>

                {/* 2. DEVICE GRID */}
                <div className="flex-col gap-4">
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Globe size={20} color="var(--tertiary)" /> <SafeText>GATEWAY STATUS (CLUSTER)</SafeText>
                    </h3>
                    <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
                        {devices.map((device: Device) => (
                            <div key={device.id} className="tactile-card" style={{
                                background: 'rgba(255,255,255,0.02)',
                                border: `1px solid ${device.status === 'connected' ? 'rgba(52,211,153,0.3)' :
                                    device.status === 'unauthorized' ? 'rgba(234,179,8,0.3)' :
                                        'rgba(239,68,68,0.3)'
                                    }`,
                                position: 'relative',
                                borderLeft: `4px solid ${device.status === 'connected' ? '#10B981' :
                                    device.status === 'unauthorized' ? '#EAB308' :
                                        '#EF4444'
                                    }`
                            }}>
                                <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Smartphone size={20} color={device.status === 'connected' ? '#10B981' : '#E2E8F0'} />
                                        <div className="flex-col">
                                            {deviceConfigs[device.id]?.alias && (
                                                <span style={{ fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--tertiary)' }}><SafeText>{deviceConfigs[device.id].alias}</SafeText></span>
                                            )}
                                            <span style={{ fontWeight: deviceConfigs[device.id]?.alias ? 'normal' : 'bold', fontSize: deviceConfigs[device.id]?.alias ? '0.65rem' : '0.9rem', color: deviceConfigs[device.id]?.alias ? '#94A3B8' : 'white' }}>
                                                <SafeText>{device.model}</SafeText>
                                            </span>
                                        </div>
                                    </div>
                                    <span style={{ fontSize: '0.6rem', color: '#64748B' }}><SafeText>{device.id}</SafeText></span>
                                </div>

                                <div className="flex-col gap-2">
                                    <div className="flex-row" style={{ justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: '#94A3B8' }}><SafeText>Batería</SafeText></span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Zap size={10} color={device.battery < 20 ? '#EF4444' : '#EAB308'} /> <SafeText>{device.battery}%</SafeText>
                                        </span>
                                    </div>

                                    {/* COMPONENTE DE CONFIGURACIÓN Y CALIBRACIÓN */}
                                    <DeviceConfig
                                        deviceId={device.id}
                                        initialConfig={deviceConfigs[device.id]}
                                        onLog={addLog}
                                    />

                                    <div className="flex-row" style={{ justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                                        <span style={{ color: '#94A3B8' }}><SafeText>SMS Enviados</SafeText></span>
                                        <span style={{ fontWeight: 'bold', color: 'var(--secondary)' }}><SafeText>{device.sentToday.toString()}</SafeText></span>
                                    </div>
                                </div>

                                <div style={{
                                    marginTop: '1rem',
                                    padding: '4px 8px',
                                    background:
                                        device.status === 'connected' ? 'rgba(16,185,129,0.1)' :
                                            device.status === 'unauthorized' ? 'rgba(234,179,8,0.1)' :
                                                'rgba(239,68,68,0.1)',
                                    borderRadius: '4px',
                                    textAlign: 'center',
                                    fontSize: '0.65rem',
                                    fontWeight: 'bold',
                                    color:
                                        device.status === 'connected' ? '#10B981' :
                                            device.status === 'unauthorized' ? '#EAB308' :
                                                '#EF4444'
                                }}>
                                    <SafeText>{device.status.toUpperCase()}</SafeText>
                                </div>

                                {device.status === 'unauthorized' && (
                                    <div style={{ marginTop: '0.5rem', padding: '4px', background: 'rgba(234,179,8,0.1)', borderRadius: '4px', fontSize: '0.6rem', color: '#EAB308', textAlign: 'center', border: '1px dashed #EAB308' }}>
                                        <SafeText>⚠️ ACEPTA EL PERMISO EN EL CELULAR</SafeText>
                                    </div>
                                )}
                                {device.status === 'offline' && (
                                    <div style={{ marginTop: '0.5rem', padding: '4px', background: 'rgba(239,68,68,0.1)', borderRadius: '4px', fontSize: '0.6rem', color: '#EF4444', textAlign: 'center', border: '1px dashed #EF4444' }}>
                                        <SafeText>❌ REVISA EL CABLE O MODO CARGA</SafeText>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 3. LOGS / TERMINAL */}
                <div className="flex-col gap-4">
                    <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Activity size={20} color="var(--secondary)" /> <SafeText>LIVE CONSOLE</SafeText>
                        </h3>
                        <button
                            className="squishy-btn mini"
                            onClick={async () => {
                                addLog("Re-intentando secuencia de envío...", 'info');
                                try {
                                    const baseUrl = await bridgeDiscovery.getBaseUrl();
                                    if (!baseUrl) throw new Error("Bridge not found");

                                    const res = await fetch(`${baseUrl}/retry-keys`, { method: 'POST' });
                                    if (!res.ok) {
                                        const data = await res.json();
                                        addLog(`Error: ${data.error}`, 'err');
                                    } else {
                                        const data = await res.json();
                                        addLog(`Secuencia enviada correctamente a ${data.deviceId}`, 'success');
                                    }
                                } catch (e) {
                                    addLog("Fallo de conexión con el puente", 'err');
                                }
                            }}
                            style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#EAB308', border: '1px solid #EAB308', fontSize: '0.7rem' }}
                        >
                            <RefreshCw size={12} /> <SafeText>RE-INTENTAR AUTOMATIZACIÓN</SafeText>
                        </button>
                    </div>
                    <div className="tactile-card" style={{
                        background: '#0a0d11',
                        height: '400px',
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        padding: '1rem',
                        overflowY: 'auto',
                        border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                        {logs.length === 0 && <p style={{ color: '#475569' }}><SafeText>Esperando comandos...</SafeText></p>}
                        {logs.map((log: any) => (
                            <div key={log.id} style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                                <span style={{ color: '#64748B' }}><SafeText>{`[${new Date().toLocaleTimeString()}]`}</SafeText></span>
                                <span style={{
                                    color: log.type === 'success' ? '#10B981' : log.type === 'err' ? '#EF4444' : '#38bdf8'
                                }}>
                                    <SafeText>{log.msg}</SafeText>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

        </div>
    );
};
