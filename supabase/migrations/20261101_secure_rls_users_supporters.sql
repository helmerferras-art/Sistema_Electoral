-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-01.
-- Cierra la lectura anónima de users/supporters/tenants/notifications, agrega RPCs públicas
-- mínimas (login, registro, landing) y corrige fn_get_map_supporters / get_team_ids.

drop policy if exists "Users visibility" on public.users;
drop policy if exists "Supporters select" on public.supporters;
drop policy if exists "Tenants visibility" on public.tenants;
drop policy if exists "Notifications self-view" on public.notifications;

create or replace function public.fn_login_precheck(p_phone text)
returns table(found boolean, phone text, is_first_login boolean, two_factor_enabled boolean)
language sql stable security definer set search_path = public as $$
  with c as (select right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10) as d)
  select true, u.phone, coalesce(u.is_first_login, false), coalesce(u.two_factor_enabled, false)
  from public.users u, c
  where length(c.d) = 10 and right(regexp_replace(coalesce(u.phone,''), '\D', '', 'g'), 10) = c.d
  order by u.created_at desc
  limit 1
$$;

create or replace function public.fn_queue_first_login_code(p_phone text)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  v_d text := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 10);
  v_user record;
  v_bridge text;
begin
  if length(v_d) <> 10 then return false; end if;
  select u.* into v_user from public.users u
   where right(regexp_replace(coalesce(u.phone,''), '\D', '', 'g'), 10) = v_d
   order by u.created_at desc limit 1;
  if v_user.id is null or not coalesce(v_user.is_first_login,false) or v_user.temp_code is null then
    return false;
  end if;
  if exists (select 1 from public.gateway_commands g
             where right(regexp_replace(coalesce(g.phone,''), '\D', '', 'g'), 10) = v_d
               and g.message like 'SISTEMA C4I (NEMIA): Tu código táctico%'
               and g.created_at > now() - interval '2 minutes') then
    return true;
  end if;
  select bridge_id into v_bridge from public.communication_gateways
   where tenant_id = v_user.tenant_id order by last_seen desc nulls last limit 1;
  if v_bridge is null then return false; end if;
  insert into public.gateway_commands (bridge_id, type, phone, message, status)
  values (v_bridge, 'sms', v_user.phone,
          'SISTEMA C4I (NEMIA): Tu código táctico es ' || v_user.temp_code || '. No lo compartas.', 'pending');
  update public.users set code_sent = true where id = v_user.id;
  return true;
end;
$$;

create or replace function public.fn_public_candidate(p_tenant_id uuid)
returns table(name text, phone text, tenant_name text)
language sql stable security definer set search_path = public as $$
  select coalesce(u.name, t.name), u.phone, t.name
  from public.tenants t
  left join public.users u on u.tenant_id = t.id and u.role = 'candidato'
  where t.id = p_tenant_id and coalesce(t.is_active, true)
  limit 1
$$;

create or replace function public.fn_supporter_phone_exists(p_phone text, p_tenant_id uuid default null)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.supporters s
                 where s.phone = p_phone and (p_tenant_id is null or s.tenant_id = p_tenant_id))
$$;

create or replace function public.fn_public_landing(p_slug text)
returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'tenant', json_build_object('id', t.id, 'name', t.name, 'description', t.description, 'position', t.position,
                                'election_type', t.election_type, 'geographic_scope', t.geographic_scope, 'slug', t.slug),
    'candidate', (select json_build_object('name', u.name, 'photo_url', u.photo_url, 'role', u.role)
                  from public.users u where u.tenant_id = t.id and u.role = 'candidato' limit 1),
    'supporters', (select count(*) from public.supporters s where s.tenant_id = t.id),
    'petitions', (select count(*) from public.petitions p where p.tenant_id = t.id),
    'resolved', (select count(*) from public.petitions p where p.tenant_id = t.id and p.status = 'resuelto'))
  from public.tenants t
  where t.slug = p_slug and coalesce(t.is_active, true)
  limit 1
$$;

drop function if exists public.fn_get_map_supporters(uuid[]);
create or replace function public.fn_get_map_supporters()
returns table(id uuid, name text, phone text, latitude double precision, longitude double precision,
              section_id text, commitment_level integer, status text, recruiter_id uuid)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.phone, s.latitude, s.longitude, s.section_id, s.commitment_level, s.status, s.recruiter_id
  from public.supporters s
  where s.latitude is not null and s.longitude is not null
    and (public.fn_current_role() = 'superadmin' or s.tenant_id = any(public.fn_current_tenant_scope()))
$$;

drop function if exists public.get_team_ids(uuid);
create or replace function public.get_team_ids(root_user_id uuid)
returns table(user_id uuid)
language sql stable security definer set search_path = public as $$
  with recursive team as (
    select u.id from public.users u
     where u.id = root_user_id
       and (public.fn_current_role() = 'superadmin' or u.tenant_id = any(public.fn_current_tenant_scope()))
    union all
    select u.id from public.users u join team t on u.parent_id = t.id
  )
  select id from team
$$;

revoke execute on function public.fn_get_map_supporters() from public, anon;
revoke execute on function public.get_team_ids(uuid) from public, anon;
revoke execute on function public.fn_get_territory_progress(uuid) from public, anon;
revoke execute on function public.fn_get_tenant_scope(uuid) from public, anon;
grant execute on function public.fn_get_map_supporters() to authenticated;
grant execute on function public.get_team_ids(uuid) to authenticated;
grant execute on function public.fn_get_territory_progress(uuid) to authenticated;
grant execute on function public.fn_get_tenant_scope(uuid) to authenticated;

revoke execute on function public.fn_login_precheck(text) from public;
revoke execute on function public.fn_queue_first_login_code(text) from public;
revoke execute on function public.fn_public_candidate(uuid) from public;
revoke execute on function public.fn_supporter_phone_exists(text, uuid) from public;
revoke execute on function public.fn_public_landing(text) from public;
grant execute on function public.fn_login_precheck(text) to anon, authenticated;
grant execute on function public.fn_queue_first_login_code(text) to anon, authenticated;
grant execute on function public.fn_public_candidate(uuid) to anon, authenticated;
grant execute on function public.fn_supporter_phone_exists(text, uuid) to anon, authenticated;
grant execute on function public.fn_public_landing(text) to anon, authenticated;
