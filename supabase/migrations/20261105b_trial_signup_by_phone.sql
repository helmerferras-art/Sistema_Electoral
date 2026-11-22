-- Acceso solo con celular y código por SMS (se retira el correo de respaldo y Google).
-- Plan Arranque: la función trial-signup crea la cuenta y manda el código por SMS.

-- 1) Si la campaña aún no tiene puente de SMS propio, el código sale por el puente de la plataforma.
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.fn_queue_first_login_code(text)'::regprocedure);
  if position('aaaaaaaa-0000-0000-0000-000000000001' in d) = 0 then
    d := replace(d,
      'if v_bridge is null then return false; end if;',
      'if v_bridge is null then
    select bridge_id into v_bridge from public.communication_gateways
     where tenant_id = ''aaaaaaaa-0000-0000-0000-000000000001''::uuid order by last_seen desc nulls last limit 1;
  end if;
  if v_bridge is null then return false; end if;');
    execute d;
  end if;
end
$do$;

-- 2) Alta de la campaña para una cuenta creada por el servidor (la persona entra después con su código).
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.fn_create_trial_campaign(text,text,text,text,text,text,boolean,text)'::regprocedure);
  d := replace(d, 'FUNCTION public.fn_create_trial_campaign(p_name text', 'FUNCTION public.fn_create_trial_campaign_for(p_auth uuid, p_name text');
  d := replace(d, 'v_auth uuid := auth.uid();', 'v_auth uuid := p_auth;');
  execute d;
end
$do$;
revoke all on function public.fn_create_trial_campaign_for(uuid, text, text, text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.fn_create_trial_campaign_for(uuid, text, text, text, text, text, text, boolean, text) to service_role;
