import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { bridgeDiscovery } from '../lib/bridgeDiscovery';
import {
    Smartphone, Send, ShieldAlert, Loader2, FileUp,
    Database, PhoneCall, Zap, RefreshCw, Layers
} from 'lucide-react';

interface Gateway {
    bridge_id: string;
    tenant_id: string;
    name: string;
    status: 'online' | 'offline';
    last_seen: string;
    supported_methods: string[];
    tenant_name?: string;
    isLocal?: boolean;
}

interface LocalDevice {
    id: string;
    model: string;
    status: string;
    sentToday: number;
}

export const GodModeConsole = () => {
    const [gateways, setGateways] = useState<Gateway[]>([]);
    const [localDevices, setLocalDevices] = useState<LocalDevice[]>([]);
    const [selectedGateways, setSelectedGateways] = useState<string[]>([]);
    const [message, setMessage] = useState('');
    const [targetPhones, setTargetPhones] = useState('');
    const [sending, setSending] = useState(false);
    const [type, setType] = useState<'sms' | 'wa' | 'call'>('wa');
    const [popSource, setPopSource] = useState<'manual' | 'structure' | 'file'>('manual');
    const [bridgeConnected, setBridgeConnected] = useState(false);
    const [stats, setStats] = useState({ totalSupporters: 0 });

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        fetchGateways();
        fetchLocalBridge();
        fetchGlobalStats();

        const sub = supabase
            .channel('gateways_status')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'communication_gateways' }, () => {
                fetchGateways();
            })
            .subscribe();

        const interval = setInterval(() => {
            fetchGateways();
            fetchLocalBridge();
        }, 15000);

        return () => {
            supabase.removeChannel(sub);
            clearInterval(interval);
        };
    }, []);

    const fetchGlobalStats = async () => {
        const { count } = await supabase.from('supporters').select('*', { count: 'exact', head: true });
        setStats({ totalSupporters: count || 0 });
    };

    const fetchGateways = async () => {
        const { data, error } = await supabase
            .from('communication_gateways')
            .select(`
                *,
                tenants:tenant_id (name)
            `);

        if (!error && data) {
            const formatted = data.map((g: any) => ({
                ...g,
                tenant_name: g.tenants?.name || 'Campaña Desconocida'
            }));
            setGateways(formatted);
        }
    };

    const fetchLocalBridge = async () => {
        try {
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (baseUrl) {
                const res = await fetch(`${baseUrl}/status`);
                if (res.ok) {
                    const data = await res.json();
                    setLocalDevices(data.devices || []);
                    setBridgeConnected(true);
                }
            } else {
                setBridgeConnected(false);
                setLocalDevices([]);
            }
        } catch (e) {
            setBridgeConnected(false);
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            const numbers = content.match(/\d{10,12}/g);
            if (numbers) {
                setTargetPhones(numbers.join(', '));
                alert(`Se han extraído ${numbers.length} números del archivo.`);
            } else {
                alert('No se encontraron números válidos en el archivo.');
            }
        };
        reader.readAsText(file);
    };

    const fetchEntireStructure = async () => {
        const { data, error } = await supabase
            .from('supporters')
            .select('phone')
            .not('phone', 'is', null);

        if (!error && data) {
            const phones = data.map(s => s.phone).filter(Boolean).join(', ');
            setTargetPhones(phones);
            alert(`Población completa cargada: ${data.length} registros.`);
        }
    };

    const handleBatchSend = async () => {
        if (selectedGateways.length === 0 || (!message && type !== 'call') || !targetPhones) {
            alert('Faltan datos críticos para iniciar la operación.');
            return;
        }
        setSending(true);

        const phones = targetPhones.split(/[\n,]+/).map(p => p.trim()).filter(p => p.length >= 10);
        if (phones.length === 0) {
            alert('No hay números válidos para enviar.');
            setSending(false);
            return;
        }

        const commands = phones.map((phone, index) => ({
            bridge_id: selectedGateways[index % selectedGateways.length],
            type,
            phone,
            message: type === 'call' ? 'Llamada Masiva' : message,
            status: 'pending'
        }));

        // Split into chunks of 100 to avoid request size limits
        const chunks = [];
        for (let i = 0; i < commands.length; i += 100) {
            chunks.push(commands.slice(i, i + 100));
        }

        for (const chunk of chunks) {
            const { error } = await supabase.from('gateway_commands').insert(chunk);
            if (error) {
                alert('Error al encolar algunos comandos: ' + error.message);
                break;
            }
        }

        alert(`¡Operación iniciada! Se han encolado ${commands.length} envíos distribuídos en ${selectedGateways.length} puentes.`);
        setSending(false);
    };

    return (
        <div className="flex-col gap-6 p-6 animate-fadeIn">
            <div className="flex-row gap-4 items-center justify-between">
                <div className="flex-row gap-3 items-center" style={{ color: 'var(--tertiary)', flexShrink: 0 }}>
                    <div style={{ background: 'var(--tertiary)', padding: '0.8rem', borderRadius: '12px', color: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <ShieldAlert size={32} />
                    </div>
                    <div>
                        <h1 style={{ fontFamily: 'Oswald', fontSize: '2.2rem', margin: 0, letterSpacing: '0.05em' }}>ORQUESTACIÓN TÁCTICA C4I</h1>
                        <div style={{ fontSize: '0.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Consola Central de Despliegue Masivo (Modo Dios)</div>
                    </div>
                </div>

                <div className="flex-row gap-4">
                    <div className="tactile-card mini" style={{ background: 'rgba(16, 185, 129, 0.05)', borderColor: '#10B981', padding: '0.5rem 1rem' }}>
                        <div style={{ fontSize: '0.6rem', color: '#10B981' }}>ESTRUCTURA TOTAL</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', fontFamily: 'Oswald' }}>{stats.totalSupporters.toLocaleString()}</div>
                    </div>
                    <div className="tactile-card mini" style={{ background: 'rgba(0, 212, 255, 0.05)', borderColor: 'var(--tertiary)', padding: '0.5rem 1rem' }}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--tertiary)' }}>PUENTES ACTIVOS</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', fontFamily: 'Oswald' }}>{gateways.filter(g => g.status === 'online').length}</div>
                    </div>
                </div>
            </div>

            <div className="responsive-grid" style={{ gridTemplateColumns: '1.2fr 1.8fr', gap: '2rem' }}>
                {/* Panel de Puentes (Hardware) */}
                <div className="flex-col gap-6">
                    {/* Mi Hardware Local */}
                    <div className="tactile-card" style={{ borderLeft: bridgeConnected ? '4px solid #10B981' : '4px solid #EAB308', background: 'rgba(255,255,255,0.02)' }}>
                        <div className="flex-row justify-between items-center mb-4">
                            <h3 style={{ fontFamily: 'Oswald', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Zap className={bridgeConnected ? 'text-green-500' : 'text-yellow-500'} size={18} />
                                MI HARDWARE LOCAL (GOD-BRIDGE)
                            </h3>
                            <button className="squishy-btn mini" onClick={fetchLocalBridge}><RefreshCw size={12} /></button>
                        </div>

                        {!bridgeConnected ? (
                            <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(234, 179, 8, 0.05)', borderRadius: '8px', border: '1px dashed #EAB308' }}>
                                <div style={{ fontSize: '0.8rem', color: '#EAB308' }}>Puente local no detectado en esta PC.</div>
                                <button
                                    className="squishy-btn mt-2"
                                    style={{ background: '#EAB308', color: 'black', fontSize: '0.7rem' }}
                                    onClick={() => window.open('file:///c:/Proyecto_Electoral/INICIAR_PUENTE.bat')}
                                >CONECTAR MI EQUIPO</button>
                            </div>
                        ) : (
                            <div className="flex-col gap-2">
                                {localDevices.map(d => (
                                    <div key={d.id} className="flex-row justify-between items-center p-2" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                                        <div className="flex-row gap-2 items-center">
                                            <Smartphone size={14} className="text-green-500" />
                                            <span style={{ fontSize: '0.8rem' }}>{d.model}</span>
                                        </div>
                                        <span style={{ fontSize: '0.6rem', color: '#888' }}>{d.id}</span>
                                    </div>
                                ))}
                                {localDevices.length === 0 && <div style={{ fontSize: '0.7rem', color: '#666', textAlign: 'center' }}>Puente activo pero sin dispositivos USB.</div>}
                            </div>
                        )}
                    </div>

                    {/* Red Federada */}
                    <div className="flex-col gap-4">
                        <div className="flex-row justify-between items-center">
                            <h3 style={{ fontFamily: 'Oswald', margin: 0 }}>RED FEDERADA (ALIADOS)</h3>
                            <div className="flex-row gap-2">
                                <button className="squishy-btn mini" onClick={() => setSelectedGateways(gateways.filter(g => g.status === 'online').map(g => g.bridge_id))}>TODO</button>
                                <button className="squishy-btn mini" onClick={() => setSelectedGateways([])}>NADA</button>
                            </div>
                        </div>

                        <div className="flex-col gap-3 overflow-auto" style={{ maxHeight: '500px', paddingRight: '0.5rem' }}>
                            {gateways.map(gw => (
                                <div
                                    key={gw.bridge_id}
                                    onClick={() => {
                                        if (selectedGateways.includes(gw.bridge_id)) {
                                            setSelectedGateways(selectedGateways.filter(id => id !== gw.bridge_id));
                                        } else {
                                            setSelectedGateways([...selectedGateways, gw.bridge_id]);
                                        }
                                    }}
                                    className="gateway-item"
                                    style={{
                                        background: selectedGateways.includes(gw.bridge_id) ? 'rgba(0, 212, 255, 0.08)' : 'rgba(255,255,255,0.03)',
                                        border: selectedGateways.includes(gw.bridge_id) ? '1px solid var(--tertiary)' : '1px solid rgba(255,255,255,0.05)',
                                        borderRadius: '10px',
                                        padding: '1rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.3s ease'
                                    }}
                                >
                                    <div className="flex-row justify-between items-center">
                                        <div className="flex-row gap-3 items-center">
                                            <div style={{
                                                width: '10px',
                                                height: '10px',
                                                borderRadius: '50%',
                                                background: gw.status === 'online' ? '#10B981' : '#EF4444',
                                                boxShadow: gw.status === 'online' ? '0 0 10px #10B981' : 'none'
                                            }} />
                                            <div>
                                                <div style={{ fontWeight: 'bold', color: 'white' }}>{gw.name || gw.bridge_id.split('-')[0]}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#888' }}>{gw.tenant_name}</div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--tertiary)' }}>
                                                {gw.supported_methods.map(m => m.toUpperCase()).join(' | ')}
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: '#555' }}>Visto: {new Date(gw.last_seen).toLocaleTimeString()}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Panel de Control de Operación */}
                <div className="flex-col gap-6">
                    <div className="tactile-card h-full" style={{ background: 'rgba(15, 18, 24, 0.4)', borderColor: 'rgba(0, 212, 255, 0.1)' }}>
                        <div className="flex-row gap-4 mb-6">
                            <button
                                onClick={() => setType('wa')}
                                className={`type-btn ${type === 'wa' ? 'active-wa' : ''}`}
                            >WHATSAPP</button>
                            <button
                                onClick={() => setType('sms')}
                                className={`type-btn ${type === 'sms' ? 'active-sms' : ''}`}
                            >SMS DIRECTO</button>
                            <button
                                onClick={() => setType('call')}
                                className={`type-btn ${type === 'call' ? 'active-call' : ''}`}
                            >MASIVE CALLS</button>
                        </div>

                        {/* Población */}
                        <div className="flex-col gap-4 mb-6">
                            <div className="flex-row justify-between items-center">
                                <label style={{ fontSize: '0.9rem', color: 'var(--tertiary)', fontWeight: 'bold', fontFamily: 'Oswald' }}>DESTINATARIOS TÁCTICOS</label>
                                <div className="flex-row gap-2">
                                    <button
                                        onClick={() => setPopSource('manual')}
                                        className={`source-chip ${popSource === 'manual' ? 'active' : ''}`}
                                    ><Layers size={12} /> MANUAL</button>
                                    <button
                                        onClick={() => { setPopSource('structure'); fetchEntireStructure(); }}
                                        className={`source-chip ${popSource === 'structure' ? 'active' : ''}`}
                                    ><Database size={12} /> ESTRUCTURA</button>
                                    <button
                                        onClick={() => { setPopSource('file'); fileInputRef.current?.click(); }}
                                        className={`source-chip ${popSource === 'file' ? 'active' : ''}`}
                                    ><FileUp size={12} /> CARGAR CSV</button>
                                </div>
                            </div>

                            <input type="file" ref={fileInputRef} hidden accept=".csv,.txt" onChange={handleFileUpload} />

                            <div style={{ position: 'relative' }}>
                                <textarea
                                    value={targetPhones}
                                    onChange={(e) => setTargetPhones(e.target.value)}
                                    placeholder="Ingresa números o selecciona una fuente automática..."
                                    style={{
                                        width: '100%',
                                        height: '150px',
                                        background: '#0a0d11',
                                        border: '1px solid #222',
                                        borderRadius: '12px',
                                        padding: '1rem',
                                        color: '#34D399',
                                        fontFamily: 'monospace',
                                        fontSize: '0.9rem'
                                    }}
                                />
                                <div style={{ position: 'absolute', bottom: '10px', right: '15px', fontSize: '0.7rem', color: '#666' }}>
                                    Target: {targetPhones ? targetPhones.split(/[\n,]+/).filter(p => p.trim().length > 0).length : 0} objetivos
                                </div>
                            </div>
                        </div>

                        {/* Mensaje */}
                        {type !== 'call' && (
                            <div className="flex-col gap-2 mb-6">
                                <label style={{ fontSize: '0.9rem', color: 'var(--tertiary)', fontWeight: 'bold', fontFamily: 'Oswald' }}>MENSAJE ESTRATÉGICO</label>
                                <textarea
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Redacta el contenido de la campaña..."
                                    style={{
                                        width: '100%',
                                        height: '120px',
                                        background: '#0a0d11',
                                        border: '1px solid #222',
                                        borderRadius: '12px',
                                        padding: '1rem',
                                        color: 'white'
                                    }}
                                />
                            </div>
                        )}

                        {type === 'call' && (
                            <div className="alert-box mb-6" style={{ background: 'rgba(255, 51, 102, 0.05)', borderColor: 'var(--secondary)', color: 'var(--secondary)' }}>
                                <PhoneCall size={20} />
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>MODO RÁFAGA ACTIVO</div>
                                    <div style={{ fontSize: '0.8rem' }}>El sistema disparará llamadas secuenciales. Se recomienda tener operadores listos en los puentes seleccionados.</div>
                                </div>
                            </div>
                        )}

                        <button
                            disabled={sending || selectedGateways.length === 0}
                            onClick={handleBatchSend}
                            className="god-fire-btn"
                        >
                            {sending ? <Loader2 className="spin" /> : <><Send size={24} /> DISPARAR OPERACIÓN MASIVA</>}
                        </button>
                    </div>
                </div>
            </div>

            <style>{`
                .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                
                .gateway-item:hover { border-color: var(--tertiary) !important; background: rgba(0, 212, 255, 0.05) !important; }
                
                .type-btn { flex: 1; padding: 1rem; border: 1px solid #333; background: transparent; color: #888; border-radius: 12px; font-weight: bold; cursor: pointer; transition: all 0.2s; font-family: Oswald; }
                .active-wa { border-color: #25D366; background: rgba(37, 211, 102, 0.1); color: #25D366; }
                .active-sms { border-color: var(--secondary); background: rgba(255, 51, 102, 0.1); color: var(--secondary); }
                .active-call { border-color: #EAB308; background: rgba(234, 179, 8, 0.1); color: #EAB308; }
                
                .source-chip { padding: 4px 12px; border-radius: 20px; border: 1px solid #333; font-size: 0.7rem; color: #888; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 4px; }
                .source-chip.active { background: var(--tertiary); color: black; border-color: var(--tertiary); font-weight: bold; }
                
                .god-fire-btn { 
                    width: 100%; padding: 1.5rem; border-radius: 15px; 
                    background: linear-gradient(135deg, var(--tertiary) 0%, #0099ff 100%); 
                    color: black; font-family: Oswald; font-size: 1.4rem; border: none; 
                    cursor: pointer; box-shadow: 0 4px 20px rgba(0, 212, 255, 0.3);
                    display: flex; align-items: center; justify-content: center; gap: 0.8rem;
                    transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }
                .god-fire-btn:hover:not(:disabled) { transform: scale(1.02); box-shadow: 0 8px 30px rgba(0, 212, 255, 0.5); }
                .god-fire-btn:disabled { opacity: 0.3; filter: grayscale(1); cursor: not-allowed; }
                
                .alert-box { padding: 1rem; border-radius: 12px; border: 1px solid; display: flex; gap: 1rem; align-items: center; }
            `}</style>
        </div>
    );
};
