import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * ai-proxy · Única puerta de Tlatoani hacia los proveedores de IA.
 *  - Las llaves viven en ai_config y solo se leen aquí, con service_role. Nunca llegan al teléfono.
 *  - Cada consulta se valida por perfil, se cuenta contra un tope diario por campaña y queda en ai_usage_log.
 *  - Tareas:
 *      advisor        → asesor de estrategia (cifras agregadas que arma el cliente)
 *      acta           → lee la foto de un acta y propone las cifras (el representante confirma)
 *      section_brief  → resumen por sección con datos agregados que arma el servidor (sin datos personales)
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const COMMAND = ['superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial'];
const VISION = ['openai', 'openrouter', 'gemini'];
const MAX_IMAGE_CHARS = 4_500_000; // ~3.3 MB en base64

type Msg = { system: string; text: string; image?: string; json?: boolean };
type Cfg = { provider: string; api_key: string };

const STRATEGIST = `Eres un estratega político experto en el territorio, la demografía y los usos y costumbres de Chiapas, México.
Reglas: no sugieras tecnología inviable en zonas rurales o de alta marginación (prefiere perifoneo, asambleas, radios comunitarias y traducción a lenguas originarias);
respeta los sistemas normativos indígenas; nunca propongas condicionar apoyos, comprar o coaccionar el voto, ni desinformación.
Responde ESTRICTAMENTE con JSON válido, sin markdown.`;

const stripFence = (s: string) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

async function callProvider(cfg: Cfg, m: Msg): Promise<string> {
    const p = cfg.provider.toLowerCase();
    if (p === 'openai' || p === 'groq' || p === 'openrouter') {
        const url = p === 'openai' ? 'https://api.openai.com/v1/chat/completions'
            : p === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
        const model = p === 'openai' ? 'gpt-4o-mini' : p === 'groq' ? 'llama-3.3-70b-versatile' : 'google/gemini-2.5-flash';
        const content: unknown = m.image
            ? [{ type: 'text', text: m.text }, { type: 'image_url', image_url: { url: m.image } }]
            : m.text;
        const payload: Record<string, unknown> = {
            model, temperature: m.image ? 0 : 0.6,
            messages: [{ role: 'system', content: m.system }, { role: 'user', content }],
        };
        if (m.json && p !== 'openrouter') payload.response_format = { type: 'json_object' };
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.api_key}` };
        if (p === 'openrouter') { headers['HTTP-Referer'] = 'https://nemia.lat'; headers['X-Title'] = 'Tlatoani'; }
        const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error(`${p} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const d = await r.json();
        return stripFence(d.choices?.[0]?.message?.content || '');
    }
    if (p === 'gemini') {
        const parts: unknown[] = [{ text: `${m.system}\n\n${m.text}` }];
        if (m.image) {
            const [, mime, data] = m.image.match(/^data:([^;]+);base64,(.+)$/) || [];
            if (!data) throw new Error('Imagen inválida');
            parts.push({ inline_data: { mime_type: mime, data } });
        }
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cfg.api_key}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: m.image ? 0 : 0.6, ...(m.json ? { responseMimeType: 'application/json' } : {}) } }),
        });
        if (!r.ok) throw new Error(`gemini HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        const d = await r.json();
        return stripFence(d.candidates?.[0]?.content?.parts?.[0]?.text || '');
    }
    throw new Error(`Proveedor no soportado: ${p}`);
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const auth = req.headers.get('Authorization') || '';
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: authData } = await asUser.auth.getUser();
    if (!authData?.user) return json({ error: 'Sin sesión' }, 401);
    const { data: me } = await admin.from('users').select('id, tenant_id, role, is_active').eq('auth_id', authData.user.id).maybeSingle();
    if (!me || me.is_active === false) return json({ error: 'Usuario no válido' }, 403);

    let body: any;
    try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
    const task = String(body?.task || '');

    // ---- Permisos por tarea
    if (task === 'advisor' || task === 'section_brief') {
        if (!COMMAND.includes(me.role)) return json({ error: 'Sin permiso' }, 403);
    } else if (task === 'acta') {
        if (!COMMAND.includes(me.role)) {
            const { count } = await admin.from('poll_watchers').select('id', { count: 'exact', head: true }).eq('user_id', me.id);
            if (!count) return json({ error: 'Sin casilla asignada' }, 403);
        }
    } else return json({ error: 'Tarea no válida' }, 400);

    // ---- Tope diario por campaña
    const { data: tenant } = await admin.from('tenants').select('ai_daily_limit').eq('id', me.tenant_id).maybeSingle();
    const since = new Date(); since.setUTCHours(6, 0, 0, 0); if (since > new Date()) since.setUTCDate(since.getUTCDate() - 1); // día en hora de México
    const { count: used } = await admin.from('ai_usage_log').select('id', { count: 'exact', head: true })
        .eq('tenant_id', me.tenant_id).eq('ok', true).gte('created_at', since.toISOString());
    if ((used || 0) >= (tenant?.ai_daily_limit ?? 60)) return json({ error: 'Se alcanzó el tope diario de consultas de IA de la campaña' }, 429);

    const { data: cfgs } = await admin.from('ai_config').select('provider, api_key').eq('is_active', true).neq('api_key', '').order('created_at');
    let configs = (cfgs || []) as Cfg[];
    if (task === 'acta') configs = configs.filter(c => VISION.includes(c.provider.toLowerCase()));
    if (!configs.length) return json({ error: task === 'acta' ? 'No hay un proveedor de IA con lectura de imágenes configurado' : 'No hay IA configurada' }, 503);

    // ---- Armar la consulta
    let msg: Msg;
    let snapshot: unknown = null;
    if (task === 'advisor') {
        const prompt = String(body.prompt || '').slice(0, 30000);
        if (!prompt) return json({ error: 'Falta prompt' }, 400);
        msg = { system: STRATEGIST, text: prompt, json: true };
    } else if (task === 'acta') {
        const image = String(body.image || '');
        const options: string[] = Array.isArray(body.options) ? body.options.map((o: unknown) => String(o).slice(0, 80)).slice(0, 30) : [];
        if (!image.startsWith('data:image/') || image.length > MAX_IMAGE_CHARS) return json({ error: 'Imagen inválida o demasiado grande' }, 400);
        if (!options.length) return json({ error: 'Faltan las opciones de la boleta' }, 400);
        msg = {
            system: 'Eres un capturista que lee actas de escrutinio y cómputo de casilla de elecciones en México. Responde solo con JSON válido.',
            text: `Lee la foto del acta y devuelve los votos de cada opción, los votos nulos, los de candidaturas no registradas y el total.
Opciones de la boleta, usa exactamente estos nombres como claves: ${JSON.stringify(options)}.
Si una cifra no se lee con claridad, pon null en vez de adivinar. Si la foto no es un acta, pon "legible": false.
Formato: {"legible": true, "votos": {"<opción>": número|null}, "nulos": número|null, "no_registrados": número|null, "total": número|null, "notas": "texto breve"}`,
            image, json: true,
        };
    } else {
        const { data: d, error } = await admin.rpc('fn_section_brief_data', { p_tenant: me.tenant_id });
        if (error) return json({ error: 'No se pudieron reunir los datos' }, 500);
        snapshot = d;
        if (!(d as any)?.secciones?.length) return json({ error: 'Aún no hay datos de campo suficientes para un resumen' }, 422);
        msg = {
            system: STRATEGIST,
            text: `Con estos datos agregados por sección de la campaña "${(d as any).campana}", escribe el resumen semanal para el equipo de campaña.
Datos: ${JSON.stringify(d)}
Instrucciones:
- "resumen": 3 a 5 frases con lo más importante de la semana, con cifras.
- "secciones": para cada sección con datos, los temas que más preocupan (de las respuestas del guion y los reportes ciudadanos) y una frase de lectura.
- "prioridades": las 5 secciones donde conviene enfocar brigadas la próxima semana, ordenadas, con el porqué en una frase basada en las cifras
  (pocos validados por cada mil electores, muchas puertas sin respuesta o por volver, margen cerrado en la última elección).
- No inventes datos que no estén en la entrada. No incluyas nombres de personas.
Formato: {"resumen": "...", "secciones": [{"seccion": "...", "temas": ["..."], "lectura": "..."}], "prioridades": [{"seccion": "...", "por_que": "...", "accion": "..."}]}`,
            json: true,
        };
    }

    // ---- Llamar con respaldo entre proveedores
    let out = '', provider = '', lastErr = '';
    for (const c of configs) {
        try { out = await callProvider(c, msg); provider = c.provider; break; }
        catch (e) { lastErr = (e as Error).message; await admin.from('ai_usage_log').insert({ tenant_id: me.tenant_id, user_id: me.id, task, provider: c.provider, ok: false, error: lastErr.slice(0, 300) }); }
    }
    if (!provider) return json({ error: 'Ningún proveedor de IA respondió', detalle: lastErr.slice(0, 200) }, 502);
    await admin.from('ai_usage_log').insert({ tenant_id: me.tenant_id, user_id: me.id, task, provider, ok: true });

    let parsed: any = null;
    try { parsed = JSON.parse(out); } catch { /* se devuelve el texto */ }

    if (task === 'section_brief') {
        if (!parsed) return json({ error: 'La IA respondió en un formato no válido' }, 502);
        const { data: saved } = await admin.from('ai_section_briefs').insert({
            tenant_id: me.tenant_id, created_by: me.id, model: provider, summary: String(parsed.resumen || ''),
            sections: Array.isArray(parsed.secciones) ? parsed.secciones : [], priorities: Array.isArray(parsed.prioridades) ? parsed.prioridades : [],
            data_snapshot: snapshot,
        }).select('id, created_at').single();
        return json({ ok: true, provider, brief: { ...parsed, id: saved?.id, created_at: saved?.created_at } });
    }
    return json({ ok: true, provider, content: out, data: parsed });
});
