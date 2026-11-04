import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * demo-session · Demo privada por visitante.
 *  start  → crea una campaña ficticia sólo para esta visita y entra con el perfil elegido (sin contraseña).
 *  switch → cambia de perfil dentro de la misma demo.
 *  end    → borra la demo (datos, cuentas y archivos).
 * Las demos sin uso por 30 minutos se borran solas (pg_cron + limpieza en cada inicio).
 * No requiere JWT de Supabase para "start": la protección es por IP y por número de demos activas.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const ROLES = ['candidato', 'coordinador_campana', 'comunicacion_digital', 'coordinador_logistica', 'coordinador_territorial', 'lider', 'brigadista'];
const MAX_ACTIVE = 40;
const MAX_PER_IP_HOUR = 4;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function removeTenantFiles(tenantIds: string[]) {
    for (const bucket of ['activity_evidence', 'campaign_docs']) {
        for (const t of tenantIds) {
            const paths: string[] = [];
            const walk = async (prefix: string, depth: number) => {
                const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
                for (const it of data || []) {
                    const p = `${prefix}/${it.name}`;
                    if (it.id) paths.push(p); else if (depth < 3) await walk(p, depth + 1);
                }
            };
            await walk(t, 0);
            for (let i = 0; i < paths.length; i += 100) await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        }
    }
}

async function purgeIdle() {
    const { data } = await admin.rpc('fn_demo_sandbox_purge', { p_tenant: null, p_idle: '30 minutes' });
    if (Array.isArray(data) && data.length) await removeTenantFiles(data);
}

/** Sesión para el usuario demo del perfil pedido: crea su cuenta de acceso si no existe y emite un token de un solo uso. */
async function sessionFor(db: SupabaseClient, tenantId: string, role: string) {
    const { data: u } = await db.from('users').select('id, name, auth_id, role').eq('tenant_id', tenantId).eq('role', role)
        .order('created_at').limit(1).maybeSingle();
    if (!u) throw new Error('Ese perfil no existe en esta demo');
    const email = `demo-${u.id}@demo.tlatoani.app`;
    if (!u.auth_id) {
        const password = crypto.randomUUID() + crypto.randomUUID();
        const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { demo: true } });
        if (error || !created?.user) throw new Error('No se pudo preparar el acceso');
        await db.from('users').update({ auth_id: created.user.id, is_first_login: false }).eq('id', u.id);
    }
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkErr || !link?.properties?.hashed_token) throw new Error('No se pudo abrir la sesión');
    return { token_hash: link.properties.hashed_token, name: u.name, role: u.role };
}

async function currentDemoUser(req: Request) {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const { data } = await admin.auth.getUser(token);
    if (!data?.user) return null;
    const { data: me } = await admin.from('users').select('id, tenant_id, tenants!users_tenant_id_fkey(is_sandbox)').eq('auth_id', data.user.id).maybeSingle();
    if (!me || !(me as any).tenants?.is_sandbox) return null;
    return me as { id: string; tenant_id: string };
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const action = String(body?.action || '');
    const role = ROLES.includes(body?.role) ? body.role : 'candidato';

    try {
        if (action === 'start') {
            const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida';
            await purgeIdle();
            const { count: active } = await admin.from('tenants').select('id', { count: 'exact', head: true }).eq('is_sandbox', true);
            if ((active || 0) >= MAX_ACTIVE) return json({ error: 'Hay muchas demos abiertas en este momento. Intenta en unos minutos.' }, 429);
            const { count: mine } = await admin.from('tenants').select('id', { count: 'exact', head: true })
                .eq('is_sandbox', true).eq('demo_ip', ip).gte('created_at', new Date(Date.now() - 3600_000).toISOString());
            if ((mine || 0) >= MAX_PER_IP_HOUR) return json({ error: 'Abriste varias demos en la última hora. Intenta más tarde.' }, 429);
            const k = [1, 2, 3].includes(Number(body?.campaign)) ? Number(body.campaign) : 2;
            const { data: tenantId, error } = await admin.rpc('fn_demo_sandbox_create', { p_k: k, p_ip: ip });
            if (error || !tenantId) return json({ error: 'No se pudo crear la demo' }, 500);
            const s = await sessionFor(admin, tenantId as string, role);
            return json({ ok: true, tenant: tenantId, ...s });
        }

        const me = await currentDemoUser(req);
        if (!me) return json({ error: 'No estás en una demo' }, 401);

        if (action === 'switch') {
            await admin.from('tenants').update({ demo_last_seen: new Date().toISOString() }).eq('id', me.tenant_id);
            const s = await sessionFor(admin, me.tenant_id, role);
            return json({ ok: true, ...s });
        }
        if (action === 'end') {
            const { data } = await admin.rpc('fn_demo_sandbox_purge', { p_tenant: me.tenant_id, p_idle: '0 seconds' });
            if (Array.isArray(data) && data.length) await removeTenantFiles(data);
            return json({ ok: true });
        }
        return json({ error: 'Acción no válida' }, 400);
    } catch (e) {
        return json({ error: (e as Error).message }, 500);
    }
});
