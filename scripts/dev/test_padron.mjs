import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const s = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
s.from('padron_electoral').select('section_id, municipality, padron_total, hombres, mujeres').limit(3).then(res => {
    console.dir(res.data, { depth: null });
});
