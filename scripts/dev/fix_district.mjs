import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    try {
        console.log("Actualizando scope geográfico de Dra. Claudia Glez...");
        const { data, error } = await supabase
            .from('tenants')
            .update({ geographic_scope: 'Distrito 6' })
            .ilike('name', '%Claudia Glez%')
            .select();

        if (error) throw error;
        console.log("Tenant actualizado:", data);

    } catch (e) {
        console.error("Error:", e);
    }
}

run();
