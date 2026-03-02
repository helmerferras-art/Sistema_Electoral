import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Shield, Fingerprint, Lock, Loader2 } from 'lucide-react';

export const LoginPage = () => {
    const { signInWithOtp, verifyOtp, verifyTwoFactor } = useAuth();
    const navigate = useNavigate();

    const [phone, setPhone] = useState('');
    const [token, setToken] = useState('');
    const [twoFactorToken, setTwoFactorToken] = useState('');
    const [step, setStep] = useState<'PHONE' | 'OTP' | '2FA'>('PHONE');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');


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
            setError(verify2Error.message || 'Código 2FA táctico incorrecto.');
        } else {
            navigate('/');
        }
    };


    return (
        <div className="flex-center flex-col" style={{ minHeight: '100vh', background: 'var(--bg-color)', padding: '1rem', width: '100%' }}>
            <div className="tactile-card flex-col gap-2" style={{ maxWidth: '400px', width: '100%', border: '1px solid var(--primary)', background: 'radial-gradient(circle at top, rgba(255, 90, 54, 0.1) 0%, rgba(15, 18, 24, 0.95) 100%)' }}>

                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    <div style={{ display: 'inline-flex', padding: '1rem', borderRadius: '50%', backgroundColor: 'rgba(0,0,0,0.5)', border: '2px solid var(--primary)', boxShadow: '0 0 20px rgba(255,90,54,0.3)', marginBottom: '1rem' }}>
                        <Shield size={48} color="var(--primary)" />
                    </div>
                    <h1 style={{ fontFamily: 'Oswald, sans-serif', color: 'var(--text-color)', margin: 0, letterSpacing: '0.1em' }}>SISTEMA LEGION</h1>
                    <p style={{ color: 'var(--tertiary)', fontFamily: 'Inter, sans-serif', marginTop: '0.5rem', letterSpacing: '0.2em', fontSize: '0.8rem' }}>
                        ACCESO RESTRINGIDO
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
                                <span>Ingresa tu número celular </span>
                                <strong style={{ color: 'var(--primary)' }}>PREVIAMENTE REGISTRADO</strong>
                                <span> para recibir tu código táctico de acceso.</span>
                            </p>

                            <div style={{ position: 'relative' }}>
                                <Fingerprint size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} />
                                <input
                                    type="tel"
                                    className="squishy-input"
                                    placeholder="[ TU NÚMERO CELULAR ]"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    style={{ paddingLeft: '3rem', textAlign: 'left', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em' }}
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
                                        <span>INGRESAR AL SISTEMA</span>
                                    </>
                                )}
                            </button>
                        </form>
                    ) : step === 'OTP' ? (
                        <form onSubmit={handleVerifyOtp} className="flex-col gap-2">
                            <p style={{ color: '#94A3B8', fontSize: '0.9rem', textAlign: 'center' }}>
                                <span>Ingresa tu </span>
                                <strong>Código Táctico</strong>
                                <span> (si es tu primer acceso) o tu </span>
                                <strong>Contraseña Permanente</strong>.
                            </p>

                            <div style={{ position: 'relative' }}>
                                <Lock size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--tertiary)' }} />
                                <input
                                    type="password"
                                    className="squishy-input"
                                    placeholder="[ CÓDIGO O CONTRASEÑA ]"
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
                                    <span>DESBLOQUEAR ACCESO</span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setStep('PHONE')}
                                style={{ background: 'transparent', border: 'none', color: '#64748B', textDecoration: 'underline', marginTop: '1rem', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.9rem' }}
                            >
                                <span>Usar otro número</span>
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleVerify2FA} className="flex-col gap-2">
                            <div style={{ textAlign: 'center', padding: '0.5rem', border: '1px dashed var(--primary)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                                <Shield size={24} color="var(--primary)" style={{ marginBottom: '0.5rem' }} />
                                <p style={{ color: 'var(--primary)', fontSize: '0.9rem', fontWeight: 'bold', margin: 0 }}>DESAFÍO 2FA ACTIVADO</p>
                            </div>
                            <p style={{ color: '#94A3B8', fontSize: '0.9rem', textAlign: 'center' }}>
                                <span>Se ha enviado un </span>
                                <strong style={{ color: 'var(--tertiary)' }}>Código de Verificación Táctico</strong>
                                <span> a tu dispositivo vía WhatsApp/SMS. </span>
                                <strong>Ingrésalo para continuar.</strong>
                            </p>

                            <div style={{ position: 'relative' }}>
                                <Fingerprint size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} />
                                <input
                                    type="text"
                                    className="squishy-input"
                                    placeholder="[ CÓDIGO 2FA ]"
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
                                    <span>CONFIRMAR IDENTIDAD</span>
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

            </div>

            <div style={{ position: 'fixed', bottom: '1rem', color: '#475569', fontSize: '0.8rem', fontFamily: 'Oswald, sans-serif', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '8px', height: '8px', backgroundColor: 'var(--tertiary)', borderRadius: '50%', animation: 'pulse 2s infinite' }}></span>
                CONEXIÓN SEGURA P2P
            </div>
        </div>
    );
};
