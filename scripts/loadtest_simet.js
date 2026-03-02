import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("ERROR: No se encontraron las variables VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el archivo .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runPhase(name, concurrency, totalRequests) {
    console.log(`\n--- FASE: ${name} (Concurrencia: ${concurrency}, Total: ${totalRequests}) ---`);

    const startTime = Date.now();
    let successCount = 0;
    let errorCount = 0;
    const latencies = [];

    const requestsPerWorker = Math.ceil(totalRequests / concurrency);

    const workers = [];
    for (let i = 0; i < concurrency; i++) {
        workers.push((async () => {
            for (let j = 0; j < requestsPerWorker; j++) {
                const reqStart = Date.now();
                try {
                    // Acción táctica: Consultar simpatizantes (LECTURA PESADA)
                    const { error } = await supabase
                        .from('supporters')
                        .select('id, name')
                        .limit(10);

                    const reqEnd = Date.now();
                    latencies.push(reqEnd - reqStart);

                    if (error) {
                        errorCount++;
                    } else {
                        successCount++;
                    }
                } catch (e) {
                    errorCount++;
                }
            }
        })());
    }

    await Promise.all(workers);
    const totalTime = Date.now() - startTime;
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    console.log(`Finalizado en: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`Éxitos: ${successCount} | Errores: ${errorCount}`);
    console.log(`Latencia Media: ${avgLatency.toFixed(2)}ms`);
    console.log(`Tasa de Éxito: ${((successCount / totalRequests) * 100).toFixed(2)}%`);

    return { successCount, errorCount, avgLatency };
}

async function startLoadTest() {
    console.log("==========================================");
    console.log("BOMBARDEO TÁCTICO: PRUEBA DE CARGA SIMET");
    console.log("==========================================");

    try {
        // Fase 1: Carga Normal
        await runPhase("OPERACIÓN NORMAL", 10, 50);

        // Fase 2: Carga de Combate
        await runPhase("HORA PICO (DÍA D)", 50, 100);

        // Fase 3: Punto de Quiebre
        await runPhase("ESTRÉS EXTREMO", 150, 300);

    } catch (error) {
        console.error("Fallo catastrófico en la prueba:", error);
    }

    console.log("\n==========================================");
    console.log("        MISIÓN DE TESTING FINALIZADA");
    console.log("==========================================");
}

startLoadTest();
