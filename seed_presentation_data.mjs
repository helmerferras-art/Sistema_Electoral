
import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const connectionString = 'postgresql://postgres:%1112Rocko@@@@db.dlpbgbldfzxyxhbnmjfn.supabase.co:5432/postgres';

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

async function seed() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log("Connected to DB. Starting seeding...");

        // 1. Create Tenants
        const campaigns = [
            { name: 'Lic. Alejandro Torres (Gobernador TEST)', type: 'local', pos: 'gubernatura', scope: 'Chiapas' },
            { name: 'Ing. Maria Elena Ruíz (SCLC TEST)', type: 'local', pos: 'presidencia_municipal', scope: 'San Cristóbal de Las Casas' },
            { name: 'C. Juan Pérez Collazo (Chamula TEST)', type: 'local', pos: 'diputacion_local', scope: 'Chamula' },
            { name: 'Dra. Claudia Glez (Tuxtla TEST)', type: 'federal', pos: 'diputacion_federal', scope: 'Tuxtla Gutiérrez' }
        ];

        const tenantIds = [];
        for (const camp of campaigns) {
            const res = await client.query(
                `INSERT INTO tenants (name, election_type, position, geographic_scope) VALUES ($1, $2, $3, $4) RETURNING id`,
                [camp.name, camp.type, camp.pos, camp.scope]
            );
            tenantIds.push({ id: res.rows[0].id, type: camp.pos });
            console.log(`Created tenant: ${camp.name}`);
        }

        const credentials = [];

        // 2. Create User Hierarchy for each tenant
        for (const tenant of tenantIds) {
            console.log(`Creating users for tenant ${tenant.id}...`);

            // Candidato
            const candRes = await createUser(client, tenant.id, 'candidato', 'Comandante Supremo', null);
            const candId = candRes.id;
            credentials.push(candRes);

            // Coordinador de Campaña, Comunicacion, Logistica (Reporting to Candidato)
            const staffRoles = [
                { role: 'coordinador_campana', rank: 'Alto Mando' },
                { role: 'comunicacion_digital', rank: 'Estratega Digital' },
                { role: 'coordinador_logistica', rank: 'Intendente Jefe' }
            ];

            for (const s of staffRoles) {
                const staffRes = await createUser(client, tenant.id, s.role, s.rank, candId);
                credentials.push(staffRes);
            }

            // 4 Coordinadores (Reporting to staff or Cand, let's say Cand for simplicity)
            const coordIds = [];
            for (let i = 0; i < 4; i++) {
                const res = await createUser(client, tenant.id, 'coordinador', 'Coordinador Regional', candId);
                coordIds.push(res.id);
                credentials.push(res);
            }

            // 8 Lideres (2 per Coordinator)
            const liderIds = [];
            for (let i = 0; i < 8; i++) {
                const parentCoord = coordIds[Math.floor(i / 2)];
                const res = await createUser(client, tenant.id, 'lider', 'Líder de Sección', parentCoord);
                liderIds.push(res.id);
                credentials.push(res);
            }

            // 16 Brigadistas (2 per Leader)
            const brigadistaIds = [];
            for (let i = 0; i < 16; i++) {
                const parentLider = liderIds[Math.floor(i / 2)];
                const res = await createUser(client, tenant.id, 'brigadista', 'Agente de Campo', parentLider);
                brigadistaIds.push(res.id);
                credentials.push(res);
            }

            // 3. Create 200 Supporters (Allies)
            console.log(`Creating 200 supporters for tenant ${tenant.id}...`);
            const supporters = [];
            const sections = SECTIONS[tenant.type] || SECTIONS.gubernatura;

            for (let i = 0; i < 200; i++) {
                const recruiter = brigadistaIds[Math.floor(Math.random() * brigadistaIds.length)];
                const section = sections[Math.floor(Math.random() * sections.length)];
                // Coordinates around Chiapas (approx 16.75, -92.64)
                const lat = 16.7 + (Math.random() * 0.1);
                const lng = -92.7 + (Math.random() * 0.1);

                supporters.push([
                    tenant.id,
                    getRandomName().replace('(TEST)', '(ALLY TEST)'),
                    getRandomPhone(),
                    `ABC${Math.floor(1000000000 + Math.random() * 9000000000)}`,
                    lat,
                    lng,
                    Math.floor(Math.random() * 3) + 3, // 3-5
                    recruiter,
                    section,
                    'aprobado'
                ]);
            }

            // Batch insert supporters
            for (let j = 0; j < supporters.length; j += 50) {
                const chunk = supporters.slice(j, j + 50);
                const placeholders = chunk.map((_, i) => `($${i * 10 + 1}, $${i * 10 + 2}, $${i * 10 + 3}, $${i * 10 + 4}, $${i * 10 + 5}, $${i * 10 + 6}, $${i * 10 + 7}, $${i * 10 + 8}, $${i * 10 + 9}, $${i * 10 + 10})`).join(',');
                const values = chunk.flat();
                await client.query(
                    `INSERT INTO supporters (tenant_id, name, phone, curp, latitude, longitude, commitment_level, recruiter_id, section_id, status) VALUES ${placeholders}`,
                    values
                );
            }
        }

        // Print Summary
        console.log("\n--- CREDENTIALS SUMMARY ---");
        let md = "# Credenciales de Acceso - Ambiente TEST\n\nAbajo encontrarás los accesos para cada campaña y rol. Todos los nombres llevan el prefijo TEST.\n\n";

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

        fs.writeFileSync('credentials_summary.md', md);
        console.log("Credentials saved to credentials_summary.md");

    } catch (err) {
        console.error("Error during seeding", err);
    } finally {
        await client.end();
    }
}

async function createUser(client, tenantId, role, rank, parentId) {
    const name = getRandomName();
    const phone = getRandomPhone();
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Get tenant name for summary
    const tRes = await client.query(`SELECT name FROM tenants WHERE id = $1`, [tenantId]);
    const tenantName = tRes.rows[0].name;

    const res = await client.query(
        `INSERT INTO users (tenant_id, name, phone, role, rank_name, parent_id, temp_code, is_first_login) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id`,
        [tenantId, name, phone, role, rank, parentId, code]
    );

    return {
        id: res.rows[0].id,
        name,
        phone,
        role,
        code,
        tenantName
    };
}

seed();
