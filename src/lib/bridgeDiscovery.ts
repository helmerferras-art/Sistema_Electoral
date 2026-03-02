/**
 * Utility to discover the active SMS Gateway Bridge port
 */

let cachedPort: number | null = null;
const SEARCH_RANGE = [5000, 5001, 5002, 5003, 5004, 5005];

export const bridgeDiscovery = {
    /**
     * Finds the active bridge by scanning ports.
     * Returns the base URL (e.g., http://localhost:5000)
     */
    async getBaseUrl(): Promise<string | null> {
        // 1. Try cached port first
        if (cachedPort) {
            try {
                const res = await fetch(`http://localhost:${cachedPort}/status`, { signal: AbortSignal.timeout(1200) });
                if (res.ok) return `http://localhost:${cachedPort}`;
            } catch (e) {
                cachedPort = null;
            }
        }

        // 2. Scan ports
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
