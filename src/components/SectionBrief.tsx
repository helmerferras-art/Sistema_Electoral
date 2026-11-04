import { useEffect, useState } from 'react';
import { Sparkles, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { askAI } from '../lib/aiProxy';

type Brief = {
    id?: string; created_at?: string; model?: string; summary?: string; resumen?: string;
    sections?: { seccion: string; temas: string[]; lectura: string }[]; secciones?: { seccion: string; temas: string[]; lectura: string }[];
    priorities?: { seccion: string; por_que: string; accion?: string }[]; prioridades?: { seccion: string; por_que: string; accion?: string }[];
};

/**
 * Resumen semanal por sección: qué preocupa en cada una y dónde enfocar brigadas.
 * El servidor arma cifras agregadas (sin nombres ni teléfonos) y la IA las redacta.
 */
export const SectionBrief = () => {
    const { user } = useAuth();
    const [brief, setBrief] = useState<Brief | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const [available, setAvailable] = useState(true);

    useEffect(() => {
        if (!user?.tenant_id) return;
        Promise.all([
            supabase.from('ai_section_briefs').select('id, created_at, model, summary, sections, priorities')
                .eq('tenant_id', user.tenant_id).order('created_at', { ascending: false }).limit(1),
            supabase.rpc('fn_ai_status'),
        ]).then(([b, s]) => {
            setBrief(((b.data || [])[0] as Brief) || null);
            setAvailable(!!(s.data as any)?.disponible);
            setLoading(false);
        });
    }, [user?.tenant_id]);

    const generate = async () => {
        setRunning(true); setError('');
        try {
            const res = await askAI<Brief>('section_brief');
            setBrief(res.brief || null);
        } catch (e: any) { setError(e.message); }
        setRunning(false);
    };

    if (loading) return null;
    const summary = brief?.summary ?? brief?.resumen;
    const sections = brief?.sections ?? brief?.secciones ?? [];
    const priorities = brief?.priorities ?? brief?.prioridades ?? [];
    const age = brief?.created_at ? Math.floor((Date.now() - new Date(brief.created_at).getTime()) / 86400000) : null;

    return (
        <div className="tactile-card flex-col gap-2" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ margin: 0, fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Sparkles color="var(--tertiary)" /> RESUMEN POR SECCIÓN
                </h3>
                <button className="squishy-btn primary" disabled={running || !available} onClick={generate} style={{ padding: '0.4rem 0.7rem', fontSize: '0.8rem' }}>
                    {running ? 'Analizando...' : brief ? 'Actualizar' : 'Generar'}
                </button>
            </div>
            {!available && <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>La IA no está configurada. El administrador del sistema la activa desde Modo Dios.</div>}
            {error && <div style={{ fontSize: '0.85rem', color: 'var(--primary)' }}>{error}</div>}
            {!brief && available && !running && <div style={{ fontSize: '0.85rem', color: '#94A3B8' }}>Reúne las respuestas del guion, los reportes ciudadanos, las puertas tocadas y los resultados históricos de cada sección.</div>}

            {brief && (
                <>
                    {age !== null && <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Generado {age === 0 ? 'hoy' : `hace ${age} día${age === 1 ? '' : 's'}`}{brief.model ? ` · ${brief.model}` : ''}</div>}
                    {summary && <p style={{ margin: 0, lineHeight: 1.5 }}>{summary}</p>}

                    {priorities.length > 0 && (
                        <div>
                            <div style={{ fontFamily: 'Oswald', fontSize: '0.9rem', margin: '0.4rem 0', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Target size={14} /> DÓNDE ENFOCAR BRIGADAS</div>
                            {priorities.map((p, i) => (
                                <div key={i} style={{ display: 'flex', gap: '0.6rem', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontFamily: 'Oswald', color: 'var(--primary)', minWidth: 22 }}>{i + 1}</div>
                                    <div style={{ fontSize: '0.85rem' }}>
                                        <strong>Sección {p.seccion}</strong> · {p.por_que}
                                        {p.accion && <div style={{ color: '#94A3B8' }}>{p.accion}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {sections.length > 0 && (
                        <details>
                            <summary style={{ cursor: 'pointer', fontFamily: 'Oswald', fontSize: '0.9rem' }}>QUÉ PREOCUPA EN CADA SECCIÓN ({sections.length})</summary>
                            {sections.map((s, i) => (
                                <div key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.85rem' }}>
                                    <strong>Sección {s.seccion}</strong>
                                    {s.temas?.length > 0 && <span style={{ color: 'var(--tertiary)' }}> · {s.temas.join(', ')}</span>}
                                    {s.lectura && <div style={{ color: '#bbb' }}>{s.lectura}</div>}
                                </div>
                            ))}
                        </details>
                    )}
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Redactado por IA a partir de cifras agregadas, sin datos personales. Verifica antes de decidir.</div>
                </>
            )}
        </div>
    );
};

export default SectionBrief;
