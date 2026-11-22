import { useState } from 'react';
import { MapPin, Star, WifiOff } from 'lucide-react';
import { PLATFORM_TERMS_VERSION } from '../lib/engagement';
import { PUBLIC_URL } from '../lib/verification';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

interface Props {
    onComplete: () => void;
}

/**
 * Primera vez en la app: una pantalla de bienvenida con lo esencial y la aceptación del aviso de privacidad.
 * Antes eran 4 pantallas (carga simulada, "nombre de agente", reglas con XP y aviso); ahora son 2 y sin escribir nada de más.
 */
export const OnboardingFlow = ({ onComplete }: Props) => {
    const { user } = useAuth();
    const [step, setStep] = useState(1);
    const [name, setName] = useState(user?.name || '');
    const [acceptPrivacy, setAcceptPrivacy] = useState(false);
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const first = (user?.name || '').split(' ')[0];

    if (step === 1) {
        const tips = [
            { icon: <MapPin size={26} />, title: 'Registra a quien te apoya', text: 'Solo nombre y celular. La app toma la ubicación sola.' },
            { icon: <WifiOff size={26} />, title: 'Funciona sin señal', text: 'Lo que guardes sin internet se envía solo cuando vuelva la señal.' },
            { icon: <Star size={26} />, title: 'Gana puntos', text: 'Cuando la persona confirma tu visita, sumas puntos y recompensas.' },
        ];
        return (
            <div className="flex-center flex-col" style={{ minHeight: '100vh', padding: '1.25rem', backgroundColor: 'var(--bg-color)' }}>
                <div style={{ width: '100%', maxWidth: 420 }}>
                    <h1 style={{ color: '#fff', textTransform: 'none', letterSpacing: 0, textShadow: 'none', fontSize: '1.8rem', margin: '0 0 0.3rem' }}>¡Bienvenido{first ? `, ${first}` : ''}!</h1>
                    <p style={{ color: '#94A3B8', margin: '0 0 1.2rem', fontSize: '1rem' }}>Así funciona, en 3 ideas:</p>
                    <div className="flex-col" style={{ gap: '0.7rem' }}>
                        {tips.map(t => (
                            <div key={t.title} className="tactile-card" style={{ display: 'flex', gap: '0.9rem', alignItems: 'center', padding: '0.9rem' }}>
                                <div style={{ color: 'var(--primary)', flex: '0 0 auto' }}>{t.icon}</div>
                                <div>
                                    <div style={{ fontWeight: 700, color: '#fff', fontSize: '1rem' }}>{t.title}</div>
                                    <div style={{ color: '#94A3B8', fontSize: '0.9rem' }}>{t.text}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="squishy-btn primary" style={{ width: '100%', marginTop: '1.4rem', padding: '1rem', fontSize: '1.1rem' }} onClick={() => setStep(2)}>
                        Empezar
                    </button>
                </div>
            </div>
        );
    }

    const handleFinalSubmit = async () => {
        setIsSaving(true); setError('');
        try {
            // Aceptación expresa del aviso de privacidad, términos y código de conducta (queda la versión y la fecha)
            const { data: accepted, error: termsError } = await supabase.rpc('fn_accept_user_terms', { p_version: PLATFORM_TERMS_VERSION });
            if (termsError || !accepted) throw termsError || new Error('No se registró la aceptación');
            if (name.trim() && name.trim() !== user?.name) {
                await supabase.from('users').update({ name: name.trim() }).eq('id', user?.id);
            }
            // La contraseña (si entró con código) se pide justo después; recargar trae el perfil actualizado
            window.location.reload();
            onComplete();
        } catch (err) {
            console.error('Error saving profile:', err);
            setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
        } finally {
            setIsSaving(false);
        }
    };

    const ready = acceptPrivacy && acceptTerms && name.trim().length >= 3;
    return (
        <div className="flex-center flex-col" style={{ minHeight: '100vh', padding: '1.25rem', backgroundColor: 'var(--bg-color)', overflowY: 'auto' }}>
            <div className="tactile-card flex-col gap-2" style={{ maxWidth: 450, width: '100%', marginTop: 'auto', marginBottom: 'auto' }}>
                <h2 style={{ margin: 0, color: '#fff', fontSize: '1.4rem', textTransform: 'none', letterSpacing: 0 }}>Antes de empezar</h2>
                <p style={{ margin: 0, color: '#94A3B8', fontSize: '0.92rem' }}>
                    Solo guardamos tu nombre, tu celular, la ubicación cuando registras algo y las fotos que tú subas.
                    Nunca te pediremos CURP, credencial para votar ni domicilio.
                </p>
                <label className="flex-col" style={{ gap: '0.3rem', fontSize: '0.9rem', color: '#CBD5E1' }}>
                    Tu nombre
                    <input value={name} onChange={e => setName(e.target.value)} className="squishy-input" placeholder="Nombre y apellido" />
                </label>
                <label style={checkRow}>
                    <input type="checkbox" checked={acceptPrivacy} onChange={e => setAcceptPrivacy(e.target.checked)} style={checkBox} />
                    <span><strong>Doy mi permiso</strong> para que se usen mis datos, incluidos los que muestran que apoyo a esta campaña, como dice el{' '}
                        <a href={`${PUBLIC_URL}/privacidad`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tertiary)' }}>aviso de privacidad</a> (versión {PLATFORM_TERMS_VERSION}).</span>
                </label>
                <label style={checkRow}>
                    <input type="checkbox" checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} style={checkBox} />
                    <span>Acepto los{' '}
                        <a href={`${PUBLIC_URL}/terminos`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tertiary)' }}>términos de uso</a> y me comprometo a: no condicionar apoyos, no registrar a menores ni a nadie sin su permiso, y no compartir listas.</span>
                </label>
                {error && <div style={{ color: '#fca5a5', fontSize: '0.9rem' }}>{error}</div>}
                <button className="squishy-btn primary" style={{ width: '100%', fontSize: '1.1rem', padding: '1rem' }} onClick={handleFinalSubmit} disabled={isSaving || !ready}>
                    {isSaving ? 'Guardando…' : 'Aceptar y entrar'}
                </button>
                {!ready && <div style={{ color: '#64748B', fontSize: '0.8rem', textAlign: 'center' }}>Marca las dos casillas para continuar.</div>}
            </div>
        </div>
    );
};

const checkRow: React.CSSProperties = { display: 'flex', gap: '0.7rem', alignItems: 'flex-start', fontSize: '0.9rem', cursor: 'pointer', lineHeight: 1.45 };
const checkBox: React.CSSProperties = { width: 24, height: 24, flex: '0 0 auto', marginTop: 1, accentColor: 'var(--primary)' };
