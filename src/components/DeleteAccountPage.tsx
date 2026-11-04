import { useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Página pública nemia.lat/eliminar-cuenta (Google Play la pide en el formulario de seguridad de datos).
 * Explica cómo borrar la cuenta desde la app y permite pedirlo sin tener la app instalada.
 */
export const DeleteAccountPage = () => {
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [state, setState] = useState<'' | 'enviando' | 'recibida' | 'error'>('');
    const [error, setError] = useState('');

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setState('enviando'); setError('');
        const { data, error: err } = await supabase.rpc('fn_request_account_deletion', { p_phone: phone, p_name: name || null });
        const estado = (data as any)?.estado;
        if (err) { setState('error'); setError('No pudimos enviar la solicitud. Intenta de nuevo en unos minutos.'); return; }
        if (estado === 'telefono_invalido') { setState('error'); setError('Escribe tu número de celular a 10 dígitos.'); return; }
        setState('recibida');
    };

    return (
        <div className="tactile-card flex-col gap-2" style={box}>
            <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Eliminar tu cuenta de Tlatoani</h1>
            <p style={p}>Tlatoani es una herramienta privada para equipos de campaña. Puedes eliminar tu cuenta y tus datos en cualquier momento.</p>

            <h2 style={h2}>Desde la app</h2>
            <ol style={{ ...p, paddingLeft: '1.2rem' }}>
                <li>Entra a la app con tu celular y contraseña.</li>
                <li>Toca el ícono de tu cuenta, arriba a la derecha.</li>
                <li>Toca <b>Eliminar mi cuenta</b>, escribe ELIMINAR y confirma.</li>
            </ol>

            <h2 style={h2}>Qué se borra y qué se conserva</h2>
            <ul style={{ ...p, paddingLeft: '1.2rem' }}>
                <li><b>Se borra de inmediato:</b> tu acceso, tu nombre y celular, tu bitácora de campo con sus fotos y audios, tus metas y tus avisos.</li>
                <li><b>Se conserva sin tu nombre:</b> las personas que registraste, porque son registros de la organización. Cada una puede pedir su propia baja desde el mensaje de agradecimiento que recibió.</li>
                <li>Al cerrar cada proceso, la organización anonimiza toda su base de datos.</li>
            </ul>

            <h2 style={h2}>Si ya no tienes la app</h2>
            {state === 'recibida' ? (
                <p style={{ ...p, color: 'var(--secondary)' }}>Recibimos tu solicitud. La atenderemos en un máximo de 10 días hábiles y te avisaremos por mensaje al número que nos diste.</p>
            ) : (
                <form onSubmit={submit} className="flex-col gap-2">
                    <label htmlFor="del-phone" style={lbl}>Celular con el que entras (10 dígitos)</label>
                    <input id="del-phone" className="squishy-input" type="tel" inputMode="numeric" autoComplete="tel" value={phone}
                        onChange={e => setPhone(e.target.value.replace(/[^\d ]/g, ''))} required />
                    <label htmlFor="del-name" style={lbl}>Tu nombre (opcional)</label>
                    <input id="del-name" className="squishy-input" value={name} onChange={e => setName(e.target.value)} maxLength={120} autoComplete="name" />
                    {state === 'error' && <div style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>{error}</div>}
                    <button className="squishy-btn primary" disabled={state === 'enviando' || phone.replace(/\D/g, '').length < 10}>
                        {state === 'enviando' ? 'Enviando...' : 'Solicitar eliminación'}
                    </button>
                </form>
            )}
            <p style={{ ...p, fontSize: '0.75rem', color: '#9aa' }}>Para verificar que la cuenta es tuya podemos llamarte o escribirte a ese número antes de borrarla.</p>
        </div>
    );
};

const box: CSSProperties = { maxWidth: 560, margin: '1rem auto', padding: '1.4rem', height: 'auto' };
const p: CSSProperties = { margin: 0, lineHeight: 1.5, fontSize: '0.92rem' };
const h2: CSSProperties = { margin: '0.6rem 0 0', fontSize: '1.05rem' };
const lbl: CSSProperties = { fontSize: '0.8rem', color: '#bbb' };

export default DeleteAccountPage;
