import { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { DEMO_CAMPAIGNS, DEMO_ROLES, FREE_LEGEND, startDemo } from '../lib/demo';
import './landing.css';

/** Elegir campaña ficticia y perfil, y entrar a una demo privada sin contraseña. */
export const DemoLauncher = ({ compact = false }: { compact?: boolean }) => {
    const [campaign, setCampaign] = useState(2);
    const [role, setRole] = useState('candidato');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const go = async () => {
        setBusy(true); setError('');
        try { await startDemo(campaign, role); } catch (e: any) { setError(e.message); setBusy(false); }
    };

    return (
        <div className="tl-launcher">
            <div className="tl-step">1 · Elige una campaña ficticia</div>
            <div className="tl-choice-grid">
                {DEMO_CAMPAIGNS.map(c => (
                    <button key={c.k} type="button" className={`tl-choice ${campaign === c.k ? 'on' : ''}`} onClick={() => setCampaign(c.k)} aria-pressed={campaign === c.k}>
                        <strong>{c.title}</strong>
                        <span className="tl-choice-place">{c.place}</span>
                        {!compact && <span className="tl-choice-blurb">{c.blurb}</span>}
                    </button>
                ))}
            </div>
            <div className="tl-step">2 · Entra como</div>
            <div className="tl-role-grid">
                {DEMO_ROLES.map(r => (
                    <button key={r.role} type="button" className={`tl-role ${role === r.role ? 'on' : ''}`} onClick={() => setRole(r.role)} aria-pressed={role === r.role}>
                        <strong>{r.label}</strong>
                        {!compact && <span>{r.what}</span>}
                    </button>
                ))}
            </div>
            <button type="button" className="tl-btn tl-btn-primary tl-btn-wide" onClick={go} disabled={busy}>
                {busy ? <><Loader2 size={18} className="spin" /> Preparando tu demo…</> : <><Play size={18} /> Entrar a la demo</>}
            </button>
            {error && <div className="tl-error">{error}</div>}
            <p className="tl-fineprint">
                Se crea una copia privada sólo para ti, con datos ficticios. Puedes agregar, editar y borrar lo que quieras: todo se elimina al salir o tras 30 minutos sin uso. Dentro puedes cambiar de perfil sin perder lo que hiciste.
                <br />{FREE_LEGEND}
            </p>
        </div>
    );
};

/** Página /demo */
export const DemoPage = () => (
    <div className="tl-landing tl-page">
        <header className="tl-nav"><a href="/" className="tl-brand">TLATOANI</a><a href="/login" className="tl-navlink">Iniciar sesión</a></header>
        <main className="tl-container tl-narrow">
            <h1 className="tl-h2">Prueba Tlatoani en 1 minuto</h1>
            <p className="tl-lead">Sin registro y sin contraseña. Recorre el sistema con cualquiera de los perfiles de una campaña.</p>
            <DemoLauncher />
            <p className="tl-fineprint" style={{ textAlign: 'center' }}><a href="/guia-demo.pdf" download>Descargar la guía de la demo (PDF)</a></p>
        </main>
    </div>
);

export default DemoPage;
