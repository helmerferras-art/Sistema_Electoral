import { useEffect, useState } from 'react';
import { CheckCircle, ClipboardList, Phone, Home } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { bumpTally } from '../lib/fieldTally';
import { COMPARATIVE, PER_PERSON, loadContest, pendingInterviews, saveInterview, shuffle, syncInterviews, type Contest, type Person } from '../lib/internal';

/**
 * Termómetro en campo: entrevista anónima y corta con las mismas preguntas que la encuesta de definición.
 * El orden de los nombres cambia en cada entrevista para no inducir la respuesta.
 */
type Step = { kind: 'per'; key: string; person: Person } | { kind: 'cmp'; key: string };

export const ThermoSurvey = () => {
    const { user } = useAuth();
    const [contest, setContest] = useState<Contest | null>(null);
    const [people, setPeople] = useState<Person[]>([]);
    const [running, setRunning] = useState(false);
    const [mode, setMode] = useState<'vivienda' | 'telefono'>('vivienda');
    const [section, setSection] = useState('');
    const [sampled, setSampled] = useState(true);
    const [order, setOrder] = useState<Person[]>([]);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [idx, setIdx] = useState(0);
    const [done, setDone] = useState(0);
    const [pending, setPending] = useState(pendingInterviews());
    const [flash, setFlash] = useState('');

    useEffect(() => {
        if (!user?.tenant_id) return;
        loadContest(user.tenant_id).then(({ contest: c, rivals }) => {
            setContest(c);
            if (c) setPeople([{ pid: 'self', name: c.self_name, is_self: true }, ...rivals.map(r => ({ pid: r.id, name: r.name, is_self: false }))]);
        });
        syncInterviews().then(() => setPending(pendingInterviews()));
        const onOnline = () => syncInterviews().then(() => setPending(pendingInterviews()));
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
    }, [user?.tenant_id]);

    if (!user || !contest?.active || people.length < 2) return null;

    // Pasos: por cada persona "¿la conoce?"; si la conoce, opinión y voto. Después las comparativas.
    const steps: Step[] = [];
    for (const p of order) {
        steps.push({ kind: 'per', key: 'conoce', person: p });
        if (answers.conoce?.[p.pid] === 'si') {
            steps.push({ kind: 'per', key: 'opinion', person: p });
            steps.push({ kind: 'per', key: 'votaria', person: p });
        }
    }
    COMPARATIVE.forEach(c => steps.push({ kind: 'cmp', key: c.key }));
    const step = steps[idx];

    const start = () => {
        setOrder(shuffle(people));
        setAnswers({ conoce: {}, opinion: {}, votaria: {}, _cmp_order: Object.fromEntries(COMPARATIVE.map(c => [c.key, shuffle(people)])) });
        setIdx(0); setRunning(true);
    };

    const answer = async (value: string) => {
        if (!step) return;
        const next = { ...answers };
        if (step.kind === 'per') next[step.key] = { ...(next[step.key] || {}), [step.person.pid]: value };
        else next[step.key] = value;
        setAnswers(next);
        // Se recalcula con la respuesta recién dada (la cantidad de pasos cambia si dijo que sí la conoce)
        const willHave = step.kind === 'per' && step.key === 'conoce' && value === 'si' ? steps.length + 2 : steps.length;
        if (idx + 1 < willHave) { setIdx(idx + 1); return; }
        const { _cmp_order, ...clean } = next;
        await saveInterview({
            tenant_id: user.tenant_id!, user_id: user.id, section_id: section.trim() || null, mode, sampled, answers: clean,
        });
        setPending(pendingInterviews());
        // Bitácora automática: la entrevista es un contacto; si conocía al aspirante también suma ahí
        bumpTally({ source: 'entrevista', contacts: 1, known: (clean as any).conoce?.self === 'si' ? 1 : 0, door: mode === 'vivienda' });
        setDone(d => d + 1);
        setRunning(false);
        setFlash('Entrevista guardada');
        setTimeout(() => setFlash(''), 1800);
    };

    const cmpOptions = (key: string): Person[] => answers._cmp_order?.[key] || people;

    return (
        <div className="tactile-card flex-col gap-2" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                <h3 style={{ margin: 0, fontFamily: 'Oswald', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ClipboardList color="var(--tertiary)" /> TERMÓMETRO
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{done ? `${done} hoy` : ''}{pending ? ` · ${pending} sin subir` : ''}</span>
            </div>

            {!running ? (
                <>
                    <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Encuesta corta y anónima: no se pide nombre ni teléfono a la persona entrevistada.</div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button className={`squishy-btn ${mode === 'vivienda' ? 'primary' : ''}`} style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4 }} onClick={() => setMode('vivienda')}><Home size={16} /> En vivienda</button>
                        <button className={`squishy-btn ${mode === 'telefono' ? 'primary' : ''}`} style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 4 }} onClick={() => setMode('telefono')}><Phone size={16} /> Por teléfono</button>
                    </div>
                    <input className="squishy-input" inputMode="numeric" placeholder={mode === 'vivienda' ? 'Sección (si la dejas vacía se toma del GPS)' : 'Sección de la persona (si la sabes)'}
                        value={section} onChange={e => setSection(e.target.value.replace(/\D/g, ''))} />
                    <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input type="checkbox" checked={sampled} onChange={e => setSampled(e.target.checked)} /> Es parte de la muestra aleatoria (casa elegida al azar, no un conocido)
                    </label>
                    <button className="squishy-btn primary" style={{ padding: '0.7rem' }} onClick={start}>Iniciar entrevista</button>
                    {flash && <div style={{ textAlign: 'center', color: 'var(--secondary)', fontSize: '0.85rem' }}><CheckCircle size={14} /> {flash}</div>}
                </>
            ) : step && (
                <div className="flex-col gap-1">
                    {idx === 0 && (
                        <div style={{ fontSize: '0.78rem', color: '#94A3B8', fontStyle: 'italic' }}>
                            Lee: "Buen día, estamos haciendo una encuesta corta de opinión sobre personas de la vida pública de la zona. Es anónima y toma dos minutos. ¿Me permite unas preguntas?"
                        </div>
                    )}
                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Pregunta {idx + 1}</div>
                    {step.kind === 'per' ? (() => {
                        const def = PER_PERSON.find(q => q.key === step.key)!;
                        return (
                            <>
                                <div style={{ fontWeight: 700 }}>{def.q(step.person.name)}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${def.options.length}, 1fr)`, gap: '0.3rem' }}>
                                    {def.options.map(([v, label]) => <button key={v} className="squishy-btn" style={{ padding: '0.7rem 0.3rem' }} onClick={() => answer(v)}>{label}</button>)}
                                </div>
                            </>
                        );
                    })() : (() => {
                        const def = COMPARATIVE.find(q => q.key === step.key)!;
                        return (
                            <>
                                <div style={{ fontWeight: 700 }}>{def.q(contest.coalition_label)}</div>
                                <div className="flex-col gap-1">
                                    {cmpOptions(step.key).map(p => <button key={p.pid} className="squishy-btn" style={{ padding: '0.6rem', textAlign: 'left' }} onClick={() => answer(p.pid)}>{p.name}</button>)}
                                    <button className="squishy-btn" style={{ padding: '0.6rem', color: '#94A3B8' }} onClick={() => answer('ninguno')}>Ninguno / No sabe</button>
                                </div>
                            </>
                        );
                    })()}
                    <button className="squishy-btn" style={{ marginTop: '0.3rem', color: '#94A3B8' }} onClick={() => setRunning(false)}>Cancelar entrevista</button>
                </div>
            )}
        </div>
    );
};

export default ThermoSurvey;
