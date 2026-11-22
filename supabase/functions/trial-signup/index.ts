import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * trial-signup · Crear campaña gratis (Plan Arranque) solo con el celular.
 * Crea la cuenta con un código de un solo uso que se envía por SMS (puente de la plataforma);
 * la persona entra después en "Iniciar sesión" con su celular y ese código, y crea su contraseña.
 * El código nunca viaja al navegador.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const MAX_PER_IP_DAY = 3;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let b: any;
    try { b = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

    const d = String(b?.phone || '').replace(/\D/g, '').slice(-10);
    const name = String(b?.name || '').trim();
    const campaign = String(b?.campaign || '').trim();
    if (d.length !== 10) return json({ estado: 'falta_telefono' });
    if (name.length < 3 || campaign.length < 3) return json({ estado: 'faltan_datos' });
    if (!b?.accept) return json({ estado: 'falta_aceptar' });
    const phone = `+52${d}`;
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'desconocida';

    try {
        const { data: existing } = await admin.from('users').select('id').or(`phone.eq.${phone},phone.eq.${d}`).limit(1);
        if (existing?.length) return json({ estado: 'telefono_registrado' });

        const { count } = await admin.from('tenants').select('id', { count: 'exact', head: true })
            .eq('plan', 'arranque').eq('demo_ip', ip).gte('created_at', new Date(Date.now() - 86400_000).toISOString());
        if ((count || 0) >= MAX_PER_IP_DAY) return json({ estado: 'demasiadas' }, 429);

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const { data: created, error: cErr } = await admin.auth.admin.createUser({
            email: `${d}@c4i.local`, password: code, email_confirm: true,
            phone, phone_confirm: true, user_metadata: { phone, role: 'candidato' },
        });
        if (cErr || !created?.user) return json({ estado: 'telefono_registrado' });

        const { data: res, error: rErr } = await admin.rpc('fn_create_trial_campaign_for', {
            p_auth: created.user.id, p_name: name, p_phone: d, p_cargo: b.cargo || 'presidencia_municipal',
            p_estado: b.estado || '', p_municipio: b.municipio || '', p_campaign: campaign, p_accept: true, p_version: String(b.version || ''),
        });
        const estado = (res as any)?.estado;
        if (rErr || estado !== 'ok') {
            await admin.auth.admin.deleteUser(created.user.id);
            return json({ estado: estado || 'error' }, rErr ? 500 : 200);
        }

        await admin.from('users').update({ temp_code: code, code_sent: false, is_first_login: true }).eq('auth_id', created.user.id);
        await admin.from('tenants').update({ demo_ip: ip }).eq('id', (res as any).tenant);
        const { data: queued } = await admin.rpc('fn_queue_first_login_code', { p_phone: phone });
        return json({ estado: 'ok', sms: !!queued });
    } catch (e) {
        return json({ estado: 'error', error: (e as Error).message }, 500);
    }
});
