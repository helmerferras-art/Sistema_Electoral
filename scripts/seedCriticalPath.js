import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedCriticalPath() {
    console.log("Seeding Critical Path Missions...");

    const { data: tenants } = await supabase.from('tenants').select('id').limit(1);
    if (!tenants || tenants.length === 0) return;
    const tenantId = tenants[0].id;

    // Clear existing
    await supabase.from('critical_path').delete().eq('tenant_id', tenantId);

    const missions = [
        {
            tenant_id: tenantId,
            title: "Registro de Representantes ante el IEPC",
            description: "Asegurar que todos los representantes generales y de casilla estén validados en el sistema oficial.",
            phase: "Candidatura",
            start_date: "2026-03-01",
            end_date: "2026-03-15",
            status: "en_progreso"
        },
        {
            tenant_id: tenantId,
            title: "Simulacro de Conteo Rápido",
            description: "Prueba nacional del sistema de transmisión de resultados electorales preliminares (PREP).",
            phase: "Eleccion",
            start_date: "2026-05-10",
            end_date: "2026-05-11",
            status: "pendiente"
        },
        {
            tenant_id: tenantId,
            title: "Cierre de Campaña",
            description: "Evento masivo de finalización de actividades proselitistas.",
            phase: "Candidatura",
            start_date: "2026-05-25",
            end_date: "2026-05-28",
            status: "pendiente"
        },
        {
            tenant_id: tenantId,
            title: "Capacitación de Defensores del Voto",
            description: "Taller técnico-legal para brigadistas y coordinadores sobre defensa jurídica.",
            phase: "Candidatura",
            start_date: "2026-02-20",
            end_date: "2026-02-25",
            status: "completado"
        }
    ];

    const { error } = await supabase.from('critical_path').insert(missions);

    if (error) {
        console.error("Error seeding critical path:", error.message);
    } else {
        console.log(`Successfully seeded ${missions.length} missions.`);
    }
}

seedCriticalPath();
