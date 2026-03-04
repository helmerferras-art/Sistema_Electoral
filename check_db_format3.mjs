import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    const { data: pData } = await supabase.from('padron_electoral').select('municipality, section_id').limit(5);
    console.log("Padron Format Array:", JSON.stringify(pData));

    const { data: hData } = await supabase.from('historical_election_results').select('municipality, section_id').limit(5);
    console.log("Hist Format Array:", JSON.stringify(hData));
}
run();
