import { useEffect, useState } from 'react';
import { X, Upload } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';

const NETWORKS: [string, string][] = [
    ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['x', 'X (Twitter)'],
    ['youtube', 'YouTube'], ['whatsapp', 'Canal de WhatsApp'], ['web', 'Sitio web'],
];

/**
 * Editor de la página de agradecimiento que ve la persona al abrir el enlace o escanear el QR
 * del brigadista. Solo candidato / coordinador de campaña / superadmin.
 */
export const ThanksPageEditor = ({ onClose }: { onClose: () => void }) => {
    const { user } = useAuth();
    const [form, setForm] = useState({
        thanks_title: '', thanks_message: '', thanks_media_url: '', thanks_media_type: '' as '' | 'imagen' | 'video',
        social_links: {} as Record<string, string>, privacy_notice_url: '',
    });
    const [objective, setObjective] = useState('votos');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!user?.tenant_id) return;
        supabase.from('tenants').select('thanks_title, thanks_message, thanks_media_url, thanks_media_type, social_links, privacy_notice_url')
            .eq('id', user.tenant_id).maybeSingle().then(({ data }) => {
                if (data) setForm({
                    thanks_title: data.thanks_title || '', thanks_message: data.thanks_message || '',
                    thanks_media_url: data.thanks_media_url || '', thanks_media_type: data.thanks_media_type || '',
                    social_links: data.social_links || {}, privacy_notice_url: data.privacy_notice_url || '',
                });
            });
        supabase.from('goal_settings').select('objective').eq('tenant_id', user.tenant_id).maybeSingle()
            .then(({ data }) => setObjective((data as any)?.objective || 'votos'));
    }, [user?.tenant_id]);

    const upload = async (file: File | undefined) => {
        if (!file || !user?.tenant_id) return;
        const isVideo = file.type.startsWith('video/');
        if (file.size > 25 * 1024 * 1024) { setMsg('❌ El archivo pesa más de 25 MB. Para videos largos, súbelo a YouTube y pega el enlace.'); return; }
        setUploading(true); setMsg('');
        const ext = (file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')).toLowerCase();
        const path = `${user.tenant_id}/agradecimiento-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('campaign_media').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '86400' });
        if (error) { setMsg(`❌ ${error.message}`); setUploading(false); return; }
        const { data } = supabase.storage.from('campaign_media').getPublicUrl(path);
        setForm(f => ({ ...f, thanks_media_url: data.publicUrl, thanks_media_type: isVideo ? 'video' : 'imagen' }));
        setUploading(false);
    };

    const save = async () => {
        const urls = [form.thanks_media_url, form.privacy_notice_url, ...Object.values(form.social_links)].filter(Boolean);
        if (urls.some(u => !/^https:\/\//i.test(u))) { setMsg('⚠️ Todos los enlaces deben empezar con https://'); return; }
        setSaving(true); setMsg('');
        const { error } = await supabase.from('tenants').update({
            thanks_title: form.thanks_title || null,
            thanks_message: form.thanks_message || null,
            thanks_media_url: form.thanks_media_url || null,
            thanks_media_type: form.thanks_media_url ? (form.thanks_media_type || 'imagen') : null,
            social_links: Object.fromEntries(Object.entries(form.social_links).filter(([, v]) => v)),
            privacy_notice_url: form.privacy_notice_url || null,
        }).eq('id', user!.tenant_id);
        setSaving(false);
        if (error) { setMsg(`❌ ${error.message}`); return; }
        setMsg('✅ Guardado. Así lo verá la gente al abrir el enlace o escanear el QR.');
    };

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div className="tactile-card flex-col gap-2" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', height: 'auto', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>📣 Página de agradecimiento</strong>
                    <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
                </div>
                <div style={{ color: '#9aa' }}>Es lo que ve la persona al escanear el QR del brigadista o abrir su enlace de WhatsApp. Abrirla cuenta como visita validada.</div>

                <label className="flex-col" style={{ gap: '0.2rem' }}>Título
                    <input className="squishy-input" maxLength={120} placeholder="¡Gracias por escucharnos!" value={form.thanks_title}
                        onChange={e => setForm({ ...form, thanks_title: e.target.value })} />
                </label>
                <label className="flex-col" style={{ gap: '0.2rem' }}>Mensaje
                    <textarea className="squishy-input" rows={4} maxLength={1500} placeholder="Un mensaje breve de agradecimiento..." value={form.thanks_message}
                        onChange={e => setForm({ ...form, thanks_message: e.target.value })} />
                </label>

                <div className="flex-col" style={{ gap: '0.3rem' }}>
                    <span>Imagen o video corto (máx. 25 MB)</span>
                    <label className="squishy-btn" style={{ textAlign: 'center', cursor: 'pointer' }}>
                        <Upload size={14} /> {uploading ? 'Subiendo...' : 'Subir imagen o video'}
                        <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden disabled={uploading}
                            onChange={e => upload(e.target.files?.[0])} />
                    </label>
                    <input className="squishy-input" placeholder="…o pega un enlace de YouTube (https://)" value={form.thanks_media_url}
                        onChange={e => setForm({ ...form, thanks_media_url: e.target.value.trim(), thanks_media_type: /youtu/.test(e.target.value) ? 'video' : form.thanks_media_type })} />
                    {form.thanks_media_url && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <select className="squishy-input" value={form.thanks_media_type || 'imagen'} onChange={e => setForm({ ...form, thanks_media_type: e.target.value as any })} style={{ flex: 1 }}>
                                <option value="imagen">Es una imagen</option>
                                <option value="video">Es un video</option>
                            </select>
                            <button className="squishy-btn" onClick={() => setForm({ ...form, thanks_media_url: '', thanks_media_type: '' })}>Quitar</button>
                        </div>
                    )}
                    {form.thanks_media_url && form.thanks_media_type === 'imagen' && <img src={form.thanks_media_url} alt="Vista previa" style={{ maxWidth: 160, borderRadius: 8 }} />}
                </div>

                <div className="flex-col" style={{ gap: '0.3rem' }}>
                    <span>Redes sociales (deja vacías las que no uses)</span>
                    {NETWORKS.map(([k, label]) => (
                        <input key={k} className="squishy-input" placeholder={`${label}: https://...`} value={form.social_links[k] || ''}
                            onChange={e => setForm({ ...form, social_links: { ...form.social_links, [k]: e.target.value.trim() } })} />
                    ))}
                </div>

                <label className="flex-col" style={{ gap: '0.2rem' }}>Enlace al aviso de privacidad completo
                    <input className="squishy-input" placeholder="https://..." value={form.privacy_notice_url}
                        onChange={e => setForm({ ...form, privacy_notice_url: e.target.value.trim() })} />
                    <span style={{ fontSize: '0.72rem', color: '#9aa' }}>Si lo dejas vacío se muestra un aviso breve genérico. Pide a tu área jurídica el aviso oficial.</span>
                </label>

                {objective !== 'votos' && (
                    <div style={{ fontSize: '0.75rem', background: 'rgba(255,176,0,0.1)', padding: '0.5rem', borderRadius: 8 }}>
                        ⚖️ Modo aspirante: el mensaje, la imagen y el video no deben pedir el voto ni presentarse como propaganda electoral antes de la precampaña.
                    </div>
                )}

                {msg && <div>{msg}</div>}
                <button className="squishy-btn primary" disabled={saving || uploading} onClick={save}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
        </div>
    );
};

export default ThanksPageEditor;
