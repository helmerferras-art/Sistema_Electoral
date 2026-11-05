-- La demo pública se movió a un proyecto de Supabase aparte (tlatoani-demo, ref uukewfxjpeavsfeercmi).
-- Producción ya no crea demos privadas: la función demo-session de producción responde 410, se quitó el
-- cron 'demo-privadas-limpieza' y se borraron las 3 campañas DEMO (viven ahora en tlatoani-demo).
-- Además, la función que siembra campañas ficticias quedaba abierta a cualquiera: se restringe al servidor.
revoke all on function public.fn_demo_seed_campaign(jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.fn_demo_seed_campaign(jsonb, text, boolean) to service_role;
alter function public.fn_demo_phone set search_path = public, extensions;
alter function public.fn_plan_block set search_path = public, extensions;
alter function public.fn_demo_spec set search_path = public, extensions;
