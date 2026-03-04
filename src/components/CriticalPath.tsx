import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { Calendar, CheckCircle2, Clock, AlertCircle, Plus, Trash2, X } from 'lucide-react';

interface Task {
    id: string;
    title: string;
    description: string;
    phase: 'Candidatura' | 'Eleccion';
    start_date: string;
    end_date: string;
    status: 'pendiente' | 'en_progreso' | 'completado' | 'retrasado';
    target_role?: string;
}

export const CriticalPath = () => {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    // Auth Check for Admin Controls
    const isAdmin = ['superadmin', 'candidato', 'coordinador_campana'].includes(user?.role || '');
    const [showForm, setShowForm] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newTask, setNewTask] = useState<Partial<Task>>({
        title: '',
        description: '',
        phase: 'Candidatura',
        start_date: new Date().toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        status: 'pendiente',
        target_role: 'todos'
    });

    const fetchPath = async () => {
        if (!user?.tenant_id) return;
        const { data } = await supabase
            .from('critical_path')
            .select('*')
            .in('tenant_id', user.tenantScope || [])
            .order('start_date', { ascending: true });

        if (data) setTasks(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchPath();
    }, [user?.tenant_id]);

    const handleAddTask = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            const { error } = await supabase.from('critical_path').insert([{
                ...newTask,
                tenant_id: user?.tenant_id
            }]);

            if (error) throw error;

            await fetchPath(); // Reload timeline
            setShowForm(false);
            setNewTask({
                title: '',
                description: '',
                phase: 'Candidatura',
                start_date: new Date().toISOString().split('T')[0],
                end_date: new Date().toISOString().split('T')[0],
                status: 'pendiente',
                target_role: 'todos'
            });
        } catch (error: any) {
            alert("Error al guardar misión: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteTask = async (id: string, title: string) => {
        if (!confirm(`¿Estás seguro de eliminar la misión: ${title}?`)) return;
        try {
            const { error } = await supabase.from('critical_path').delete().eq('id', id);
            if (error) throw error;
            setTasks(tasks.filter(t => t.id !== id));
        } catch (error: any) {
            alert("Error al eliminar: " + error.message);
        }
    };

    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            const { error } = await supabase.from('critical_path').update({ status: newStatus }).eq('id', id);
            if (error) throw error;
            setTasks(tasks.map(t => t.id === id ? { ...t, status: newStatus as any } : t));
        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completado': return <CheckCircle2 size={18} color="#10B981" />;
            case 'en_progreso': return <Clock size={18} color="var(--tertiary)" />;
            case 'retrasado': return <AlertCircle size={18} color="#EF4444" />;
            default: return <Calendar size={18} color="#64748B" />;
        }
    };

    if (loading) return <div className="flex-center" style={{ color: 'var(--primary)', fontFamily: 'Oswald', padding: '2rem' }}>SINCRONIZANDO RUTA CRÍTICA...</div>;

    return (
        <div className="flex-col gap-2" style={{ paddingBottom: '5rem' }}>
            <div className="tactile-card" style={{ border: '1px solid var(--tertiary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontFamily: 'Oswald', color: 'white', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Calendar color="var(--tertiary)" /> RUTA CRÍTICA (QUEST LOG)
                    </h2>
                    {isAdmin && !showForm && (
                        <button className="primary-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => setShowForm(true)}>
                            <Plus size={16} /> NUEVA MISIÓN
                        </button>
                    )}
                </div>

                {/* --- ADD MISSION FORM (ADMIN ONLY) --- */}
                {showForm && (
                    <form onSubmit={handleAddTask} style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px', border: '1px dashed var(--tertiary)', marginBottom: '1.5rem', position: 'relative' }}>
                        <button type="button" onClick={() => setShowForm(false)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
                            <X size={20} />
                        </button>
                        <h3 style={{ margin: '0 0 1rem 0', color: 'var(--tertiary)', fontFamily: 'Oswald', fontSize: '1.1rem' }}>INSTRUIR NUEVA MISIÓN TÁCTICA</h3>

                        <input
                            type="text" required placeholder="Título de la Misión (Ej: Taller de Defensa del Voto)" className="squishy-input"
                            value={newTask.title} onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                        />
                        <textarea
                            required placeholder="Descripción y objetivos a cumplir..." className="squishy-input" rows={2} style={{ resize: 'vertical' }}
                            value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                        />

                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <select className="squishy-input" style={{ flex: 1 }} value={newTask.phase} onChange={e => setNewTask({ ...newTask, phase: e.target.value as any })}>
                                <option value="Candidatura">Fase: Candidatura</option>
                                <option value="Eleccion">Fase: Elección (Día D)</option>
                            </select>
                            <select className="squishy-input" style={{ flex: 1 }} value={newTask.target_role || 'todos'} onChange={e => setNewTask({ ...newTask, target_role: e.target.value })}>
                                <option value="todos">Objetivo para: TODOS</option>
                                <option value="coordinador">Objetivo para: Coordinadores</option>
                                <option value="lider">Objetivo para: Líderes</option>
                                <option value="brigadista">Objetivo para: Brigadistas</option>
                            </select>
                            <input type="date" required className="squishy-input" style={{ flex: 1 }} title="Fecha de Inicio"
                                value={newTask.start_date} onChange={e => setNewTask({ ...newTask, start_date: e.target.value })}
                            />
                            <input type="date" required className="squishy-input" style={{ flex: 1 }} title="Fecha de Cierre"
                                value={newTask.end_date} onChange={e => setNewTask({ ...newTask, end_date: e.target.value })}
                            />
                        </div>
                        <button type="submit" className="primary-btn" disabled={isSaving} style={{ marginTop: '0.5rem', width: '100%' }}>
                            {isSaving ? 'GUARDANDO MANDO...' : 'AUTORIZAR MISIÓN E INYECTAR A LA BASE'}
                        </button>
                    </form>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
                    {/* Timeline Line */}
                    <div style={{ position: 'absolute', left: '9px', top: '10px', bottom: '10px', width: '2px', backgroundColor: 'rgba(255,255,255,0.1)', zIndex: 0 }} />

                    {tasks.map((task) => (
                        <div key={task.id} style={{ display: 'flex', gap: '1rem', position: 'relative', zIndex: 1, opacity: task.status === 'completado' ? 0.7 : 1 }}>
                            <div style={{ backgroundColor: '#1A1D24', borderRadius: '50%', padding: '2px' }}>
                                {getStatusIcon(task.status)}
                            </div>
                            <div style={{
                                flex: 1,
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                padding: '1rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.05)',
                                borderLeft: `3px solid ${task.status === 'completado' ? '#10B981' : task.status === 'retrasado' ? '#EF4444' : task.status === 'en_progreso' ? 'var(--tertiary)' : 'transparent'}`
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <h4 style={{ margin: 0, color: task.status === 'completado' ? '#888' : 'white', fontFamily: 'Inter', textDecoration: task.status === 'completado' ? 'line-through' : 'none' }}>{task.title}</h4>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <span style={{
                                            fontSize: '0.65rem',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            backgroundColor: task.phase === 'Candidatura' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255, 90, 54, 0.2)',
                                            color: task.phase === 'Candidatura' ? '#00D4FF' : '#FF5A36',
                                            fontFamily: 'Oswald',
                                            textTransform: 'uppercase'
                                        }}>
                                            {task.phase}
                                        </span>
                                        {task.target_role && task.target_role !== 'todos' && (
                                            <span style={{
                                                fontSize: '0.65rem',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                backgroundColor: 'rgba(255, 215, 0, 0.2)',
                                                color: '#FFD700',
                                                fontFamily: 'Oswald',
                                                textTransform: 'uppercase'
                                            }}>
                                                DIRIGIDO A: {task.target_role}
                                            </span>
                                        )}
                                        {isAdmin && (
                                            <button onClick={() => handleDeleteTask(task.id, task.title)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px' }} title="Eliminar Misión">
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: '0.5rem 0' }}>{task.description}</p>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.8rem' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', gap: '1rem' }}>
                                        <span>Inicia: {new Date(task.start_date).toLocaleDateString()}</span>
                                        <span>Cierra: {new Date(task.end_date).toLocaleDateString()}</span>
                                    </div>

                                    {/* Status Controls for Admins */}
                                    {isAdmin && (
                                        <select
                                            value={task.status}
                                            onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                            style={{
                                                backgroundColor: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
                                                borderRadius: '4px', fontSize: '0.75rem', padding: '2px 4px', cursor: 'pointer'
                                            }}
                                        >
                                            <option value="pendiente">Pendiente</option>
                                            <option value="en_progreso">En Progreso</option>
                                            <option value="retrasado">Retrasado</option>
                                            <option value="completado">Completado</option>
                                        </select>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {tasks.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748B' }}>
                            No hay misiones programadas en la ruta crítica. Configura la agenda para movilizar al equipo.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
