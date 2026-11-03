import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(url, key);

async function check() {
    const { data: tenantOrig, error: terr } = await supabase.from('tenants').insert([{ name: 'test err final', election_type: 'local' }]).select().single();
    const tId = tenantOrig?.id;
    console.log('Tenant insert error:', terr);
    if (!tId) return;

    const { data, error } = await supabase.from('users').insert([{ tenant_id: tId, name: 'test final', phone: '961000final', role: 'brigadista' }]).select();
    console.log('User insert data:', data);
    console.log('User insert error:', error);
}

check().then(() => process.exit(0));
