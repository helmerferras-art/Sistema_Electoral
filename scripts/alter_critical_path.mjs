import 'dotenv/config';
import { Client } from 'pg';

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
    console.error('[FATAL] Falta SUPABASE_DB_URL en .env (Dashboard → Settings → Database → Connection string, modo URI). No se debe commitear.');
    process.exit(1);
}

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function addTargetRole() {
    try {
        await client.connect();
        console.log("Connected to Supabase DB. Altering critical_path table...");

        const alterQuery = `
            ALTER TABLE critical_path 
            ADD COLUMN IF NOT EXISTS target_role TEXT DEFAULT 'todos';
        `;

        await client.query(alterQuery);
        console.log("Successfully added target_role column to critical_path table.");
    } catch (err) {
        console.error("Error altering table:", err);
    } finally {
        await client.end();
    }
}

addTargetRole();
