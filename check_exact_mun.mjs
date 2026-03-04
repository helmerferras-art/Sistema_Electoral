import { createClient } from '@supabase/supabase-js';
const s = createClient('https://dlpbgbldfzxyxhbnmjfn.supabase.co', 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC');
async function f() {
    const p = await s.from('padron_electoral').select('municipality').eq('section_id', '1608').limit(1);
    const h = await s.from('historical_election_results').select('municipality').eq('section_id', '1608').limit(1);
    console.log('PADRON_MUN_EXACT:', p.data[0]?.municipality);
    console.log('HIST_MUN_EXACT:', h.data[0]?.municipality);
}
f();
