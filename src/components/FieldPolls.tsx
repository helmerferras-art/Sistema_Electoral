import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { ClipboardList, ChevronRight, X } from 'lucide-react';

export const FieldPolls = () => {
    const { user } = useAuth();
    const [polls, setPolls] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Answering state
    const [activePoll, setActivePoll] = useState<any>(null);
    const [responses, setResponses] = useState<Record<string, string>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchActivePolls();
    }, [user?.tenant_id]);

    const fetchActivePolls = async () => {
        if (!user?.tenant_id) return;

        // Fetch active polls
        const { data: pollsData, error } = await supabase
            .from('polls')
            .select(`
                id, title, description,
                poll_questions (
                    id, question_text, question_type,
                    poll_options (
                        id, option_text
                    )
                )
            `)
            .eq('tenant_id', user.tenant_id)
            .eq('active', true);

        if (!error && pollsData) {
            setPolls(pollsData);
        }
        setLoading(false);
    };

    const handleSelectOption = (questionId: string, optionId: string) => {
        setResponses(prev => ({
            ...prev,
            [questionId]: optionId
        }));
    };

    const submitPoll = async () => {
        if (!activePoll || !user) return;

        // Ensure all questions answered
        const questionIds = activePoll.poll_questions.map((q: any) => q.id);
        const answeredIds = Object.keys(responses);
        if (questionIds.length !== answeredIds.length) {
            alert("Por favor responde todas las preguntas del instrumento.");
            return;
        }

        setIsSubmitting(true);
        try {
            // Get location if possible
            let lat = null, lng = null;
            if ('geolocation' in navigator) {
                try {
                    const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
                    });
                    lat = pos.coords.latitude;
                    lng = pos.coords.longitude;
                } catch (e) {
                    console.log("Location skipped or denied");
                }
            }

            const inserts = Object.entries(responses).map(([qId, optId]) => ({
                poll_id: activePoll.id,
                question_id: qId,
                option_id: optId,
                user_id: user.id,
                lat,
                lng
            }));

            const { error } = await supabase.from('poll_responses').insert(inserts);
            if (error) throw error;

            alert("Respuestas enviadas exitosamente. Operador: +10 XP");
            // Optional: User XP bump logic here

            setActivePoll(null);
            setResponses({});
        } catch (err: any) {
            alert("Error al enviar encuesta: " + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div style={{ color: 'var(--tertiary)' }}>Sincronizando encuestas...</div>;

    if (activePoll) {
        return (
            <div className="flex-col gap-4" style={{ animation: 'slideInRight 0.3s ease-out' }}>
                <div className="tactile-card" style={{ border: '1px solid var(--tertiary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ color: 'var(--tertiary)', fontFamily: 'Oswald', margin: '0 0 0.5rem 0' }}>{activePoll.title}</h3>
                            <p style={{ color: '#94A3B8', fontSize: '0.9rem', margin: 0 }}>{activePoll.description}</p>
                        </div>
                        <button onClick={() => { setActivePoll(null); setResponses({}); }} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}>
                            <X size={24} />
                        </button>
                    </div>

                    <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {activePoll.poll_questions.map((q: any, i: number) => (
                            <div key={q.id} style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', borderLeft: '3px solid var(--tertiary)' }}>
                                <div style={{ color: 'white', fontFamily: 'Inter', fontWeight: 'bold', marginBottom: '1rem' }}>
                                    {i + 1}. {q.question_text}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {q.poll_options.map((opt: any) => (
                                        <button
                                            key={opt.id}
                                            onClick={() => handleSelectOption(q.id, opt.id)}
                                            style={{
                                                textAlign: 'left',
                                                padding: '0.8rem 1rem',
                                                borderRadius: '6px',
                                                border: responses[q.id] === opt.id ? '1px solid var(--tertiary)' : '1px solid rgba(255,255,255,0.1)',
                                                backgroundColor: responses[q.id] === opt.id ? 'rgba(0, 212, 255, 0.15)' : 'rgba(255,255,255,0.02)',
                                                color: responses[q.id] === opt.id ? 'var(--tertiary)' : 'white',
                                                cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ width: '16px', height: '16px', borderRadius: '50%', border: responses[q.id] === opt.id ? '4px solid var(--tertiary)' : '1px solid #888', backgroundColor: responses[q.id] === opt.id ? '#0F1218' : 'transparent' }} />
                                            {opt.option_text}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={submitPoll}
                        disabled={isSubmitting}
                        className="squishy-btn primary"
                        style={{ width: '100%', marginTop: '1.5rem', padding: '1rem', justifyContent: 'center', fontSize: '1.1rem' }}
                    >
                        {isSubmitting ? 'ENVIANDO...' : 'ENVIAR RESULTADOS AL C4I'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-col gap-3">
            <h3 style={{ color: 'white', fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 0.5rem 0' }}>
                <ClipboardList color="var(--tertiary)" /> ENCUESTAS ACTIVAS
            </h3>

            {polls.length === 0 ? (
                <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '2rem', textAlign: 'center', borderRadius: '8px', color: '#64748B', border: '1px dashed rgba(255,255,255,0.1)' }}>
                    No hay mediciones activas requeridas por Mando Central en este momento.
                </div>
            ) : (
                polls.map(poll => (
                    <div key={poll.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                        <div>
                            <div style={{ color: 'white', fontFamily: 'Oswald', fontSize: '1.1rem' }}>{poll.title}</div>
                            <div style={{ color: '#94A3B8', fontSize: '0.8rem', marginTop: '0.2rem' }}>{poll.poll_questions?.length || 0} Preguntas</div>
                        </div>
                        <button
                            onClick={() => setActivePoll(poll)}
                            className="squishy-btn primary"
                            style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                            INICIAR <ChevronRight size={16} />
                        </button>
                    </div>
                ))
            )}
        </div>
    );
};
