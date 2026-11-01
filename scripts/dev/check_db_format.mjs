import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    const { data: padronData } = await supabase.from('padron_electoral').select('municipality').ilike('municipality', '%crist%').limit(5);
    console.log("Padron Format:", padronData);

    const { data: histData } = await supabase.from('historical_election_results').select('municipality').ilike('municipality', '%crist%').limit(5);
    console.log("Historical Format:", histData);
}
run();
