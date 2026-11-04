import { useEffect, useState, type CSSProperties } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/verification';
import { formatEventDate } from '../lib/engagement';

type Info = {
    estado: 'programado' | 'cancelado' | 'realizado' | 'no_encontrado';
    titulo?: string; descripcion?: string | null; lugar?: string | null; inicio?: string; fin?: string | null;
    campana?: string; aviso_url?: string | null; aviso_version?: string; cupo?: number | null; confirmados?: number;
    registro_abierto?: boolean;
};

const MESSAGES: Record<string, string> = {
    falta_aviso: 'Para continuar acepta el aviso de privacidad.',
    falta_telefono: 'Escribe tu celular a 10 dígitos.',
    cupo_lleno: 'El cupo de este evento ya está completo.',
    fuera_de_horario: 'El registro de llegada se abre 3 horas antes del inicio.',
    cancelado: 'Este evento fue cancelado.',
};

/**
 * Página pública de un evento (/e/<token>).
 * Antes del evento: confirmar asistencia. Durante el evento: registrar la llegada (QR en la entrada).
 */
export const PublicEvent = () => {
    const { token } = useParams();
    const { search } = useLocation();
    const ref = new URLSearchParams(search).get('r');
    const [info, setInfo] = useState<Info | null>(null);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [accept, setAccept] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState<'rsvp' | 'checkin' | null>(null);
    const [showNotice, setShowNotice] = useState(false);

    useEffect(() => {
        if (!token) return;
        supabase.rpc('fn_public_event', { p_token: token }).then(({ data }) => setInfo((data as Info) || { estado: 'no_encontrado' }));
    }, [token]);

    const submit = async (mode: 'rsvp' | 'checkin') => {
        if (!token) return;
        setSending(true); setError('');
        const uuid = ref && /^[0-9a-f-]{36}$/i.test(ref) ? ref : null;
        const { data, error: err } = await supabase.rpc('fn_event_register', {
            p_token: token, p_name: name, p_phone: phone, p_mode: mode, p_accept: accept, p_ref: uuid, p_device: getDeviceId(),
        });
        setSending(false);
        const estado = (data as any)?.estado;
        if (err || estado !== 'ok') { setError(MESSAGES[estado] || 'No se pudo registrar. Intenta de nuevo.'); return; }
        setDone(mode);
    };

    const box: CSSProperties = { maxWidth: 460, margin: '1rem auto', padding: '1.4rem', textAlign: 'center' };
    if (!info) return <div className="tactile-card" style={box}>Cargando...</div>;
    if (info.estado === 'no_encontrado') return <div className="tactile-card" style={box}><h2>Enlace no válido</h2><p style={{ color: '#9aa' }}>Revisa que el enlace esté completo.</p></div>;
    if (info.estado === 'cancelado') return <div className="tactile-card" style={box}><h2>{info.titulo}</h2><p>Este evento fue cancelado. Gracias por tu interés.</p></div>;

    if (done) {
        return (
            <div className="tactile-card" style={box}>
                <h2 style={{ marginTop: 0 }}>{done === 'checkin' ? '¡Bienvenido!' : '¡Te esperamos!'}</h2>
                <p>{done === 'checkin' ? `Registramos tu llegada a ${info.titulo}.` : `Confirmaste tu asistencia a ${info.titulo}, ${info.inicio ? formatEventDate(info.inicio) : ''}.`}</p>
            </div>
        );
    }

    const lleno = !!info.cupo && (info.confirmados || 0) >= info.cupo;
    const ready = accept && phone.replace(/\D/g, '').length >= 10 && name.trim().length >= 2;
    return (
        <div className="tactile-card flex-col gap-2" style={box}>
            <div style={{ fontSize: '0.8rem', color: '#9aa' }}>{info.campana}</div>
            <h2 style={{ margin: 0 }}>{info.titulo}</h2>
            {info.inicio && <div style={{ textTransform: 'capitalize' }}>{formatEventDate(info.inicio)}</div>}
            {info.lugar && <div style={{ color: '#9aa' }}>{info.lugar}</div>}
            {info.descripcion && <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{info.descripcion}</p>}

            <input className="squishy-input" placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} />
            <input className="squishy-input" type="tel" inputMode="numeric" autoComplete="tel" placeholder="Tu celular (10 dígitos)"
                value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d ]/g, ''))} />
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', textAlign: 'left', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Autorizo que {info.campana || 'el equipo'} use mi nombre y celular para registrar mi asistencia y mantenerme informado, incluido el dato de mi simpatía por este proyecto.{' '}
                    <button type="button" onClick={() => setShowNotice(!showNotice)} style={linkBtn}>Aviso de privacidad</button></span>
            </label>
            {showNotice && (
                <div style={{ fontSize: '0.75rem', color: '#bbb', textAlign: 'left', background: 'rgba(255,255,255,0.04)', padding: '0.7rem', borderRadius: 8 }}>
                    {info.aviso_url
                        ? <>Consulta el aviso completo (versión {info.aviso_version}) en <a href={info.aviso_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tertiary)' }}>este enlace</a>.</>
                        : <>Responsable: {info.campana || 'el equipo de campaña'}. Datos: nombre y celular. Finalidad: registrar tu asistencia e informarte de actividades. No se venden ni se comparten. Versión {info.aviso_version}.</>}
                </div>
            )}
            {error && <div style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>{error}</div>}

            {info.registro_abierto ? (
                <button className="squishy-btn primary" disabled={!ready || sending} onClick={() => submit('checkin')} style={{ padding: '0.9rem' }}>
                    {sending ? 'Un momento...' : 'Registrar mi llegada'}
                </button>
            ) : (
                <button className="squishy-btn primary" disabled={!ready || sending || lleno} onClick={() => submit('rsvp')} style={{ padding: '0.9rem' }}>
                    {lleno ? 'Cupo completo' : sending ? 'Un momento...' : 'Confirmar asistencia'}
                </button>
            )}
        </div>
    );
};

const linkBtn: CSSProperties = { background: 'none', border: 'none', color: 'var(--tertiary)', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' };

export default PublicEvent;
