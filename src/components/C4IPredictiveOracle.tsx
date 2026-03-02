import { useState, useEffect } from 'react';
import { Terminal, Activity, AlertTriangle, Zap, BrainCircuit, MessageSquare } from 'lucide-react';

export const C4IPredictiveOracle = () => {
    const [scanned, setScanned] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [simulationLog, setSimulationLog] = useState<string[]>([]);

    // Simulate calculating insights on mount
    useEffect(() => {
        const timer = setTimeout(() => {
            setScanned(true);
            setSimulationLog([
                '> ENLACE SATELITAL ESTABLECIDO',
                '> SISTEMA DE IA TÁCTICA ONLINE...',
                '> RECABANDO INTELIGENCIA TERRITORIAL...',
                '> CARGANDO DATOS CENSALES Y DE ESTRUCTURA...',
                '> ANÁLISIS DE BURNOUT FINANCIERO: ESTABLE',
                '> ORÁCULO LISTO PARA CONSULTA.'
            ]);
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    const handleSimulationRequest = () => {
        setIsTyping(true);
        setTimeout(() => {
            setSimulationLog(prev => [
                ...prev,
                '',
                '> QUERY: PROYECCIÓN DÍA D',
                '> CALCULANDO COEFICIENTE DE MOVILIZACIÓN...',
                '> ALERTA: RENDIMIENTO INSUFICIENTE EN SECTOR NORTE (-14% HISTÓRICO)',
                '> RECOMENDACIÓN TÁCTICA: REDESTINAR 30 BRIGADISTAS DE RESERVA AL SECTOR NORTE PARA COMPENSAR VACÍO.'
            ]);
            setIsTyping(false);
        }, 2000);
    };

    return (
        <div className="flex-col gap-4" style={{ fontFamily: 'monospace' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--tertiary)', paddingBottom: '0.5rem' }}>
                <h3 style={{ color: 'var(--tertiary)', fontFamily: 'Oswald', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', textShadow: '0 0 10px rgba(0, 212, 255, 0.4)' }}>
                    <BrainCircuit size={24} /> ORÁCULO PREDICTIVO (MVP)
                </h3>
                <div style={{ color: scanned ? '#10B981' : '#EF4444', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Activity size={14} className={scanned ? 'pulse' : ''} /> {scanned ? "SYSTEM ONLINE" : "SCANNING..."}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>

                {/* AI / Terminal Interface */}
                <div style={{ flex: '1 1 500px', backgroundColor: '#0A0A0A', border: '1px solid var(--tertiary)', borderRadius: '4px', position: 'relative', overflow: 'hidden' }}>
                    {/* Scanning Line Animation Header */}
                    <div style={{ height: '3px', width: '100%', background: 'linear-gradient(90deg, transparent, var(--tertiary), transparent)', opacity: 0.5 }}></div>

                    <div style={{ padding: '1rem', height: '350px', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', marginBottom: '1rem', fontSize: '0.8rem' }}>
                            <Terminal size={14} /> TACTICAL MOCK-TERMINAL V1.0.0
                        </div>

                        {simulationLog.map((log, index) => (
                            <div key={index} style={{
                                color: log.includes('ALERTA') ? '#EF4444' : log.includes('RECOMENDACIÓN') ? '#10B981' : 'var(--tertiary)',
                                padding: '0.2rem 0',
                                opacity: 0,
                                animation: 'fade-in 0.3s forwards',
                                animationDelay: `${index * 0.1}s`
                            }}>
                                {log}
                            </div>
                        ))}

                        {isTyping && (
                            <div style={{ color: 'var(--tertiary)', padding: '0.2rem 0' }} className="pulse">
                                {'>'} SINTETIZANDO DATOS...
                            </div>
                        )}

                        {/* Terminal input simulation */}
                        <div style={{ display: 'flex', alignItems: 'center', marginTop: '1rem', borderTop: '1px dashed rgba(0,212,255,0.2)', paddingTop: '0.5rem' }}>
                            <span style={{ color: '#10B981', marginRight: '0.5rem' }}>Admin@C4I:~$</span>
                            <span style={{ color: '#fff', opacity: 0.5 }}> Esperando integración IA real...</span>
                        </div>
                    </div>
                </div>

                {/* Dashboard Indicators */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Tarjeta de Riesgo */}
                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid #EF4444', padding: '1.2rem', borderRadius: '4px' }}>
                        <h4 style={{ color: '#EF4444', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'Inter' }}>
                            <AlertTriangle size={18} /> RIESGO TÁCTICO INMINENTE
                        </h4>
                        <p style={{ color: '#bbb', margin: 0, fontSize: '0.9rem', lineHeight: '1.4' }}>
                            La densidad de promoción en el "Distrito 4" ha caído un 12% por debajo de la meta semanal. Probabilidad alta de voto cruzado si no se impacta en 48 horas.
                        </p>
                    </div>

                    {/* Meta ROI */}
                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid #10B981', padding: '1.2rem', borderRadius: '4px' }}>
                        <h4 style={{ color: '#10B981', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'Inter' }}>
                            <Zap size={18} /> ROI ESTRATÉGICO
                        </h4>
                        <p style={{ color: '#bbb', margin: 0, fontSize: '0.9rem', lineHeight: '1.4' }}>
                            La eficiencia del gasto en brigadas es del 88%. Estás invirtiendo $45.20 MXN por simpatizante confirmado activo. Nivel Óptimo.
                        </p>
                    </div>

                    {/* Consultar Boton */}
                    <button
                        onClick={handleSimulationRequest}
                        disabled={!scanned || isTyping}
                        style={{
                            marginTop: 'auto',
                            backgroundColor: 'rgba(0, 212, 255, 0.1)',
                            border: '1px solid var(--tertiary)',
                            color: 'var(--tertiary)',
                            padding: '1rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            cursor: (!scanned || isTyping) ? 'not-allowed' : 'pointer',
                            textTransform: 'uppercase',
                            fontFamily: 'Oswald',
                            fontWeight: 'bold',
                            letterSpacing: '1px',
                            transition: 'all 0.3s'
                        }}
                        onMouseOver={(e) => {
                            if (scanned && !isTyping) e.currentTarget.style.backgroundColor = 'var(--tertiary)';
                            if (scanned && !isTyping) e.currentTarget.style.color = '#000';
                        }}
                        onMouseOut={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(0, 212, 255, 0.1)';
                            e.currentTarget.style.color = 'var(--tertiary)';
                        }}
                    >
                        <MessageSquare size={18} /> SIMULAR ESCENARIO DÍA D
                    </button>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes fade-in {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .pulse {
                    animation: pulse-op 1.5s infinite;
                }
                @keyframes pulse-op {
                    0% { opacity: 0.5; }
                    50% { opacity: 1; text-shadow: 0 0 8px currentColor; }
                    100% { opacity: 0.5; }
                }
            `}} />
        </div>
    );
};
