import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CARGOS, ESTADOS } from './SignupPage';
import { useLeaveDemo } from '../lib/demo';
import './landing.css';

const MODULES = ['Estructura y brigadas', 'Mapa y secciones', 'Guiones y sondeos', 'Eventos', 'Zonas casa por casa', 'Día D y casillas', 'Finanzas y fiscalización', 'Mensajería', 'IA', 'App móvil con marca propia'];
const SIZES = ['Hasta 50 personas', '50 a 300', '300 a 1,000', 'Más de 1,000'];

/** /cotizacion · Solicitud de proyecto a la medida. */
export const QuotePage = () => {
    const leavingDemo = useLeaveDemo('/cotizacion');
    const [f, setF] = useState({ name: '', phone: '', email: '', cargo: 'presidencia_municipal', estado: 'Chiapas', territory: '', size: SIZES[1], date: '', message: '' });
    const [mods, setMods] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true); setError('');
        const { data, error } = await supabase.rpc('fn_request_quote', {
            p_name: f.name, p_phone: f.phone, p_email: f.email,
            p_election_type: CARGOS.find(c => c.v === f.cargo)?.l || f.cargo,
            p_territory: [f.territory, f.estado].filter(Boolean).join(', '),
            p_structure: f.size, p_modules: mods, p_election_date: f.date || null, p_message: f.message,
            p_source: new URLSearchParams(window.location.search).get('origen') || 'web',
        });
        const estado = (data as any)?.estado;
        if (error || estado !== 'ok') {
            setError(estado === 'faltan_datos' ? 'Escribe tu nombre y un celular o correo para contactarte.'
                : estado === 'demasiadas_solicitudes' ? 'Ya recibimos varias solicitudes desde aquí. Te contactaremos pronto.'
                    : 'No se pudo enviar. Intenta de nuevo.');
            setBusy(false);
            return;
        }
        setDone(true);
    };

    if (leavingDemo) return null;
    return (
        <div className="tl-landing tl-page">
            <header className="tl-nav"><a href="/" className="tl-brand">TLATOANI</a><a href="/demo" className="tl-navlink">Ver demo</a></header>
            <main className="tl-container tl-narrow">
                {done ? (
                    <div className="tl-done">
                        <CheckCircle2 size={48} color="#E8743B" />
                        <h1 className="tl-h2">Recibimos tu solicitud</h1>
                        <p className="tl-lead">Un asesor te contactará para entender tu campaña y enviarte la propuesta. El precio depende del tipo de elección, el territorio y el tamaño de la estructura.</p>
                        <a className="tl-btn tl-btn-primary" href="/demo">Mientras, prueba la demo</a>
                    </div>
                ) : (
                    <form onSubmit={submit} className="tl-form">
                        <h1 className="tl-h2">Proyecto a la medida</h1>
                        <p className="tl-lead">Cuéntanos de tu campaña y te enviamos una cotización. El precio depende del tipo de elección, el territorio y el tamaño de tu estructura.</p>
                        <label>Nombre<input required minLength={3} value={f.name} onChange={set('name')} /></label>
                        <div className="tl-form-row">
                            <label>Celular<input inputMode="tel" value={f.phone} onChange={set('phone')} /></label>
                            <label>Correo<input type="email" value={f.email} onChange={set('email')} /></label>
                        </div>
                        <div className="tl-form-row">
                            <label>Elección<select value={f.cargo} onChange={set('cargo')}>{CARGOS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></label>
                            <label>Estado<select value={f.estado} onChange={set('estado')}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></label>
                        </div>
                        <div className="tl-form-row">
                            <label>Municipio o distrito<input value={f.territory} onChange={set('territory')} /></label>
                            <label>Fecha de la elección<input type="date" value={f.date} onChange={set('date')} /></label>
                        </div>
                        <label>Tamaño de la estructura<select value={f.size} onChange={set('size')}>{SIZES.map(s => <option key={s}>{s}</option>)}</select></label>
                        <fieldset className="tl-chips"><legend>Lo que más te interesa</legend>
                            {MODULES.map(m => (
                                <button type="button" key={m} className={`tl-chip ${mods.includes(m) ? 'on' : ''}`} aria-pressed={mods.includes(m)}
                                    onClick={() => setMods(mods.includes(m) ? mods.filter(x => x !== m) : [...mods, m])}>{m}</button>
                            ))}
                        </fieldset>
                        <label>Mensaje (opcional)<textarea rows={3} value={f.message} onChange={set('message')} /></label>
                        <button className="tl-btn tl-btn-primary tl-btn-wide" disabled={busy}>{busy ? <><Loader2 size={18} className="spin" /> Enviando…</> : 'Solicitar cotización'}</button>
                        {error && <div className="tl-error">{error}</div>}
                        <p className="tl-fineprint">Usamos estos datos sólo para responder tu solicitud. <a href="/privacidad">Aviso de privacidad</a>.</p>
                    </form>
                )}
            </main>
        </div>
    );
};

export default QuotePage;
