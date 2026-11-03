import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(url, key);

async function check() {
    const { count: tc } = await supabase.from('tenants').select('*', { count: 'exact', head: true });
    const { count: uc } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: sc } = await supabase.from('supporters').select('*', { count: 'exact', head: true });
    console.log('--- FINAL DATABASE CHECK ---');
    console.log('Tenants inserted:', tc);
    console.log('Users inserted:', uc);
    console.log('Supporters inserted:', sc);
}

check().then(() => process.exit(0));
