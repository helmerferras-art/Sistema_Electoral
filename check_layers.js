const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read env vars from a file if necessary or just use what we know
// I'll try to find the supabase config in the project
const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'MISSING';

if (supabaseKey === 'MISSING') {
    console.log("Error: SUPABASE_SERVICE_ROLE_KEY not found in env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLayers() {
    const { data, error } = await supabase.from('global_map_layers').select('*').eq('is_active', true);
    if (error) {
        console.error("Error fetching layers:", error);
        return;
    }
    console.log("Active Layers:", JSON.stringify(data, null, 2));
}

checkLayers();
