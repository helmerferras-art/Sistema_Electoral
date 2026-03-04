import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    const { data, error } = await supabase.rpc('fn_get_map_supporters');
    fs.writeFileSync('error_log.json', JSON.stringify(error, null, 2));
}
run();
