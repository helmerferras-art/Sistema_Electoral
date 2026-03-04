import { createClient } from '@supabase/supabase-js';
const s = createClient('https://dlpbgbldfzxyxhbnmjfn.supabase.co', 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC');
async function f() {
    const p77 = await s.from('padron_electoral').select('section_id').eq('municipality', '77').limit(1);
    const p077 = await s.from('padron_electoral').select('section_id').eq('municipality', '077').limit(1);
    console.log('Result 77:', p77.data);
    console.log('Result 077:', p077.data);
}
f();
