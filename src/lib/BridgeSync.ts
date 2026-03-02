import { supabase } from './supabase';
import { BridgeService } from './BridgeService';

/**
 * BridgeSync - Centinela de entrega diferida
 * Detecta conexión con el hardware y despacha códigos en cola.
 */
let isRunning = false;
let intervalId: any = null;

export const BridgeSync = {
    /**
     * Procesa todos los usuarios que tienen un código generado pero no enviado.
     */
    async processQueue() {
        // 1. Verificar si hay hardware listo
        const status = await BridgeService.getStatus();
        const readyDevices = status.devices.filter(d => d.status === 'connected');

        if (!status.isOnline || readyDevices.length === 0) {
            return;
        }

        // 2. Buscar usuarios con códigos pendientes de envío
        const { data: pendingUsers, error } = await supabase
            .from('users')
            .select('id, phone, temp_code, name')
            .eq('code_sent', false)
            .not('temp_code', 'is', null);

        if (error || !pendingUsers || pendingUsers.length === 0) {
            if (error) console.error('[BridgeSync] Error consultando cola:', error);
            return;
        }

        console.log(`[BridgeSync] Puente ONLINE. Despachando ${pendingUsers.length} códigos pendientes:`, pendingUsers.map(u => u.phone));

        // 3. Despachar envíos
        for (const user of pendingUsers) {
            const message = `🛡️ NEMIA C4I: Hola ${user.name.split(' ')[0]}, tu código de acceso táctico es: ${user.temp_code}. Úsalo para activar tu perfil.`;

            let success = await BridgeService.sendWhatsApp(user.phone, message);

            if (!success) {
                console.log(`[BridgeSync] WhatsApp falló para ${user.phone}, intentando SMS...`);
                success = await BridgeService.sendSMS(user.phone, message);
            }

            if (success) {
                console.log(`[BridgeSync] Código enviado exitosamente a ${user.phone}`);
                await supabase
                    .from('users')
                    .update({ code_sent: true })
                    .eq('id', user.id);
            } else {
                console.warn(`[BridgeSync] Fallo crítico al enviar a ${user.phone}. Se reintentará.`);
            }
        }
    },

    /**
     * Inicia el monitoreo periódico
     */
    startWatcher() {
        if (isRunning) return;
        isRunning = true;

        console.log('[BridgeSync] Centinela C4I activo (Modo Silencioso).');
        this.processQueue();
        intervalId = setInterval(() => this.processQueue(), 30000);
    },

    stopWatcher() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            isRunning = false;
        }
    }
};
