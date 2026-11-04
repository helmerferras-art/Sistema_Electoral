import { useState } from 'react';
import { PUBLIC_URL } from '../lib/verification';

export const inviteLink = (code: string) => `${PUBLIC_URL}/u/${code}`;

/** Botón para que un simpatizante comparta su enlace personal de invitación. */
export const InviteShare = ({ code, campaign }: { code: string; campaign?: string | null }) => {
    const [copied, setCopied] = useState(false);
    const link = inviteLink(code);
    const text = `Me sumé a ${campaign || 'este proyecto'}. Súmate tú también: ${link}`;
    const share = () => {
        if (navigator.share) navigator.share({ text }).catch(() => { });
        else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    };
    const copy = async () => {
        try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sin permiso */ }
    };
    return (
        <div style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.4)', borderRadius: 10, padding: '0.8rem', marginTop: '0.4rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.3rem' }}>Invita a tus conocidos</div>
            <div style={{ fontSize: '0.8rem', color: '#bbb', marginBottom: '0.5rem' }}>Comparte tu enlace personal con familiares y amigos que quieran sumarse.</div>
            <button className="squishy-btn" onClick={share} style={{ width: '100%', padding: '0.7rem', background: '#25D366', color: '#fff', border: 'none', fontWeight: 700 }}>Compartir por WhatsApp</button>
            <button onClick={copy} style={{ marginTop: '0.4rem', background: 'none', border: 'none', color: 'var(--tertiary)', cursor: 'pointer', fontSize: '0.8rem' }}>
                {copied ? 'Enlace copiado' : 'Copiar enlace'}
            </button>
        </div>
    );
};

export default InviteShare;
