import 'dotenv/config';
import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
    console.error('[FATAL] Falta SUPABASE_DB_URL en .env (Dashboard → Settings → Database → Connection string, modo URI). No se debe commitear.');
    process.exit(1);
}

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        await client.connect();
        console.log("Connected to Postgres. Adding geolocation columns to 'users'...");

        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='users' AND column_name='latitude') THEN
                    ALTER TABLE users ADD COLUMN latitude DOUBLE PRECISION;
                END IF;

                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='users' AND column_name='longitude') THEN
                    ALTER TABLE users ADD COLUMN longitude DOUBLE PRECISION;
                END IF;
            END $$;
        `);

        console.log("Migration for users table applied successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

migrate();
