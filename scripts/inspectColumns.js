import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// We need the SERVICE_ROLE_KEY to run RPC or raw SQL if possible, 
// but since we only have the anon key usually, we might need to use a trick 
// or hope the user has an RPC for it.
// Alternatively, I'll just try to use the REST API to see if I can find an alternative column name.

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    const { data, error } = await supabase
        .from('resource_assignments')
        .select('*')
        .limit(1);

    if (data && data.length > 0) {
        console.log("Current columns:", Object.keys(data[0]));
    } else {
        console.log("No data to inspect.");
    }
}

inspect();
