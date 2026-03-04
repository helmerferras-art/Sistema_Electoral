/**
 * BridgeService - Capa de abstracción para el Puente de Hardware C4I
 * Interactúa con el servidor local scripts/sms_bridge.js descubriendo su puerto.
 */

import { bridgeDiscovery } from './bridgeDiscovery';

export interface BridgeDevice {
    id: string;
    model: string;
    status: 'connected' | 'unauthorized' | 'offline';
    sentToday: number;
}

export interface BridgeStatus {
    isOnline: boolean;
    devices: BridgeDevice[];
}

const getBridgeUrl = async () => {
    const url = await bridgeDiscovery.getBaseUrl();
    return url || 'http://localhost:5000';
};

export const BridgeService = {
    /**
     * Verifica si el puente local está corriendo y tiene equipos listos
     */
    async getStatus(): Promise<BridgeStatus> {
        try {
            const url = await getBridgeUrl();
            const resp = await fetch(`${url}/status`, {
                signal: AbortSignal.timeout(2000)
            });
            if (!resp.ok) throw new Error('Bridge offline');

            const data = await resp.json();
            return {
                isOnline: true,
                devices: data.devices || []
            };
        } catch (err) {
            return { isOnline: false, devices: [] };
        }
    },

    /**
     * Envía un SMS con el código de acceso
     */
    async sendSMS(phone: string, message: string): Promise<boolean> {
        try {
            const url = await getBridgeUrl();
            const resp = await fetch(`${url}/send-sms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, message })
            });
            return resp.ok;
        } catch (err) {
            console.error('[BridgeService] Error enviando SMS:', err);
            return false;
        }
    },

    /**
     * Envía un mensaje de WhatsApp con el código de acceso
     */
    async sendWhatsApp(phone: string, message: string): Promise<boolean> {
        try {
            const url = await getBridgeUrl();
            const resp = await fetch(`${url}/send-wa`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, message })
            });
            return resp.ok;
        } catch (err) {
            console.error('[BridgeService] Error enviando WhatsApp:', err);
            return false;
        }
    },

    /**
     * Vincula el puente local con el tenant actual
     */
    async pairBridge(tenant_id: string, name: string): Promise<boolean> {
        try {
            const url = await getBridgeUrl();
            const resp = await fetch(`${url}/pair-gateway`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tenant_id, name })
            });
            return resp.ok;
        } catch (err) {
            console.error('[BridgeService] Error vinculando puente:', err);
            return false;
        }
    }
};
