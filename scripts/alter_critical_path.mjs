import { Client } from 'pg';

const client = new Client({
    connectionString: 'postgresql://postgres:%1112Rocko@@@@db.dlpbgbldfzxyxhbnmjfn.supabase.co:5432/postgres',
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
