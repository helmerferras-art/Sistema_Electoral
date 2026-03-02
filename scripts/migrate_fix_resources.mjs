import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
    connectionString: 'postgresql://postgres:%1112Rocko@@@@db.dlpbgbldfzxyxhbnmjfn.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        await client.connect();
        console.log("Connected to Postgres. Applying fix...");

        // Add quantity to resource_assignments if missing
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='resource_assignments' AND column_name='quantity') THEN
                    ALTER TABLE resource_assignments ADD COLUMN quantity INTEGER DEFAULT 1;
                END IF;
            END $$;
        `);

        console.log("Migration applied successfully.");
    } catch (err) {
        console.error("Migration failed:", err);
    } finally {
        await client.end();
    }
}

migrate();
