import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Misma cadena de mando que create-team-member: qué rol puede otorgar cada rol.
const GRANTABLE_ROLES: Record<string, string[]> = {
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

/** ¿ancestorId aparece en algún punto de la cadena parent_id de userId? Profundidad máxima de seguridad: 10. */
const isAncestorOf = async (admin: any, ancestorId: string, userId: string): Promise<boolean> => {
    let currentId = userId;
    for (let i = 0; i < 10; i++) {
        const { data } = await admin.from('users').select('parent_id').eq('id', currentId).maybeSingle();
        if (!data?.parent_id) return false;
        if (data.parent_id === ancestorId) return true;
        currentId = data.parent_id;
    }
    return false;
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
        return json({ error: 'Se requiere sesión para promover usuarios' }, 401);
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'JSON inválido' }, 400);
    }

    const { target_user_id, new_role } = body;
    if (!target_user_id || !new_role) {
        return json({ error: 'Faltan campos requeridos: target_user_id, new_role' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

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

    const { data: target, error: targetErr } = await admin
        .from('users')
        .select('id, role, tenant_id, parent_id')
        .eq('id', target_user_id)
        .single();

    if (targetErr || !target) {
        return json({ error: 'Usuario objetivo no encontrado' }, 404);
    }

    if (target.tenant_id !== caller.tenant_id) {
        return json({ error: 'El usuario objetivo no pertenece a tu campaña' }, 403);
    }

    // superadmin y candidato están en el origen de toda la cadena de su campaña: no necesitan
    // verificación de ancestro, siempre son "superiores" a cualquiera dentro de su tenant.
    const isTopLevel = caller.role === 'superadmin' || caller.role === 'candidato';

    if (!isTopLevel) {
        const isDirectParent = target.parent_id === caller.id;
        const isAncestor = isDirectParent || await isAncestorOf(admin, caller.id, target.id);
        if (!isAncestor) {
            return json({ error: 'Solo quien dio de alta a este usuario, o un nivel jerárquico superior en su cadena, puede modificarlo' }, 403);
        }
    }

    const allowed = caller.role === 'superadmin' ? null : GRANTABLE_ROLES[caller.role] || [];
    if (allowed !== null && !allowed.includes(new_role)) {
        return json({ error: `Tu rol (${caller.role}) no puede asignar el rol "${new_role}"` }, 403);
    }

    const { data: updated, error: updateErr } = await admin
        .from('users')
        .update({ role: new_role })
        .eq('id', target.id)
        .select()
        .single();

    if (updateErr) {
        return json({ error: updateErr.message }, 500);
    }

    return json({ success: true, user: updated });
});
