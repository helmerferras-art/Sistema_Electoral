import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Shield, Fingerprint, Lock, Loader2, Mail } from 'lucide-react';
import { useLeaveDemo } from '../lib/demo';

export const LoginPage = () => {
    const { signInWithOtp, verifyOtp, verifyTwoFactor, sendEmailCode, verifyEmailCode } = useAuth();
    const navigate = useNavigate();
    const leavingDemo = useLeaveDemo('/login');

    const [phone, setPhone] = useState('');
    const [token, setToken] = useState('');
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [step, setStep] = useState<'PHONE' | 'OTP' | '2FA'>('PHONE');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    // Respaldo por correo: solo si la cuenta ya tiene un correo vinculado
    const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'none' | 'wait'>('idle');
    const [mailHint, setMailHint] = useState('');
    const [mailCode, setMailCode] = useState('');

    const askEmailCode = async () => {
        setError(''); setMailState('sending');
        const r = await sendEmailCode(phone);
        if (r.sent) { setMailHint(r.hint || ''); setMailState('sent'); }
        else setMailState(r.reason === 'espera' ? 'wait' : 'none');
    };

    const handleEmailCode = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setLoading(true);
        const { error: mErr } = await verifyEmailCode(phone, mailCode);
        setLoading(false);
        if (mErr) setError(mErr.message); else navigate('/');
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


    if (leavingDemo) return null;
    return (
        <div className="flex-center flex-col" style={{ minHeight: '100vh', background: 'var(--bg-color)', padding: '1rem', width: '100%' }}>
            <div className="tactile-card flex-col gap-2" style={{ maxWidth: '400px', width: '100%', border: '1px solid var(--primary)', background: 'radial-gradient(circle at top, rgba(255, 90, 54, 0.1) 0%, rgba(15, 18, 24, 0.95) 100%)' }}>

                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.5)', border: '2px solid var(--primary)', boxShadow: '0 0 20px rgba(255,90,54,0.3)', marginBottom: '1rem' }}>
                        <Shield size={48} color="var(--primary)" />
                    </div>
                    <h1 style={{ fontFamily: 'Oswald, sans-serif', color: 'var(--text-color)', margin: 0, letterSpacing: '0.1em' }}>TLATOANI</h1>
                    <p style={{ color: 'var(--tertiary)', fontFamily: 'Inter, sans-serif', marginTop: '0.5rem', letterSpacing: '0.2em', fontSize: '0.8rem' }}>
                        Entra con tu número de celular
                    </p>
                </div>

                {error && (
                    <div style={{ padding: '0.8rem', backgroundColor: 'rgba(255, 0, 0, 0.2)', border: '1px solid red', borderRadius: '4px', color: '#ff8a80', fontSize: '0.9rem', textAlign: 'center' }}>
                        {error}
                    </div>
                )}

                <div key={step === 'PHONE' ? 'phone-step' : 'otp-step'} className="flex-col gap-2">
                    {step === 'PHONE' ? (
                        <form onSubmit={handleSendOtp} className="flex-col gap-2">
                            <p style={{ color: '#94A3B8', fontSize: '0.9rem', textAlign: 'center' }}>
                                <span>Escribe el celular con el que te registró tu equipo.</span>
                            </p>

                            <div style={{ position: 'relative' }}>
                                <Fingerprint size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} />
                                <input
                                    type="tel"
                                    className="squishy-input"
                                    placeholder="Ej. 961 123 4567"
                                    inputMode="numeric"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(-10))}
                                    style={{ paddingLeft: '3rem', textAlign: 'left', fontSize: '1.2rem', letterSpacing: '0.05em' }}
                                    required
                                    autoComplete="tel"
                                />
                            </div>

                            <button
                                type="submit"
                                className="squishy-btn primary"
                                disabled={loading || phone.length < 10}
                                style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', boxShadow: '0 0 15px rgba(255,90,54,0.3)' }}
                            >
                                {loading ? (
                                    <Loader2 className="spin" size={20} />
                                ) : (
                                    <>
                                        <Shield size={20} />
                                        <span>Continuar</span>
                                    </>
                                )}
                            </button>
                        </form>
                    ) : step === 'OTP' ? (
                        <form onSubmit={handleVerifyOtp} className="flex-col gap-2">
                            <p style={{ color: '#94A3B8', fontSize: '0.9rem', textAlign: 'center' }}>
                                <span>Si es tu primera vez, escribe el </span>
                                <strong>código que te mandaron por mensaje</strong>
                                <span>. Si ya tienes contraseña, escríbela.</span>
                            </p>

                            <div style={{ position: 'relative' }}>
                                <Lock size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--tertiary)' }} />
                                <input
                                    type="password"
                                    className="squishy-input"
                                    placeholder="Código o contraseña"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value)}
                                    style={{ paddingLeft: '3rem', textAlign: 'center', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.2em', fontSize: '1.2rem' }}
                                    required
                                    autoComplete="current-password"
                                />
                            </div>

                            <button
                                type="submit"
                                className="squishy-btn"
                                disabled={loading || token.length < 4}
                                style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', backgroundColor: 'var(--tertiary)', color: 'black', border: '1px solid var(--tertiary)', boxShadow: '0 0 15px rgba(0,212,255,0.4)' }}
                            >
                                {loading ? (
                                    <Loader2 className="spin" size={20} />
                                ) : (
                                    <span>Entrar</span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => { setStep('PHONE'); setMailState('idle'); setMailCode(''); }}
                                style={{ background: 'transparent', border: 'none', color: '#64748B', textDecoration: 'underline', marginTop: '1rem', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.9rem' }}
                            >
                                <span>Usar otro número</span>
                            </button>
                        </form>
                    ) : null}
                    {step === 'OTP' && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.9rem', marginTop: '0.4rem' }}>
                            {mailState === 'idle' || mailState === 'sending' ? (
                                <button type="button" className="squishy-btn" style={{ width: '100%', padding: '0.8rem' }} disabled={mailState === 'sending'} onClick={askEmailCode}>
                                    <Mail size={18} /> {mailState === 'sending' ? 'Enviando…' : '¿No te llegó el código? Recíbelo por correo'}
                                </button>
                            ) : mailState === 'sent' ? (
                                <form onSubmit={handleEmailCode} className="flex-col gap-2">
                                    <p style={{ color: '#CBD5E1', fontSize: '0.92rem', textAlign: 'center', margin: 0 }}>
                                        Te mandamos un código de 6 números a <strong>{mailHint}</strong>. Revisa también la carpeta de spam.
                                    </p>
                                    <input className="squishy-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
                                        value={mailCode} onChange={e => setMailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        style={{ textAlign: 'center', letterSpacing: '0.3em', fontSize: '1.4rem' }} />
                                    <button type="submit" className="squishy-btn primary" disabled={loading || mailCode.length < 6}>
                                        {loading ? <Loader2 className="spin" size={20} /> : 'Entrar con el código del correo'}
                                    </button>
                                    <button type="button" onClick={askEmailCode} style={{ background: 'none', border: 'none', color: '#64748B', textDecoration: 'underline', cursor: 'pointer' }}>Mandar otro código</button>
                                </form>
                            ) : mailState === 'wait' ? (
                                <p style={{ color: '#CBD5E1', fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>Ya te mandamos un código hace poco. Espera un minuto y vuelve a intentarlo.</p>
                            ) : (
                                <p style={{ color: '#CBD5E1', fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>
                                    Tu cuenta todavía no tiene correo de respaldo. Pide tu código a la persona que te registró (lo ve en su app).
                                    Cuando entres, agrega tu correo en <strong>Mi cuenta</strong> para la próxima vez.
                                </p>
                            )}
                        </div>
                    )}
                    {step === '2FA' && (
                        <form onSubmit={handleVerify2FA} className="flex-col gap-2">
                            <div style={{ textAlign: 'center', padding: '0.5rem', border: '1px dashed var(--primary)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                                <Shield size={24} color="var(--primary)" style={{ marginBottom: '0.5rem' }} />
                                <p style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 'bold', margin: 0 }}>Un paso más para cuidar tu cuenta</p>
                            </div>
                            <p style={{ color: '#94A3B8', fontSize: '0.9rem', textAlign: 'center' }}>
                                <span>Te mandamos un </span>
                                <strong style={{ color: 'var(--tertiary)' }}>código de 6 números</strong>
                                <span> por mensaje. Escríbelo aquí.</span>
                            </p>

                            <div style={{ position: 'relative' }}>
                                <Fingerprint size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} />
                                <input
                                    type="text"
                                    className="squishy-input"
                                    placeholder="000000"
                                    inputMode="numeric"
                                    value={twoFactorToken}
                                    onChange={(e) => setTwoFactorToken(e.target.value)}
                                    style={{ paddingLeft: '3rem', textAlign: 'center', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.3em', fontSize: '1.5rem', color: 'var(--primary)' }}
                                    required
                                    maxLength={6}
                                />
                            </div>

                            <button
                                type="submit"
                                className="squishy-btn primary"
                                disabled={loading || twoFactorToken.length < 6}
                                style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem', boxShadow: '0 0 20px rgba(255,90,54,0.4)' }}
                            >
                                {loading ? (
                                    <Loader2 className="spin" size={20} />
                                ) : (
                                    <span>Confirmar</span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setStep('OTP')}
                                style={{ background: 'transparent', border: 'none', color: '#64748B', textDecoration: 'underline', marginTop: '1rem', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.9rem' }}
                            >
                                <span>Regresar a contraseña</span>
                            </button>
                        </form>
                    )}

                </div>

                {step === 'PHONE' && (
                    <div className="tl-landing" style={{ background: 'transparent', minHeight: 0, color: 'inherit', marginTop: '0.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.85rem' }}>
                            <a href="/demo" style={{ color: 'var(--tertiary)' }}>Probar la demo</a>
                            <a href="/registro" style={{ color: 'var(--primary)' }}>Crear cuenta gratis</a>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ position: 'fixed', bottom: '1rem', color: '#475569', fontSize: '0.8rem', fontFamily: 'Oswald, sans-serif', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--tertiary)', borderRadius: '50%', animation: 'pulse 2s infinite' }}></span>
                Conexión segura
            </div>
        </div>
    );
};
