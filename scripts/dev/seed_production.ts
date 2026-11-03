import { createClient } from '@supabase/supabase-js';
import { fakerES_MX as faker } from '@faker-js/faker';
import crypto from 'crypto';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Configuración de Chiapas
const CHIAPAS_SECCIONES = Array.from({ length: 40 }, (_, i) => (1600 + i).toString());

let globalPhoneCounter = 100;

const createUsers = (tenantId: string, role: string, count: number, zoneAssignments?: string[]) => {
    return Array.from({ length: count }).map(() => {
        globalPhoneCounter++;
        return {
            id: crypto.randomUUID(),
            tenant_id: tenantId,
            name: faker.person.fullName(),
            phone: `961000${globalPhoneCounter.toString().padStart(4, '0')}`,
            role: role,
            password_hash: 'Test12345.',
            assigned_territory: zoneAssignments ? { layer_type: "seccion", zone_ids: zoneAssignments } : null,
            is_active: true
        };
    });
};

const SUPPORTERS_PER_CAMPAIGN = 20000;
const BATCH_SIZE = 1000;

async function seedCampaign(tenantData: any, secciones: string[]) {
    console.log(`\n===========================================`);
    console.log(`🌱 Sembrando Campaña: ${tenantData.name}`);
    console.log(`===========================================`);

    const tId = crypto.randomUUID();
    tenantData.id = tId;

    // 1. Crear el Tenant
    const { admin_phone, slug, ...dbTenantData } = tenantData;
    const { error: tenantErr } = await supabase.from('tenants').insert([dbTenantData]);
    if (tenantErr) {
        fs.writeFileSync('c:\\Proyecto_Electoral\\crash_tenant.json', JSON.stringify(tenantErr, null, 2));
        throw new Error('Tenant creation failed: ' + tenantErr.message);
    }
    console.log(`✅ Tenant Creado (ID: ${tId})`);

    // 2. Crear Usuarios (Candidato, Coord Campaña, Coords Territoriales, Líderes)
    const usersToInsert = [];

    // - 1 Candidato
    usersToInsert.push({
        id: crypto.randomUUID(),
        tenant_id: tId,
        name: faker.person.fullName(),
        phone: tenantData.admin_phone,
        role: 'candidato',
        password_hash: 'Test12345.',
        assigned_territory: null,
        is_active: true
    });

    // - 1 Coordinador General
    usersToInsert.push(...createUsers(tId, 'coordinador_campana', 1));

    // - 2 Coordinadores Territoriales (Mitad de secciones cada uno)
    const midPoint = Math.floor(secciones.length / 2);
    usersToInsert.push(...createUsers(tId, 'coordinador', 1, secciones.slice(0, midPoint)));
    usersToInsert.push(...createUsers(tId, 'coordinador', 1, secciones.slice(midPoint)));

    // - 40 Líderes (1 seccion cada uno)
    for (let i = 0; i < 40; i++) {
        usersToInsert.push(...createUsers(tId, 'lider', 1, [secciones[i]]));
    }

    const { error: usersErr } = await supabase.from('users').insert(usersToInsert);
    if (usersErr) {
        fs.writeFileSync('c:\\Proyecto_Electoral\\crash_users.json', JSON.stringify(usersErr, null, 2));
        await supabase.from('tenants').delete().eq('id', tId);
        throw new Error('User creation failed: ' + usersErr.message);
    }
    console.log(`✅ ${usersToInsert.length} Usuarios (Mando y Operativos) creados.`);

    // 3. Crear Simpatizantes (20,000)
    console.log(`⏳ Generando ${SUPPORTERS_PER_CAMPAIGN} simpatizantes simulados...`);

    const recruiters = usersToInsert.filter(u => u.role !== 'candidato');

    let totalInserted = 0;
    while (totalInserted < SUPPORTERS_PER_CAMPAIGN) {
        const batch = Array.from({ length: Math.min(BATCH_SIZE, SUPPORTERS_PER_CAMPAIGN - totalInserted) }).map(() => {
            const recruiter = faker.helpers.arrayElement(recruiters);
            const rTerritory: any = recruiter.assigned_territory || {};
            const seccionAsignada = (rTerritory.zone_ids && rTerritory.zone_ids.length > 0)
                ? faker.helpers.arrayElement(rTerritory.zone_ids)
                : faker.helpers.arrayElement(secciones);

            return {
                id: crypto.randomUUID(),
                tenant_id: tId,
                name: faker.person.fullName(),
                phone: faker.phone.number({ style: 'national' }).replace(/\D/g, '').substring(0, 10),
                section_id: seccionAsignada,
                status: faker.helpers.arrayElement(['pendiente', 'aprobado', 'rechazado']),
                recruiter_id: recruiter.id,
                latitude: 16.75 + (Math.random() * 0.1),
                longitude: -93.11 + (Math.random() * 0.1)
            };
        });

        const { error: suppErr } = await supabase.from('supporters').insert(batch);
        if (suppErr) {
            fs.writeFileSync('c:\\Proyecto_Electoral\\crash_supporters.json', JSON.stringify(suppErr, null, 2));
            throw new Error('Supporters creation failed: ' + suppErr.message);
        }
        totalInserted += batch.length;
        process.stdout.write(`\r✅ Insertados: ${totalInserted} / ${SUPPORTERS_PER_CAMPAIGN}`);
    }
    console.log(`\n🎉 Campaña ${tenantData.name} lista!\n`);
}

async function main() {
    const tuxtlaSections = CHIAPAS_SECCIONES;

    console.log('Borrando datos anteriores (excepto superadmin)...');
    try {
        const { data: orphans } = await supabase.from('tenants').select('id');
        if (orphans && orphans.length > 0) {
            for (const o of orphans) {
                await supabase.from('tenants').delete().eq('id', o.id);
            }
        }
        // Force clean via JS instead of bulk delete without error checks
        await supabase.from('users').delete().neq('role', 'superadmin');
        await supabase.from('supporters').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch (e) {
        console.error("Clean error: ", e);
    }

    try {
        // DIPUTADO FEDERAL DISTRITO 6 TUXTLA
        await seedCampaign({
            name: 'DIP. FEDERAL CHIAPAS D6 (SEED)',
            slug: 'dip-fed-chis-d6-seed',
            admin_phone: '9610000001',
            description: 'Distrito Federal 6 - Tuxtla',
            election_type: 'federal',
            position: 'diputacion_federal',
            geographic_scope: 'Distrito 6',
            is_active: true
        }, tuxtlaSections);

        // PRESIDENTE MUNICIPAL TUXTLA
        await seedCampaign({
            name: 'PRESIDENCIA TUXTLA GUTIÉRREZ (SEED)',
            slug: 'presidencia-tuxtla-seed',
            admin_phone: '9610000002',
            description: 'Ayuntamiento Tuxtla Gutiérrez',
            election_type: 'local',
            position: 'presidencia_municipal',
            geographic_scope: 'Tuxtla Gutiérrez',
            is_active: true
        }, tuxtlaSections);
    } catch (e) {
        console.error("\n[!] FATAL CRASH: ", e);
        process.exit(1);
    }

    console.log(`
    ========================================================
    🔐 DATOS DE ACCESO PARA VERIFICACIÓN (Testing)
    ========================================================
    
    1. DIPUTACIÓN FEDERAL (Distrito 6)
       - Teléfono de Ingreso: 9610000001
       - Clave/Password: Test12345.
    
    2. PRESIDENCIA MUNICIPAL (Tuxtla Gutiérrez)
       - Teléfono de Ingreso: 9610000002
       - Clave/Password: Test12345.
       
    * Se han creado 2 campañas.
    * 88 Miembros de equipo (Candidatos, Coordinadores y Líderes con secciones asignadas).
    * 80,000 Simpatizantes geolocalizados totales.
    ========================================================
    `);
    process.exit(0);
}

main();
