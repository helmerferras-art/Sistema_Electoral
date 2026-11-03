-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-02
-- (whatsapp_verification + whatsapp_verification_fix_flags + verified_excludes_flagged).
-- Validación de visitas por WhatsApp: el brigadista envía desde su celular un enlace único
-- (nemia.lat/v/<token>); la persona confirma o niega desde su teléfono. Se marcan alertas si se
-- confirma desde el mismo dispositivo o red del brigadista, o en menos de 20 s. Solo las
-- confirmaciones sin alertas cuentan como "verificados" en las metas.
-- También: ¿vive aquí? (lives_here) y colonia de residencia (colonia_id).

alter table public.supporters add column if not exists verification_token text;
alter table public.supporters add column if not exists verification_sent_at timestamptz;
alter table public.supporters add column if not exists verification_sent_ip text;
alter table public.supporters add column if not exists verified_at timestamptz;
alter table public.supporters add column if not exists verification_response text check (verification_response in ('si','no'));
alter table public.supporters add column if not exists verification_ip text;
alter table public.supporters add column if not exists verification_flags text[] not null default '{}';
alter table public.supporters add column if not exists recruiter_device text;
alter table public.supporters add column if not exists confirm_device text;
alter table public.supporters add column if not exists privacy_accepted_at timestamptz;
alter table public.supporters add column if not exists lives_here boolean;
alter table public.supporters add column if not exists colonia_id integer;
create unique index if not exists supporters_verification_token_idx on public.supporters (verification_token) where verification_token is not null;

grant select (verification_sent_at, verified_at, verification_response, verification_flags, lives_here, colonia_id, privacy_accepted_at)
  on public.supporters to authenticated;

alter table public.tenants add column if not exists privacy_notice_url text;

create or replace function public.fn_request_ip()
returns text language sql stable set search_path = public as $$
  select nullif(trim(split_part(coalesce(
    (current_setting('request.headers', true)::json)->>'x-forwarded-for',
    (current_setting('request.headers', true)::json)->>'x-real-ip', ''), ',', 1)), '')
$$;

create or replace function public.fn_mark_verification_sent(p_token text)
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  update public.supporters s
     set verification_sent_at = coalesce(s.verification_sent_at, now()),
         verification_sent_ip = coalesce(s.verification_sent_ip, public.fn_request_ip())
   where s.verification_token = p_token
     and s.recruiter_id = any(public.fn_current_team_ids());
  return found;
end;
$$;

create or replace function public.fn_get_verification_token(p_supporter_id uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare v_token text;
begin
  select verification_token into v_token from public.supporters
   where id = p_supporter_id
     and (recruiter_id = any(public.fn_current_team_ids())
          or (public.fn_current_role() in ('candidato','coordinador_campana','superadmin')
              and tenant_id = any(public.fn_current_tenant_scope())));
  if not found then raise exception 'Sin permiso sobre este simpatizante'; end if;
  if v_token is null then
    v_token := replace(replace(encode(extensions.gen_random_bytes(12), 'base64'), '/', 'x'), '+', 'z');
    update public.supporters set verification_token = v_token where id = p_supporter_id;
  end if;
  return v_token;
end;
$$;

create or replace function public.fn_verification_info(p_token text)
returns json language sql stable security definer set search_path = public as $$
  select coalesce((
    select json_build_object(
      'estado', case when s.verification_response = 'si' then 'confirmado'
                     when s.verification_response = 'no' then 'rechazado' else 'pendiente' end,
      'persona', split_part(trim(s.name), ' ', 1),
      'brigadista', split_part(trim(u.name), ' ', 1),
      'campana', t.name,
      'aviso_url', t.privacy_notice_url)
    from public.supporters s
    join public.tenants t on t.id = s.tenant_id
    left join public.users u on u.id = s.recruiter_id
    where length(p_token) >= 12 and s.verification_token = p_token
  ), json_build_object('estado', 'no_encontrado'))
$$;

create or replace function public.fn_confirm_verification(p_token text, p_response text, p_device text default null)
returns json language plpgsql volatile security definer set search_path = public as $$
declare s record; v_ip text := public.fn_request_ip(); v_flags text[] := '{}'::text[];
begin
  if p_response not in ('si','no') or length(coalesce(p_token, '')) < 12 then
    return json_build_object('estado', 'no_encontrado');
  end if;
  select * into s from public.supporters where verification_token = p_token for update;
  if s.id is null then return json_build_object('estado', 'no_encontrado'); end if;
  if s.verification_response is not null then
    return json_build_object('estado', case when s.verification_response = 'si' then 'confirmado' else 'rechazado' end);
  end if;

  if p_device is not null and p_device = s.recruiter_device then v_flags := array_append(v_flags, 'mismo_dispositivo'); end if;
  if v_ip is not null and v_ip = s.verification_sent_ip then v_flags := array_append(v_flags, 'misma_red'); end if;
  if s.verification_sent_at is not null and now() - s.verification_sent_at < interval '20 seconds' then v_flags := array_append(v_flags, 'muy_rapido'); end if;
  if p_response = 'no' then v_flags := array_append(v_flags, 'negado'); end if;

  update public.supporters
     set verification_response = p_response, verified_at = now(), verification_ip = v_ip,
         confirm_device = left(p_device, 64), verification_flags = v_flags,
         privacy_accepted_at = case when p_response = 'si' then now() else privacy_accepted_at end
   where id = s.id;
  return json_build_object('estado', case when p_response = 'si' then 'confirmado' else 'rechazado' end);
end;
$$;

revoke execute on function public.fn_request_ip() from public, anon, authenticated;
revoke execute on function public.fn_mark_verification_sent(text) from public, anon;
revoke execute on function public.fn_get_verification_token(uuid) from public, anon;
revoke execute on function public.fn_verification_info(text) from public;
revoke execute on function public.fn_confirm_verification(text, text, text) from public;
grant execute on function public.fn_mark_verification_sent(text) to authenticated;
grant execute on function public.fn_get_verification_token(uuid) to authenticated;
grant execute on function public.fn_verification_info(text) to anon, authenticated;
grant execute on function public.fn_confirm_verification(text, text, text) to anon, authenticated;

drop function if exists public.fn_goal_board(uuid);
create or replace function public.fn_goal_board(p_root uuid default null)
returns table(user_id uuid, name text, role text, is_root boolean, territory_type text, territory_zones integer,
              meta_votos integer, meta_simpatizantes integer, meta_contactos integer, method text,
              periodo_inicio date, periodo_fin date, dias_restantes integer, fraccion_esperada numeric,
              esperado_simpatizantes integer, esperado_contactos integer,
              avance_simpatizantes bigint, avance_verificados bigint, avance_alertas bigint,
              avance_contactos bigint, avance_convencidos bigint, avance_conocian bigint,
              actividades bigint, repartido_simpatizantes bigint, equipo integer, sin_meta integer)
language plpgsql stable security definer set search_path = public as $$
declare v_root uuid := coalesce(p_root, public.fn_current_user_id());
begin
  if not public.fn_can_manage(v_root, true) then raise exception 'Sin permiso'; end if;
  return query
  with people as (
    select u.id, u.name, u.role, (u.id = v_root) is_root, u.assigned_territory at, u.tenant_id
    from public.users u where u.id = v_root or (u.parent_id = v_root and u.is_active is not false)
  ), win as (
    select p.*, w.start_date ws, w.end_date we, public.fn_team_of(p.id) team,
           public.fn_expected_fraction(p.tenant_id, w.start_date, w.end_date, current_date) f
    from people p cross join lateral public.fn_goal_window(p.id) w
  ), act as (
    select p.id, coalesce(sum(a.contacts_count), 0) c, coalesce(sum(a.convinced_count), 0) v,
           coalesce(sum(a.known_count), 0) k, count(a.id) n
    from win p left join public.field_activities a on a.user_id = any(p.team) and a.occurred_at::date >= p.ws
    group by p.id
  ), sup as (
    select p.id, count(s.id) total,
           count(s.id) filter (where s.verification_response = 'si' and cardinality(s.verification_flags) = 0) verif,
           count(s.id) filter (where s.verification_response = 'no' or cardinality(s.verification_flags) > 0) alert
    from win p left join public.supporters s on s.recruiter_id = any(p.team) and s.created_at::date >= p.ws
    group by p.id
  )
  select p.id, p.name, p.role, p.is_root,
         p.at->>'layer_type', coalesce(jsonb_array_length(p.at->'zone_ids'), 0),
         g.meta_votos, g.meta_simpatizantes, g.meta_contactos, g.method,
         p.ws, p.we, greatest(0, p.we - current_date)::int, round(p.f, 4),
         round(coalesce(g.meta_simpatizantes, 0) * p.f)::int, round(coalesce(g.meta_contactos, 0) * p.f)::int,
         su.total, su.verif, su.alert,
         a.c, a.v, a.k, a.n,
         (select coalesce(sum(g2.meta_simpatizantes), 0) from public.goals g2 join public.users c on c.id = g2.user_id
           where c.parent_id = p.id),
         (select count(*)::int from public.users c where c.parent_id = p.id and c.is_active is not false),
         (select count(*)::int from public.users c where c.parent_id = p.id and c.is_active is not false
             and not exists (select 1 from public.goals g3 where g3.user_id = c.id))
  from win p left join public.goals g on g.user_id = p.id join act a on a.id = p.id join sup su on su.id = p.id
  order by p.is_root desc, p.name;
end;
$$;
revoke execute on function public.fn_goal_board(uuid) from public, anon;
grant execute on function public.fn_goal_board(uuid) to authenticated;
