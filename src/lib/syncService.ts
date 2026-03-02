import { getOfflineSupporters, removeOfflineSupporter } from './indexedDB';
import { supabase } from './supabase';

export const syncOfflineData = async () => {
    // Only sync if online
    if (!navigator.onLine) {
        console.log('Currently offline, skipping sync.');
        return;
    }

    try {
        const offlineSupporters = await getOfflineSupporters();

        if (offlineSupporters.length === 0) {
            console.log('No offline supporters to sync.');
            return;
        }

        console.log(`Attempting to sync ${offlineSupporters.length} supporters...`);

        for (const supporter of offlineSupporters) {
            // Remove local-only properties before sending to Supabase
            const { saved_at_local, ...dataToSync } = supporter;

            const { error } = await supabase
                .from('supporters')
                .insert(dataToSync);

            if (error) {
                // If it's a unique constraint error (23505) on offline_id, it means it was already synced
                if (error.code === '23505') {
                    console.log(`Supporter ${supporter.offline_id} already exists in DB, removing from local.`);
                    await removeOfflineSupporter(supporter.offline_id);
                } else {
                    console.error('Error syncing supporter:', error);
                }
            } else {
                console.log(`Successfully synced supporter: ${supporter.name}`);
                // Remove from IndexedDB after successful sync
                await removeOfflineSupporter(supporter.offline_id);
            }
        }
    } catch (err) {
        console.error('Unhandled error during sync:', err);
    }
};

// Setup listeners to automatically trigger sync when coming online
export const setupSyncListeners = () => {
    window.addEventListener('online', () => {
        console.log('Network is back online, triggering sync...');
        syncOfflineData();
    });
};
