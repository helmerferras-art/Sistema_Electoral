-- Celular dedicado: el mando lo da de alta desde el tablero y recibe una llave para configurarlo por cable (ADB),
-- sin que nadie inicie sesión en ese celular. Queda "fuera de línea" hasta que el servicio haga su primera consulta,
-- para que mientras tanto los códigos sigan saliendo por otro equipo.
create or replace function public.fn_gateway_provision(p_name text, p_phone text)
returns json language plpgsql security definer set search_path = public as $$
declare me record; v_id text := 'cel-' || encode(extensions.gen_random_bytes(8), 'hex');
        v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select id, tenant_id into me from public.users where auth_id = auth.uid();
  if me.id is null or not public.fn_gateway_can_own() then
    raise exception 'Solo el candidato o la coordinación de campaña pueden dar de alta un celular de envíos';
  end if;
  insert into public.communication_gateways (bridge_id, tenant_id, name, status, last_seen, kind, owner_user, phone_number, supported_methods, token_hash)
  values (v_id, me.tenant_id, left(coalesce(nullif(trim(p_name), ''), 'Celular dedicado'), 80), 'offline', null, 'android', me.id,
          left(nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), ''), 20), '["sms","wa"]'::jsonb,
          encode(extensions.digest(v_token, 'sha256'), 'hex'));
  return json_build_object('bridge', v_id, 'token', v_token);
end $$;
revoke all on function public.fn_gateway_provision(text, text) from public, anon;
grant execute on function public.fn_gateway_provision(text, text) to authenticated;

-- El mando también puede dar de baja cualquier celular de su campaña (revoca su llave)
create or replace function public.fn_gateway_retire(p_bridge text)
returns boolean language sql security definer set search_path = public as $$
  update public.communication_gateways cg set status = 'offline', token_hash = null
   where cg.bridge_id = p_bridge and cg.kind = 'android' and public.fn_gateway_can_own()
     and cg.tenant_id = (select tenant_id from public.users where auth_id = auth.uid())
  returning true
$$;
revoke all on function public.fn_gateway_retire(text) from public, anon;
grant execute on function public.fn_gateway_retire(text) to authenticated;
