import { createClient } from '@supabase/supabase-js';
const s = createClient('https://dlpbgbldfzxyxhbnmjfn.supabase.co', 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC');
async function f() {
    const h = await s.from('historical_election_results').select('municipality').ilike('municipality', '%crist%').limit(1);
    console.log("H_Cris:", h.data);
    const p = await s.from('padron_electoral').select('municipality').eq('section_id', '1608').limit(1);
    console.log("P_1608:", p.data);
}
f();
