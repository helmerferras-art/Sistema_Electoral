import { useEffect, useState } from 'react';
import { nextPhrase, type Phrase } from '../lib/motivation';

/**
 * Frase para el equipo cada vez que se abre la app (una por apertura, no en cada cambio de pestaña).
 * "Hoy no" la oculta hasta el día siguiente.
 */
const SESSION_KEY = 'tl_motiv_session';
const MUTE_KEY = 'tl_motiv_mute';
const today = () => new Date().toLocaleDateString('es-MX');

export const MotivationCard = ({ role, name }: { role?: string; name?: string }) => {
    const [phrase, setPhrase] = useState<Phrase | null>(null);

    useEffect(() => {
        try {
            if (sessionStorage.getItem(SESSION_KEY)) return;
            if (localStorage.getItem(MUTE_KEY) === today()) return;
            sessionStorage.setItem(SESSION_KEY, '1');
        } catch { /* sin almacenamiento: se muestra igual */ }
        const t = setTimeout(() => setPhrase(nextPhrase(role)), 1200);
        return () => clearTimeout(t);
    }, [role]);

    if (!phrase) return null;
    const close = () => setPhrase(null);
    const mute = () => { try { localStorage.setItem(MUTE_KEY, today()); } catch { /* */ } close(); };
    const first = (name || '').split(' ')[0];

    return (
        <div className="motiv-overlay" role="dialog" aria-label="Frase del día" onClick={close}>
            <div className="motiv-card" onClick={e => e.stopPropagation()}>
                <div className="motiv-kicker">{first ? `${first}, la frase de hoy` : 'La frase de hoy'}</div>
                <blockquote className="motiv-text">“{phrase.text}”</blockquote>
                <div className="motiv-source">{phrase.idea ? 'Idea de ' : '— '}{phrase.source}</div>
                <div className="motiv-actions">
                    <button className="motiv-go" onClick={close}>¡A darle!</button>
                    <button className="motiv-link" onClick={() => setPhrase(nextPhrase(role))}>Otra frase</button>
                    <button className="motiv-link" onClick={mute}>Hoy no</button>
                </div>
            </div>
        </div>
    );
};
