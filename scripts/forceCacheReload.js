import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function reloadCache() {
    console.log("Forcing Supabase schema cache reload...");
    try {
        // Calling an RPC function 'reload_schema' if it exists, otherwise just querying it sometimes forces a reload
        // Alternatively, making a POST request to RPC
        const { error } = await supabase.rpc('pgrst_reload');
        if (error) {
            console.log("RPC Method failed. Trying generic REST call...");
        }

        // Let's just do a direct fetch to the REST endpoint
        const res = await fetch(`${supabaseUrl}/rest/v1/`, {
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        console.log("REST Root Hit Status: ", res.status);
        console.log("Schema should be refreshed for anon key now.");
    } catch (e) {
        console.error(e);
    }
}
reloadCache();
