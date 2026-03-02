import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * SIMULACIÓN DE DESPLIEGUE TÁCTICO
 * Este script añade simpatizantes gradualmente a diferentes secciones
 * para que el usuario vea cómo se "ilumina" la niebla de guerra.
 */
async function simulate() {
    console.log("🚀 Iniciando Simulación de Despliegue Radar...");

    // 1. Obtener el tenant actual
    const { data: tenants } = await supabase.from('tenants').select('id, geographic_scope').limit(1);
    if (!tenants || tenants.length === 0) return console.error("No hay tenants.");
    const tenantId = tenants[0].id;
    const scope = tenants[0].geographic_scope;

    // 2. Obtener algunas secciones con metas para iluminar
    const { data: targets } = await supabase.from('historical_election_results')
        .select('section_id, target_votes_calculated')
        .eq('election_year', 2024)
        .limit(20);

    if (!targets) return console.error("No hay metas históricas.");

    console.log(`📍 Simulando para ${targets.length} secciones en el tenant ${tenantId}`);

    for (let i = 0; i < 5; i++) {
        console.log(`📦 Batch ${i + 1}/5 - Reforzando despliegue...`);
        const newSupporters = [];

        for (const target of targets) {
            // Añadir un grupo de simpatizantes con coordenadas aproximadas (Tuxtla)
            const count = Math.floor(Math.random() * (target.target_votes_calculated * 0.2)) + 5;
            for (let j = 0; j < count; j++) {
                newSupporters.push({
                    tenant_id: tenantId,
                    name: `Simulante ${i}-${j}`,
                    phone: `961${Math.floor(Math.random() * 9000000 + 1000000)}`,
                    latitude: 16.7569 + (Math.random() - 0.5) * 0.05,
                    longitude: -93.1292 + (Math.random() - 0.5) * 0.05,
                    commitment_level: Math.floor(Math.random() * 5) + 1
                });
            }
        }

        const { error } = await supabase.from('supporters').insert(newSupporters);
        if (error) console.error("Error insertando simulación:", error.message);

        console.log(`✅ ${newSupporters.length} Aliados desplegados. Esperando actualización del satélite...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log("🏁 Simulación de Despliegue Completada.");
}

simulate();
