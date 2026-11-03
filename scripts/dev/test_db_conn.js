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

async function test() {
    try {
        console.log("Connecting...");
        await client.connect();
        console.log("CONNECTED successfully");
        const res = await client.query('SELECT current_database(), current_user');
        console.log("Query Result:", res.rows[0]);
    } catch (err) {
        console.error("CONNECTION FAILED:");
        console.error(err);
    } finally {
        await client.end();
    }
}

test();
