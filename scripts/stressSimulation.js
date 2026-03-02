/**
 * DÍA D - Stress Simulation Script
 * Simulates high concurrent report activity during Election Day to test WebSocket stability
 * and backend performance.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function startStressTest() {
    console.log("=== INICIANDO PRUEBA DE ESTRÉS DÍA D ===");
    console.log(`URL: ${supabaseUrl}`);

    // 1. Get a dynamic tenant
    const { data: tenants } = await supabase.from('tenants').select('id').limit(1);
    if (!tenants || tenants.length === 0) {
        console.error("No tenants found to stress test.");
        return;
    }
    const TENANT_ID = tenants[0].id;
    console.log(`Target Tenant: ${TENANT_ID}`);

    const SIMULATED_REPORTERS = 5;
    const REPORTS_PER_USER = 10;
    const DELAY_BETWEEN_REPORTS = 1000;

    const targets = await getTargets(TENANT_ID);
    if (targets.length === 0) {
        console.error("No se encontraron objetivos de Día D para este tenant.");
        return;
    }

    const reporters = [];
    for (let i = 1; i <= SIMULATED_REPORTERS; i++) {
        reporters.push(simulateReporting(i, targets, TENANT_ID, DELAY_BETWEEN_REPORTS, REPORTS_PER_USER));
    }

    await Promise.all(reporters);
    console.log("=== PRUEBA DE ESTRÉS FINALIZADA ===");
}

async function getTargets(tenantId) {
    const { data } = await supabase
        .from('d_day_targets')
        .select('id')
        .eq('tenant_id', tenantId)
        .limit(20);
    return data || [];
}

async function simulateReporting(userId, targets, tenantId, delay, count) {
    console.log(`[Reporter ${userId}] Starting mission...`);

    for (let i = 0; i < count; i++) {
        const target = targets[Math.floor(Math.random() * targets.length)];
        const damage = Math.floor(Math.random() * 50) + 10;

        const { error } = await supabase
            .from('d_day_reports')
            .insert([{
                tenant_id: tenantId,
                target_id: target.id,
                report_text: `Reporte de combate simulado #${i + 1}`,
                damage_points: damage,
                latitude: 16.75 + (Math.random() * 0.1),
                longitude: -93.12 + (Math.random() * 0.1)
            }]);

        if (error) {
            console.error(`[Reporter ${userId}] Error:`, error.message);
        } else {
            console.log(`[Reporter ${userId}] Report #${i + 1} sent to target ${target.id.substring(0, 8)}...`);
        }

        await new Promise(res => setTimeout(res, delay));
    }
}

startStressTest();
