import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    let d_start = 0;
    let d_limit = 1000;
    let count = 0;

    while (true) {
        const { data: chunk, error } = await supabase.from('padron_electoral')
            .select('id')
            .eq('year', 2024)
            .order('id', { ascending: true })
            .range(d_start, d_start + d_limit - 1);

        if (error) {
            console.error("Error:", error);
            break;
        }
        if (chunk && chunk.length > 0) {
            count += chunk.length;
            if (chunk.length < d_limit) {
                console.log("Se recibieron menos de 1000 (" + chunk.length + "). Terminando loop.");
                break;
            }
        } else {
            console.log("Chunk vacío. Fin de datos.");
            break;
        }
        d_start += d_limit;
    }
    console.log("TOTAL PADRON ROWS EXTRACTED:", count);
}
run();
