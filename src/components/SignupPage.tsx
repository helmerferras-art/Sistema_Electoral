import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { FREE_LEGEND, useLeaveDemo } from '../lib/demo';
import { PLATFORM_TERMS_VERSION } from '../lib/engagement';
import './landing.css';

export const CARGOS = [
    { v: 'presidencia_municipal', l: 'Presidencia municipal' },
    { v: 'diputacion_local', l: 'Diputación local' },
    { v: 'diputacion_federal', l: 'Diputación federal' },
    { v: 'gubernatura', l: 'Gubernatura' },
    { v: 'senaduria', l: 'Senaduría' },
    { v: 'regiduria', l: 'Regiduría / sindicatura' },
    { v: 'aspirante', l: 'Aún soy aspirante' },
];

export const ESTADOS = ['Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas'];

const INCLUDED = [
    '1 candidato(a), 1 coordinación de campaña, 1 comunicación, 1 comunicación digital y 1 coordinación territorial',
    '2 líderes con 5 brigadistas cada uno',
    'Hasta 500 simpatizantes, 1 guion de campo, 1 sondeo y 3 eventos al mes',
    'Mapa, zonas de recorrido, metas, capacitación y 3 consultas de IA al día',
];

export const GoogleButton = ({ label = 'Continuar con Google', next = '/registro' }: { label?: string; next?: string }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return (
        <>
            <button
                type="button"
                className="tl-btn tl-btn-google tl-btn-wide"
                disabled={busy}
                onClick={async () => {
                    setBusy(true); setError('');
                    localStorage.removeItem('gamefi_agent_context');
                    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}${next}` } });
                    if (error) { setError('El acceso con Google aún no está activado. Intenta más tarde o escríbenos.'); setBusy(false); }
                }}
            >
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" /><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" /><path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" /><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.8 6C6.6 42.6 14.6 48 24 48z" /></svg>
                {busy ? 'Abriendo Google…' : label}
            </button>
            {error && <div className="tl-error">{error}</div>}
        </>
    );
};

const ERRORS: Record<string, string> = {
    sin_sesion: 'Tu sesión expiró. Vuelve a entrar con Google.',
    falta_aceptar: 'Debes aceptar el aviso de privacidad y los términos.',
    faltan_datos: 'Escribe tu nombre y el nombre de la campaña (mínimo 3 letras).',
    falta_telefono: 'El celular debe tener 10 dígitos.',
    telefono_registrado: 'Ese celular ya está registrado en otra campaña. Usa otro o entra con tu número desde "Iniciar sesión".',
    ya_tiene_prueba: 'Esta cuenta de Google ya tiene una campaña en Plan Arranque.',
};

/** /registro · Crear cuenta gratis (Plan Arranque) con Google y completar los datos de la campaña. */
export const SignupPage = () => {
    const { session, user } = useAuth();
    const leavingDemo = useLeaveDemo('/registro');
    const meta = session?.user?.user_metadata || {};
    const [f, setF] = useState({ name: meta.full_name || meta.name || '', phone: '', cargo: 'presidencia_municipal', estado: 'Chiapas', municipio: '', campaign: '' });
    const [accept, setAccept] = useState(false);
    const [legend, setLegend] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (leavingDemo) return null;
    if (session && user) return <Navigate to="/" replace />;
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true); setError('');
        const { data, error } = await supabase.rpc('fn_create_trial_campaign', {
            p_name: f.name, p_phone: f.phone, p_cargo: f.cargo, p_estado: f.estado, p_municipio: f.municipio,
            p_campaign: f.campaign, p_accept: accept && legend, p_version: PLATFORM_TERMS_VERSION,
        });
        const estado = (data as any)?.estado;
        if (error || estado !== 'ok') {
            if (estado === 'ya_tiene_cuenta') { window.location.href = '/'; return; }
            setError(ERRORS[estado] || error?.message || 'No se pudo crear la campaña.');
            setBusy(false);
            return;
        }
        localStorage.removeItem('gamefi_agent_context');
        window.location.href = '/';
    };

    return (
        <div className="tl-landing tl-page">
            <header className="tl-nav"><a href="/" className="tl-brand">TLATOANI</a><a href="/login" className="tl-navlink">Iniciar sesión</a></header>
            <main className="tl-container tl-narrow">
                {!session ? (
                    <>
                        <h1 className="tl-h2">Crea tu campaña gratis</h1>
                        <p className="tl-lead">El Plan Arranque es para que un candidato sin estructura ponga a andar su equipo y pruebe el sistema, sin pago.</p>
                        <ul className="tl-checklist">{INCLUDED.map(i => <li key={i}><CheckCircle2 size={18} /> {i}</li>)}</ul>
                        <GoogleButton label="Crear cuenta con Google" />
                        <p className="tl-fineprint">{FREE_LEGEND} Si después contratas, se emite un precio simbólico o el que se acuerde, para que puedas reportarlo a la autoridad electoral.</p>
                        <p className="tl-fineprint">¿Sólo quieres ver cómo funciona? <a href="/demo">Entra a la demo</a> · ¿Necesitas más? <a href="/cotizacion">Solicita una cotización</a></p>
                    </>
                ) : (
                    <form onSubmit={submit} className="tl-form">
                        <h1 className="tl-h2">Datos de tu campaña</h1>
                        <p className="tl-lead">Entraste como {session.user?.email}. Con esto creamos tu campaña en Plan Arranque.</p>
                        <label>Tu nombre<input required minLength={3} value={f.name} onChange={set('name')} /></label>
                        <label>Celular (10 dígitos)<input required inputMode="numeric" pattern="[0-9 ]{10,14}" value={f.phone} onChange={set('phone')} placeholder="961 123 4567" /></label>
                        <label>Nombre de la campaña<input required minLength={3} value={f.campaign} onChange={set('campaign')} placeholder="Ej. Ana López para Tuxtla" /></label>
                        <div className="tl-form-row">
                            <label>Cargo<select value={f.cargo} onChange={set('cargo')}>{CARGOS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></label>
                            <label>Estado<select value={f.estado} onChange={set('estado')}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></label>
                        </div>
                        <label>Municipio o distrito<input value={f.municipio} onChange={set('municipio')} placeholder="Ej. Tuxtla Gutiérrez" /></label>
                        <label className="tl-check"><input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} /> <span>Acepto el <a href="/privacidad" target="_blank">aviso de privacidad</a> y los <a href="/terminos" target="_blank">términos de uso</a>.</span></label>
                        <label className="tl-check"><input type="checkbox" checked={legend} onChange={e => setLegend(e.target.checked)} /> <span>Entiendo que es una <strong>versión de demostración gratuita</strong> y que <strong>no constituye aportación a ninguna campaña electoral</strong>.</span></label>
                        <button className="tl-btn tl-btn-primary tl-btn-wide" disabled={busy || !accept || !legend}>
                            {busy ? <><Loader2 size={18} className="spin" /> Creando…</> : 'Crear mi campaña'}
                        </button>
                        {error && <div className="tl-error">{error}</div>}
                        <button type="button" className="tl-linkbtn" onClick={async () => { await supabase.auth.signOut(); window.location.href = '/registro'; }}>Usar otra cuenta de Google</button>
                    </form>
                )}
            </main>
        </div>
    );
};

export default SignupPage;
