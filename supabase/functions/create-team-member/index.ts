import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Qué roles puede dar de alta cada rol (cadena de mando real de la campaña).
// superadmin no aparece aquí: se maneja aparte (sin restricción de rol destino).
// comunicacion_digital y coordinador_logistica son roles terminales: no dan de alta a nadie del sistema.
export const GRANTABLE_ROLES: Record<string, string[]> = {
    candidato: ['coordinador_campana', 'comunicacion_digital', 'coordinador_logistica', 'coordinador'],
    coordinador_campana: ['comunicacion_digital', 'coordinador_logistica', 'coordinador'],
    coordinador: ['coordinador_territorial'],
    coordinador_territorial: ['lider'],
    lider: ['brigadista'],
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

const toSyntheticEmail = (phone: string) => `${phone.replace(/\D/g, '').slice(-10)}@c4i.local`;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body: any;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'JSON inválido' }, 400);
    }

    const { name, phone, role: targetRole, tenant_id: bodyTenantId, parent_id: bodyParentId, assigned_territory, two_factor_enabled } = body;

    if (!name || !phone || !targetRole) {
        return json({ error: 'Faltan campos requeridos: name, phone, role' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const authHeader = req.headers.get('Authorization');
    let callerId: string | null = null;
    let callerTenantId: string | null = null;

    if (authHeader) {
        // --- Camino autenticado: admin/coordinador/lider dando de alta a alguien de su equipo ---
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: authData, error: authErr } = await admin.auth.getUser(token);
        if (authErr || !authData?.user) {
            return json({ error: 'Sesión inválida o expirada' }, 401);
        }

        const { data: caller, error: callerErr } = await admin
            .from('users')
            .select('id, role, tenant_id')
            .eq('auth_id', authData.user.id)
            .single();

        if (callerErr || !caller) {
            return json({ error: 'Perfil de usuario no encontrado para esta sesión' }, 403);
        }

        callerId = caller.id;
        callerTenantId = caller.tenant_id;

        if (caller.role !== 'superadmin') {
            const allowed = GRANTABLE_ROLES[caller.role] || [];
            if (!allowed.includes(targetRole)) {
                return json({ error: `Tu rol (${caller.role}) no está autorizado para crear cuentas con rol "${targetRole}"` }, 403);
            }
        }
    } else {
        // --- Camino público: RegistroForm, auto-registro de voluntarios ---
        if (targetRole !== 'brigadista') {
            return json({ error: 'El registro público solo puede crear cuentas de brigadista' }, 403);
        }
        if (!bodyTenantId) {
            return json({ error: 'Falta tenant_id' }, 400);
        }
        const { data: tenantRow, error: tenantErr } = await admin
            .from('tenants')
            .select('id')
            .eq('id', bodyTenantId)
            .maybeSingle();

        if (tenantErr || !tenantRow) {
            return json({ error: 'tenant_id inválido' }, 400);
        }
    }

    const finalTenantId = callerTenantId || bodyTenantId;
    if (!finalTenantId) {
        return json({ error: 'No se pudo determinar el tenant_id' }, 400);
    }

    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+52${cleanPhone}`;
    const email = toSyntheticEmail(cleanPhone);
    const tacticalCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Re-registro: si ya existe un usuario con este teléfono, refrescar en vez de duplicar
    const { data: existingUser } = await admin
        .from('users')
        .select('id, auth_id')
        .eq('phone', formattedPhone)
        .maybeSingle();

    if (existingUser) {
        const { data: updated, error: updateErr } = await admin
            .from('users')
            .update({
                name,
                role: targetRole,
                tenant_id: finalTenantId,
                rank_name: targetRole === 'brigadista' ? 'Recluta Voluntario' : 'Recluta Nivel 1',
                is_first_login: true,
                temp_code: tacticalCode,
                code_sent: false,
                two_factor_enabled: !!two_factor_enabled,
                ...(assigned_territory ? { assigned_territory } : {}),
            })
            .eq('id', existingUser.id)
            .select()
            .single();

        if (updateErr) return json({ error: updateErr.message }, 500);

        if (existingUser.auth_id) {
            await admin.auth.admin.updateUserById(existingUser.auth_id, { password: tacticalCode });
        }

        return json({ success: true, user: updated, temp_code: tacticalCode });
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: tacticalCode,
        email_confirm: true,
        user_metadata: { phone: formattedPhone, role: targetRole },
    });

    if (createErr) {
        return json({ error: createErr.message }, 409);
    }

    const { data: newUser, error: insertErr } = await admin
        .from('users')
        .insert([{
            auth_id: created.user.id,
            name,
            phone: formattedPhone,
            role: targetRole,
            tenant_id: finalTenantId,
            parent_id: bodyParentId || callerId || null,
            rank_name: targetRole === 'brigadista' ? 'Recluta Voluntario' : 'Recluta Nivel 1',
            is_first_login: true,
            temp_code: tacticalCode,
            code_sent: false,
            two_factor_enabled: !!two_factor_enabled,
            ...(assigned_territory ? { assigned_territory } : {}),
        }])
        .select()
        .single();

    if (insertErr) {
        // Rollback: no dejar un usuario huérfano en Auth si el insert en public.users falla
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: insertErr.message }, 500);
    }

    return json({ success: true, user: newUser, temp_code: tacticalCode });
});
