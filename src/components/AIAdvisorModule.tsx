import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AiAdvisorService, AIStrategicInsight } from '../lib/AiAdvisorService';
import { BrainCircuit, Send, User, Activity, CheckCircle, Clock } from 'lucide-react';

export const AIAdvisorModule = ({ tenantId, municipality }: { tenantId: string, municipality: string }) => {
    const [loading, setLoading] = useState(false);
    const [insights, setInsights] = useState<AIStrategicInsight[]>([]);
    const [topic, setTopic] = useState<'cobertura' | 'presencia' | 'intencion' | 'actividades'>('actividades');

    useEffect(() => {
        loadLastInsights();
    }, [tenantId]);

    const loadLastInsights = async () => {
        const { data } = await supabase
            .from('ai_strategic_insights')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(5);
        if (data) setInsights(data as any);
    };

    const generateNewAnalysis = async () => {
        setLoading(true);
        try {
            const result = await AiAdvisorService.generateInsight({
                municipality,
                topic,
                tenantId
            });
            setInsights([result, ...insights]);
        } catch (err: any) {
            alert('Error al generar análisis: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleTaskImplementation = async (insightId: string, taskTitle: string) => {
        // Implementación local para demo
        const updatedInsights = insights.map(ins => {
            if (ins.id === insightId || (ins.insight_text && ins.insight_text === insights.find(i => i.id === insightId)?.insight_text)) {
                return {
                    ...ins,
                    suggested_tasks: ins.suggested_tasks.map(t =>
                        t.title === taskTitle ? { ...t, completed: !((t as any).completed) } : t
                    )
                };
            }
            return ins;
        });
        setInsights(updatedInsights as any);
        // En producción aquí actualizaríamos el JSONB en Supabase
    };

    return (
        <div className="flex-col gap-4">
            {/* Header de IA */}
            <div className="tactile-card flex-row-resp" style={{ background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(20, 25, 35, 0.8) 100%)', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem' }}>
                <div className="flex-col">
                    <h2 style={{ margin: 0, fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.8rem', color: 'var(--tertiary)' }}>
                        <BrainCircuit size={32} /> ASESOR ESTRATÉGICO AI
                    </h2>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                        Analizando demografía de <strong>{municipality}</strong> y resultados históricos.
                    </p>
                </div>

                <div className="flex-row-resp" style={{ gap: '0.5rem' }}>
                    <select className="squishy-input" value={topic} onChange={e => setTopic(e.target.value as any)} style={{ minWidth: '150px' }}>
                        <option value="actividades">Sugerir Actividades</option>
                        <option value="cobertura">Mejorar Cobertura</option>
                        <option value="presencia">Aumentar Presencia</option>
                        <option value="intencion">Elevar Intención</option>
                    </select>
                    <button
                        className="squishy-btn primary"
                        onClick={generateNewAnalysis}
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        <Send size={18} className={loading ? 'spin' : ''} />
                        {loading ? 'PENSANDO...' : 'SOLICITAR TÁCTICA'}
                    </button>
                </div>
            </div>

            {/* Listado de Insights */}
            <div className="flex-col gap-4">
                {insights.length === 0 && !loading && (
                    <div className="flex-center flex-col" style={{ padding: '4rem', color: '#64748B' }}>
                        <Activity size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <p>No hay análisis generados recientemente. Solicita uno para empezar.</p>
                    </div>
                )}

                {insights.map((insight, idx) => (
                    <div key={idx} className="tactile-card flex-col gap-4" style={{ animation: 'fadeIn 0.5s ease-out' }}>
                        <div className="flex-row-resp" style={{ justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.8rem' }}>
                            <div className="flex-row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ padding: '0.2rem 0.6rem', background: 'var(--tertiary)', borderRadius: '4px', fontSize: '0.7rem', color: '#000', fontWeight: 'bold' }}>
                                    {insight.topic.toUpperCase()}
                                </span>
                                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>
                                    Vía {insight.model_used.toUpperCase()}
                                </span>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                <Clock size={12} /> Recién generado
                            </span>
                        </div>

                        <div style={{ fontSize: '1rem', lineHeight: '1.6', color: '#cbd5e1', fontStyle: 'italic' }}>
                            "{insight.insight_text}"
                        </div>

                        {/* Listado de Tareas Asignadas */}
                        <div className="flex-col gap-2">
                            <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px' }}>Tareas y Objetivos Asignados</h4>
                            <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                                {insight.suggested_tasks.map((task, tIdx) => (
                                    <div key={tIdx} className="tactile-card" style={{
                                        backgroundColor: (task as any).completed ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${(task as any).completed ? '#10B981' : 'rgba(255,255,255,0.05)'}`,
                                        opacity: (task as any).completed ? 0.7 : 1
                                    }}>
                                        <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                            <div className="flex-row" style={{ gap: '0.5rem', alignItems: 'center' }}>
                                                <div style={{
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.65rem',
                                                    background: getDeptColor(task.department),
                                                    color: '#fff'
                                                }}>
                                                    {task.department.toUpperCase()}
                                                </div>
                                                {task.target_age_range && (
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--tertiary)' }}>
                                                        <User size={10} /> EDAD: {task.target_age_range}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ color: task.priority === 'Alta' ? '#EF4444' : '#EAB308', fontSize: '0.65rem', fontWeight: 'bold' }}>
                                                {task.priority.toUpperCase()}
                                            </div>
                                        </div>
                                        <h5 style={{ margin: '0.5rem 0', fontSize: '0.95rem', color: 'white' }}>{task.title}</h5>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>{task.description}</p>

                                        <button
                                            className="squishy-btn success"
                                            onClick={() => toggleTaskImplementation(insight.id || '', task.title)}
                                            style={{ marginTop: '1rem', width: '100%', fontSize: '0.75rem', padding: '0.4rem' }}
                                        >
                                            {(task as any).completed ? <CheckCircle size={14} /> : null}
                                            {(task as any).completed ? 'OBJETIVO LOGRADO' : 'MARCAR COMO ASIGNADO'}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const getDeptColor = (dept: string) => {
    switch (dept) {
        case 'Comunicación': return '#3B82F6';
        case 'Activismo': return '#EF4444';
        case 'Jurídico': return '#8B5CF6';
        case 'Sistemas': return '#10B981';
        default: return '#64748B';
    }
};
