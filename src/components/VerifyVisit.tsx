import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getDeviceId } from '../lib/verification';

type Info = {
    estado: 'pendiente' | 'confirmado' | 'baja' | 'no_encontrado';
    persona?: string; brigadista?: string; campana?: string; aviso_url?: string | null;
    titulo?: string | null; mensaje?: string | null; media_url?: string | null; media_tipo?: 'imagen' | 'video' | null;
    redes?: Record<string, string> | null;
};

const SOCIAL: Record<string, { label: string; color: string }> = {
    facebook: { label: 'Facebook', color: '#1877F2' }, instagram: { label: 'Instagram', color: '#E1306C' },
    tiktok: { label: 'TikTok', color: '#111' }, x: { label: 'X', color: '#111' }, youtube: { label: 'YouTube', color: '#FF0000' },
    whatsapp: { label: 'Canal de WhatsApp', color: '#25D366' }, web: { label: 'Sitio web', color: '#555' },
};

const youtubeEmbed = (url: string) => {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
    return m ? `https://www.youtube.com/embed/${m[1]}` : null;
};

/**
 * Página que abre la persona visitada (desde el QR del brigadista o el WhatsApp).
 * Abrirla ES la validación de la visita. Por QR, la persona escribe su número de celular.
 */
export const VerifyVisit = () => {
    const { token } = useParams();
    const { search } = useLocation();
    const channel: 'qr' | 'whatsapp' = new URLSearchParams(search).get('c') === 'qr' ? 'qr' : 'whatsapp';
    const [info, setInfo] = useState<Info | null>(null);
    const [phone, setPhone] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [showNotice, setShowNotice] = useState(false);
    const autoConfirmed = useRef(false);

    const confirm = async (p?: string) => {
        if (!token) return;
        setSending(true); setError('');
        const { data } = await supabase.rpc('fn_confirm_verification', {
            p_token: token, p_channel: channel, p_device: getDeviceId(), p_phone: p || null,
        });
        const estado = (data as any)?.estado;
        if (estado === 'falta_telefono') setError('Escribe tu número de celular a 10 dígitos.');
        else if (estado === 'confirmado') setInfo(prev => prev && { ...prev, estado: 'confirmado' });
        setSending(false);
    };

    useEffect(() => {
        if (!token) return;
        supabase.rpc('fn_verification_info', { p_token: token }).then(({ data }) => {
            const i = (data as Info) || { estado: 'no_encontrado' };
            setInfo(i);
            // Por WhatsApp, abrir el enlace basta para validar la visita
            if (i.estado === 'pendiente' && channel === 'whatsapp' && !autoConfirmed.current) {
                autoConfirmed.current = true;
                confirm();
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const optOut = async () => {
        if (!token) return;
        if (!window.confirm('¿Quieres que no usemos tu nombre ni tu celular? Ya no te contactaremos.')) return;
        await supabase.rpc('fn_verification_opt_out', { p_token: token });
        setInfo(prev => prev && { ...prev, estado: 'baja' });
    };

    const box: CSSProperties = { maxWidth: 460, margin: '1rem auto', padding: '1.4rem', textAlign: 'center' };

    if (!info) return <div className="tactile-card" style={box}>Cargando...</div>;
    if (info.estado === 'no_encontrado') {
        return <div className="tactile-card" style={box}><h2>Enlace no válido</h2><p style={{ color: '#9aa' }}>Revisa que el enlace esté completo.</p></div>;
    }
    if (info.estado === 'baja') {
        return <div className="tactile-card" style={box}><h2>Listo</h2><p>No usaremos tus datos ni volveremos a contactarte. Gracias por tu tiempo.</p></div>;
    }

    // Por QR: la persona escribe su número para ver el mensaje
    if (info.estado === 'pendiente' && channel === 'qr') {
        return (
            <div className="tactile-card flex-col gap-2" style={box}>
                <h2 style={{ margin: 0 }}>Hola{info.persona ? `, ${info.persona}` : ''} 👋</h2>
                <p style={{ margin: 0 }}>Gracias por platicar con <strong>{info.brigadista}</strong>{info.campana ? <> del equipo de <strong>{info.campana}</strong></> : ''}. Escribe tu celular para ver el mensaje que tenemos para ti.</p>
                <input className="squishy-input" type="tel" inputMode="numeric" autoComplete="tel" placeholder="Tu celular (10 dígitos)"
                    value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d ]/g, ''))} style={{ textAlign: 'center', fontSize: '1.1rem' }} />
                {error && <div style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>{error}</div>}
                <button className="squishy-btn primary" disabled={sending || phone.replace(/\D/g, '').length < 10} onClick={() => confirm(phone)} style={{ padding: '0.9rem' }}>
                    {sending ? 'Un momento...' : 'Continuar'}
                </button>
                <p style={{ fontSize: '0.75rem', color: '#9aa', margin: 0 }}>
                    Al continuar aceptas que {info.campana || 'el equipo'} guarde tu nombre y celular para mantenerte informado.{' '}
                    <button onClick={() => setShowNotice(!showNotice)} style={linkBtn}>Aviso de privacidad</button>
                </p>
                {showNotice && <Notice info={info} />}
            </div>
        );
    }

    if (info.estado === 'pendiente') return <div className="tactile-card" style={box}>Cargando...</div>;

    // Página de agradecimiento definida por el candidato
    const yt = info.media_url && info.media_tipo === 'video' ? youtubeEmbed(info.media_url) : null;
    const redes = Object.entries(info.redes || {}).filter(([, url]) => !!url);
    return (
        <div className="tactile-card flex-col gap-2" style={box}>
            {info.media_url && info.media_tipo === 'imagen' && (
                <img src={info.media_url} alt={info.campana || 'Mensaje de agradecimiento'} style={{ width: '100%', borderRadius: 10 }} />
            )}
            {info.media_url && info.media_tipo === 'video' && (yt
                ? <div style={{ position: 'relative', paddingTop: '177%', borderRadius: 10, overflow: 'hidden' }}>
                    <iframe src={yt} title="Video" allow="autoplay; encrypted-media" allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />
                </div>
                : <video src={info.media_url} controls playsInline style={{ width: '100%', borderRadius: 10, background: '#000' }} />)}

            <h2 style={{ margin: 0 }}>{info.titulo || `¡Gracias${info.persona ? `, ${info.persona}` : ''}!`}</h2>
            <p style={{ margin: 0, whiteSpace: 'pre-line' }}>
                {info.mensaje || `Gracias por tomarte el tiempo de platicar con ${info.brigadista || 'nuestro equipo'}. Tu opinión nos importa.`}
            </p>

            {redes.length > 0 && (
                <div className="flex-col" style={{ gap: '0.4rem', marginTop: '0.4rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#9aa' }}>Síguenos</div>
                    {redes.map(([k, url]) => (
                        <a key={k} href={url} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'block', padding: '0.7rem', borderRadius: 10, background: SOCIAL[k]?.color || '#333', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
                            {SOCIAL[k]?.label || k}
                        </a>
                    ))}
                </div>
            )}

            <div style={{ fontSize: '0.72rem', color: '#9aa', marginTop: '0.6rem' }}>
                <button onClick={() => setShowNotice(!showNotice)} style={linkBtn}>Aviso de privacidad</button>
                {' · '}
                <button onClick={optOut} style={linkBtn}>No quiero que guarden mis datos</button>
            </div>
            {showNotice && <Notice info={info} />}
        </div>
    );
};

const linkBtn: CSSProperties = { background: 'none', border: 'none', color: 'var(--tertiary)', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' };

const Notice = ({ info }: { info: Info }) => (
    <div style={{ fontSize: '0.75rem', color: '#bbb', textAlign: 'left', background: 'rgba(255,255,255,0.04)', padding: '0.7rem', borderRadius: 8 }}>
        {info.aviso_url
            ? <>Consulta el aviso de privacidad completo en <a href={info.aviso_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--tertiary)' }}>este enlace</a>.</>
            : <>Responsable: {info.campana || 'el equipo de campaña'}. Datos: nombre, celular y zona donde vives. Finalidad: mantenerte informado de las actividades del proyecto y confirmar este contacto.
                No se venden ni se comparten con terceros. Puedes pedir que no se usen con el enlace "No quiero que guarden mis datos".</>}
    </div>
);

export default VerifyVisit;
