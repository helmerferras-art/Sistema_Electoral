-- Puente de la plataforma (PC con Windows + celular Android o módem USB) con llave propia del equipo.
-- Reemplaza la llave maestra (service_role) que usaba el puente anterior.

-- Superadmin: dar de alta la PC del puente desde el tablero. La llave se muestra una sola vez.
create or replace function public.fn_gateway_provision_platform(p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_id text := 'pc-' || encode(extensions.gen_random_bytes(8), 'hex');
        v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not exists (select 1 from public.users where auth_id = auth.uid() and role = 'superadmin') then
    raise exception 'Solo la administración de la plataforma puede dar de alta el puente';
  end if;
  insert into public.communication_gateways (bridge_id, tenant_id, name, status, last_seen, kind, supported_methods, token_hash)
  values (v_id, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, left(coalesce(nullif(trim(p_name), ''), 'PC del puente'), 80),
          'offline', null, 'pc', '["sms"]'::jsonb, encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return json_build_object('bridge', v_id, 'token', v_token);
end $$;
revoke all on function public.fn_gateway_provision_platform(text) from public, anon;
grant execute on function public.fn_gateway_provision_platform(text) to authenticated;

-- El programa del puente se presenta: nombre del equipo y con qué envía (celular o módem). Cuenta como señal de vida.
create or replace function public.fn_gateway_hello_token(p_token text, p_name text, p_line text)
returns json language plpgsql security definer set search_path = public as $$
declare g public.communication_gateways;
begin
  g := public.fn_gateway_by_token(p_token);
  if g.bridge_id is null then raise exception 'Llave de envío inválida'; end if;
  update public.communication_gateways
     set name = coalesce(left(nullif(trim(p_name), ''), 80), name),
         phone_number = left(nullif(trim(p_line), ''), 60),
         status = case when nullif(trim(p_line), '') is null then 'offline' else 'online' end,
         last_seen = now()
   where bridge_id = g.bridge_id;
  return json_build_object('bridge', g.bridge_id, 'platform', g.tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid);
end $$;
revoke all on function public.fn_gateway_hello_token(text, text, text) from public;
grant execute on function public.fn_gateway_hello_token(text, text, text) to anon, authenticated;

-- Baja: el superadmin puede dar de baja equipos de la plataforma (además de los celulares de su campaña)
create or replace function public.fn_gateway_retire(p_bridge text)
returns boolean language sql security definer set search_path = public as $$
  update public.communication_gateways cg set status = 'offline', token_hash = null
   where cg.bridge_id = p_bridge and public.fn_gateway_can_own()
     and cg.tenant_id = (select tenant_id from public.users where auth_id = auth.uid())
  returning true
$$;

-- El estado del puente de la plataforma, para el superadmin
create or replace function public.fn_platform_bridge_status()
returns table (bridge_id text, name text, line text, online boolean, last_seen timestamptz, pendientes bigint, enviados_hoy bigint, fallidos_hoy bigint, con_llave boolean)
language sql stable security definer set search_path = public as $$
  select cg.bridge_id, cg.name, cg.phone_number,
         (cg.status = 'online' and cg.last_seen > now() - interval '2 minutes'), cg.last_seen,
         (select count(*) from public.gateway_commands c where c.bridge_id = cg.bridge_id and c.status in ('pending', 'processing')),
         (select count(*) from public.gateway_commands c where c.bridge_id = cg.bridge_id and c.status = 'completed' and c.processed_at > date_trunc('day', now())),
         (select count(*) from public.gateway_commands c where c.bridge_id = cg.bridge_id and c.status = 'failed' and c.processed_at > date_trunc('day', now())),
         cg.token_hash is not null
    from public.communication_gateways cg
   where cg.tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
     and exists (select 1 from public.users where auth_id = auth.uid() and role = 'superadmin')
   order by cg.last_seen desc nulls last
$$;
revoke all on function public.fn_platform_bridge_status() from public, anon;
grant execute on function public.fn_platform_bridge_status() to authenticated;
