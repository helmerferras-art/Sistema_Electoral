import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { MessageSquare, Users, Send, Settings, Clock, AlertTriangle, ShieldAlert, Cpu } from 'lucide-react';

interface Campaign {
    id: string;
    name: string;
    target_role: string;
    message_template: string;
    status: 'draft' | 'running' | 'paused' | 'completed';
    created_at: string;
}

export const CommunicationsDashboard = () => {
    const { user } = useAuth();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    // const [loading] = useState(false); // Mantener para futura lógica de carga

    // Form State
    const [newCampaignName, setNewCampaignName] = useState('');
    const [targetRole, setTargetRole] = useState('lider');
    const [messageTemplate, setMessageTemplate] = useState('{Hola|Saludos|Buen día} {{nombre}}, te recordamos la junta de mañana a las 18:00 hrs.');
    const [previewTarget] = useState('Juan Pérez');

    useEffect(() => {
        // Placeholder for future DB fetch
        setCampaigns([
            {
                id: 'mock-1',
                name: 'Aviso Mitin Cierre',
                target_role: 'simpatizante',
                message_template: 'Hola {{nombre}}, acompáñanos este domingo al gran cierre.',
                status: 'completed',
                created_at: new Date().toISOString()
            }
        ]);
    }, []);

    // Evitar warning de user no usado por ahora
    if (!user) return null;

    const handleCreateCampaign = (e: React.FormEvent) => {
        e.preventDefault();
        // Placeholder save logic for MVP
        const newCamp: Campaign = {
            id: `mock-${Date.now()}`,
            name: newCampaignName,
            target_role: targetRole,
            message_template: messageTemplate,
            status: 'draft',
            created_at: new Date().toISOString()
        };
        setCampaigns([newCamp, ...campaigns]);
        setNewCampaignName('');
    };

    const handlePlayPause = (id: string, currentStatus: string) => {
        setCampaigns(campaigns.map(c => {
            if (c.id === id) {
                return { ...c, status: currentStatus === 'running' ? 'paused' : 'running' };
            }
            return c;
        }));
    };

    // Spintax Engine: Parsea {opcion1|opcion2|opcion3} y elige una al azar
    const applySpintax = (text: string) => {
        return text.replace(/\{([^{}]+)\}/g, (_, options) => {
            const parts = options.split('|');
            return parts[Math.floor(Math.random() * parts.length)];
        });
    };

    const getPreview = (template: string, name: string) => {
        let text = template.replace(/\{\{nombre\}\}/g, name).replace(/\{\{rango\}\}/g, 'Soldado');
        return applySpintax(text);
    };

    return (
        <div style={{ padding: '1rem', paddingBottom: '100px', maxWidth: '1000px', margin: '0 auto', color: 'var(--text-color)' }}>
            <header style={{ marginBottom: '2rem', borderBottom: '2px solid var(--primary)', paddingBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <MessageSquare size={40} color="var(--primary)" />
                <div>
                    <h1 style={{ fontFamily: 'Oswald, sans-serif', margin: 0, letterSpacing: '0.05em' }}>CENTRO DE COMUNICADOS</h1>
                    <p style={{ margin: 0, color: 'var(--tertiary)', fontSize: '0.9rem' }}>API de Transmisión Masiva (Bot Node.js)</p>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: '1.5rem' }}>
                {/* Panel Redactor */}
                <div className="tactile-card" style={{ border: '1px solid var(--secondary)' }}>
                    <h2 style={{ fontFamily: 'Oswald', margin: '0 0 1rem 0', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Settings size={20} /> NUEVA CAMPAÑA DE EMISIÓN
                    </h2>

                    <form onSubmit={handleCreateCampaign} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.2rem', display: 'block' }}>NOMBRE INTERNO DE CAMPAÑA</label>
                            <input
                                type="text"
                                className="squishy-input"
                                placeholder="Ej: Invitación Brigadas Sabatinas"
                                value={newCampaignName}
                                onChange={(e) => setNewCampaignName(e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.2rem', display: 'block' }}>AUDIENCIA OBJETIVO (ROL)</label>
                            <select
                                className="squishy-input"
                                value={targetRole}
                                onChange={(e) => setTargetRole(e.target.value)}
                                style={{ backgroundColor: '#0F1218', color: 'white' }}
                            >
                                <option value="coordinador">Coordinadores (Mando Medio)</option>
                                <option value="lider">Líderes de Estructura</option>
                                <option value="brigadista">Brigadistas</option>
                                <option value="simpatizante">Simpatizantes (Masivo)</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.2rem', display: 'flex', justifyContent: 'space-between' }}>
                                <span>MENSAJE DE WHATSAPP</span>
                                <span style={{ color: 'var(--tertiary)' }}>Variables: {'{{nombre}}'} {'{A|B}'}</span>
                            </label>
                            <div style={{ fontSize: '0.7rem', color: '#64748B', marginBottom: '0.5rem', fontStyle: 'italic' }}>
                                Usa {'{Hola|Buen día|Saludos}'} para variar el texto automáticamente.
                            </div>
                            <textarea
                                className="squishy-input"
                                rows={5}
                                value={messageTemplate}
                                onChange={(e) => setMessageTemplate(e.target.value)}
                                required
                                style={{ resize: 'vertical', fontFamily: 'Inter' }}
                            />
                        </div>

                        <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid var(--primary)' }}>
                            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertTriangle size={14} color="var(--primary)" /> VISTA PREVIA DE VARIACIONES (SPINTAX)
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                <div style={{ padding: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--tertiary)' }}>VARIACIÓN 1:</span>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap', fontFamily: 'sans-serif' }}>
                                        {getPreview(messageTemplate, previewTarget)}
                                    </p>
                                </div>
                                <div>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--tertiary)' }}>VARIACIÓN 2:</span>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap', fontFamily: 'sans-serif', opacity: 0.7 }}>
                                        {getPreview(messageTemplate, 'Maria Garcia')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <button type="submit" className="squishy-btn primary" style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                            <Send size={18} /> GUARDAR EN BORRADOR
                        </button>
                    </form>
                </div>

                {/* Status Dashboard & Bot Connection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* Anti-Ban & Sync Settings */}
                    <div className="tactile-card" style={{ border: '1px solid var(--primary)', backgroundColor: 'rgba(255, 90, 54, 0.05)' }}>
                        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'Oswald' }}>
                            <ShieldAlert size={20} /> ESTRATEGIA ANTI-BANEO
                        </h3>

                        {/* Drip Feed Control */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ fontSize: '0.8rem', color: '#94A3B8', display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span>VELOCIDAD DE GOTEO (DRIP FEED)</span>
                                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>150 msgs / bloque</span>
                            </label>
                            <input type="range" min="10" max="300" defaultValue="150" style={{ width: '100%', accentColor: 'var(--primary)' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#64748B', marginTop: '0.2rem' }}>
                                <span>Lento (Seguro)</span>
                                <span>Rápido (Riesgoso)</span>
                            </div>
                        </div>

                        {/* Google Sync Sync */}
                        <div style={{ padding: '1rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Users size={18} color="#4285F4" />
                                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>Google Contacts Sync</span>
                                </div>
                                <div style={{ width: '30px', height: '15px', backgroundColor: '#34D399', borderRadius: '10px', position: 'relative' }}>
                                    <div style={{ width: '11px', height: '11px', backgroundColor: 'white', borderRadius: '50%', position: 'absolute', right: '2px', top: '2px' }}></div>
                                </div>
                            </div>
                            <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: 0 }}>
                                Los nuevos registros se agregan automáticamente a la agenda de Google del candidato.
                            </p>
                            <button className="squishy-btn" style={{ width: '100%', marginTop: '0.8rem', padding: '0.4rem', fontSize: '0.75rem', backgroundColor: 'transparent', border: '1px solid #4285F4', color: '#4285F4' }}>
                                🔄 RE-SINCRONIZAR AGENDA
                            </button>
                        </div>
                    </div>

                    {/* Bot Server Status (Mock) */}
                    <div className="tactile-card" style={{ border: '1px solid var(--tertiary)', backgroundColor: 'rgba(0, 212, 255, 0.05)' }}>
                        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--tertiary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'Oswald' }}>
                            <Cpu size={20} /> ESTADO DEL SERVIDOR BOT
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--tertiary)', boxShadow: '0 0 10px var(--tertiary)' }}></div>
                                <span style={{ fontFamily: 'Oswald', letterSpacing: '0.05em' }}>BOT NODE.JS ACTIVO</span>
                            </div>
                            <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>Enlace: WhatsApp Web</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '1rem', marginBottom: 0 }}>
                            <Clock size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                            Última actividad: Hace 3 minutos
                        </p>
                    </div>

                    {/* Campaigns List */}
                    <div className="tactile-card flex-col gap-1">
                        <h3 style={{ margin: '0 0 0.5rem 0', fontFamily: 'Oswald', color: 'var(--text-color)' }}>CAMPAÑAS PROGRAMADAS</h3>
                        {campaigns.length === 0 ? (
                            <p style={{ color: '#64748B', fontSize: '0.9rem' }}>No hay campañas. Crea una nueva.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {campaigns.map(camp => (
                                    <div key={camp.id} style={{ padding: '0.75rem', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: `3px solid ${camp.status === 'running' ? 'var(--secondary)' : camp.status === 'completed' ? 'gray' : 'var(--primary)'}` }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                            <strong style={{ fontSize: '0.95rem' }}>{camp.name}</strong>
                                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                                                {camp.status}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                                            <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                                                <Users size={12} style={{ display: 'inline', marginRight: '4px' }} /> Destino: {camp.target_role}
                                            </div>
                                            {camp.status !== 'completed' && (
                                                <button
                                                    onClick={() => handlePlayPause(camp.id, camp.status)}
                                                    className="squishy-btn"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', backgroundColor: camp.status === 'running' ? 'rgba(255,0,0,0.2)' : 'rgba(0,255,100,0.2)', color: camp.status === 'running' ? '#ff4d4d' : 'var(--secondary)' }}
                                                >
                                                    {camp.status === 'running' ? '⏸ PAUSAR ENVÍO' : '▶ INICIAR DRIP'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
