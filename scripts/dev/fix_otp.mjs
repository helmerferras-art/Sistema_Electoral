import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('role, name, phone, temp_code')
            .eq('phone', '+521771127611')
            .single();

        console.log("FEDERAL CANDIDATE DB STATUS:", data);
        if (error) console.error("ERROR:", error.message);

        // Let's force update the code to exactly what's in the markdown
        await supabase
            .from('users')
            .update({ temp_code: '497933' })
            .eq('phone', '+521771127611');

        console.log("Forced code to 497933");
    } catch (e) {
        console.error("Script error:", e);
    }
}
run();
