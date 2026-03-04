/**
 * Utility to discover the active SMS Gateway Bridge port
 */

let cachedPort: number | null = null;
let lastScanTime = 0;
const SCAN_COOLDOWN = 120000; // 2 minutes
const SEARCH_RANGE = [5000, 5001, 5002, 5003, 5004, 5005];

export const bridgeDiscovery = {
    /**
     * Finds the active bridge by scanning ports.
     * Returns the base URL (e.g., http://localhost:5000)
     */
    async getBaseUrl(): Promise<string | null> {
        const now = Date.now();

        // 1. Try cached port first (always allowed)
        if (cachedPort) {
            try {
                const res = await fetch(`http://localhost:${cachedPort}/status`, { signal: AbortSignal.timeout(1200) });
                if (res.ok) return `http://localhost:${cachedPort}`;
            } catch (e) {
                cachedPort = null;
            }
        }

        // 2. Check cooldown for full scan
        if (now - lastScanTime < SCAN_COOLDOWN) {
            return null;
        }

        // 3. Scan ports
        lastScanTime = now;
        for (const port of SEARCH_RANGE) {
            try {
                const res = await fetch(`http://localhost:${port}/status`, { signal: AbortSignal.timeout(1000) });
                if (res.ok) {
                    cachedPort = port;
                    console.log(`[BRIDGE] Encontrado en puerto ${port}`);
                    return `http://localhost:${port}`;
                }
            } catch (e) {
                // Ignore connection errors during scan
            }
        }

        return null;
    }
};
