import { useEffect, useState } from 'react';
import { supabase, isDemoMode } from './supabase';

/**
 * Identidad de la campaña: foto, nombre corto, slogan y color.
 * Es solo para el equipo (dentro de la app): no se muestra en páginas públicas, así sirve también en la etapa de aspirante.
 */
export type Brand = {
    photo: string | null;
    shortName: string | null;
    slogan: string | null;
    color: string | null;
};

export const EMPTY_BRAND: Brand = { photo: null, shortName: null, slogan: null, color: null };
export const DEFAULT_PRIMARY = '#FF5A36';
export const BRAND_EVENT = 'tl-brand-updated';
const cacheKey = (tenant: string) => `tl_brand_${tenant}`;
const LAST_KEY = 'tl_brand_last'; // la usa el inicio de sesión en este mismo teléfono

export const hasBrand = (b: Brand | null | undefined) => !!(b && (b.photo || b.shortName || b.slogan || b.color));

const fromRow = (r: any): Brand => ({
    photo: r?.brand_photo_url || null,
    shortName: r?.brand_short_name || null,
    slogan: r?.brand_slogan || null,
    color: r?.brand_color || null,
});

export const readCachedBrand = (tenant?: string | null): Brand => {
    if (!tenant) return EMPTY_BRAND;
    try { return { ...EMPTY_BRAND, ...JSON.parse(localStorage.getItem(cacheKey(tenant)) || '{}') }; } catch { return EMPTY_BRAND; }
};

export const readLastBrand = (): Brand | null => {
    try { const b = JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); return hasBrand(b) ? b : null; } catch { return null; }
};

const remember = (tenant: string, b: Brand) => {
    try {
        localStorage.setItem(cacheKey(tenant), JSON.stringify(b));
        // La demo no deja su marca en la pantalla de inicio de sesión del teléfono
        if (!isDemoMode()) { if (hasBrand(b)) localStorage.setItem(LAST_KEY, JSON.stringify(b)); else localStorage.removeItem(LAST_KEY); }
    } catch { /* sin almacenamiento */ }
};

// ---- Color
const hexToRgb = (hex: string) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};
const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
    const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};

/** Ajusta el color para que el texto blanco de los botones se lea bien (contraste mínimo ~3:1). */
export const usableColor = (hex: string | null): string => {
    const rgb = hex ? hexToRgb(hex) : null;
    if (!rgb) return DEFAULT_PRIMARY;
    let { r, g, b } = rgb;
    for (let i = 0; i < 12 && (1.05 / (luminance({ r, g, b }) + 0.05)) < 3; i++) { r *= 0.88; g *= 0.88; b *= 0.88; }
    return rgbToHex(r, g, b);
};

export const applyBrandColor = (hex: string | null) => {
    const root = document.documentElement;
    if (!hex) { root.style.removeProperty('--primary'); root.style.removeProperty('--primary-rgb'); return; }
    const c = usableColor(hex);
    const rgb = hexToRgb(c)!;
    root.style.setProperty('--primary', c);
    root.style.setProperty('--primary-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
};

export const PALETTE: { name: string; hex: string }[] = [
    { name: 'Naranja Tlatoani', hex: '#FF5A36' }, { name: 'Guinda', hex: '#9F2241' }, { name: 'Rojo', hex: '#D62828' },
    { name: 'Azul', hex: '#1D4ED8' }, { name: 'Azul cielo', hex: '#0284C7' }, { name: 'Verde', hex: '#15803D' },
    { name: 'Verde agua', hex: '#0F766E' }, { name: 'Morado', hex: '#7C3AED' }, { name: 'Rosa', hex: '#DB2777' },
    { name: 'Dorado', hex: '#B45309' }, { name: 'Naranja', hex: '#EA580C' }, { name: 'Gris pizarra', hex: '#475569' },
];

/** Identidad de la campaña del usuario; se actualiza sola cuando alguien la edita en este teléfono. */
export const useBranding = (tenant?: string | null) => {
    const [brand, setBrand] = useState<Brand>(() => readCachedBrand(tenant));
    useEffect(() => {
        if (!tenant) { setBrand(EMPTY_BRAND); return; }
        setBrand(readCachedBrand(tenant));
        let alive = true;
        const load = async () => {
            const { data, error } = await supabase.from('tenants').select('*').eq('id', tenant).maybeSingle();
            if (!alive || error || !data) return;
            const b = fromRow(data);
            remember(tenant, b);
            setBrand(b);
        };
        load();
        const onUpd = () => load();
        window.addEventListener(BRAND_EVENT, onUpd);
        return () => { alive = false; window.removeEventListener(BRAND_EVENT, onUpd); };
    }, [tenant]);
    return brand;
};

export type BrandForm = { photo: string; shortName: string; slogan: string; color: string; rightsOk: boolean };

export const loadBrandForm = async (tenant: string): Promise<BrandForm> => {
    const { data } = await supabase.from('tenants').select('*').eq('id', tenant).maybeSingle();
    const d: any = data || {};
    return {
        photo: d.brand_photo_url || '', shortName: d.brand_short_name || '', slogan: d.brand_slogan || '',
        color: d.brand_color || '', rightsOk: !!d.brand_rights_ok,
    };
};

export const saveBrand = async (tenant: string, f: BrandForm) => {
    const { error } = await supabase.from('tenants').update({
        brand_photo_url: f.photo || null,
        brand_short_name: f.shortName.trim() || null,
        brand_slogan: f.slogan.trim() || null,
        brand_color: f.color || null,
        brand_rights_ok: f.rightsOk,
        brand_updated_at: new Date().toISOString(),
    }).eq('id', tenant);
    if (!error) window.dispatchEvent(new Event(BRAND_EVENT));
    return error;
};

/** Reduce la foto a un cuadrado de 600 px centrado (JPEG) antes de subirla. */
export const squarePhoto = (file: File, size = 600): Promise<Blob> => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2, sy = (img.height - side) / 2.6; // un poco hacia arriba: suele estar la cara
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        c.getContext('2d')!.drawImage(img, sx, Math.max(0, sy), side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo procesar la foto')), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
});

export const uploadBrandPhoto = async (tenant: string, file: File) => {
    const blob = await squarePhoto(file);
    const path = `${tenant}/identidad-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('campaign_media').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '86400' });
    if (error) throw error;
    return supabase.storage.from('campaign_media').getPublicUrl(path).data.publicUrl;
};
