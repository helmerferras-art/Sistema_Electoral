import React, { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { Lock, Shield, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export const SecuritySettings = () => {
    const { user, updatePassword } = useAuth();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [is2FAEnabled, setIs2FAEnabled] = useState(user?.two_factor_enabled || false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
            return;
        }

        setLoading(true);
        const { error } = await updatePassword(newPassword);
        setLoading(false);

        if (error) {
            setMessage({ type: 'error', text: `Error: ${error.message}` });
        } else {
            setMessage({ type: 'success', text: 'Contraseña actualizada correctamente.' });
            setNewPassword('');
            setConfirmPassword('');
        }
    };

    const toggle2FA = async () => {
        if (!user) return;
        setLoading(true);
        const newState = !is2FAEnabled;
        const { error } = await supabase
            .from('users')
            .update({ two_factor_enabled: newState })
            .eq('id', user.id);


        setLoading(false);
        if (error) {
            setMessage({ type: 'error', text: `Error al cambiar 2FA: ${error.message}` });
        } else {
            setIs2FAEnabled(newState);
            setMessage({ type: 'success', text: `2FA ${newState ? 'activado' : 'desactivado'} correctamente.` });
        }
    };

    return (
        <div className="flex-col gap-4" style={{ padding: '1rem', color: 'white', maxWidth: '500px' }}>
            <h2 className="tactical-font" style={{ color: 'var(--tertiary)', borderBottom: '1px solid var(--tertiary)', paddingBottom: '0.5rem' }}>
                SEGURIDAD DEL PERFIL
            </h2>

            {message && (
                <div style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    backgroundColor: message.type === 'success' ? 'rgba(0, 255, 0, 0.1)' : 'rgba(255, 0, 0, 0.1)',
                    border: `1px solid ${message.type === 'success' ? '#00ff00' : '#ff0000'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.9rem'
                }}>
                    {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    {message.text}
                </div>
            )}

            {/* Change Password */}
            <div className="tactile-card" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <h3 className="tactical-font" style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Lock size={18} color="var(--tertiary)" /> CAMBIAR CONTRASEÑA
                </h3>
                <form onSubmit={handleUpdatePassword} className="flex-col gap-3">
                    <div className="flex-col gap-1">
                        <label style={{ fontSize: '0.7rem', color: '#888' }}>NUEVA CONTRASEÑA</label>
                        <input
                            type="password"
                            className="squishy-input"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div className="flex-col gap-1">
                        <label style={{ fontSize: '0.7rem', color: '#888' }}>CONFIRMAR CONTRASEÑA</label>
                        <input
                            type="password"
                            className="squishy-input"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button type="submit" className="squishy-btn" disabled={loading} style={{ background: 'var(--tertiary)', color: 'black' }}>
                        {loading ? <Loader2 className="spin" size={18} /> : 'ACTUALIZAR CREDENCIALES'}
                    </button>
                </form>
            </div>

            {/* 2FA Toggle */}
            <div className="tactile-card" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <h3 className="tactical-font" style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={18} color="var(--primary)" /> AUTENTICACIÓN TÁCTICA (2FA)
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#888', marginBottom: '1rem' }}>
                    Al activar el 2FA, cada vez que inicies sesión se enviará un código de seguridad a tu teléfono vía WhatsApp/SMS (usando el puente C4I). Esto blinda tu cuenta ante hackers.
                </p>

                <div className="flex-row-resp" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div>
                        <p style={{ margin: 0, fontWeight: 'bold', color: is2FAEnabled ? 'lime' : '#666' }}>
                            ESTADO: {is2FAEnabled ? 'PROTEGIDO' : 'VULNERABLE'}
                        </p>
                    </div>
                    <button
                        onClick={toggle2FA}
                        className={`squishy-btn ${is2FAEnabled ? 'danger' : 'primary'}`}
                        disabled={loading}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                    >
                        {is2FAEnabled ? 'DESACTIVAR 2FA' : 'ACTIVAR 2FA'}
                    </button>
                </div>
            </div>
        </div>
    );
};
