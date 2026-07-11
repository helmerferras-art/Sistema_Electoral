import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error('[FATAL] Falta VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env (Dashboard -> Settings -> API). No se debe commitear.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
});

const toSyntheticEmail = (phone) => {
    const digits = String(phone || '').replace(/\D/g, '').slice(-10);
    return `${digits}@c4i.local`;
};

const run = async () => {
    const { data: users, error } = await supabase
        .from('users')
        .select('id, phone, password_hash, temp_code, is_first_login, auth_id')
        .is('auth_id', null);

    if (error) {
        console.error('[FATAL] No se pudo leer la tabla users:', error.message);
        process.exit(1);
    }

    if (!users || users.length === 0) {
        console.log('[OK] No hay usuarios pendientes de migrar. auth_id ya está poblado para todos.');
        return;
    }

    console.log(`[INFO] ${users.length} usuario(s) sin auth_id. Migrando a auth.users...`);

    let migrated = 0, skipped = 0, failed = 0;

    for (const u of users) {
        if (!u.phone) {
            console.warn(`[SKIP] Usuario ${u.id} sin teléfono, no se puede derivar email sintético.`);
            skipped++;
            continue;
        }

        const email = toSyntheticEmail(u.phone);
        const password = (!u.is_first_login && u.password_hash) ? u.password_hash : u.temp_code;

        if (!password) {
            console.warn(`[SKIP] Usuario ${u.id} (${u.phone}) sin password_hash ni temp_code, no se puede crear en Auth.`);
            skipped++;
            continue;
        }

        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { migrated_from_users_id: u.id, phone: u.phone }
        });

        if (createErr) {
            // Re-corrida parcial: el usuario ya existe en Auth de un intento previo, solo vincular auth_id
            const alreadyExists = createErr.status === 422 || /already been registered/i.test(createErr.message || '');
            if (alreadyExists) {
                const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
                const existing = !listErr && list?.users?.find((au) => au.email === email);
                if (existing) {
                    const { error: linkErr } = await supabase.from('users').update({ auth_id: existing.id }).eq('id', u.id);
                    if (linkErr) {
                        console.error(`[FAIL] ${u.phone}: existía en Auth pero no se pudo vincular auth_id: ${linkErr.message}`);
                        failed++;
                    } else {
                        console.log(`[LINK] ${u.phone} ya existía en Auth, vinculado auth_id=${existing.id}`);
                        migrated++;
                    }
                    continue;
                }
            }
            console.error(`[FAIL] ${u.phone}: ${createErr.message}`);
            failed++;
            continue;
        }

        const { error: updateErr } = await supabase
            .from('users')
            .update({ auth_id: created.user.id })
            .eq('id', u.id);

        if (updateErr) {
            console.error(`[FAIL] ${u.phone}: usuario creado en Auth (${created.user.id}) pero no se pudo guardar auth_id: ${updateErr.message}`);
            failed++;
            continue;
        }

        console.log(`[OK] ${u.phone} -> auth_id=${created.user.id}`);
        migrated++;
    }

    console.log(`\n[RESUMEN] migrados=${migrated} saltados=${skipped} fallidos=${failed}`);
};

run();
