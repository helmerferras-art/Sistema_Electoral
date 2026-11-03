import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function extractOtp() {
    const { data, error } = await supabase.from('users').select('name, phone, role, temp_code').in('phone', ['9610000001', '9610000002']);
    console.log('--- 2FA TOKENS (temp_code) ---');
    console.log(JSON.stringify(data, null, 2));
}

extractOtp().then(() => process.exit(0));
