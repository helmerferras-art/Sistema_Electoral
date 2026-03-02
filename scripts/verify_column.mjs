import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyColumn() {
    const { data, error } = await supabase
        .from('historical_election_results')
        .select('candidate_names')
        .limit(1);

    if (error) {
        console.log("COLUMN_MISSING: " + error.message);
    } else {
        console.log("COLUMN_EXISTS");
    }
}

verifyColumn();
