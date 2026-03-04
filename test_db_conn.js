
const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    host: 'db.dlpbgbldfzxyxhbnmjfn.supabase.co',
    database: 'postgres',
    password: '%1112Rocko@@@@',
    port: 5432,
    ssl: { rejectUnauthorized: false }
});

async function test() {
    try {
        console.log("Connecting to:", client.options.host);
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
