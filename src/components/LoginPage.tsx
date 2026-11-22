import React, { useMemo, useState } from 'react';
import { readLastBrand } from '../lib/branding';
import { useAuth } from '../lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Loader2, MessageSquare, ShieldCheck, AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';
import { useLeaveDemo } from '../lib/demo';
import './login.css';

/** Secciones (hexágonos) que se encienden en ola desde el punto de la campaña: el avance sección por sección. */
type Hex = { x: number; y: number; cls: string; d: number };
const W = 400, H = 330, R = 17;
const ORIGIN = { x: 255, y: 150 };
const buildMap = (): Hex[] => {
    const out: Hex[] = [];
    const dx = R * 1.5, dy = R * Math.sqrt(3);
    for (let c = -1; c * dx < W + R; c++) {
        for (let r = -1; r * dy < H + R; r++) {
            const x = c * dx, y = r * dy + (c % 2 ? dy / 2 : 0);
            const dist = Math.hypot(x - ORIGIN.x, y - ORIGIN.y);
            const h = Math.abs(Math.sin(c * 12.9898 + r * 78.233) * 43758.5453) % 1; // pseudoaleatorio fijo
            let cls = '';
            if (dist < 70 || (dist < 150 && h < 0.55) || (dist < 230 && h < 0.18)) cls = h < 0.72 || dist < 40 ? 'won' : 'work';
            else if (h > 0.93) cls = 'work';
            if (cls && h > 0.86) cls += ' beat';
            out.push({ x, y, cls, d: Math.round(dist * 4.2) });
        }
    }
    return out;
};
const hexPath = (x: number, y: number) => {
    const p = [];
    for (let i = 0; i < 6; i++) { const a = (Math.PI / 3) * i; p.push(`${(x + (R - 1.5) * Math.cos(a)).toFixed(1)},${(y + (R - 1.5) * Math.sin(a)).toFixed(1)}`); }
    return `M${p.join('L')}Z`;
};
const fmtPhone = (d: string) => [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ');

export const LoginPage = () => {
    const { signInWithOtp, verifyOtp, verifyTwoFactor } = useAuth();
    const navigate = useNavigate();
    const leavingDemo = useLeaveDemo('/login');

    const [phone, setPhone] = useState(() => new URLSearchParams(window.location.search).get('tel')?.replace(/\D/g, '').slice(-10) || '');
    const [token, setToken] = useState('');
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [step, setStep] = useState<'PHONE' | 'OTP' | '2FA'>('PHONE');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // Reenviar el SMS (el servidor evita duplicados en 2 minutos)
    const [resent, setResent] = useState(false);
    const [showPass, setShowPass] = useState(false);
    const resendSms = async () => {
        setError(''); setResent(false); setLoading(true);
        const { error: rErr } = await signInWithOtp(phone);
        setLoading(false);
        if (rErr) setError(rErr.message); else setResent(true);
    };

    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error: otpError } = await signInWithOtp(phone);

        setLoading(false);
        if (otpError) {
            setError(otpError.message || 'Error al enviar código. Verifica tu número.');
        } else {
            setStep('OTP');
        }
    };

    const handleVerifyOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error: verifyError, requires2FA } = await verifyOtp(phone, token);

        if (verifyError) {
            setLoading(false);
            setError(verifyError.message || 'Código o contraseña inválida.');
        } else if (requires2FA) {
            setLoading(false);
            setStep('2FA');
        } else {
            navigate('/');
        }
    };

    const handleVerify2FA = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error: verify2Error } = await verifyTwoFactor(phone, twoFactorToken);

        if (verify2Error) {
            setLoading(false);
            setError(verify2Error.message || 'El código no es correcto. Revisa el mensaje e inténtalo de nuevo.');
        } else {
            navigate('/');
        }
    };


    const map = useMemo(buildMap, []);
    // Si en este teléfono ya entró alguien de una campaña, se muestra su identidad (no se consulta nada antes de entrar)
    const [lastBrand] = useState(() => readLastBrand());
    if (leavingDemo) return null;

    return (
        <div className="lg">
            <div className="lg-stage" aria-hidden="true">
                <svg className="lg-map" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
                    {map.map((h, i) => <path key={i} d={hexPath(h.x, h.y)} className={`hx ${h.cls}`} style={{ ['--d' as any]: `${h.d}ms` }} />)}
                    <circle cx={ORIGIN.x} cy={ORIGIN.y} r="6" className="pin-ring" />
                    <circle cx={ORIGIN.x} cy={ORIGIN.y} r="4.5" fill="#fff" />
                </svg>
                <div className="lg-shade" />
                <div className="lg-brand">
                    {lastBrand ? (
                        <div className="lg-campaign">
                            {lastBrand.photo && <img src={lastBrand.photo} alt="" />}
                            <div>
                                <h1 style={{ fontSize: 'clamp(1.6rem, 7vw, 2.4rem)' }}>{lastBrand.shortName ? `Equipo ${lastBrand.shortName}` : 'TLATOANI'}</h1>
                                <p>{lastBrand.slogan || 'Tu campaña, sección por sección.'}</p>
                            </div>
                        </div>
                    ) : (<>
                    <h1>TLATOANI</h1>
                    <p>Tu campaña, sección por sección.</p>
                    </>)}
                    <div className="lg-legend">
                        <span><i style={{ background: 'var(--lg-won)' }} />Secciones con avance</span>
                        <span><i style={{ background: 'var(--lg-work)' }} />En recorrido</span>
                    </div>
                </div>
            </div>

            <div className="lg-sheet">
                {error && (
                    <div className="lg-error" role="alert"><AlertCircle size={18} style={{ flex: 'none', marginTop: 1 }} /><span>{error}</span></div>
                )}

                {step === 'PHONE' && (
                    <form key="phone" onSubmit={handleSendOtp} className="lg-step">
                        <h2>Entra con tu celular</h2>
                        <p className="lg-sub">Escribe el número con el que te registró tu equipo.</p>
                        <label className="lg-field">
                            <span className="pre">🇲🇽 +52</span>
                            <input
                                type="tel"
                                inputMode="numeric"
                                placeholder="961 123 4567"
                                aria-label="Celular a 10 dígitos"
                                value={fmtPhone(phone)}
                                onChange={(e) => { const d = e.target.value.replace(/\D/g, ''); setPhone(d.length > 10 ? d.slice(-10) : d); }}
                                autoComplete="tel-national"
                                autoFocus
                                required
                            />
                        </label>
                        <button type="submit" className="lg-btn" disabled={loading || phone.length < 10}>
                            {loading ? <Loader2 className="spin" size={20} /> : 'Continuar'}
                        </button>
                        <div className="lg-foot">
                            <a className="lg-link" href="/demo">Probar la demo</a>
                            <a className="lg-link hot" href="/registro">Crear cuenta gratis</a>
                        </div>
                    </form>
                )}

                {step === 'OTP' && (
                    <form key="otp" onSubmit={handleVerifyOtp} className="lg-step">
                        <div className="lg-chip">+52 {fmtPhone(phone)} <button type="button" onClick={() => { setStep('PHONE'); setResent(false); setToken(''); setError(''); }}>Cambiar</button></div>
                        <h2>Escribe tu código o contraseña</h2>
                        <p className="lg-sub">Si es tu primera vez, usa el <strong>código que te llegó por SMS</strong>. Si ya creaste tu contraseña, escríbela.</p>
                        <label className="lg-field">
                            <span className="pre"><Lock size={18} /></span>
                            <input
                                type={showPass ? 'text' : 'password'}
                                placeholder="Código o contraseña"
                                aria-label="Código o contraseña"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                autoComplete="current-password"
                                autoFocus
                                required
                            />
                            <button type="button" className="eye" onClick={() => setShowPass(v => !v)} aria-label={showPass ? 'Ocultar' : 'Mostrar'}>
                                {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </label>
                        <button type="submit" className="lg-btn alt" disabled={loading || token.length < 4}>
                            {loading ? <Loader2 className="spin" size={20} /> : 'Entrar'}
                        </button>
                        <button type="button" className="lg-ghost" disabled={loading} onClick={resendSms}>
                            <MessageSquare size={18} /> No me llegó: enviar otro SMS
                        </button>
                        {resent
                            ? <p className="lg-note lg-ok">Listo, te lo enviamos de nuevo. Puede tardar unos minutos.</p>
                            : <p className="lg-note">Si sigue sin llegar, pide tu código a quien te registró: lo ve en su app.</p>}
                    </form>
                )}

                {step === '2FA' && (
                    <form key="2fa" onSubmit={handleVerify2FA} className="lg-step">
                        <h2>Un paso más para cuidar tu cuenta</h2>
                        <p className="lg-sub">Te mandamos un <strong>código de 6 números</strong> por SMS al +52 {fmtPhone(phone)}.</p>
                        <label className="lg-field code">
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="000000"
                                aria-label="Código de 6 números"
                                value={twoFactorToken}
                                onChange={(e) => setTwoFactorToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                autoComplete="one-time-code"
                                autoFocus
                                required
                            />
                        </label>
                        <button type="submit" className="lg-btn" disabled={loading || twoFactorToken.length < 6}>
                            {loading ? <Loader2 className="spin" size={20} /> : 'Confirmar'}
                        </button>
                        <button type="button" className="lg-ghost" onClick={() => setStep('OTP')}>Regresar</button>
                    </form>
                )}

                <div className="lg-secure"><ShieldCheck size={14} /> Conexión cifrada. Tus datos solo los ve tu campaña.</div>
            </div>
        </div>
    );
};
