import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { Shield, Lock, CheckCircle, Loader2 } from 'lucide-react';

export const PasswordSetModal = () => {
    const { user, updatePassword } = useAuth();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [finished, setFinished] = useState(false);

    // Solo mostrar si el usuario es nuevo y está logueado
    if (!user || !user.is_first_login) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        if (password !== confirm) {
            setError('Las contraseñas no coinciden.');
            return;
        }

        setLoading(true);
        const { error: updateError } = await updatePassword(password);
        setLoading(false);

        if (updateError) {
            setError(updateError.message || 'Error al guardar contraseña.');
        } else {
            setFinished(true);
        }
    };

    if (finished) {
        return (
            <div className="modal-overlay" style={{ display: 'flex', zIndex: 9999, position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
                <div className="tactile-card flex-col gap-2" style={{ maxWidth: '400px', textAlign: 'center', animation: 'scaleUp 0.3s ease-out' }}>
                    <CheckCircle size={48} color="var(--tertiary)" style={{ margin: '0 auto' }} />
                    <h2 style={{ fontFamily: 'Oswald', color: 'white' }}>ACCESO GARANTIZADO</h2>
                    <p style={{ color: '#94A3B8' }}>Tu contraseña permanente ha sido establecida con éxito. Bienvenido al ecosistema C4I.</p>
                    <button onClick={() => window.location.reload()} className="squishy-btn primary">INGRESAR AL COMANDO</button>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" style={{ display: 'flex', zIndex: 9999, backdropFilter: 'blur(10px)', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', justifyContent: 'center', alignItems: 'center' }}>
            <div className="tactile-card flex-col gap-2" style={{ maxWidth: '400px', width: '90%', border: '2px solid var(--primary)', background: 'rgba(15, 18, 24, 0.98)' }}>
                <div style={{ textAlign: 'center' }}>
                    <Lock size={40} color="var(--primary)" style={{ margin: '0 auto' }} />
                    <h2 style={{ fontFamily: 'Oswald', color: 'white', marginTop: '1rem' }}>SEGURIDAD TÁCTICA</h2>
                    <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>Has ingresado con un código temporal. Para proteger tu cuenta, debes establecer una contraseña permanente ahora.</p>
                </div>

                {error && <div style={{ color: '#ff8a80', backgroundColor: 'rgba(255,0,0,0.1)', padding: '0.5rem', borderRadius: '4px', fontSize: '0.8rem', textAlign: 'center' }}>{error}</div>}

                <form onSubmit={handleSave} className="flex-col gap-2">
                    <div style={{ position: 'relative' }}>
                        <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--primary)' }} />
                        <input
                            type="password"
                            className="squishy-input"
                            placeholder="NUEVA CONTRASEÑA"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ paddingLeft: '3rem' }}
                            required
                        />
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Shield size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--tertiary)' }} />
                        <input
                            type="password"
                            className="squishy-input"
                            placeholder="CONFIRMAR CONTRASEÑA"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            style={{ paddingLeft: '3rem' }}
                            required
                        />
                    </div>

                    <button type="submit" className="squishy-btn primary" disabled={loading} style={{ marginTop: '1rem' }}>
                        {loading ? <Loader2 className="spin" /> : 'ESTABLECER CREDENCIALES'}
                    </button>
                </form>
            </div>
        </div>
    );
};
