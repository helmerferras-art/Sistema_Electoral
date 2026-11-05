-- Celular de la campaña como puente de SMS (sin PC).
-- La app Android "Tlatoani Envíos" se registra con la sesión de quien la activa (candidato o coordinación de campaña),
-- recoge solo los mensajes de su campaña y los envía desde su propio chip. Sin llave maestra en ningún equipo.

alter table public.communication_gateways add column if not exists kind text not null default 'pc';
alter table public.communication_gateways add column if not exists owner_user uuid references public.users(id) on delete set null;
alter table public.communication_gateways add column if not exists phone_number text;

-- Seguridad: la cola llevaba los códigos de acceso de todos y cualquier persona de la campaña podía leerla.
-- Ahora solo el mando ve la cola, y nunca los mensajes del sistema (códigos de acceso y de seguridad).
drop policy if exists "Gateway commands tenant select" on public.gateway_commands;
create policy "Gateway commands tenant select" on public.gateway_commands for select to authenticated
  using (created_by is not null and public.fn_is_command_role()
         and bridge_id in (select g.bridge_id from public.communication_gateways g where g.tenant_id = any (public.fn_current_tenant_scope())));
drop policy if exists "Gateway commands tenant insert" on public.gateway_commands;
create policy "Gateway commands tenant insert" on public.gateway_commands for insert to authenticated
  with check (created_by = auth.uid() and public.fn_is_command_role()
              and bridge_id in (select g.bridge_id from public.communication_gateways g where g.tenant_id = any (public.fn_current_tenant_scope())));

-- Qué puente usar: el celular o la PC de la campaña con señal reciente; si no, el de la plataforma.
create or replace function public.fn_pick_bridge(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select bridge_id from (
    select bridge_id, 1 pri, last_seen from public.communication_gateways
     where tenant_id = p_tenant and status = 'online' and last_seen > now() - interval '5 minutes'
    union all
    select bridge_id, 2, last_seen from public.communication_gateways
     where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid and status = 'online' and last_seen > now() - interval '5 minutes'
    union all
    -- Nadie con señal: se encola al equipo de la campaña (lo enviará al reconectarse) o, si no tiene, al de la plataforma
    select bridge_id, 3, last_seen from public.communication_gateways where tenant_id = p_tenant
    union all
    select bridge_id, 4, last_seen from public.communication_gateways where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
  ) b order by pri, last_seen desc nulls last limit 1
$$;
revoke all on function public.fn_pick_bridge(uuid) from public, anon, authenticated;

-- Usarlo en el envío de códigos (primer acceso y verificación en dos pasos)
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.fn_queue_first_login_code(text)'::regprocedure);
  d := regexp_replace(d, 'select bridge_id into v_bridge from public\.communication_gateways\s+where tenant_id = v_user\.tenant_id order by last_seen desc nulls last limit 1;', 'v_bridge := public.fn_pick_bridge(v_user.tenant_id);');
  execute d;
  d := pg_get_functiondef('public.fn_issue_2fa_code()'::regprocedure);
  d := regexp_replace(d, 'select bridge_id into v_bridge from public\.communication_gateways\s+where tenant_id = u\.tenant_id order by last_seen desc nulls last limit 1;', 'v_bridge := public.fn_pick_bridge(u.tenant_id);');
  execute d;
end
$do$;

-- Quién puede convertir su celular en puente
create or replace function public.fn_gateway_can_own()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where auth_id = auth.uid() and role in ('superadmin', 'candidato', 'coordinador_campana'))
$$;

-- Registrar (o reactivar) este celular como puente de la campaña. Devuelve su identificador.
create or replace function public.fn_gateway_register(p_bridge text, p_device text, p_phone text)
returns text language plpgsql security definer set search_path = public as $$
declare me record; v_id text := nullif(trim(coalesce(p_bridge, '')), '');
begin
  select id, tenant_id into me from public.users where auth_id = auth.uid();
  if me.id is null or not public.fn_gateway_can_own() then raise exception 'Solo el candidato o la coordinación de campaña pueden activar el envío desde su celular'; end if;
  if v_id is not null and not exists (select 1 from public.communication_gateways where bridge_id = v_id and owner_user = me.id) then v_id := null; end if;
  if v_id is null then v_id := 'cel-' || encode(extensions.gen_random_bytes(8), 'hex'); end if;
  insert into public.communication_gateways (bridge_id, tenant_id, name, status, last_seen, kind, owner_user, phone_number, supported_methods)
  values (v_id, me.tenant_id, left(coalesce(p_device, 'Celular'), 80), 'online', now(), 'android', me.id, left(p_phone, 20), '["sms","wa"]'::jsonb)
  on conflict (bridge_id) do update set status = 'online', last_seen = now(), name = excluded.name, phone_number = coalesce(excluded.phone_number, communication_gateways.phone_number);
  return v_id;
end $$;

-- Recoger mensajes pendientes. Cuenta como señal de vida. Toma también los de puentes de la misma campaña que ya no responden.
create or replace function public.fn_gateway_pull(p_bridge text, p_limit int default 5)
returns table (id uuid, type text, phone text, message text, is_code boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare g record;
begin
  select cg.* into g from public.communication_gateways cg join public.users u on u.id = cg.owner_user
   where cg.bridge_id = p_bridge and u.auth_id = auth.uid();
  if g.bridge_id is null then raise exception 'Este celular no está activado para enviar mensajes'; end if;
  update public.communication_gateways set status = 'online', last_seen = now() where bridge_id = p_bridge;
  -- Reintentos: lo que quedó "procesando" más de 10 minutos vuelve a la fila
  update public.gateway_commands c set status = 'pending'
   where c.bridge_id = p_bridge and c.status = 'processing' and c.processed_at < now() - interval '10 minutes';
  -- Adoptar pendientes de puentes caídos de la misma campaña
  update public.gateway_commands c set bridge_id = p_bridge
   where c.status = 'pending' and c.bridge_id in (
     select cg.bridge_id from public.communication_gateways cg
      where cg.tenant_id = g.tenant_id and cg.bridge_id <> p_bridge and (cg.last_seen is null or cg.last_seen < now() - interval '5 minutes'));
  return query
  with picked as (
    select c.id from public.gateway_commands c
     where c.bridge_id = p_bridge and c.status = 'pending' and c.created_at > now() - interval '1 day'
     order by c.created_at limit greatest(1, least(p_limit, 20))
     for update skip locked)
  update public.gateway_commands c set status = 'processing', processed_at = now()
    from picked where c.id = picked.id
  returning c.id, c.type, c.phone, c.message, (c.created_by is null);
end $$;

-- Resultado del envío
create or replace function public.fn_gateway_report(p_cmd uuid, p_ok boolean, p_error text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.gateway_commands c set status = case when p_ok then 'completed' else 'failed' end,
         processed_at = now(), error_log = left(p_error, 300)
   where c.id = p_cmd and c.bridge_id in (
     select cg.bridge_id from public.communication_gateways cg join public.users u on u.id = cg.owner_user where u.auth_id = auth.uid());
  return found;
end $$;

-- Apagar el envío desde este celular
create or replace function public.fn_gateway_off(p_bridge text)
returns boolean language sql security definer set search_path = public as $$
  update public.communication_gateways cg set status = 'offline'
    from public.users u where u.id = cg.owner_user and u.auth_id = auth.uid() and cg.bridge_id = p_bridge
  returning true
$$;

-- Estado para el tablero: qué equipos envían los mensajes de la campaña
create or replace function public.fn_gateway_status()
returns table (bridge_id text, name text, kind text, phone_number text, online boolean, last_seen timestamptz, pendientes bigint)
language sql stable security definer set search_path = public as $$
  select cg.bridge_id, cg.name, cg.kind, cg.phone_number,
         (cg.status = 'online' and cg.last_seen > now() - interval '5 minutes'), cg.last_seen,
         (select count(*) from public.gateway_commands c where c.bridge_id = cg.bridge_id and c.status in ('pending', 'processing'))
    from public.communication_gateways cg
   where public.fn_is_command_role() and cg.tenant_id = (select tenant_id from public.users where auth_id = auth.uid())
   order by cg.last_seen desc nulls last
$$;

revoke all on function public.fn_gateway_can_own(), public.fn_gateway_register(text, text, text), public.fn_gateway_pull(text, int),
  public.fn_gateway_report(uuid, boolean, text), public.fn_gateway_off(text), public.fn_gateway_status() from public, anon;
grant execute on function public.fn_gateway_can_own(), public.fn_gateway_register(text, text, text), public.fn_gateway_pull(text, int),
  public.fn_gateway_report(uuid, boolean, text), public.fn_gateway_off(text), public.fn_gateway_status() to authenticated;

-- Reenviar el código de primer acceso por SMS o por WhatsApp (el celular de la campaña lo muestra para enviarlo con un toque)
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.fn_queue_first_login_code(text)'::regprocedure);
  d := replace(d, 'FUNCTION public.fn_queue_first_login_code(p_phone text)', 'FUNCTION public.fn_queue_login_code(p_phone text, p_channel text)');
  d := replace(d, 'values (v_bridge, ''sms'',', 'values (v_bridge, case when p_channel = ''wa'' then ''wa'' else ''sms'' end,');
  d := replace(d, 'and g.created_at > now() - interval ''2 minutes''', 'and g.type = case when p_channel = ''wa'' then ''wa'' else ''sms'' end and g.created_at > now() - interval ''2 minutes''');
  execute d;
end
$do$;
revoke all on function public.fn_queue_login_code(text, text) from public;
grant execute on function public.fn_queue_login_code(text, text) to anon, authenticated;
