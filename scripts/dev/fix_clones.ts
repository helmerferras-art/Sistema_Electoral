import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!; // use Service Role to bypass RLS for this fix
const supabase = createClient(url, key);

async function fix() {
    console.log('1. LIMPIANDO CLONES FANTASMAS DE DEVLOGIN...');
    const { data: ghosts } = await supabase.from('users').select('id, name, phone, role').like('name', 'Usuario %');

    if (ghosts && ghosts.length > 0) {
        console.log(`Borrando ${ghosts.length} clones...`);
        for (const g of ghosts) {
            await supabase.from('users').delete().eq('id', g.id);
        }
        console.log('Clones eliminados.');
    } else {
        console.log('No se detectaron clones brigadistas.');
    }

    // Comprobar la cuenta original
    const { data: real } = await supabase.from('users').select('name, role, phone').eq('phone', '9610000001');
    console.log('Estado de la cuenta original: ', real);
}

fix().then(() => process.exit(0));
