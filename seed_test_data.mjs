import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// @ts-ignore
const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
// @ts-ignore
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const SURNAMES = ['Hernández', 'García', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Gómez', 'Morales', 'Vázquez', 'Jiménez', 'Reyes', 'Díaz', 'Torres', 'Ruiz', 'Mendoza'];
const NAMES = ['Juan', 'Maria', 'Jose', 'Ana', 'Luis', 'Leticia', 'Pedro', 'Rosa', 'Carlos', 'Silvia', 'Jorge', 'Guadalupe', 'Ricardo', 'Elena', 'Fernando', 'Teresa', 'Roberto', 'Adriana', 'Raul', 'Isabel'];

const SECTIONS = {
    gubernatura: ['1020', '1021', '1022', '1023', '1024', '1683', '1684', '1116', '1117', '0230'],
    ayuntamiento: ['1116', '1117', '1118', '1119', '1120', '1121', '1122', '1123'],
    dip_local: ['0230', '0231', '0232', '0233', '0234', '0235', '0236', '0237'],
    dip_federal: ['1584', '1585', '1586', '1587', '1588', '1589', '1590', '1591']
};

function getRandomName() {
    return `${NAMES[Math.floor(Math.random() * NAMES.length)]} ${SURNAMES[Math.floor(Math.random() * SURNAMES.length)]} ${SURNAMES[Math.floor(Math.random() * SURNAMES.length)]} (TEST)`;
}

function getRandomPhone() {
    return `+52${Math.floor(1000000000 + Math.random() * 9000000000)}`;
}

async function createUser(tenantId, role, rank, parentId, tenantName) {
    const name = getRandomName();
    const phone = getRandomPhone();
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const { data, error } = await supabase.from('users').insert([{
        tenant_id: tenantId,
        name,
        phone,
        role,
        rank_name: rank,
        parent_id: parentId,
        temp_code: code,
        is_first_login: true
    }]).select('id').single();

    if (error) {
        throw new Error(`Error creating user ${role}: ${error.message}`);
    }

    return {
        id: data.id,
        name,
        phone,
        role,
        code,
        tenantName
    };
}

async function seed() {
    console.log("Connected to DB via Supabase JS. Starting seeding...");

    try {
        // 1. Create Tenants
        const campaigns = [
            { name: 'Lic. Alejandro Torres (Gobernador TEST)', election_type: 'local', position: 'gubernatura', geographic_scope: 'Chiapas' },
            { name: 'Ing. Maria Elena Ruíz (SCLC TEST)', election_type: 'local', position: 'presidencia_municipal', geographic_scope: 'San Cristóbal de Las Casas' },
            { name: 'C. Juan Pérez Collazo (Chamula TEST)', election_type: 'local', position: 'diputacion_local', geographic_scope: 'Chamula' },
            { name: 'Dra. Claudia Glez (Tuxtla TEST)', election_type: 'federal', position: 'diputacion_federal', geographic_scope: 'Tuxtla Gutiérrez' }
        ];

        const tenantIds = [];
        for (const camp of campaigns) {
            const { data, error } = await supabase.from('tenants').insert([camp]).select('id').single();
            if (error) throw new Error(`Error creating tenant: ${error.message}`);

            tenantIds.push({ id: data.id, type: camp.position, name: camp.name });
            console.log(`Created tenant: ${camp.name}`);
        }

        const credentials = [];

        // 2. Create User Hierarchy for each tenant
        for (const tenant of tenantIds) {
            console.log(`Creating users for tenant ${tenant.name}...`);

            // Candidato
            const candRes = await createUser(tenant.id, 'candidato', 'Comandante Supremo', null, tenant.name);
            const candId = candRes.id;
            credentials.push(candRes);

            // Coordinador de Campaña, Comunicacion, Logistica (Reporting to Candidato)
            const staffRoles = [
                { role: 'coordinador_campana', rank: 'Alto Mando' },
                { role: 'comunicacion_digital', rank: 'Estratega Digital' },
                { role: 'coordinador_logistica', rank: 'Intendente Jefe' }
            ];

            for (const s of staffRoles) {
                const staffRes = await createUser(tenant.id, s.role, s.rank, candId, tenant.name);
                credentials.push(staffRes);
            }

            // 4 Coordinadores
            const coordIds = [];
            for (let i = 0; i < 4; i++) {
                const res = await createUser(tenant.id, 'coordinador', 'Coordinador Regional', candId, tenant.name);
                coordIds.push(res.id);
                credentials.push(res);
            }

            // 8 Lideres (2 per Coordinator)
            const liderIds = [];
            for (let i = 0; i < 8; i++) {
                const parentCoord = coordIds[Math.floor(i / 2)];
                const res = await createUser(tenant.id, 'lider', 'Líder de Sección', parentCoord, tenant.name);
                liderIds.push(res.id);
                credentials.push(res);
            }

            // 16 Brigadistas (2 per Leader)
            const brigadistaIds = [];
            for (let i = 0; i < 16; i++) {
                const parentLider = liderIds[Math.floor(i / 2)];
                const res = await createUser(tenant.id, 'brigadista', 'Agente de Campo', parentLider, tenant.name);
                brigadistaIds.push(res.id);
                credentials.push(res);
            }

            // 3. Create 200 Supporters (Allies)
            console.log(`Creating 200 supporters for tenant ${tenant.name}...`);
            const supporters = [];
            const sections = SECTIONS[tenant.type] || SECTIONS.gubernatura;

            for (let i = 0; i < 200; i++) {
                const recruiter = brigadistaIds[Math.floor(Math.random() * brigadistaIds.length)];
                const section = sections[Math.floor(Math.random() * sections.length)];
                // Coordinates around Chiapas (approx 16.75, -92.64)
                const lat = 16.7 + (Math.random() * 0.1);
                const lng = -92.7 + (Math.random() * 0.1);

                supporters.push({
                    tenant_id: tenant.id,
                    name: getRandomName().replace('(TEST)', '(ALLY TEST)'),
                    phone: getRandomPhone(),
                    curp: `ABC${Math.floor(1000000000 + Math.random() * 9000000000)}`,
                    latitude: lat,
                    longitude: lng,
                    commitment_level: Math.floor(Math.random() * 3) + 3, // 3-5
                    recruiter_id: recruiter,
                    section_id: section,
                    status: 'aprobado'
                });
            }

            // Batch insert supporters
            for (let j = 0; j < supporters.length; j += 50) {
                const chunk = supporters.slice(j, j + 50);
                const { error } = await supabase.from('supporters').insert(chunk);
                if (error) throw new Error(`Error inserting supporters: ${error.message}`);
            }
        }

        // Print Summary
        console.log("\n--- CREDENTIALS SUMMARY ---");
        let md = "# Credenciales de Acceso - Ambiente TEST\n\nAbajo encontrarás los accesos para cada campaña y rol. Úsalos para iniciar sesión en la plataforma y navegar por los distintos perfiles.\n\n";

        const tenantsGroups = {};
        credentials.forEach(c => {
            if (!tenantsGroups[c.tenantName]) tenantsGroups[c.tenantName] = [];
            tenantsGroups[c.tenantName].push(c);
        });

        for (const [tName, users] of Object.entries(tenantsGroups)) {
            md += `## ${tName}\n\n`;
            md += "| Rol | Nombre | Teléfono | Código Táctico |\n";
            md += "| :--- | :--- | :--- | :--- |\n";
            users.forEach(u => {
                md += `| ${u.role} | ${u.name} | \`${u.phone}\` | **${u.code}** |\n`;
            });
            md += "\n";
        }

        fs.writeFileSync('C:/Proyecto_Electoral/credenciales_test.md', md);
        console.log("Credentials saved to credenciales_test.md");

    } catch (err) {
        console.error("Error during seeding", err);
    }
}

seed();
