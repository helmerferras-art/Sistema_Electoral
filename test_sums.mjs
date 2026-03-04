import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    console.log("Comprobando Padron... SCLC");
    const { data: pData } = await supabase.from('padron_electoral').select('padron_total, num_casilla, section_id').ilike('municipality', '%San Cri%').limit(10);
    console.log("Padron (10 Muestras):", pData);

    const { data: vData } = await supabase.from('padron_electoral').select('sum(padron_total)').ilike('municipality', '%San Cri%').single();
    // Wait, let's just fetch all and sum manually since postgREST sum syntax is tricky
    const { data: pAll } = await supabase.from('padron_electoral').select('padron_total').ilike('municipality', '%San Cri%');
    const totalP = pAll?.reduce((acc, row) => acc + (row.padron_total || 0), 0);
    console.log("PADRON TOTAL SCLC DB:", totalP);

    console.log("Comprobando Resultados. SCLC");
    const { data: hAll } = await supabase.from('historical_election_results').select('total_votes').ilike('municipality', '%San Cri%').eq('election_type', 'gubernatura');
    const totalH = hAll?.reduce((acc, row) => acc + (row.total_votes || 0), 0);
    console.log("VOTACION TOTAL SCLC DB (Gubernatura):", totalH);
}
run();
