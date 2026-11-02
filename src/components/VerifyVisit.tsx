import { useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/verification';

type Info = { estado: 'pendiente' | 'confirmado' | 'rechazado' | 'no_encontrado'; persona?: string; brigadista?: string; campana?: string; aviso_url?: string | null };

/** Página pública que abre la persona contactada para confirmar (o negar) la visita. */
export const VerifyVisit = () => {
    const { token } = useParams();
    const [info, setInfo] = useState<Info | null>(null);
    const [sending, setSending] = useState(false);
    const [showNotice, setShowNotice] = useState(false);

    useEffect(() => {
        if (!token) return;
        supabase.rpc('fn_verification_info', { p_token: token })
            .then(({ data }) => setInfo((data as Info) || { estado: 'no_encontrado' }));
    }, [token]);

    const answer = async (response: 'si' | 'no') => {
        if (!token) return;
        setSending(true);
        const { data } = await supabase.rpc('fn_confirm_verification', { p_token: token, p_response: response, p_device: getDeviceId() });
        setInfo(prev => ({ ...(prev || { estado: 'pendiente' }), estado: ((data as any)?.estado || 'no_encontrado') }));
        setSending(false);
    };

    const box: CSSProperties = { maxWidth: 440, margin: '2rem auto', padding: '1.5rem', textAlign: 'center' };

    if (!info) return <div className="tactile-card" style={box}>Cargando...</div>;

    if (info.estado === 'no_encontrado') {
        return <div className="tactile-card" style={box}><h2>Enlace no válido</h2><p style={{ color: '#9aa' }}>Revisa que el enlace esté completo.</p></div>;
    }
    if (info.estado === 'confirmado') {
        return <div className="tactile-card" style={box}><h2>¡Gracias, {info.persona}! 🙌</h2><p>Confirmaste la visita de {info.brigadista}.</p></div>;
    }
    if (info.estado === 'rechazado') {
        return <div className="tactile-card" style={box}><h2>Gracias por avisarnos</h2><p>Registramos que no recibiste esta visita. Revisaremos el caso.</p></div>;
    }

    return (
        <div className="tactile-card flex-col gap-2" style={box}>
            <h2 style={{ margin: 0 }}>Hola, {info.persona}</h2>
            <p style={{ margin: 0 }}>
                <strong>{info.brigadista}</strong>{info.campana ? <>, del equipo de <strong>{info.campana}</strong>,</> : ''} registró que platicó contigo.
                ¿Es correcto?
            </p>
            <button className="squishy-btn primary" disabled={sending} onClick={() => answer('si')} style={{ padding: '0.9rem', fontSize: '1.05rem' }}>
                Sí, me visitó
            </button>
            <button className="squishy-btn" disabled={sending} onClick={() => answer('no')}>
                No, nadie me visitó
            </button>
            <p style={{ fontSize: '0.78rem', color: '#9aa', margin: 0 }}>
                Al confirmar aceptas que {info.campana || 'el equipo'} guarde tu nombre y teléfono para mantenerte informado.{' '}
                <button onClick={() => setShowNotice(!showNotice)} style={{ background: 'none', border: 'none', color: 'var(--tertiary)', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                    Aviso de privacidad
                </button>
            </p>
            {showNotice && (
                <div style={{ fontSize: '0.76rem', color: '#bbb', textAlign: 'left', background: 'rgba(255,255,255,0.04)', padding: '0.7rem', borderRadius: 8 }}>
                    {info.aviso_url
                        ? <>Consulta el aviso de privacidad completo en <a href={info.aviso_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tertiary)' }}>este enlace</a>.</>
                        : <>Responsable: {info.campana || 'el equipo de campaña'}. Datos: nombre, teléfono y zona donde vives. Finalidad: mantenerte informado de las actividades del proyecto y confirmar este contacto.
                            No se venden ni se comparten con terceros. Puedes pedir en cualquier momento que se corrijan o eliminen respondiendo al mensaje que recibiste.</>}
                </div>
            )}
        </div>
    );
};

export default VerifyVisit;
