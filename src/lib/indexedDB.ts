import { openDB } from 'idb';

const DB_NAME = 'proyecto-electoral-db';
const DB_VERSION = 2;
const STORE_SUPPORTERS = 'offline-supporters';
const STORE_ACTIVITIES = 'offline-activities';

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_SUPPORTERS)) {
                db.createObjectStore(STORE_SUPPORTERS, { keyPath: 'offline_id' });
            }
            // v2: bitácora de campo (actividad + evidencias como Blob) pendiente de subir
            if (!db.objectStoreNames.contains(STORE_ACTIVITIES)) {
                db.createObjectStore(STORE_ACTIVITIES, { keyPath: 'offline_id' });
            }
        },
    });
};

export const saveOfflineSupporter = async (supporterData: any) => {
    const db = await initDB();
    const tx = db.transaction(STORE_SUPPORTERS, 'readwrite');
    const store = tx.objectStore(STORE_SUPPORTERS);

    // Create a unique offline ID if it doesn't exist
    if (!supporterData.offline_id) {
        supporterData.offline_id = crypto.randomUUID();
    }

    // Keep track of when it was saved locally
    supporterData.saved_at_local = new Date().toISOString();

    await store.put(supporterData);
    await tx.done;
    console.log('Supporter saved offline:', supporterData);
    return supporterData;
};

export const getOfflineSupporters = async () => {
    const db = await initDB();
    return db.getAll(STORE_SUPPORTERS);
};

export const removeOfflineSupporter = async (offline_id: string) => {
    const db = await initDB();
    const tx = db.transaction(STORE_SUPPORTERS, 'readwrite');
    await tx.objectStore(STORE_SUPPORTERS).delete(offline_id);
    await tx.done;
};

// ─── Bitácora de campo ───────────────────────────────────────────────

export interface OfflineEvidence {
    local_id: string;
    kind: 'foto' | 'audio' | 'video';
    blob: Blob;
    mime_type: string;
    duration_s?: number;
    uploaded_path?: string; // se llena al subir, para no repetir la subida si falla el resto
}

export interface OfflineActivity {
    offline_id: string;
    tenant_id: string;
    user_id: string;
    activity_type: string;
    notes: string;
    contacts_count: number;
    convinced_count: number;
    known_count?: number; // contactados que ya conocían al aspirante/candidato
    latitude: number | null;
    longitude: number | null;
    accuracy_m: number | null;
    consent_confirmed: boolean;
    occurred_at: string;
    evidences: OfflineEvidence[];
    remote_id?: string; // id en Supabase una vez creada la actividad
    last_error?: string;
}

export const saveOfflineActivity = async (activity: OfflineActivity) => {
    const db = await initDB();
    await db.put(STORE_ACTIVITIES, activity);
    return activity;
};

export const getOfflineActivities = async (): Promise<OfflineActivity[]> => {
    const db = await initDB();
    return db.getAll(STORE_ACTIVITIES);
};

export const removeOfflineActivity = async (offline_id: string) => {
    const db = await initDB();
    await db.delete(STORE_ACTIVITIES, offline_id);
};
