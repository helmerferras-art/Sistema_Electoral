import { supabase } from './supabase';

/**
 * Llama a la función del servidor ai-proxy. Las llaves de IA nunca están en el teléfono:
 * el servidor valida el perfil, aplica el tope diario de la campaña y registra cada consulta.
 */
export const askAI = async <T = any>(task: 'advisor' | 'acta' | 'section_brief', payload: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('ai-proxy', { body: { task, ...payload } });
    if (error) {
        let msg = error.message;
        try { const ctx = await (error as any).context?.json?.(); if (ctx?.error) msg = ctx.error; } catch { /* sin cuerpo */ }
        throw new Error(msg);
    }
    return data as { ok: boolean; provider: string; content?: string; data?: T; brief?: T };
};

/** Reduce una foto a máximo 1600 px y la convierte a JPEG en base64 para enviarla a la IA. */
export const imageToDataUrl = (file: File, max = 1600): Promise<string> => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
});
