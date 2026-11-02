import { supabase } from './supabase';
import { getOfflineActivities, saveOfflineActivity, removeOfflineActivity, type OfflineActivity } from './indexedDB';

const BUCKET = 'activity_evidence';
let syncing = false;

const extFor = (mime: string) => {
    if (mime.includes('jpeg')) return 'jpg';
    if (mime.includes('png')) return 'png';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('webm')) return 'webm';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mp4')) return mime.startsWith('audio') ? 'm4a' : 'mp4';
    if (mime.includes('mpeg')) return 'mp3';
    if (mime.includes('aac')) return 'aac';
    return 'bin';
};

/** Sube una actividad pendiente. Es idempotente: si se corta a la mitad, el siguiente intento continúa. */
const syncOne = async (a: OfflineActivity) => {
    // 1) Crear la actividad (o recuperar su id si ya se creó en un intento anterior)
    if (!a.remote_id) {
        const { data, error } = await supabase
            .from('field_activities')
            .insert({
                tenant_id: a.tenant_id,
                user_id: a.user_id,
                activity_type: a.activity_type,
                notes: a.notes || null,
                contacts_count: a.contacts_count,
                convinced_count: a.convinced_count,
                known_count: a.known_count ?? 0,
                latitude: a.latitude,
                longitude: a.longitude,
                accuracy_m: a.accuracy_m,
                consent_confirmed: a.consent_confirmed,
                occurred_at: a.occurred_at,
                offline_id: a.offline_id,
            })
            .select('id')
            .single();

        if (error && error.code === '23505') {
            const { data: existing } = await supabase
                .from('field_activities').select('id').eq('offline_id', a.offline_id).single();
            if (!existing) throw error;
            a.remote_id = existing.id;
        } else if (error) {
            throw error;
        } else {
            a.remote_id = data.id;
        }
        await saveOfflineActivity(a);
    }

    // 2) Subir cada evidencia y registrarla
    for (const ev of a.evidences) {
        if (!ev.uploaded_path) {
            const path = `${a.tenant_id}/${a.user_id}/${a.remote_id}/${ev.local_id}.${extFor(ev.mime_type)}`;
            const { error: upErr } = await supabase.storage.from(BUCKET)
                .upload(path, ev.blob, { contentType: ev.mime_type, upsert: false });
            if (upErr && !/exists|duplicate/i.test(upErr.message)) throw upErr;

            const { error: dbErr } = await supabase.from('activity_evidence').insert({
                activity_id: a.remote_id,
                tenant_id: a.tenant_id,
                user_id: a.user_id,
                kind: ev.kind,
                storage_path: path,
                mime_type: ev.mime_type,
                size_bytes: ev.blob.size,
                duration_s: ev.duration_s ?? null,
            });
            if (dbErr && dbErr.code !== '23505') throw dbErr;

            ev.uploaded_path = path;
            await saveOfflineActivity(a);
        }
    }

    await removeOfflineActivity(a.offline_id);
};

/** Sube todo lo pendiente. Devuelve cuántas actividades se subieron y cuántas siguen pendientes. */
export const syncOfflineActivities = async (): Promise<{ synced: number; pending: number }> => {
    if (syncing || !navigator.onLine) {
        const pending = (await getOfflineActivities()).length;
        return { synced: 0, pending };
    }
    syncing = true;
    let synced = 0;
    try {
        const queue = await getOfflineActivities();
        for (const a of queue) {
            try {
                await syncOne(a);
                synced++;
            } catch (e: any) {
                a.last_error = e?.message || String(e);
                await saveOfflineActivity(a);
                console.warn('[Campo] No se pudo subir la actividad', a.offline_id, a.last_error);
            }
        }
    } finally {
        syncing = false;
    }
    const pending = (await getOfflineActivities()).length;
    if (synced > 0) window.dispatchEvent(new CustomEvent('field-activities-synced', { detail: { synced, pending } }));
    return { synced, pending };
};

let listening = false;
/** Reintenta al recuperar señal y cada 2 minutos mientras haya pendientes. */
export const startActivitySyncListener = () => {
    if (listening) return;
    listening = true;
    window.addEventListener('online', () => { syncOfflineActivities(); });
    setInterval(async () => {
        if (navigator.onLine && !document.hidden && (await getOfflineActivities()).length > 0) {
            syncOfflineActivities();
        }
    }, 120000);
    syncOfflineActivities();
};

/** Reduce una foto a máx. 1600 px y JPEG ~0.72: de 4-8 MB a ~300 KB, clave con datos móviles. */
export const compressImage = (file: File, maxSide = 1600, quality = 0.72): Promise<Blob> =>
    new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((b) => { URL.revokeObjectURL(url); resolve(b || file); }, 'image/jpeg', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
        img.src = url;
    });
