import { supabase } from './supabase';

/**
 * Validación de visitas por WhatsApp.
 * El brigadista envía desde SU celular un mensaje con un enlace único; la persona lo abre en SU
 * teléfono y confirma. La base marca alertas si el enlace se abre desde el mismo dispositivo o red
 * del brigadista, o demasiado rápido.
 */

// Dominio público de la app (en la app móvil, location.origin es capacitor://localhost)
export const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined)
    || (typeof window !== 'undefined' && window.location.origin.startsWith('http') && !window.location.hostname.match(/^(localhost|127\.)/)
        ? window.location.origin : 'https://nemia.lat');

const DEVICE_KEY = 'c4i_device_id';

/** Identificador anónimo de este dispositivo (solo para detectar autoconfirmaciones). */
export const getDeviceId = (): string => {
    try {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) { id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); }
        return id;
    } catch {
        return 'sin-almacenamiento';
    }
};

/** Token de 16 caracteres, imposible de adivinar; se genera en el teléfono para funcionar sin señal. */
export const newVerificationToken = (): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return btoa(String.fromCharCode(...bytes)).replace(/\//g, 'x').replace(/\+/g, 'z').replace(/=+$/, '');
};

export const verificationLink = (token: string) => `${PUBLIC_URL}/v/${token}`;

const firstName = (s?: string | null) => (s || '').trim().split(/\s+/)[0] || '';

export const verificationMessage = (opts: { personName: string; recruiterName?: string | null; campaignName?: string | null; token: string }) => {
    const persona = firstName(opts.personName);
    const yo = firstName(opts.recruiterName);
    const proyecto = opts.campaignName ? ` del equipo de ${opts.campaignName}` : '';
    return `Hola ${persona}, soy ${yo}${proyecto}. Gracias por platicar conmigo. ` +
        `¿Me ayudas a confirmar que te visité? Solo toca este enlace: ${verificationLink(opts.token)} ` +
        `(ahí también puedes ver cómo cuidamos tus datos).`;
};

/** Número mexicano a formato de wa.me (52 + 10 dígitos). */
export const waNumber = (phone: string) => {
    const d = (phone || '').replace(/\D/g, '');
    const ten = d.slice(-10);
    return ten.length === 10 ? `52${ten}` : d;
};

/** Abre WhatsApp en el celular del brigadista con el mensaje listo y registra el envío. */
export const sendVerificationWhatsApp = async (opts: { phone: string; personName: string; recruiterName?: string | null; campaignName?: string | null; token: string }) => {
    const text = verificationMessage(opts);
    window.open(`https://wa.me/${waNumber(opts.phone)}?text=${encodeURIComponent(text)}`, '_blank');
    if (navigator.onLine) {
        // Si el registro aún no se sube (sin señal), no pasa nada: la confirmación funcionará al sincronizar.
        supabase.rpc('fn_mark_verification_sent', { p_token: opts.token }).then(() => undefined);
    }
};

/** Para simpatizantes ya subidos: obtiene (o genera) su enlace y abre WhatsApp. */
export const resendVerification = async (supporter: { id: string; phone: string; name: string }, recruiterName?: string | null, campaignName?: string | null) => {
    const { data: token, error } = await supabase.rpc('fn_get_verification_token', { p_supporter_id: supporter.id });
    if (error || !token) throw error || new Error('No se pudo generar el enlace');
    await sendVerificationWhatsApp({ phone: supporter.phone, personName: supporter.name, recruiterName, campaignName, token: token as string });
};

export type VerificationState = 'confirmado' | 'rechazado' | 'alerta' | 'enviado' | 'pendiente';
export const verificationState = (s: { verification_response?: string | null; verification_flags?: string[] | null; verification_sent_at?: string | null }): VerificationState => {
    if (s.verification_response === 'no') return 'rechazado';
    if (s.verification_response === 'si') return (s.verification_flags?.length ?? 0) > 0 ? 'alerta' : 'confirmado';
    return s.verification_sent_at ? 'enviado' : 'pendiente';
};
export const VERIFICATION_BADGE: Record<VerificationState, { text: string; color: string }> = {
    confirmado: { text: '✅ Validado', color: 'var(--secondary)' },
    alerta: { text: '⚠️ Revisar', color: '#FFB000' },
    rechazado: { text: '❌ Negó la visita', color: 'var(--primary)' },
    enviado: { text: '⏳ Esperando respuesta', color: '#9aa' },
    pendiente: { text: '○ Sin validar', color: '#9aa' },
};
