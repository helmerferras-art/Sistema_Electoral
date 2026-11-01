import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const res = await supabase.from('padron_electoral').select('section_id, municipality, padron_total, hombres, mujeres').limit(5);
    await fs.writeFile('padron_dump.json', JSON.stringify(res.data, null, 2));
    console.log("Written to padron_dump.json");
}

run();
