import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * SCRIPT DE CONFIGURACIÓN DE RUTA CRÍTICA
 * Usa este script para definir los objetivos y misiones de tu campaña.
 * Modifica el array 'misObjetivos' con las fechas y datos reales de tu equipo.
 */
async function configurarRuta() {
    console.log("🛠️ Iniciando configuración de Ruta Crítica...");

    // 1. Obtener tu Tenant (Campaña)
    const { data: tenants } = await supabase.from('tenants').select('id, name').limit(1);
    if (!tenants || tenants.length === 0) return console.error("No se encontró ninguna campaña (Tenant).");
    const tenantId = tenants[0].id;
    console.log(`📡 Configuracion para: ${tenants[0].name}`);

    // 2. Limpiar la ruta crítica anterior (Opcional, comenta esta línea si solo quieres agregar)
    await supabase.from('critical_path').delete().eq('tenant_id', tenantId);

    // 3. Define aquí tus propios objetivos
    const misObjetivos = [
        {
            title: 'REGISTRO DE REPRESENTANTES ANTE EL IEPC',
            description: 'Asegurar que todos los representantes generales y de casilla estén validados en el sistema oficial.',
            phase: 'Candidatura',
            start_date: '2026-02-28',
            end_date: '2026-03-14',
            status: 'pendiente'
        },
        {
            title: 'CIERRE DE CAMPAÑA',
            description: 'Evento masivo de finalización de actividades proselitistas.',
            phase: 'Candidatura',
            start_date: '2026-05-24',
            end_date: '2026-05-27',
            status: 'pendiente'
        },
        {
            title: 'SIMULACRO DE CONTEO RÁPIDO',
            description: 'Prueba nacional del sistema de transmisión de resultados electorales preliminares (PREP).',
            phase: 'Eleccion',
            start_date: '2026-05-09',
            end_date: '2026-05-10',
            status: 'pendiente'
        },
        {
            title: 'DÍA D: DESPLIEGUE OPERATIVO',
            description: 'Movilización general, apertura de casillas y defensa del voto.',
            phase: 'Eleccion',
            start_date: '2026-06-07',
            end_date: '2026-06-07',
            status: 'pendiente'
        }
    ];

    // 4. Preparar y subir datos
    const objetivosParaSubir = misObjetivos.map(obj => ({
        ...obj,
        tenant_id: tenantId
    }));

    const { error } = await supabase.from('critical_path').insert(objetivosParaSubir);

    if (error) {
        console.error("❌ Error al guardar la ruta crítica:", error.message);
    } else {
        console.log(`✅ ¡Éxito! Se han configurado ${misObjetivos.length} misiones en la Ruta Crítica.`);
        console.log("🔄 Recarga tu aplicación (pestaña OBJETIVOS) para ver los cambios.");
    }
}

configurarRuta();
