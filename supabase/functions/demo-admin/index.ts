import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * demo-admin · El administrador del sistema maneja la demo (base aparte, tlatoani-demo) desde su panel en producción.
 *  - Solo responde a un usuario con perfil superadmin en producción.
 *  - Usa la llave de servicio de la demo guardada como secreto DEMO_SERVICE_ROLE_KEY (nunca llega al navegador).
 *  - Cada acción queda en la bitácora de producción (admin_audit_log).
 */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DEMO_URL = Deno.env.get('DEMO_SUPABASE_URL') || 'https://uukewfxjpeavsfeercmi.supabase.co';
const DEMO_KEY = Deno.env.get('DEMO_SERVICE_ROLE_KEY') || '';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PROVIDERS = ['openrouter', 'openai', 'gemini', 'groq'];
const maskIp = (ip?: string | null) => (ip ? ip.replace(/(\d+)\.(\d+)\.(\d+)\.(\d+)/, '$1.$2.x.x').replace(/^([0-9a-f]+:[0-9a-f]+):.*$/i, '$1:…') : null);

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } }, auth: { persistSession: false } });
    const prod = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData } = await asUser.auth.getUser();
    if (!authData?.user) return json({ error: 'Sin sesión' }, 401);
    const { data: me } = await prod.from('users').select('id, name, role, is_active').eq('auth_id', authData.user.id).maybeSingle();
    if (!me || me.role !== 'superadmin' || me.is_active === false) return json({ error: 'Solo el administrador del sistema' }, 403);

    if (!DEMO_KEY) return json({ error: 'Falta conectar la demo', needs_key: true }, 412);
    const demo = createClient(DEMO_URL, DEMO_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    let body: any = {};
    try { body = await req.json(); } catch { /* vacío */ }
    const action = String(body?.action || 'overview');
    const log = (summary: string, detail?: unknown) => prod.from('admin_audit_log').insert({
        actor_auth: authData.user.id, actor_name: me.name, action: 'demo', entity: 'demo', summary, detail: detail ?? null,
    });

    try {
        if (action === 'overview') {
            const since = new Date(); since.setUTCHours(6, 0, 0, 0); if (since > new Date()) since.setUTCDate(since.getUTCDate() - 1);
            const [{ data: tenants }, { data: brands }, { data: cfg }, aiToday, { data: spec }] = await Promise.all([
                demo.from('tenants').select('id, name, slug, is_sandbox, created_at, demo_last_seen, demo_ip, brand_short_name').order('created_at', { ascending: false }),
                demo.from('demo_brand').select('*').order('k'),
                demo.from('ai_config').select('provider, is_active, api_key'),
                demo.from('ai_usage_log').select('id', { count: 'exact', head: true }).eq('ok', true).gte('created_at', since.toISOString()),
                demo.rpc('fn_demo_spec'),
            ]);
            const kBySlug: Record<string, number> = {}; const nameByK: Record<number, string> = {};
            (spec || []).forEach((e: any) => { kBySlug[e.slug] = e.k; nameByK[e.k] = String(e.name || '').replace('DEMO · ', ''); });
            const now = Date.now();
            const sandboxes = (tenants || []).filter((t: any) => t.is_sandbox).map((t: any) => ({
                id: t.id, name: t.name, created_at: t.created_at, last_seen: t.demo_last_seen,
                active: !!t.demo_last_seen && now - new Date(t.demo_last_seen).getTime() < 35 * 60_000,
                ip: maskIp(t.demo_ip), brand: t.brand_short_name,
            }));
            const base = (tenants || []).filter((t: any) => !t.is_sandbox).map((t: any) => ({ id: t.id, name: t.name, slug: t.slug, k: kBySlug[t.slug] || null }));
            return json({
                ok: true, sandboxes, base,
                brands: (brands || []).map((b: any) => ({ ...b, campaign: nameByK[b.k] || `Campaña ${b.k}` })),
                ai: (cfg || []).map((c: any) => ({ provider: c.provider, is_active: c.is_active, has_key: !!(c.api_key && String(c.api_key).length > 8) })),
                ai_today: aiToday.count || 0,
            });
        }

        if (action === 'purge') {
            const id = String(body.tenant_id || '');
            if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'Demo no válida' }, 400);
            const { data, error } = await demo.rpc('fn_demo_sandbox_purge', { p_tenant: id, p_idle: '0 seconds' });
            if (error) throw error;
            await log('Cerró una demo privada', { tenant: id });
            return json({ ok: true, purged: data?.length || 0 });
        }

        if (action === 'purge_idle') {
            const { data, error } = await demo.rpc('fn_demo_sandbox_purge', { p_tenant: null, p_idle: '35 minutes' });
            if (error) throw error;
            await log('Cerró las demos inactivas', { cerradas: data?.length || 0 });
            return json({ ok: true, purged: data?.length || 0 });
        }

        if (action === 'purge_all') {
            const { data, error } = await demo.rpc('fn_demo_sandbox_purge', { p_tenant: null, p_idle: '0 seconds' });
            if (error) throw error;
            await log('Cerró todas las demos privadas', { cerradas: data?.length || 0 });
            return json({ ok: true, purged: data?.length || 0 });
        }

        if (action === 'reset_base') {
            const { error } = await demo.rpc('fn_demo_reset');
            if (error) throw error;
            await log('Reinició las campañas base de la demo');
            return json({ ok: true });
        }

        if (action === 'set_ai') {
            const provider = String(body.provider || '').toLowerCase();
            const key = String(body.api_key || '').trim();
            if (!PROVIDERS.includes(provider)) return json({ error: 'Proveedor no válido' }, 400);
            if (key.length < 12) return json({ error: 'La llave parece incompleta' }, 400);
            const { data: existing } = await demo.from('ai_config').select('id').eq('provider', provider).limit(1);
            const res = existing?.length
                ? await demo.from('ai_config').update({ api_key: key, is_active: true }).eq('provider', provider)
                : await demo.from('ai_config').insert({ provider, api_key: key, is_active: true });
            if (res.error) throw res.error;
            await log(`Guardó la llave de IA de la demo (${provider})`);
            return json({ ok: true });
        }

        if (action === 'toggle_ai') {
            const provider = String(body.provider || '').toLowerCase();
            if (!PROVIDERS.includes(provider)) return json({ error: 'Proveedor no válido' }, 400);
            const { error } = await demo.from('ai_config').update({ is_active: !!body.active }).eq('provider', provider);
            if (error) throw error;
            await log(`${body.active ? 'Activó' : 'Pausó'} la IA de la demo (${provider})`);
            return json({ ok: true });
        }

        if (action === 'save_brand') {
            const k = Number(body.k);
            const short = String(body.short_name || '').trim().slice(0, 40);
            const slogan = String(body.slogan || '').trim().slice(0, 90);
            const color = String(body.color || '').trim();
            const photo = String(body.photo || '').trim();
            if (![1, 2, 3, 4].includes(k)) return json({ error: 'Campaña no válida' }, 400);
            if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) return json({ error: 'Color no válido' }, 400);
            if (photo && !/^(\/demo-brand\/k[1-4]\.svg|https:\/\/.+)$/.test(photo)) return json({ error: 'La foto debe ser una dirección https://' }, 400);
            const row = { photo: photo || null, short_name: short || null, slogan: slogan || null, color: color || null, updated_at: new Date().toISOString() };
            const { error } = await demo.from('demo_brand').update(row).eq('k', k);
            if (error) throw error;
            // La campaña base de ese tipo toma la identidad de inmediato; las demos nuevas la heredan al crearse
            const { data: spec } = await demo.rpc('fn_demo_spec');
            const slug = (spec || []).find((e: any) => Number(e.k) === k)?.slug;
            if (slug) await demo.from('tenants').update({
                brand_photo_url: row.photo, brand_short_name: row.short_name, brand_slogan: row.slogan, brand_color: row.color,
                brand_rights_ok: true, brand_updated_at: row.updated_at,
            }).eq('slug', slug);
            await log(`Cambió la identidad de la campaña demo ${k}`, { short_name: short, slogan, color });
            return json({ ok: true });
        }

        return json({ error: 'Acción no válida' }, 400);
    } catch (e) {
        return json({ error: (e as Error).message || 'Error en la demo' }, 500);
    }
});
