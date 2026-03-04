import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_ANON_KEY!;
const supabase = createClient(url, key);

async function testInsert() {
    const results: any = {};
    const tId = crypto.randomUUID();
    const { error: tErr } = await supabase.from('tenants').insert([{
        id: tId,
        name: 'DEBUG TENANT 1',
        is_active: true
    }]);
    results.tenantErr = tErr;

    const { error: uErr } = await supabase.from('users').insert([{
        id: crypto.randomUUID(),
        tenant_id: tId,
        name: 'DEBUG USER 1',
        phone: `9610${Math.floor(Math.random() * 900000)}`,
        role: 'brigadista',
        password_hash: 'Test12345.',
        is_active: true
    }]);
    results.userErr = uErr;

    fs.writeFileSync('c:\\Proyecto_Electoral\\debug_results.json', JSON.stringify(results, null, 2));
}

testInsert().then(() => process.exit(0));
