import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
    const { error } = await supabase.from('candidate_mappings').select('id').limit(1);
    if (error && error.code === 'PGRST116' || error?.message?.includes('does not exist')) {
        console.log("TABLE_MISSING");
    } else if (error) {
        console.log("ERROR:", error.message);
    } else {
        console.log("TABLE_EXISTS");
    }
}

test();
