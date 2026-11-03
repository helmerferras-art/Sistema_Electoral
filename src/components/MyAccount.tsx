import { useState } from 'react';
import { X, Trash2, ExternalLink } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * "Mi cuenta": datos básicos y eliminación de la cuenta desde la app
 * (requisito de Google Play y App Store). Disponible para todos los perfiles.
 */
export const MyAccount = ({ onClose }: { onClose: () => void }) => {
    const { user, signOut } = useAuth();
    const [step, setStep] = useState<'info' | 'confirm'>('info');
    const [phrase, setPhrase] = useState('');
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const protectedRole = ['candidato', 'superadmin'].includes(user?.role || '');

    const deleteAccount = async () => {
        if (!user) return;
        setBusy(true); setMsg('');
        // 1) Fotos y audios de evidencia que subió la persona
        const { data: ev } = await supabase.from('activity_evidence').select('storage_path').eq('user_id', user.id);
        const paths = (ev || []).map((e: any) => e.storage_path).filter(Boolean);
        for (let i = 0; i < paths.length; i += 100) {
            const { error } = await supabase.storage.from('activity_evidence').remove(paths.slice(i, i + 100));
            if (error) { setMsg(`❌ No se pudieron borrar tus archivos: ${error.message}`); setBusy(false); return; }
        }
        // 2) Cuenta y datos
        const { error } = await supabase.rpc('fn_delete_my_account', { p_confirm: phrase.trim().toUpperCase() });
        if (error) { setMsg(`❌ ${error.message}`); setBusy(false); return; }
        try { localStorage.removeItem('gamefi_agent_context'); } catch { /* sin almacenamiento local */ }
        await signOut();
    };

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="tactile-card flex-col gap-2" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, width: '100%', height: 'auto', fontSize: '0.9rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>Mi cuenta</strong>
                    <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
                </div>
                <div style={{ color: '#bbb' }}>
                    <div><b style={{ color: 'white' }}>{user?.name}</b></div>
                    <div>{user?.phone} · {user?.role?.replace('_', ' ')}</div>
                </div>
                <a href="/eliminar-cuenta" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tertiary)', fontSize: '0.8rem', display: 'inline-flex', gap: '0.3rem', alignItems: 'center' }}>
                    Qué datos se borran y cómo se protegen <ExternalLink size={12} />
                </a>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.8rem', marginTop: '0.4rem' }}>
                    {protectedRole ? (
                        <div style={{ color: '#bbb', fontSize: '0.8rem' }}>
                            La cuenta del candidato o del administrador no se elimina desde la app, para no dejar la campaña sin responsable. Pide la baja a soporte desde <b>nemia.lat/eliminar-cuenta</b>.
                        </div>
                    ) : step === 'info' ? (
                        <button className="squishy-btn" style={{ width: '100%', borderColor: 'var(--primary)', color: 'var(--primary)' }} onClick={() => setStep('confirm')}>
                            <Trash2 size={14} /> Eliminar mi cuenta
                        </button>
                    ) : (
                        <div className="flex-col gap-2">
                            <div style={{ fontSize: '0.82rem', color: '#ddd' }}>
                                Se borrarán para siempre tu acceso, tu bitácora de campo con sus fotos y audios, tus metas y tus avisos.
                                Las personas que registraste se quedan en la campaña, sin tu nombre. Tu equipo pasa con tu jefe inmediato. <b>No se puede deshacer.</b>
                            </div>
                            <label htmlFor="confirm-delete" style={{ fontSize: '0.8rem' }}>Para confirmar escribe <b>ELIMINAR</b></label>
                            <input id="confirm-delete" className="squishy-input" value={phrase} onChange={e => setPhrase(e.target.value)} autoComplete="off" />
                            {msg && <div style={{ fontSize: '0.82rem' }}>{msg}</div>}
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="squishy-btn" style={{ flex: 1 }} onClick={() => { setStep('info'); setPhrase(''); setMsg(''); }} disabled={busy}>Cancelar</button>
                                <button className="squishy-btn" style={{ flex: 1, background: 'var(--primary)', color: 'white' }}
                                    disabled={busy || phrase.trim().toUpperCase() !== 'ELIMINAR'} onClick={deleteAccount}>
                                    {busy ? 'Eliminando...' : 'Eliminar cuenta'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MyAccount;
