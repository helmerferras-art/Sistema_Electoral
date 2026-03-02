import { getDb } from './db.js';
import { createClient } from '@supabase/supabase-js';

const SYNC_INTERVAL_MS = 60000; // 1 Minuto

export class SyncEngine {
    private isRunning = false;
    private intervalParams: ReturnType<typeof setInterval> | null = null;

    public start() {
        if (this.isRunning) return;
        this.isRunning = true;

        console.log("[C4I SyncEngine] Iniciando Motor de Sincronización...");
        this.intervalParams = setInterval(() => this.cycle(), SYNC_INTERVAL_MS);

        // Ejecución inmediata del primer ciclo
        this.cycle();
    }

    public stop() {
        if (this.intervalParams) {
            clearInterval(this.intervalParams);
            this.intervalParams = null;
        }
        this.isRunning = false;
        console.log("[C4I SyncEngine] Motor Detenido.");
    }

    private async cycle() {
        try {
            const db = getDb();
            const settings = db.prepare('SELECT * FROM local_settings ORDER BY id DESC LIMIT 1').get() as any;

            if (!settings || !settings.is_configured || !settings.relay_url) {
                console.log("[C4I SyncEngine] Omitiendo ciclo. Nodo no configurado.");
                return;
            }

            console.log(`[C4I SyncEngine] Ejecutando sincronización con Relay: ${settings.relay_url}`);

            // 1. PULL: Descargar nuevos registros del Supabase Relay
            await this.pullFromRelay(settings, db);

            // 2. PUSH: Subir reportes / cambios pendientes locales a Supabase
            // await this.pushToRelay(settings, db);

            // 3. ACTUALIZAR Heartbeat
            db.prepare('UPDATE local_settings SET last_sync = CURRENT_TIMESTAMP WHERE id = ?').run(settings.id);

        } catch (error) {
            console.error("[C4I SyncEngine] Error durante el ciclo de sincronización:", error);
        }
    }

    private async pullFromRelay(settings: any, db: any) {
        if (!settings.relay_url) return;

        console.log(`[C4I SyncEngine] -> Simulando extracción (Vacuum) de registros desde la nube...`);
        try {
            // 1. Instanciar Supabase al vuelo con las credenciales maestras de este Local Node
            // NOTA: En un despliegue real, requeriríamos la service_role key almacenada off-grid
            // o bien autenticar con el handshakeToken. Asumiremos variables de entorno para la KEY por ahora.
            const supaKey = process.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY_FALLBACK";
            const supabase = createClient(settings.relay_url, supaKey);

            // 2. Extraer "Activistas" y "Reportes"
            const { data: supporters, error: errSupporters } = await supabase
                .from('supporters')
                .select('*')
                .limit(500);

            if (errSupporters) throw errSupporters;

            // 3. Insertarlos en la DB Local (SQLite)
            if (supporters && supporters.length > 0) {
                const insertStmt = db.prepare(`
                    INSERT INTO local_supporters (id, phone, name, curp, voter_key, section_id, latitude, longitude, needs_sync) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                    ON CONFLICT(phone) DO UPDATE SET 
                        name = excluded.name, latitude = excluded.latitude, longitude = excluded.longitude
                 `);

                const deleteLocalSql = db.transaction((supData: any[]) => {
                    for (const sup of supData) {
                        insertStmt.run(
                            sup.id, sup.phone, sup.name, sup.curp,
                            sup.voter_key, sup.section_id, sup.latitude, sup.longitude
                        );
                    }
                });

                deleteLocalSql(supporters);
                console.log(`[C4I SyncEngine] -> ${supporters.length} activistas guardados localmente.`);

                // 4. [VACUUM] Borrarlos del Relay (Nube) para ahorrar costos
                const idsToDelete = supporters.map((s: any) => s.id);
                const { error: delErr } = await supabase.from('supporters').delete().in('id', idsToDelete);
                if (delErr) {
                    console.error("[C4I SyncEngine] -> ADVERTENCIA: No se pudo limpiar Supabase:", delErr);
                } else {
                    console.log("[C4I SyncEngine] -> Sincronización completa. Módulo Nube limpiado exitosamente (Vacuum).");
                }
            } else {
                console.log("[C4I SyncEngine] -> Sin datos nuevos en Operativa Nube.");
            }

        } catch (error) {
            console.error("[C4I SyncEngine] Falló el Vacuum de Activistas:", error);
        }

        try {
            // 5. Extraer "Peticiones/Reportes"
            const queryClient = createClient(settings.relay_url, process.env.VITE_SUPABASE_ANON_KEY || "");
            const { data: petitions, error: errPetitions } = await queryClient
                .from('petitions')
                .select('*')
                .limit(500);

            if (errPetitions) throw errPetitions;

            if (petitions && petitions.length > 0) {
                const insertRepStmt = db.prepare(`
                    INSERT INTO local_reports (id, type, description, status, latitude, longitude, needs_sync) 
                    VALUES (?, ?, ?, ?, ?, ?, 0)
                    ON CONFLICT(id) DO UPDATE SET status = excluded.status
                 `);

                const saveReports = db.transaction((repData: any[]) => {
                    for (const rep of repData) {
                        insertRepStmt.run(
                            rep.id, rep.category || 'petition', rep.description,
                            rep.status, rep.location_lat, rep.location_lng
                        );
                    }
                });

                saveReports(petitions);
                console.log(`[C4I SyncEngine] -> ${petitions.length} reportes guardados localmente.`);

                // 6. [VACUUM] Borrarlos del Relay
                const repIdsToDelete = petitions.map((p: any) => p.id);
                const { error: delRepErr } = await queryClient.from('petitions').delete().in('id', repIdsToDelete);

                if (delRepErr) {
                    console.error("[C4I SyncEngine] -> ADVERTENCIA: No se pudo limpiar reportes en Supabase:", delRepErr);
                }
            }
        } catch (error) {
            console.error("[C4I SyncEngine] Falló el Vacuum de Peticiones:", error);
        }
    }
}
