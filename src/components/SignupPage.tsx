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
    telefono_registrado: 'Ese celular ya tiene cuenta. Entra con tu número desde "Iniciar sesión".',
    ya_tiene_prueba: 'Ese celular ya tiene una campaña en Plan Arranque.',
    demasiadas: 'Se crearon varias campañas desde esta conexión hoy. Intenta mañana o escríbenos.',
    error: 'No se pudo crear la campaña. Intenta de nuevo en unos minutos.',
};

/**
 * /registro · Crear campaña gratis (Plan Arranque) solo con el celular.
 * El servidor crea la cuenta y manda por SMS un código de un solo uso; la persona entra en
 * "Iniciar sesión" con su celular y ese código, y ahí crea su contraseña.
 */
export const SignupPage = () => {
    const { session, user } = useAuth();
    const leavingDemo = useLeaveDemo('/registro');
    const [f, setF] = useState({ name: '', phone: '', cargo: 'presidencia_municipal', estado: 'Chiapas', municipio: '', campaign: '' });
    const [accept, setAccept] = useState(false);
    const [legend, setLegend] = useState(false);
    const [done, setDone] = useState<null | { sms: boolean }>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (leavingDemo) return null;
    if (session && user) return <Navigate to="/" replace />;
    const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
    const phone10 = f.phone.replace(/\D/g, '').slice(-10);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (phone10.length !== 10) { setError(ERRORS.falta_telefono); return; }
        setBusy(true);
        const { data, error } = await supabase.functions.invoke('trial-signup', {
            body: { ...f, phone: phone10, accept: accept && legend, version: PLATFORM_TERMS_VERSION },
        });
        let estado = (data as any)?.estado;
        if (!estado && error) { try { estado = (await (error as any).context?.json?.())?.estado; } catch { /* sin cuerpo */ } }
        setBusy(false);
        if (estado !== 'ok') { setError(ERRORS[estado] || ERRORS.error); return; }
        setDone({ sms: !!(data as any)?.sms });
    };

    return (
        <div className="tl-landing tl-page">
            <header className="tl-nav"><a href="/" className="tl-brand">TLATOANI</a><a href="/login" className="tl-navlink">Iniciar sesión</a></header>
            <main className="tl-container tl-narrow">
                {done ? (
                    <div className="tl-done">
                        <CheckCircle2 size={48} color="#E8743B" />
                        <h1 className="tl-h2">¡Tu campaña está lista!</h1>
                        <p className="tl-lead">
                            {done.sms
                                ? <>Te mandamos un <strong>SMS con tu código</strong> al {phone10}. Puede tardar unos minutos.</>
                                : <>Tu código de acceso se enviará por SMS al {phone10} en cuanto el servicio de mensajes esté disponible.</>}
                            {' '}Entra con tu celular y ese código; ahí crearás tu contraseña.
                        </p>
                        <a className="tl-btn tl-btn-primary tl-btn-wide" href={`/login?tel=${phone10}`}>Iniciar sesión</a>
                    </div>
                ) : (
                    <form onSubmit={submit} className="tl-form">
                        <h1 className="tl-h2">Crea tu campaña gratis</h1>
                        <p className="tl-lead">El Plan Arranque es para que un candidato sin estructura ponga a andar su equipo y pruebe el sistema, sin pago.</p>
                        <ul className="tl-checklist">{INCLUDED.map(i => <li key={i}><CheckCircle2 size={18} /> {i}</li>)}</ul>
                        <label>Tu nombre<input required minLength={3} value={f.name} onChange={set('name')} autoComplete="name" /></label>
                        <label>Celular (10 números)<input required inputMode="numeric" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value.replace(/[^\d]/g, '').slice(0, 10) })} placeholder="961 123 4567" autoComplete="tel-national" /></label>
                        <div className="tl-fineprint" style={{ marginTop: '-0.4rem' }}>Ahí te llega por SMS el código para entrar.</div>
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
                        <p className="tl-fineprint">{FREE_LEGEND} Si después contratas, se emite un precio simbólico o el que se acuerde, para que puedas reportarlo a la autoridad electoral.</p>
                        <p className="tl-fineprint">¿Sólo quieres ver cómo funciona? <a href="/demo">Entra a la demo</a> · ¿Necesitas más? <a href="/cotizacion">Solicita una cotización</a></p>
                    </form>
                )}
            </main>
        </div>
    );
};

export default SignupPage;
