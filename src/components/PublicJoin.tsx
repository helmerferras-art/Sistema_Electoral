import { useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/verification';
import { getPositionOnce } from '../lib/location';
import { InviteShare } from './InviteShare';

type Info = { estado: 'ok' | 'no_encontrado'; invita?: string; campana?: string; aviso_url?: string | null; aviso_version?: string };

const MESSAGES: Record<string, string> = {
    falta_aviso: 'Para continuar acepta el aviso de privacidad.',
    falta_telefono: 'Escribe tu celular a 10 dígitos.',
    falta_nombre: 'Escribe tu nombre.',
    ya_registrado: 'Este número ya está registrado. ¡Gracias!',
    no_encontrado: 'Esta invitación ya no es válida.',
};

/**
 * Invitación personal (/u/<código>): una persona que ya validó su visita invita a sus conocidos.
 * Quien se registra lo hace desde su propio celular y queda validado con su consentimiento.
 */
export const PublicJoin = () => {
    const { code } = useParams();
    const [info, setInfo] = useState<Info | null>(null);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [accept, setAccept] = useState(false);
    const [shareLoc, setShareLoc] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [myCode, setMyCode] = useState<string | null>(null);
    const [showNotice, setShowNotice] = useState(false);

    useEffect(() => {
        if (!code) return;
        supabase.rpc('fn_public_invite', { p_code: code }).then(({ data }) => setInfo((data as Info) || { estado: 'no_encontrado' }));
    }, [code]);

    const submit = async () => {
        if (!code) return;
        setSending(true); setError('');
        let lat: number | null = null, lng: number | null = null;
        if (shareLoc) { try { const f = await getPositionOnce({ timeoutMs: 8000 }); lat = f.lat; lng = f.lng; } catch { /* opcional */ } }
        const { data, error: err } = await supabase.rpc('fn_public_join', {
            p_code: code, p_name: name, p_phone: phone, p_accept: accept, p_lat: lat, p_lng: lng, p_device: getDeviceId(),
        });
        setSending(false);
        const estado = (data as any)?.estado;
        if (err || estado !== 'ok') { setError(MESSAGES[estado] || 'No se pudo registrar. Intenta de nuevo.'); return; }
        setMyCode((data as any).codigo || '');
    };

    const box: CSSProperties = { maxWidth: 460, margin: '1rem auto', padding: '1.4rem', textAlign: 'center' };
    if (!info) return <div className="tactile-card" style={box}>Cargando...</div>;
    if (info.estado !== 'ok') return <div className="tactile-card" style={box}><h2>Invitación no válida</h2><p style={{ color: '#9aa' }}>Pide a quien te invitó que te comparta su enlace de nuevo.</p></div>;

    if (myCode !== null) {
        return (
            <div className="tactile-card flex-col gap-2" style={box}>
                <h2 style={{ margin: 0 }}>¡Bienvenido!</h2>
                <p style={{ margin: 0 }}>Ya formas parte de {info.campana}. Te mantendremos informado.</p>
                {myCode && <InviteShare code={myCode} campaign={info.campana} />}
            </div>
        );
    }

    const ready = accept && phone.replace(/\D/g, '').length >= 10 && name.trim().length >= 3;
    return (
        <div className="tactile-card flex-col gap-2" style={box}>
            <div style={{ fontSize: '0.8rem', color: '#9aa' }}>{info.campana}</div>
            <h2 style={{ margin: 0 }}>{info.invita} te invita a sumarte</h2>
            <p style={{ margin: 0, color: '#bbb' }}>Déjanos tu nombre y celular para mantenerte informado de las propuestas y actividades.</p>
            <input className="squishy-input" placeholder="Tu nombre" value={name} onChange={e => setName(e.target.value)} />
            <input className="squishy-input" type="tel" inputMode="numeric" autoComplete="tel" placeholder="Tu celular (10 dígitos)"
                value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d ]/g, ''))} />
            <label style={check}>
                <input type="checkbox" checked={shareLoc} onChange={e => setShareLoc(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Usar mi ubicación para saber en qué sección vivo (opcional).</span>
            </label>
            <label style={check}>
                <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} style={{ marginTop: 3 }} />
                <span><strong>Autorizo</strong> que {info.campana || 'el equipo'} use mis datos, incluido el que revela mi simpatía por este proyecto, para mantenerme informado.{' '}
                    <button type="button" onClick={() => setShowNotice(!showNotice)} style={linkBtn}>Aviso de privacidad</button></span>
            </label>
            {showNotice && (
                <div style={{ fontSize: '0.75rem', color: '#bbb', textAlign: 'left', background: 'rgba(255,255,255,0.04)', padding: '0.7rem', borderRadius: 8 }}>
                    {info.aviso_url
                        ? <>Consulta el aviso completo (versión {info.aviso_version}) en <a href={info.aviso_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tertiary)' }}>este enlace</a>.</>
                        : <>Responsable: {info.campana}. Datos: nombre, celular y, si lo autorizas, tu ubicación. Finalidad: informarte de actividades. No se venden ni se comparten. Versión {info.aviso_version}.</>}
                </div>
            )}
            {error && <div style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>{error}</div>}
            <button className="squishy-btn primary" disabled={!ready || sending} onClick={submit} style={{ padding: '0.9rem' }}>
                {sending ? 'Un momento...' : 'Sumarme'}
            </button>
        </div>
    );
};

const check: CSSProperties = { display: 'flex', gap: '0.5rem', alignItems: 'flex-start', textAlign: 'left', fontSize: '0.8rem', cursor: 'pointer' };
const linkBtn: CSSProperties = { background: 'none', border: 'none', color: 'var(--tertiary)', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' };

export default PublicJoin;
