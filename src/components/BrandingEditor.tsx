import { useEffect, useState } from 'react';
import { X, Upload, Palette } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import {
    PALETTE, applyBrandColor, hasBrand, loadBrandForm, saveBrand, uploadBrandPhoto, usableColor, useBranding,
    type BrandForm,
} from '../lib/branding';

const CAN_EDIT = ['candidato', 'coordinador_campana', 'superadmin'];

/** Tarjeta en el tablero de mando: muestra la identidad actual y abre el editor. */
export const BrandingCard = () => {
    const { user } = useAuth();
    const brand = useBranding(user?.tenant_id);
    const [open, setOpen] = useState(false);
    if (!user || !CAN_EDIT.includes(user.role)) return null;
    const set = hasBrand(brand);
    return (
        <>
            <div className="tactile-card brand-card" style={{ height: 'auto' }}>
                <div className="brand-card-row">
                    {brand.photo
                        ? <img src={brand.photo} alt="" className="brand-avatar lg" />
                        : <div className="brand-avatar lg brand-avatar-empty"><Palette size={22} /></div>}
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="brand-card-title">{set ? (brand.shortName || 'Identidad de la campaña') : 'Personaliza tu campaña'}</div>
                        <div className="brand-card-sub">{set
                            ? (brand.slogan || 'Foto y color listos')
                            : 'Sube tu foto, tu nombre corto, tu slogan y tus colores para que tu equipo sepa de quién es la app.'}</div>
                    </div>
                    <button className="squishy-btn primary" onClick={() => setOpen(true)} style={{ padding: '0.5rem 0.8rem', whiteSpace: 'nowrap' }}>
                        {set ? 'Editar' : 'Personalizar'}
                    </button>
                </div>
            </div>
            {open && <BrandingEditor onClose={() => setOpen(false)} />}
        </>
    );
};

export const BrandingEditor = ({ onClose }: { onClose: () => void }) => {
    const { user } = useAuth();
    const current = useBranding(user?.tenant_id);
    const [f, setF] = useState<BrandForm>({ photo: '', shortName: '', slogan: '', color: '', rightsOk: false });
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        if (!user?.tenant_id) return;
        loadBrandForm(user.tenant_id).then(v => { setF(v); setLoaded(true); });
    }, [user?.tenant_id]);

    // Vista previa del color mientras se elige; al cerrar sin guardar se regresa al color guardado
    useEffect(() => { if (loaded) applyBrandColor(f.color || null); }, [f.color, loaded]);
    const close = () => { applyBrandColor(current.color); onClose(); };

    const pickPhoto = async (file?: File) => {
        if (!file || !user?.tenant_id) return;
        if (!file.type.startsWith('image/')) { setMsg('❌ Elige una imagen (JPG o PNG).'); return; }
        if (file.size > 15 * 1024 * 1024) { setMsg('❌ La foto pesa más de 15 MB.'); return; }
        setBusy(true); setMsg('Subiendo foto…');
        try {
            const url = await uploadBrandPhoto(user.tenant_id, file);
            setF(s => ({ ...s, photo: url })); setMsg('');
        } catch (e) { setMsg(`❌ ${(e as Error).message}`); }
        setBusy(false);
    };

    const save = async () => {
        if (!user?.tenant_id) return;
        if (f.photo && !f.rightsOk) { setMsg('⚠️ Confirma que tienes derecho a usar la foto.'); return; }
        setBusy(true); setMsg('');
        const error = await saveBrand(user.tenant_id, f);
        setBusy(false);
        if (error) { setMsg(`❌ ${error.message}`); return; }
        setMsg('✅ Listo. Tu equipo verá tu identidad la próxima vez que abra la app.');
        setTimeout(onClose, 1200);
    };

    const first = (user?.name || '').split(' ')[0] || 'Ana';
    const shown = usableColor(f.color || null);

    return (
        <div className="brand-overlay" onClick={close}>
            <div className="tactile-card brand-editor" onClick={e => e.stopPropagation()}>
                <div className="brand-editor-head">
                    <strong>🎨 Identidad de la campaña</strong>
                    <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={close} aria-label="Cerrar"><X size={16} /></button>
                </div>
                <div className="brand-note">
                    Solo la ve tu equipo dentro de la app. No aparece en páginas públicas ni en los enlaces que comparten las brigadas,
                    así que también puedes usarla en la etapa de aspirante.
                </div>

                <div className="brand-photo-row">
                    {f.photo ? <img src={f.photo} alt="Foto de la campaña" className="brand-avatar xl" /> : <div className="brand-avatar xl brand-avatar-empty">Sin foto</div>}
                    <div className="flex-col" style={{ gap: '0.4rem', flex: 1, minWidth: 0 }}>
                        <label className="squishy-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center', cursor: busy ? 'wait' : 'pointer' }}>
                            <Upload size={16} /> {f.photo ? 'Cambiar foto' : 'Subir foto'}
                            <input type="file" accept="image/*" hidden disabled={busy} onChange={e => pickPhoto(e.target.files?.[0])} />
                        </label>
                        <div style={{ fontSize: '0.75rem', color: '#9aa' }}>Se recorta en cuadro, centrada en la cara. Mejor con buena luz y fondo limpio.</div>
                        {f.photo && <button className="brand-link" onClick={() => setF(s => ({ ...s, photo: '' }))}>Quitar foto</button>}
                    </div>
                </div>
                {f.photo && (
                    <label className="brand-check">
                        <input type="checkbox" checked={f.rightsOk} onChange={e => setF(s => ({ ...s, rightsOk: e.target.checked }))} />
                        Confirmo que tengo derecho a usar esta imagen.
                    </label>
                )}

                <label className="flex-col" style={{ gap: '0.25rem' }}>
                    Nombre corto <span className="brand-hint">Como te conoce la gente. Ej.: "El Profe Helmer"</span>
                    <input className="squishy-input" maxLength={40} value={f.shortName} onChange={e => setF(s => ({ ...s, shortName: e.target.value }))} placeholder="Nombre corto" />
                </label>
                <label className="flex-col" style={{ gap: '0.25rem' }}>
                    Slogan o frase del equipo <span className="brand-hint">{f.slogan.length}/90</span>
                    <input className="squishy-input" maxLength={90} value={f.slogan} onChange={e => setF(s => ({ ...s, slogan: e.target.value }))} placeholder="Ej.: Juntos, sección por sección" />
                </label>

                <div className="flex-col" style={{ gap: '0.35rem' }}>
                    <span>Color de la campaña</span>
                    <div className="brand-palette">
                        {PALETTE.map(p => (
                            <button key={p.hex} title={p.name} aria-label={p.name} onClick={() => setF(s => ({ ...s, color: p.hex === '#FF5A36' ? '' : p.hex }))}
                                className={`brand-swatch${(f.color || '#FF5A36').toUpperCase() === p.hex ? ' on' : ''}`} style={{ background: p.hex }} />
                        ))}
                        <label className="brand-swatch brand-swatch-custom" title="Otro color">
                            <input type="color" value={f.color || '#FF5A36'} onChange={e => setF(s => ({ ...s, color: e.target.value.toUpperCase() }))} />
                        </label>
                    </div>
                    {f.color && usableColor(f.color).toUpperCase() !== f.color.toUpperCase() && (
                        <div className="brand-hint">Lo oscurecimos un poco para que el texto blanco de los botones se lea bien.</div>
                    )}
                </div>

                <div className="brand-preview" style={{ ['--bp' as any]: shown }}>
                    <div className="brand-hint" style={{ marginBottom: '0.4rem' }}>Así lo verá tu equipo</div>
                    <div className="brand-preview-head">
                        {f.photo ? <img src={f.photo} alt="" className="brand-avatar" /> : <div className="brand-avatar" style={{ background: shown }}>{first.charAt(0)}</div>}
                        <div><div style={{ fontWeight: 700 }}>Hola, {first}</div><div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Brigadista · Equipo {f.shortName || 'de tu campaña'}</div></div>
                    </div>
                    {f.slogan && <div className="brand-preview-slogan">“{f.slogan}”</div>}
                    <div className="brand-preview-btn">¡A DARLE!</div>
                </div>

                {msg && <div style={{ fontSize: '0.85rem' }}>{msg}</div>}
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                    <button className="squishy-btn" onClick={close} disabled={busy}>Cancelar</button>
                    <button className="squishy-btn primary" onClick={save} disabled={busy || !loaded}>{busy ? 'Guardando…' : 'Guardar'}</button>
                </div>
            </div>
        </div>
    );
};
