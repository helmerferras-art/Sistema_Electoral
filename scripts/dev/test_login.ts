import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(url, key);

async function check() {
    console.log('--- ALL TUXTLA SEED USERS ---');
    const { data, error } = await supabase.from('users').select('name, phone, role').ilike('phone', '%961000000%');
    console.log('Error:', error?.message);
    console.log('Data:', data);

    if (data?.length === 0) {
        console.log('Wait, let me look at the last 10 inserted users to see how they look...');
        const { data: latest } = await supabase.from('users').select('name, phone, role').order('created_at', { ascending: false }).limit(10);
        console.log('Latest:', latest);
    }
}
check();
