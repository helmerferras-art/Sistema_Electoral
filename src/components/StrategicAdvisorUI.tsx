import React, { useState, useEffect } from 'react';
import { Brain, Sparkles, Target, Zap, Clock, CheckCircle2, AlertCircle, MapPin } from 'lucide-react';
import { AiAdvisorService, AIStrategicInsight } from '../lib/AiAdvisorService';
import { supabase } from '../lib/supabase';

interface StrategicAdvisorUIProps {
    tenantId: string;
}

export const StrategicAdvisorUI: React.FC<StrategicAdvisorUIProps> = ({ tenantId }) => {
    const [strategy, setStrategy] = useState<AIStrategicInsight | null>(null);
    const [loading, setLoading] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [topic, setTopic] = useState<'cobertura' | 'presencia' | 'intencion' | 'actividades'>('cobertura');
    const [subordinates, setSubordinates] = useState<any[]>([]);
    const [assigningTaskIdx, setAssigningTaskIdx] = useState<number | null>(null);
    const [taskAssignments, setTaskAssignments] = useState<Record<number, string>>({});
    const [taskRoleFilter, setTaskRoleFilter] = useState<Record<number, string>>({});

    useEffect(() => {
        loadLastInsight();
        loadSubordinates();
    }, [tenantId]);

    const loadSubordinates = async () => {
        const { data } = await supabase
            .from('users')
            .select('id, name, role')
            .eq('tenant_id', tenantId)
            .in('role', ['coordinador_campana', 'coordinador_territorial', 'lider', 'brigadista'])
            .order('name');
        if (data) setSubordinates(data);
    };

    const loadLastInsight = async () => {
        const { data } = await supabase
            .from('ai_strategic_insights')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (data) {
            setStrategy(data as AIStrategicInsight);
        }
    };

    const handleConsult = async () => {
        setLoading(true);
        try {
            // Obtenemos el nombre del municipio (scope real desde la DB)
            const { data: tenant } = await supabase.from('tenants').select('geographic_scope').eq('id', tenantId).single();
            const municipality = tenant?.geographic_scope || 'TUXTLA GUTIERREZ';

            const result = await AiAdvisorService.generateInsight({
                municipality,
                topic,
                tenantId
            });

            setStrategy(result);

        } catch (err: any) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleApproveStrategy = async () => {
        if (!strategy || !strategy.id) {
            alert("No se puede aprobar. La estrategia no pudo ser guardada en la base de datos.");
            return;
        }
        setIsApproving(true);
        try {
            const { error } = await supabase
                .from('ai_strategic_insights')
                .update({ is_implemented: true })
                .eq('id', strategy.id);
            if (error) throw error;
            alert("✅ Estrategia guardada en la memoria de la IA como 'Aprobada'. La inteligencia no la volverá a repetir y pasará a metas superiores.");
            setStrategy({ ...strategy, is_implemented: true });
        } catch (e: any) {
            alert("Error al aprobar: " + e.message);
        } finally {
            setIsApproving(false);
        }
    };

    const handleAssignTask = async (task: any, index: number) => {
        const assignedUserId = taskAssignments[index];
        if (!assignedUserId) {
            alert("⚠️ Selecciona a un elemento del equipo para asignarle esta misión.");
            return;
        }

        const subordinate = subordinates.find(s => s.id === assignedUserId);
        setAssigningTaskIdx(index);

        try {
            const { error } = await supabase.from('critical_path').insert([{
                tenant_id: tenantId,
                title: task.title,
                description: `${task.description} \n\n🎯 OBJETIVO TÁCTICO: ${task.target_location || 'General'} \n🤖 Sugerido por: IA Asesor C4I`,
                phase: 'Candidatura',
                start_date: new Date().toISOString().split('T')[0],
                end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 días
                status: 'pendiente',
                target_role: subordinate?.name || 'Comando'
            }]);

            if (error) throw error;

            alert(`✅ Misión enviada exitosamente a la Ruta Crítica de ${subordinate?.name}`);

            // Marcar localmente que ya se asignó
            setStrategy(prev => {
                if (!prev) return prev;
                const newTasks = [...prev.suggested_tasks];
                newTasks[index] = { ...newTasks[index], assigned_to: subordinate?.name };
                return { ...prev, suggested_tasks: newTasks };
            });

        } catch (e: any) {
            alert("Error al asignar misión: " + e.message);
        } finally {
            setAssigningTaskIdx(null);
        }
    };

    return (
        <div className="flex-col gap-6">
            <div className="tactile-card" style={{ background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.1) 0%, rgba(0,0,0,0) 100%)', border: '1px solid var(--tertiary)' }}>
                <div className="flex-row-resp" style={{ justifyContent: 'space-between', alignItems: 'center', gap: '2rem' }}>
                    <div className="flex-col gap-2" style={{ flex: 1 }}>
                        <h2 style={{ margin: 0, fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--tertiary)' }}>
                            <Brain size={28} /> ASESOR ESTRATÉGICO C4I
                        </h2>
                        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>
                            Inteligencia Artificial procesando el pulso territorial, demografía y humor social en tiempo real.
                        </p>
                    </div>

                    <div className="flex-col gap-2" style={{ alignItems: 'flex-end' }}>
                        <div className="flex-row" style={{ gap: '0.5rem' }}>
                            <select
                                className="squishy-input mini"
                                value={topic}
                                onChange={e => setTopic(e.target.value as any)}
                                style={{ width: '150px' }}
                            >
                                <option value="cobertura">Mejorar Cobertura</option>
                                <option value="presencia">Aumentar Presencia</option>
                                <option value="intencion">Elevar Intención</option>
                                <option value="actividades">Sugerir Actividades</option>
                            </select>
                            <button
                                onClick={handleConsult}
                                disabled={loading}
                                className="squishy-btn mini"
                                style={{ background: 'var(--tertiary)', color: '#000' }}
                            >
                                {loading ? 'SINTETIZANDO...' : 'INICIAR CONSULTORÍA'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {strategy ? (
                <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>

                    {/* Estrategias Generales */}
                    <div className="flex-col gap-4" style={{ gridColumn: '1 / -1' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--tertiary)', borderBottom: '1px solid rgba(0,212,255,0.2)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Sparkles size={18} /> ANÁLISIS DEL TERRITORIO
                        </h3>
                        <div className="tactile-card flex-col gap-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                <Clock size={12} /> Modelo Utilizado: {strategy.model_used.toUpperCase()}
                            </span>
                            <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.6', color: '#cbd5e1', fontStyle: 'italic' }}>
                                "{strategy.insight_text}"
                            </p>
                        </div>
                    </div>

                    {/* Objetivos del Equipo / Tareas */}
                    <div className="flex-col gap-4" style={{ gridColumn: '1 / -1' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', color: '#10B981', borderBottom: '1px solid rgba(16,185,129,0.2)', paddingBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Target size={18} /> PLAN DE ACCIÓN RECOMENDADO
                        </h3>
                        <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                            {strategy.suggested_tasks.map((task: any, i: number) => (
                                <div key={i} className="tactile-card mini flex-col gap-2" style={{ background: 'rgba(16,185,129,0.05)' }}>
                                    <div className="flex-row" style={{ justifyContent: 'space-between' }}>
                                        <div className="flex-row" style={{ gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.65rem', background: '#3B82F6', padding: '0.2rem 0.5rem', borderRadius: '4px', color: 'white' }}>
                                                {task.department.toUpperCase()}
                                            </span>
                                            {task.target_age_range && (
                                                <span style={{ fontSize: '0.65rem', color: 'var(--tertiary)' }}>EDAD: {task.target_age_range}</span>
                                            )}
                                            {task.target_location && (
                                                <span style={{ fontSize: '0.65rem', color: '#10B981', display: 'flex', alignItems: 'center', gap: '2px', background: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                                                    <MapPin size={10} /> {task.target_location.toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <span style={{ color: task.priority === 'Alta' ? '#EF4444' : '#EAB308', fontSize: '0.65rem', fontWeight: 'bold' }}>
                                            {task.priority.toUpperCase()}
                                        </span>
                                    </div>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#10B981', marginTop: '0.5rem' }}>{task.title}</span>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>{task.description}</p>

                                    {/* Sección de Asignación */}
                                    <div style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {task.assigned_to ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--tertiary)', background: 'rgba(0, 212, 255, 0.1)', padding: '0.3rem 0.5rem', borderRadius: '4px' }}>
                                                <CheckCircle2 size={12} /> ASIGNADO A: {task.assigned_to.toUpperCase()}
                                            </div>
                                        ) : subordinates.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <select
                                                        className="squishy-input mini"
                                                        style={{ flex: 1, padding: '0.3rem', fontSize: '0.75rem', border: '1px solid rgba(255,255,255,0.1)' }}
                                                        value={taskRoleFilter[i] || 'todos'}
                                                        onChange={e => {
                                                            setTaskRoleFilter({ ...taskRoleFilter, [i]: e.target.value });
                                                            // Clear selected person when filter changes
                                                            if (taskAssignments[i]) {
                                                                const newAssignments = { ...taskAssignments };
                                                                delete newAssignments[i];
                                                                setTaskAssignments(newAssignments);
                                                            }
                                                        }}
                                                    >
                                                        <option value="todos">Todos los Rangos</option>
                                                        <option value="coordinador">Coordinadores</option>
                                                        <option value="lider">Líderes de Territorio</option>
                                                        <option value="brigadista">Brigadistas</option>
                                                    </select>
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    <select
                                                        className="squishy-input mini"
                                                        style={{ flex: 1, padding: '0.3rem', fontSize: '0.75rem' }}
                                                        value={taskAssignments[i] || ''}
                                                        onChange={e => setTaskAssignments({ ...taskAssignments, [i]: e.target.value })}
                                                    >
                                                        <option value="">Seleccionar personal...</option>
                                                        {subordinates
                                                            .filter(sub => taskRoleFilter[i] && taskRoleFilter[i] !== 'todos' ? sub.role.includes(taskRoleFilter[i]) : true)
                                                            .map(sub => (
                                                                <option key={sub.id} value={sub.id}>{sub.name} ({sub.role.split('_')[0]})</option>
                                                            ))}
                                                    </select>
                                                    <button
                                                        className="squishy-btn mini"
                                                        onClick={() => handleAssignTask(task, i)}
                                                        disabled={assigningTaskIdx === i || !taskAssignments[i]}
                                                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }}
                                                    >
                                                        {assigningTaskIdx === i ? '...' : <><Zap size={10} style={{ marginRight: '4px' }} /> ENVIAR</>}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize: '0.7rem', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <AlertCircle size={12} /> No hay personal de campo registrado.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Botón de Aprobación */}
                    {!strategy.is_implemented && (
                        <div style={{ gridColumn: '1 / -1', marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                            <button
                                onClick={handleApproveStrategy}
                                disabled={isApproving}
                                className="squishy-btn primary"
                                style={{ padding: '1rem 2rem', fontSize: '1rem' }}
                            >
                                ✅ APROBAR ESTRATEGIA E INICIAR EJECUCIÓN
                            </button>
                        </div>
                    )}
                    {strategy.is_implemented && (
                        <div style={{ gridColumn: '1 / -1', marginTop: '1rem', display: 'flex', justifyContent: 'center' }}>
                            <div style={{ padding: '1rem 2rem', fontSize: '1rem', color: '#10B981', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid currentColor', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <CheckCircle2 size={18} /> ESTRATEGIA EN EJECUCIÓN
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="tactile-card flex-col gap-4" style={{ alignItems: 'center', padding: '4rem', opacity: 0.5 }}>
                    <Brain size={64} className="pulse" />
                    <p>Inicie una consulta táctica para generar estrategias basadas en datos.</p>
                    <div style={{ display: 'flex', gap: '2rem', fontSize: '0.8rem' }}>
                        <div className="flex-row" style={{ gap: '0.5rem' }}><CheckCircle2 size={14} /> Demografía Cargada</div>
                        <div className="flex-row" style={{ gap: '0.5rem' }}><CheckCircle2 size={14} /> Pulso Social Activo</div>
                        <div className="flex-row" style={{ gap: '0.5rem' }}><AlertCircle size={14} color="#FBBF24" /> Esperando Input Táctico</div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
                .pulse { animation: pulse-ai 2s infinite; }
                @keyframes pulse-ai {
                    0% { transform: scale(1); opacity: 0.3; }
                    50% { transform: scale(1.1); opacity: 0.6; color: var(--tertiary); }
                    100% { transform: scale(1); opacity: 0.3; }
                }
            `}} />
        </div>
    );
};
