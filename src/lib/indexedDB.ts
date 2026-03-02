import { openDB } from 'idb';

const DB_NAME = 'proyecto-electoral-db';
const DB_VERSION = 1;
const STORE_SUPPORTERS = 'offline-supporters';

export const initDB = async () => {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_SUPPORTERS)) {
                db.createObjectStore(STORE_SUPPORTERS, { keyPath: 'offline_id' });
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
