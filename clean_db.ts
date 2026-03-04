import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

async function cleanDatabase() {
    console.log('🧹 Iniciando Protocolo de Limpieza Total...');

    // 1. Obtener al SuperAdmin para proteger su Tenant si lo tiene
    const { data: superadmins } = await supabase.from('users').select('tenant_id').eq('role', 'superadmin');
    const protectedTenantId = superadmins && superadmins.length > 0 ? superadmins[0].tenant_id : null;

    // 2. Borrar todos los supporters
    console.log('Eliminando simpatizantes...');
    const { error: suppError } = await supabase.from('supporters').delete().not('id', 'is', null);
    if (suppError) console.error('Error limpiando simpatizantes:', suppError);

    // 3. Borrar usuarios (excepto superadmin)
    console.log('Eliminando usuarios operativos...');
    const { error: userError } = await supabase.from('users').delete().neq('role', 'superadmin');
    if (userError) console.error('Error limpiando usuarios:', userError);

    // 4. Borrar Tenants (excepto el del superadmin si existe)
    console.log('Eliminando campañas (tenants)...');
    let tenantQuery = supabase.from('tenants').delete().not('id', 'is', null);
    if (protectedTenantId) {
        tenantQuery = tenantQuery.neq('id', protectedTenantId);
    }
    const { error: tenantError } = await tenantQuery;
    if (tenantError) console.error('Error limpiando tenants:', tenantError);

    console.log('✅ Base de datos purgada. Lista para carga manual.');
}

cleanDatabase().then(() => process.exit(0));
