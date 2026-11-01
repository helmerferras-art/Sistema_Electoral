import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();
const s = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!);

async function check() {
    const { data: dbData, error } = await s.rpc('pg_query', { query: "SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'users'" });
    if (error) {
        console.log("No RPC pg_query", error.message);
        // Alternative: try to fetch anon users to see what RLS allows
        const { data, error: e2 } = await createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!).from('users').select('id, name').limit(1);
        fs.writeFileSync('c:\\Proyecto_Electoral\\policies.json', JSON.stringify({ anon_query: data, anon_error: e2 }, null, 2));
    } else {
        fs.writeFileSync('c:\\Proyecto_Electoral\\policies.json', JSON.stringify(dbData, null, 2));
    }
}
check().then(() => process.exit(0));
