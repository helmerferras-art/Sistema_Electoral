-- Solo SMS. Orden de envío de los códigos:
--   1) el puente de la plataforma (PC con módem/celular) si está en línea;
--   2) si no está o no pudo enviar, el celular de la campaña con la app Tlatoani Envíos.
-- Se quita el alta por cable (modo desarrollador) y el canal de WhatsApp.

create or replace function public.fn_pick_bridge(p_tenant uuid)
returns text language sql stable security definer set search_path = public as $$
  select bridge_id from (
    select bridge_id, 1 pri, last_seen from public.communication_gateways
     where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid and status = 'online' and last_seen > now() - interval '5 minutes'
    union all
    select bridge_id, 2, last_seen from public.communication_gateways
     where tenant_id = p_tenant and status = 'online' and last_seen > now() - interval '5 minutes'
    union all
    -- Nadie con señal: se encola al puente (y el celular de la campaña lo toma si se conecta antes)
    select bridge_id, 3, last_seen from public.communication_gateways where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
    union all
    select bridge_id, 4, last_seen from public.communication_gateways where tenant_id = p_tenant and (kind <> 'android' or token_hash is not null)
  ) b order by pri, last_seen desc nulls last limit 1
$$;
revoke all on function public.fn_pick_bridge(uuid) from public, anon, authenticated;

-- Reenvío del código: solo por SMS
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.fn_queue_login_code(text,text)'::regprocedure);
  d := replace(d, 'case when p_channel = ''wa'' then ''wa'' else ''sms'' end', '''sms''');
  execute d;
end
$do$;

-- El celular de la campaña recoge también los códigos de su campaña que el puente no envió
-- (puente sin señal más de 2 minutos, o que falló al enviar en los últimos 30 minutos).
create or replace function public.fn_gateway_pull_token(p_token text, p_limit int default 5)
returns table (id uuid, type text, phone text, message text, is_code boolean, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare g public.communication_gateways;
begin
  g := public.fn_gateway_by_token(p_token);
  if g.bridge_id is null then raise exception 'Llave de envío inválida'; end if;
  update public.communication_gateways set status = 'online', last_seen = now() where bridge_id = g.bridge_id;
  update public.gateway_commands c set status = 'pending'
   where c.bridge_id = g.bridge_id and c.status = 'processing' and c.processed_at < now() - interval '10 minutes';
  -- Pendientes de otros equipos caídos de la misma campaña
  update public.gateway_commands c set bridge_id = g.bridge_id
   where c.status = 'pending' and c.bridge_id in (
     select cg.bridge_id from public.communication_gateways cg
      where cg.tenant_id = g.tenant_id and cg.bridge_id <> g.bridge_id and (cg.last_seen is null or cg.last_seen < now() - interval '5 minutes'));
  -- Códigos de esta campaña que el puente de la plataforma no pudo enviar
  update public.gateway_commands c set bridge_id = g.bridge_id, status = 'pending', error_log = null
   where c.created_by is null and c.created_at > now() - interval '30 minutes'
     and c.bridge_id in (select cg.bridge_id from public.communication_gateways cg where cg.tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid)
     and (c.status = 'failed'
          or (c.status = 'pending' and c.created_at < now() - interval '2 minutes'
              and not exists (select 1 from public.communication_gateways cg
                               where cg.bridge_id = c.bridge_id and cg.status = 'online' and cg.last_seen > now() - interval '2 minutes')))
     and exists (select 1 from public.users u
                  where u.tenant_id = g.tenant_id
                    and right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10));
  return query
  with picked as (
    select c.id from public.gateway_commands c
     where c.bridge_id = g.bridge_id and c.status = 'pending' and c.type in ('sms', 'wa') and c.created_at > now() - interval '1 day'
     order by c.created_at limit greatest(1, least(p_limit, 20))
     for update skip locked)
  update public.gateway_commands c set status = 'processing', processed_at = now(), type = 'sms'
    from picked where c.id = picked.id
  returning c.id, c.type, c.phone, c.message, (c.created_by is null), c.created_at;
end $$;

update public.communication_gateways set supported_methods = '["sms"]'::jsonb where kind = 'android';
drop function if exists public.fn_gateway_provision(text, text);
