import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });

const toSyntheticEmail = (phone: string) => `${phone.replace(/\D/g, '').slice(-10)}@c4i.local`;

/**
 * Segundo factor de login. El cliente ya validó la contraseña en verifyOtp (y AuthContext
 * cerró esa sesión sin dejarla activa); aquí solo se valida el código de 6 dígitos enviado
 * por SMS y, si coincide, se emite un magic-link server-side (requiere service_role) que el
 * cliente canjea con supabase.auth.verifyOtp para obtener una sesión real.
 */
Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let body: any;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'JSON inválido' }, 400);
    }

    const { phone, code } = body;
    if (!phone || !code) {
        return json({ error: 'Faltan phone o code' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
    const formattedPhone = `+52${cleanPhone}`;

    const { data: userRows, error: lookupErr } = await admin
        .from('users')
        .select('id, phone, auth_id, temp_code, temp_code_expires_at')
        .or(`phone.eq.${formattedPhone},phone.eq.${cleanPhone}`)
        .limit(1);

    const target = !lookupErr && userRows && userRows[0];
    if (!target) {
        return json({ error: 'Usuario no encontrado' }, 404);
    }

    if (!target.temp_code || String(target.temp_code).trim() !== String(code).trim()) {
        return json({ error: 'Código 2FA incorrecto' }, 401);
    }

    if (target.temp_code_expires_at && new Date(target.temp_code_expires_at) < new Date()) {
        return json({ error: 'Código 2FA expirado, solicita uno nuevo' }, 401);
    }

    if (!target.auth_id) {
        return json({ error: 'Esta cuenta no tiene sesión de Auth vinculada' }, 500);
    }

    // Invalidar el código de un solo uso
    await admin.from('users').update({ temp_code: null, temp_code_expires_at: null }).eq('id', target.id);

    const email = toSyntheticEmail(target.phone);
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });

    if (linkErr || !linkData?.properties?.hashed_token) {
        return json({ error: linkErr?.message || 'No se pudo generar el token de sesión' }, 500);
    }

    return json({ success: true, email, token_hash: linkData.properties.hashed_token });
});
