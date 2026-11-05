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

const ERRORS: Record<string, string> = {
    sin_sesion: 'Tu sesión expiró. Vuelve a entrar con Google.',
    falta_aceptar: 'Debes aceptar el aviso de privacidad y los términos.',
    faltan_datos: 'Escribe tu nombre y el nombre de la campaña (mínimo 3 letras).',
    falta_telefono: 'El celular debe tener 10 dígitos.',
    telefono_registrado: 'Ese celular ya está registrado en otra campaña. Usa otro o entra con tu número desde "Iniciar sesión".',
    ya_tiene_prueba: 'Ese correo ya tiene una campaña en Plan Arranque.',
};

/**
 * /registro · Crear cuenta gratis (Plan Arranque).
 * 1) Datos de la campaña + celular + correo  2) Código de 6 números que llega al correo  3) Se crea la campaña.
 * El correo queda vinculado al celular: si un SMS no llega, el código de acceso se puede recibir ahí.
 */
export const SignupPage = () => {
    const { session, user } = useAuth();
    const leavingDemo = useLeaveDemo('/registro');
    const [f, setF] = useState({ name: '', phone: '', email: session?.user?.email && !String(session.user.email).endsWith('@c4i.local') ? session.user.email : '', cargo: 'presidencia_municipal', estado: 'Chiapas', municipio: '', campaign: '' });
    const [accept, setAccept] = useState(false);
    const [legend, setLegend] = useState(false);
    const [step, setStep] = useState<'form' | 'code'>('form');
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (leavingDemo) return null;
    if (session && user) return <Navigate to="/" replace />;
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
    const phone10 = f.phone.replace(/\D/g, '').slice(-10);
    const email = f.email.trim().toLowerCase();

    const createCampaign = async () => {
        const { data, error } = await supabase.rpc('fn_create_trial_campaign', {
            p_name: f.name, p_phone: phone10, p_cargo: f.cargo, p_estado: f.estado, p_municipio: f.municipio,
            p_campaign: f.campaign, p_accept: accept && legend, p_version: PLATFORM_TERMS_VERSION,
        });
        const estado = (data as any)?.estado;
        if (error || estado !== 'ok') {
            if (estado === 'ya_tiene_cuenta') { window.location.href = '/'; return; }
            setError(ERRORS[estado] || error?.message || 'No se pudo crear la campaña.');
            setBusy(false);
            return;
        }
        // Deja el celular registrado en la cuenta para entrar después con celular y contraseña
        await supabase.functions.invoke('account-email', { body: { action: 'link', email } }).catch(() => undefined);
        localStorage.removeItem('gamefi_agent_context');
        window.location.href = '/';
    };

    const sendCode = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setError('');
        if (phone10.length !== 10) { setError('El celular debe tener 10 números.'); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setError('Revisa el correo: parece incompleto.'); return; }
        setBusy(true);
        const { data: pre } = await supabase.rpc('fn_login_precheck', { p_phone: phone10 });
        if (pre && pre.length) { setError(ERRORS.telefono_registrado); setBusy(false); return; }
        // Si ya hay sesión con este correo (volvió a la página), se crea la campaña directo
        if (session?.user?.email?.toLowerCase() === email) { await createCampaign(); return; }
        const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        setBusy(false);
        if (error) { setError(/rate|seconds/i.test(error.message) ? 'Ya te mandamos un código hace poco. Espera un minuto.' : 'No se pudo enviar el código. Revisa el correo e intenta de nuevo.'); return; }
        setStep('code');
    };

    const confirmCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setBusy(true); setError('');
        const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
        if (error) { setError('El código no es correcto o ya venció. Pide otro.'); setBusy(false); return; }
        await createCampaign();
    };

    return (
        <div className="tl-landing tl-page">
            <header className="tl-nav"><a href="/" className="tl-brand">TLATOANI</a><a href="/login" className="tl-navlink">Iniciar sesión</a></header>
            <main className="tl-container tl-narrow">
                {step === 'form' ? (
                    <form onSubmit={sendCode} className="tl-form">
                        <h1 className="tl-h2">Crea tu campaña gratis</h1>
                        <p className="tl-lead">El Plan Arranque es para que un candidato sin estructura ponga a andar su equipo y pruebe el sistema, sin pago.</p>
                        <ul className="tl-checklist">{INCLUDED.map(i => <li key={i}><CheckCircle2 size={18} /> {i}</li>)}</ul>
                        <label>Tu nombre<input required minLength={3} value={f.name} onChange={set('name')} autoComplete="name" /></label>
                        <label>Celular (10 números)<input required inputMode="numeric" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value.replace(/[^\d]/g, '').slice(0, 10) })} placeholder="961 123 4567" autoComplete="tel-national" /></label>
                        <label>Correo<input required type="email" value={f.email} onChange={set('email')} placeholder="tucorreo@gmail.com" autoComplete="email" /></label>
                        <div className="tl-fineprint" style={{ marginTop: '-0.4rem' }}>Ahí te llega el código para crear tu cuenta, y te sirve de respaldo si algún mensaje no llega a tu celular.</div>
                        <label>Nombre de la campaña<input required minLength={3} value={f.campaign} onChange={set('campaign')} placeholder="Ej. Ana López para Tuxtla" /></label>
                        <div className="tl-form-row">
                            <label>Cargo<select value={f.cargo} onChange={set('cargo')}>{CARGOS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}</select></label>
                            <label>Estado<select value={f.estado} onChange={set('estado')}>{ESTADOS.map(s => <option key={s}>{s}</option>)}</select></label>
                        </div>
                        <label>Municipio o distrito<input value={f.municipio} onChange={set('municipio')} placeholder="Ej. Tuxtla Gutiérrez" /></label>
                        <label className="tl-check"><input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} /> <span>Acepto el <a href="/privacidad" target="_blank">aviso de privacidad</a> y los <a href="/terminos" target="_blank">términos de uso</a>.</span></label>
                        <label className="tl-check"><input type="checkbox" checked={legend} onChange={e => setLegend(e.target.checked)} /> <span>Entiendo que es una <strong>versión de demostración gratuita</strong> y que <strong>no constituye aportación a ninguna campaña electoral</strong>.</span></label>
                        <button className="tl-btn tl-btn-primary tl-btn-wide" disabled={busy || !accept || !legend}>
                            {busy ? <><Loader2 size={18} className="spin" /> Enviando…</> : 'Recibir mi código por correo'}
                        </button>
                        {error && <div className="tl-error">{error}</div>}
                        <p className="tl-fineprint">{FREE_LEGEND} Si después contratas, se emite un precio simbólico o el que se acuerde, para que puedas reportarlo a la autoridad electoral.</p>
                        <p className="tl-fineprint">¿Sólo quieres ver cómo funciona? <a href="/demo">Entra a la demo</a> · ¿Necesitas más? <a href="/cotizacion">Solicita una cotización</a></p>
                    </form>
                ) : (
                    <form onSubmit={confirmCode} className="tl-form">
                        <h1 className="tl-h2">Revisa tu correo</h1>
                        <p className="tl-lead">Te mandamos un código de 6 números a <strong>{email}</strong>. Si no lo ves, busca en la carpeta de spam o promociones.</p>
                        <input className="tl-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus
                            value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                        <button className="tl-btn tl-btn-primary tl-btn-wide" disabled={busy || code.length < 6}>
                            {busy ? <><Loader2 size={18} className="spin" /> Creando tu campaña…</> : 'Crear mi campaña'}
                        </button>
                        {error && <div className="tl-error">{error}</div>}
                        <button type="button" className="tl-linkbtn" onClick={() => sendCode()} disabled={busy}>Mandar otro código</button>
                        <button type="button" className="tl-linkbtn" onClick={() => { setStep('form'); setCode(''); setError(''); }}>Corregir el correo</button>
                    </form>
                )}
            </main>
        </div>
    );
};

export default SignupPage;
