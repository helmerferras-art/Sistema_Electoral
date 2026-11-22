-- Envío 24/7: el servicio nativo del celular trabaja con una llave propia del equipo (no con la sesión de la persona),
-- así no se vence ni depende de que la app esté abierta. Solo se guarda la huella (sha256) de la llave.
alter table public.communication_gateways add column if not exists token_hash text;

-- Emite una llave nueva para este celular (la anterior deja de servir). Solo su dueño.
create or replace function public.fn_gateway_issue_token(p_bridge text)
returns text language plpgsql security definer set search_path = public as $$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  update public.communication_gateways cg set token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
    from public.users u where u.id = cg.owner_user and u.auth_id = auth.uid() and cg.bridge_id = p_bridge;
  if not found then raise exception 'Este celular no está activado para enviar mensajes'; end if;
  return v_token;
end $$;

create or replace function public.fn_gateway_by_token(p_token text)
returns public.communication_gateways language sql stable security definer set search_path = public as $$
  select * from public.communication_gateways
   where token_hash is not null and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;
revoke all on function public.fn_gateway_by_token(text) from public, anon, authenticated;

-- Recoger pendientes con la llave del equipo (lo usa el servicio nativo)
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
  update public.gateway_commands c set bridge_id = g.bridge_id
   where c.status = 'pending' and c.bridge_id in (
     select cg.bridge_id from public.communication_gateways cg
      where cg.tenant_id = g.tenant_id and cg.bridge_id <> g.bridge_id and (cg.last_seen is null or cg.last_seen < now() - interval '5 minutes'));
  return query
  with picked as (
    select c.id from public.gateway_commands c
     where c.bridge_id = g.bridge_id and c.status = 'pending' and c.created_at > now() - interval '1 day'
     order by c.created_at limit greatest(1, least(p_limit, 20))
     for update skip locked)
  update public.gateway_commands c set status = 'processing', processed_at = now()
    from picked where c.id = picked.id
  returning c.id, c.type, c.phone, c.message, (c.created_by is null), c.created_at;
end $$;

create or replace function public.fn_gateway_report_token(p_token text, p_cmd uuid, p_ok boolean, p_error text)
returns boolean language plpgsql security definer set search_path = public as $$
declare g public.communication_gateways;
begin
  g := public.fn_gateway_by_token(p_token);
  if g.bridge_id is null then return false; end if;
  update public.gateway_commands c set status = case when p_ok then 'completed' else 'failed' end,
         processed_at = now(), error_log = left(p_error, 300)
   where c.id = p_cmd and c.bridge_id = g.bridge_id;
  return found;
end $$;

-- Apagar también revoca la llave
create or replace function public.fn_gateway_off(p_bridge text)
returns boolean language sql security definer set search_path = public as $$
  update public.communication_gateways cg set status = 'offline', token_hash = null
    from public.users u where u.id = cg.owner_user and u.auth_id = auth.uid() and cg.bridge_id = p_bridge
  returning true
$$;

revoke all on function public.fn_gateway_issue_token(text), public.fn_gateway_pull_token(text, int), public.fn_gateway_report_token(text, uuid, boolean, text) from public;
grant execute on function public.fn_gateway_issue_token(text) to authenticated;
grant execute on function public.fn_gateway_pull_token(text, int), public.fn_gateway_report_token(text, uuid, boolean, text) to anon, authenticated;
