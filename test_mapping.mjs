import * as dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function checkUserAndSupporters() {
    const { data: users } = await supabase.from('users').select('*');
    if (!users) { console.log('No users found.'); return; }

    console.log("Users available:");
    users.forEach(u => console.log(`- ${u.email} (Role: ${u.role}, Tenant: ${u.tenant_id})`));

    const { data: supporters } = await supabase.from('supporters').select('tenant_id');
    const counts = {};
    supporters.forEach(s => {
        counts[s.tenant_id] = (counts[s.tenant_id] || 0) + 1;
    });
    console.log("Supporters by tenant_id:", counts);
}

checkUserAndSupporters();
