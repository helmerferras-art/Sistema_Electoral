import pg from 'pg';
import fs from 'fs';

const connectionString = "postgresql://postgres.ncyiylzylgclnblfcyly:Pulsar_V15_1985@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

async function applyMigrations() {
    console.log("Conectando a la base de datos para aplicar la migración de alianzas...");
    const client = new pg.Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const sql = fs.readFileSync('setup_alliances.sql', 'utf8');
        console.log("Ejecutando SQL...");
        await client.query(sql);
        console.log("¡Migración completada con éxito!");
    } catch (e) {
        console.error("Error ejecutando migración SQL:", e);
    } finally {
        await client.end();
    }
}

applyMigrations();
