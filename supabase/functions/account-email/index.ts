import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * account-email · Correo de respaldo para el código de acceso.
 *  link   (con sesión) → vincula un correo a la propia cuenta o a alguien de tu equipo que puedas dar de alta.
 *  send   (sin sesión) → si el celular tiene correo vinculado, envía ahí un código de 6 números.
 *  verify (sin sesión) → canjea ese código por una sesión.
 * El correo nunca se vincula desde la pantalla de inicio: así nadie puede quedarse con una cuenta
 * solo por conocer el celular de otra persona.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const GRANTABLE_ROLES: Record<string, string[]> = {
    candidato: ['coordinador_campana', 'comunicacion', 'comunicacion_digital', 'coordinador_logistica', 'coordinador', 'coordinador_territorial', 'lider', 'brigadista'],
    coordinador_campana: ['comunicacion', 'comunicacion_digital', 'coordinador_logistica', 'coordinador', 'coordinador_territorial', 'lider', 'brigadista'],
    coordinador: ['coordinador_territorial', 'lider', 'brigadista'],
    coordinador_territorial: ['lider', 'brigadista'],
    lider: ['brigadista'],
};

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const digits10 = (p: unknown) => String(p || '').replace(/\D/g, '').slice(-10);
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const hint = (e: string) => `${e.split('@')[0].slice(0, 1)}***@${e.split('@')[1]}`;

async function userByPhone(phone: unknown) {
    const d = digits10(phone);
    if (d.length !== 10) return null;
    const { data } = await admin.from('users').select('id, auth_id, email, phone, is_active')
        .or(`phone.eq.+52${d},phone.eq.${d}`).order('created_at', { ascending: false }).limit(1);
    return data?.[0] || null;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const action = String(body?.action || '');

    try {
        if (action === 'send') {
            const u = await userByPhone(body.phone);
            if (!u?.email || !u.auth_id || u.is_active === false) return json({ sent: false, reason: 'sin_correo' });
            const { error } = await admin.auth.signInWithOtp({ email: u.email, options: { shouldCreateUser: false } });
            if (error) return json({ sent: false, reason: /rate|seconds/i.test(error.message) ? 'espera' : 'error', error: error.message }, 429);
            return json({ sent: true, hint: hint(u.email) });
        }

        if (action === 'verify') {
            const u = await userByPhone(body.phone);
            const code = String(body.code || '').replace(/\D/g, '');
            if (!u?.email || code.length < 6) return json({ error: 'Código incorrecto' }, 401);
            const { data, error } = await admin.auth.verifyOtp({ email: u.email, token: code, type: 'email' });
            if (error || !data?.session) return json({ error: 'El código no es correcto o ya venció. Pide otro.' }, 401);
            return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
        }

        if (action === 'link') {
            const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
            const { data: auth } = await admin.auth.getUser(token);
            if (!auth?.user) return json({ error: 'Inicia sesión otra vez' }, 401);
            const { data: caller } = await admin.from('users').select('id, role, tenant_id').eq('auth_id', auth.user.id).maybeSingle();
            if (!caller) return json({ error: 'Perfil no encontrado' }, 403);

            const email = String(body.email || '').trim().toLowerCase();
            if (!validEmail(email)) return json({ error: 'Revisa el correo: parece incompleto.' }, 400);

            let target = caller as any;
            if (body.user_id && body.user_id !== caller.id) {
                const { data: t } = await admin.from('users').select('id, role, tenant_id').eq('id', body.user_id).maybeSingle();
                if (!t) return json({ error: 'Persona no encontrada' }, 404);
                const allowed = caller.role === 'superadmin' || (t.tenant_id === caller.tenant_id && (GRANTABLE_ROLES[caller.role] || []).includes(t.role));
                if (!allowed) return json({ error: 'No puedes cambiar el correo de esta persona' }, 403);
                target = t;
            }
            const { data: full } = await admin.from('users').select('id, auth_id, phone').eq('id', target.id).single();
            const { data: taken } = await admin.from('users').select('id').ilike('email', email).neq('id', target.id).limit(1);
            if (taken?.length) return json({ error: 'Ese correo ya está en uso por otra cuenta.' }, 409);
            if (full?.auth_id) {
                const d = digits10(full.phone);
                const { error } = await admin.auth.admin.updateUserById(full.auth_id, {
                    email, email_confirm: true, ...(d.length === 10 ? { phone: `+52${d}`, phone_confirm: true } : {}),
                });
                if (error) return json({ error: /already|registered|exists/i.test(error.message) ? 'Ese correo ya está en uso por otra cuenta.' : error.message }, 409);
            }
            await admin.from('users').update({ email }).eq('id', target.id);
            return json({ ok: true, hint: hint(email) });
        }

        return json({ error: 'Acción no válida' }, 400);
    } catch (e) {
        return json({ error: (e as Error).message }, 500);
    }
});
