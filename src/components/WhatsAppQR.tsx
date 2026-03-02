import React, { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { UserPlus, Download, CheckCircle } from 'lucide-react';

interface WhatsAppQRProps {
    phone: string;
    candidateName: string;
    message?: string;
    size?: number;
}

/**
 * Component to display a QR code that either:
 * 1. Downloads a vCard (through a helper URL or blob)
 * 2. or Opens WhatsApp with a pre-filled message + VCard link
 * 
 * For this MVP, we'll use the "wa.me" link with a message and instructions
 * to save the contact.
 */
export const WhatsAppQR: React.FC<WhatsAppQRProps> = ({
    phone,
    candidateName,
    message = "¡Hola! Me da gusto saludarte. Te escribo de parte de tu contacto para que estemos comunicados. ¡Saludos!",
    size = 200
}) => {
    // Clean phone number (remove non-digits, ensure 521 for Mexico if needed)
    const cleanPhone = useMemo(() => phone.replace(/\D/g, ''), [phone]);

    // WhatsApp Click-to-Chat URL
    const waUrl = `https://wa.me/${cleanPhone}/?text=${encodeURIComponent(message)}`;

    // Generate VCF (vCard) content
    const generateVCard = () => {
        const vcard = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${candidateName}`,
            `TEL;TYPE=CELL,VOICE:${phone}`,
            'END:VCARD'
        ].join('\n');

        const blob = new Blob([vcard], { type: 'text/vcard' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${candidateName.replace(/\s+/g, '_')}.vcf`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            padding: '1.5rem',
            backgroundColor: 'rgba(255,255,255,0.03)',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)'
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '10px',
                borderRadius: '8px',
                boxShadow: '0 0 20px rgba(0, 212, 255, 0.3)'
            }}>
                <QRCodeSVG
                    value={waUrl}
                    size={size}
                    includeMargin={false}
                    level="H"
                />
            </div>

            <div style={{ textAlign: 'center' }}>
                <h3 style={{ fontFamily: 'Oswald', margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>
                    PASO FINAL: AGREGAR A {candidateName.toUpperCase()}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#94A3B8', maxWidth: '280px', margin: '0 auto' }}>
                    Escanea este código con tu cámara para abrir WhatsApp y recibir tu bienvenida.
                </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                <button
                    onClick={generateVCard}
                    className="squishy-btn"
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        fontSize: '0.8rem',
                        padding: '0.6rem',
                        backgroundColor: 'rgba(52, 211, 153, 0.1)',
                        color: '#34D399',
                        border: '1px solid #34D399'
                    }}
                >
                    <Download size={16} /> BAJAR CONTACTO
                </button>
                <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="squishy-btn primary"
                    style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        fontSize: '0.8rem',
                        padding: '0.6rem',
                        textDecoration: 'none'
                    }}
                >
                    <CheckCircle size={16} /> ABRIR CHAT
                </a>
            </div>

            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.5rem',
                color: 'var(--tertiary)',
                fontSize: '0.75rem'
            }}>
                <UserPlus size={14} />
                <span>Confianza establecida: Anti-Baneo activo</span>
            </div>
        </div>
    );
};
