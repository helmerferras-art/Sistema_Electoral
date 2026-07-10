import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
    console.error('[FATAL] Falta SUPABASE_DB_URL en .env (Dashboard → Settings → Database → Connection string, modo URI). No se debe commitear.');
    process.exit(1);
}

async function run() {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();

        try {
            await client.query(`ALTER TABLE tenants ADD COLUMN alliance_code TEXT UNIQUE`);
        } catch (e) {
            console.log("Column probably already exists");
        }

        const res = await client.query(`SELECT id FROM tenants WHERE alliance_code IS NULL`);
        for (let row of res.rows) {
            const randomCode = Math.random().toString(36).substring(2, 10).toUpperCase();
            await client.query(`UPDATE tenants SET alliance_code = $1 WHERE id = $2`, [randomCode, row.id]);
        }

        console.log("Alliance codes created successfully.");
    } catch (e) {
        console.error("Migration error detail:", e.message);
    } finally {
        await client.end();
    }
}
run();
