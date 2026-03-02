import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { PieChart, Plus, CheckCircle, Clock, Map as MapIcon } from 'lucide-react';

interface Poll {
    id: string;
    title: string;
    description: string;
    active: boolean;
    created_at: string;
}


export const C4IPollManager = () => {
    const { user } = useAuth();
    const [polls, setPolls] = useState<Poll[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newPollTitle, setNewPollTitle] = useState('');
    const [newPollDesc, setNewPollDesc] = useState('');
    const [questions, setQuestions] = useState([{ text: '', options: ['', ''] }]);
    const [loading, setLoading] = useState(true);

    const fetchPolls = async () => {
        if (!user?.tenant_id) return;
        const { data, error } = await supabase
            .from('polls')
            .select('*')
            .eq('tenant_id', user.tenant_id)
            .order('created_at', { ascending: false });

        if (error) console.error("Error fetching polls:", error);
        else setPolls(data || []);
        setLoading(false);
    };

    useEffect(() => {
        fetchPolls();
    }, [user?.tenant_id]);

    const handleViewMap = (poll: Poll) => {
        localStorage.setItem('radar_poll_mode', JSON.stringify({ pollId: poll.id, title: poll.title }));
        window.dispatchEvent(new CustomEvent('changeTab', { detail: 'map' }));
    };

    const handleAddQuestion = () => {
        setQuestions([...questions, { text: '', options: ['', ''] }]);
    };

    const handleAddOption = (qIndex: number) => {
        const updated = [...questions];
        updated[qIndex].options.push('');
        setQuestions(updated);
    };

    const updateQuestionText = (index: number, text: string) => {
        const updated = [...questions];
        updated[index].text = text;
        setQuestions(updated);
    };

    const updateOptionText = (qIndex: number, oIndex: number, text: string) => {
        const updated = [...questions];
        updated[qIndex].options[oIndex] = text;
        setQuestions(updated);
    };

    const handleCreatePoll = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            // 1. Create Poll
            const { data: pollData, error: pollError } = await supabase.from('polls').insert([{
                tenant_id: user?.tenant_id,
                title: newPollTitle,
                description: newPollDesc,
                active: true
            }]).select().single();

            if (pollError) throw pollError;

            // 2. Create Questions & Options
            for (const q of questions) {
                if (!q.text) continue;
                const { data: qData, error: qError } = await supabase.from('poll_questions').insert([{
                    poll_id: pollData.id,
                    question_text: q.text
                }]).select().single();

                if (qError) throw qError;

                const optionsToInsert = q.options.filter(o => o.trim() !== '').map(opt => ({
                    question_id: qData.id,
                    option_text: opt
                }));

                if (optionsToInsert.length > 0) {
                    await supabase.from('poll_options').insert(optionsToInsert);
                }
            }

            alert("Encuesta desplegada exitosamente.");
            setIsCreating(false);
            setNewPollTitle('');
            setNewPollDesc('');
            setQuestions([{ text: '', options: ['', ''] }]);
            fetchPolls();
        } catch (error: any) {
            alert("Error al crear encuesta: " + error.message);
        }
    };

    const togglePollStatus = async (pollId: string, currentStatus: boolean) => {
        try {
            const { error } = await supabase.from('polls').update({ active: !currentStatus }).eq('id', pollId);
            if (!error) fetchPolls();
        } catch (err) {
            console.error("Toggle error", err);
        }
    };

    if (loading) return <div style={{ color: 'var(--tertiary)' }}>Cargando encuestas...</div>;

    return (
        <div className="flex-col gap-4">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: 'white', fontFamily: 'Oswald', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', textShadow: '0 0 10px var(--tertiary)' }}>
                    <PieChart color="var(--tertiary)" /> GESTIÓN DE ENCUESTAS
                </h3>

                {!isCreating && (
                    <button className="primary-btn" onClick={() => setIsCreating(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                        <Plus size={16} /> NUEVA ENCUESTA
                    </button>
                )}
            </div>

            {isCreating && (
                <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--tertiary)' }}>
                    <h4 style={{ color: 'var(--tertiary)', marginTop: 0, fontFamily: 'Oswald' }}>DISEÑAR INSTRUMENTO DE MEDICIÓN</h4>
                    <form onSubmit={handleCreatePoll} className="flex-col gap-3">
                        <input type="text" required placeholder="Título de la Encuesta" value={newPollTitle} onChange={e => setNewPollTitle(e.target.value)} className="squishy-input" />
                        <textarea placeholder="Descripción u objetivo..." value={newPollDesc} onChange={e => setNewPollDesc(e.target.value)} className="squishy-input" rows={2} />

                        <div style={{ marginTop: '1rem' }}>
                            <h5 style={{ color: '#94A3B8', fontFamily: 'Inter', margin: '0 0 0.5rem 0' }}>PREGUNTAS (OPCIÓN MÚLTIPLE)</h5>
                            {questions.map((q, qIdx) => (
                                <div key={qIdx} style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '6px', marginBottom: '1rem', borderLeft: '2px solid rgba(255,255,255,0.2)' }}>
                                    <input required type="text" placeholder={`Pregunta ${qIdx + 1}`} value={q.text} onChange={e => updateQuestionText(qIdx, e.target.value)} className="squishy-input" style={{ marginBottom: '0.5rem' }} />

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', paddingLeft: '1rem' }}>
                                        {q.options.map((opt, oIdx) => (
                                            <div key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', border: '1px solid #888' }} />
                                                <input required type="text" placeholder={`Opción ${oIdx + 1}`} value={opt} onChange={e => updateOptionText(qIdx, oIdx, e.target.value)} className="squishy-input" style={{ padding: '0.4rem', fontSize: '0.85rem' }} />
                                            </div>
                                        ))}
                                        <button type="button" onClick={() => handleAddOption(qIdx)} style={{ background: 'none', border: 'none', color: 'var(--tertiary)', fontSize: '0.8rem', textAlign: 'left', marginTop: '0.3rem', cursor: 'pointer' }}>+ Añadir opción</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                            <button type="button" onClick={handleAddQuestion} className="squishy-btn secondary" style={{ flex: 1, padding: '0.6rem' }}>+ AGREGAR PREGUNTA</button>
                            <button type="submit" className="primary-btn" style={{ flex: 2, padding: '0.6rem' }}>DESPLEGAR ENCUESTA A OPERADORES</button>
                        </div>
                        <button type="button" onClick={() => setIsCreating(false)} style={{ background: 'none', border: 'none', color: '#EF4444', marginTop: '0.5rem', cursor: 'pointer', fontSize: '0.8rem' }}>Cancelar</button>
                    </form>
                </div>
            )}

            {!isCreating && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {polls.length === 0 ? (
                        <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>No hay encuestas activas. Crea una para medir el pulso territorial.</div>
                    ) : (
                        polls.map(poll => (
                            <div key={poll.id} className="tactile-card glow-tertiary" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'relative', zIndex: 1 }}>
                                    <h4 style={{ margin: 0, color: 'white', fontFamily: 'Inter' }}>{poll.title}</h4>
                                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '0.2rem' }}>{poll.description}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--tertiary)', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem', textShadow: '0 0 5px var(--tertiary)' }}>
                                        <Clock size={12} /> Creada: {new Date(poll.created_at).toLocaleDateString()}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative', zIndex: 1 }}>
                                    {poll.active ? (
                                        <span style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10B981', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #10B981' }}><CheckCircle size={12} /> ACTIVA</span>
                                    ) : (
                                        <span style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', color: '#EF4444', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', border: '1px solid #EF4444' }}>CERRADA</span>
                                    )}
                                    <button onClick={() => handleViewMap(poll)} className="squishy-btn primary glow-tertiary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', height: 'fit-content', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                        <MapIcon size={14} /> MAPA
                                    </button>
                                    <button onClick={() => togglePollStatus(poll.id, poll.active)} className={poll.active ? "squishy-btn secondary" : "primary-btn"} style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', height: 'fit-content' }}>
                                        {poll.active ? 'CERRAR' : 'REABRIR'}
                                    </button>
                                </div>
                            </div>
                        ))

                    )}
                </div>
            )}
        </div>
    );
};
