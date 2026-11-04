-- ============================================================================
-- Tlatoani · Proyectos clave de campo (4-nov-2026)
--  A. Rutas de visita: zonas asignadas y resultado de cada puerta
--  B. Red de referidos: cada simpatizante validado invita a sus conocidos
--  C. Casillas, representantes y actas (conteo propio)
--  D. Finanzas con criterios de fiscalización (tope de gasto, comprobantes, aportaciones)
-- ============================================================================

-- ---------------------------------------------------------------- utilidades
create or replace function public.fn_is_command_role()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_current_role(), '') in ('superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial')
$$;
revoke execute on function public.fn_is_command_role() from public, anon;
grant execute on function public.fn_is_command_role() to authenticated;

create or replace function public.fn_is_finance_role()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_current_role(), '') in ('superadmin', 'candidato', 'coordinador_campana', 'coordinador_logistica')
$$;
revoke execute on function public.fn_is_finance_role() from public, anon;
grant execute on function public.fn_is_finance_role() to authenticated;

create or replace function public.fn_section_at(p_lat double precision, p_lng double precision)
returns text language sql stable security definer set search_path = public, extensions as $$
  select es.seccion::text from public.electoral_sections es
   where p_lat is not null and p_lng is not null
     and ST_Contains(es.geom, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)) limit 1
$$;
revoke execute on function public.fn_section_at(double precision, double precision) from public, anon;

-- ================================================================ A. Rutas
create table if not exists public.walk_zones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  section_id text not null,
  notes text,
  target_doors int check (target_doors is null or target_doors > 0),
  assigned_to uuid references public.users(id) on delete set null,
  due_date date,
  status text not null default 'abierta' check (status in ('abierta', 'cerrada')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists walk_zones_tenant_idx on public.walk_zones(tenant_id, status);

create table if not exists public.door_knocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  zone_id uuid references public.walk_zones(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  outcome text not null check (outcome in ('registrado', 'no_estaba', 'volver', 'no_interesa', 'no_abrio')),
  note text check (note is null or length(note) <= 140),
  latitude double precision,
  longitude double precision,
  section_id text,
  revisit_on date,
  resolved_at timestamptz,
  offline_id text unique,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists door_knocks_zone_idx on public.door_knocks(zone_id);
create index if not exists door_knocks_user_idx on public.door_knocks(user_id, captured_at desc);

alter table public.walk_zones enable row level security;
alter table public.door_knocks enable row level security;

drop policy if exists "Zones visible" on public.walk_zones;
create policy "Zones visible" on public.walk_zones for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role())
           or assigned_to = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[]))
           or created_by = (select public.fn_current_user_id()))));
drop policy if exists "Zones managed by leaders" on public.walk_zones;
create policy "Zones managed by leaders" on public.walk_zones for all to authenticated
  using (tenant_id = (select public.fn_current_user_tenant()) and coalesce((select public.fn_current_role()), '') <> 'brigadista'
         and ((select public.fn_is_command_role()) or created_by = (select public.fn_current_user_id())))
  with check (tenant_id = (select public.fn_current_user_tenant()) and coalesce((select public.fn_current_role()), '') <> 'brigadista'
              and (assigned_to is null or assigned_to = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])) or (select public.fn_is_full_scope_role())));

drop policy if exists "Knocks insert own" on public.door_knocks;
create policy "Knocks insert own" on public.door_knocks for insert to authenticated
  with check (user_id = (select public.fn_current_user_id()) and tenant_id = (select public.fn_current_user_tenant()));
drop policy if exists "Knocks update own" on public.door_knocks;
create policy "Knocks update own" on public.door_knocks for update to authenticated
  using (user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])))
  with check (user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])));
drop policy if exists "Knocks visible" on public.door_knocks;
create policy "Knocks visible" on public.door_knocks for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role()) or user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])))));

create or replace function public.fn_door_knock_defaults()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.section_id is null then new.section_id := public.fn_section_at(new.latitude, new.longitude); end if;
  if new.outcome = 'volver' and new.revisit_on is null then new.revisit_on := (new.captured_at at time zone 'America/Mexico_City')::date + 2; end if;
  return new;
end $$;
drop trigger if exists trg_door_knock_defaults on public.door_knocks;
create trigger trg_door_knock_defaults before insert on public.door_knocks
  for each row execute function public.fn_door_knock_defaults();

-- Avance por zona
create or replace function public.fn_zone_progress()
returns table (zone_id uuid, puertas bigint, registrados bigint, no_estaba bigint, volver_pendientes bigint, no_interesa bigint, ultima timestamptz)
language sql stable security definer set search_path = public as $$
  select z.id, count(k.id), count(k.id) filter (where k.outcome = 'registrado'),
         count(k.id) filter (where k.outcome in ('no_estaba', 'no_abrio')),
         count(k.id) filter (where k.outcome = 'volver' and k.resolved_at is null),
         count(k.id) filter (where k.outcome = 'no_interesa'), max(k.captured_at)
    from public.walk_zones z left join public.door_knocks k on k.zone_id = z.id
   where public.fn_current_role() = 'superadmin'
      or (z.tenant_id = any(public.fn_current_tenant_scope())
          and (public.fn_is_full_scope_role() or z.assigned_to = any(public.fn_current_team_ids()) or z.created_by = public.fn_current_user_id()))
   group by z.id
$$;
revoke execute on function public.fn_zone_progress() from public, anon;
grant execute on function public.fn_zone_progress() to authenticated;

-- ================================================================ B. Red de referidos
alter table public.supporters add column if not exists invite_code text;
alter table public.supporters add column if not exists referred_by uuid references public.supporters(id) on delete set null;
create unique index if not exists supporters_invite_code_key on public.supporters(invite_code) where invite_code is not null;
create index if not exists supporters_referred_by_idx on public.supporters(referred_by) where referred_by is not null;

-- Al validar la visita, la persona recibe su propio código para invitar
create or replace function public.fn_supporter_invite_code()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.verified_at is not null and new.invite_code is null and new.privacy_opt_out_at is null then
    new.invite_code := encode(extensions.gen_random_bytes(6), 'hex');
  end if;
  return new;
end $$;
drop trigger if exists trg_supporter_invite_code on public.supporters;
create trigger trg_supporter_invite_code before insert or update of verified_at on public.supporters
  for each row execute function public.fn_supporter_invite_code();
update public.supporters set invite_code = encode(extensions.gen_random_bytes(6), 'hex')
 where verified_at is not null and invite_code is null and privacy_opt_out_at is null;

-- Datos públicos de una invitación (/u/<código>)
create or replace function public.fn_public_invite(p_code text)
returns json language sql stable security definer set search_path = public as $$
  select coalesce((
    select json_build_object('estado', 'ok', 'invita', split_part(trim(s.name), ' ', 1), 'campana', t.name,
                             'aviso_url', t.privacy_notice_url, 'aviso_version', t.privacy_version)
      from public.supporters s join public.tenants t on t.id = s.tenant_id
     where length(coalesce(p_code, '')) = 12 and s.invite_code = p_code and s.privacy_opt_out_at is null
  ), json_build_object('estado', 'no_encontrado'))
$$;
revoke execute on function public.fn_public_invite(text) from public;
grant execute on function public.fn_public_invite(text) to anon, authenticated;

-- La persona invitada se registra desde su propio celular (queda validada y con su consentimiento)
create or replace function public.fn_public_join(p_code text, p_name text, p_phone text, p_accept boolean,
                                                 p_lat double precision default null, p_lng double precision default null,
                                                 p_device text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare ref record; v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10); v_new public.supporters;
begin
  if not coalesce(p_accept, false) then return json_build_object('estado', 'falta_aviso'); end if;
  if length(v_phone) <> 10 then return json_build_object('estado', 'falta_telefono'); end if;
  if length(trim(coalesce(p_name, ''))) < 3 then return json_build_object('estado', 'falta_nombre'); end if;
  select * into ref from public.supporters where length(coalesce(p_code, '')) = 12 and invite_code = p_code and privacy_opt_out_at is null;
  if ref.id is null then return json_build_object('estado', 'no_encontrado'); end if;
  if exists (select 1 from public.supporters s where s.tenant_id = ref.tenant_id
               and right(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), 10) = v_phone) then
    return json_build_object('estado', 'ya_registrado');
  end if;
  insert into public.supporters (tenant_id, name, phone, recruiter_id, referred_by, latitude, longitude, commitment_level,
                                 verification_token, verification_response, verified_at, verification_channel, verification_phone,
                                 verification_ip, confirm_device, privacy_accepted_at, captured_at)
  values (ref.tenant_id, left(trim(p_name), 120), v_phone, ref.recruiter_id, ref.id, p_lat, p_lng, 3,
          encode(extensions.gen_random_bytes(16), 'hex'), 'si', now(), 'referido', v_phone,
          public.fn_request_ip(), left(p_device, 64), now(), now())
  returning * into v_new;
  update public.supporters set privacy_version = (select privacy_version from public.tenants where id = ref.tenant_id),
         quality_flags = array(select f from unnest(quality_flags) f where f = 'telefono_repetido') where id = v_new.id;
  perform public.fn_award_xp(ref.recruiter_id, 5, 'referido_registrado', v_new.id::text);
  return json_build_object('estado', 'ok', 'codigo', v_new.invite_code);
end $$;
revoke execute on function public.fn_public_join(text, text, text, boolean, double precision, double precision, text) from public;
grant execute on function public.fn_public_join(text, text, text, boolean, double precision, double precision, text) to anon, authenticated;

-- Líderes naturales: simpatizantes que más personas sumaron
create or replace function public.fn_referral_leaders(p_limit int default 30)
returns table (supporter_id uuid, name text, phone text, section_id text, recruiter text, referidos bigint, segundo_nivel bigint)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.phone, s.section_id, u.name,
         (select count(*) from public.supporters r where r.referred_by = s.id),
         (select count(*) from public.supporters r join public.supporters r2 on r2.referred_by = r.id where r.referred_by = s.id)
    from public.supporters s left join public.users u on u.id = s.recruiter_id
   where exists (select 1 from public.supporters r where r.referred_by = s.id)
     and (public.fn_current_role() = 'superadmin'
          or (s.tenant_id = any(public.fn_current_tenant_scope())
              and (public.fn_is_full_scope_role() or s.recruiter_id = any(public.fn_current_team_ids()))))
   order by 6 desc, 7 desc
   limit greatest(1, least(coalesce(p_limit, 30), 200))
$$;
revoke execute on function public.fn_referral_leaders(int) from public, anon;
grant execute on function public.fn_referral_leaders(int) to authenticated;

-- La página de agradecimiento muestra el código para invitar
create or replace function public.fn_verification_info(p_token text)
returns json language sql stable security definer set search_path = public as $$
  select coalesce((
    select json_build_object(
      'estado', case when s.privacy_opt_out_at is not null then 'baja'
                     when s.verification_response = 'si' then 'confirmado' else 'pendiente' end,
      'persona', split_part(trim(s.name), ' ', 1),
      'brigadista', split_part(trim(u.name), ' ', 1),
      'campana', t.name,
      'aviso_url', t.privacy_notice_url,
      'aviso_version', t.privacy_version,
      'invita_codigo', case when s.verification_response = 'si' and s.privacy_opt_out_at is null then s.invite_code end,
      'titulo', t.thanks_title,
      'mensaje', t.thanks_message,
      'media_url', t.thanks_media_url,
      'media_tipo', t.thanks_media_type,
      'redes', t.social_links)
    from public.supporters s
    join public.tenants t on t.id = s.tenant_id
    left join public.users u on u.id = s.recruiter_id
    where length(p_token) >= 12 and s.verification_token = p_token
  ), json_build_object('estado', 'no_encontrado'))
$$;

-- La baja de un simpatizante también apaga su código de invitación
create or replace function public.fn_supporter_optout_invite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.privacy_opt_out_at is not null and old.privacy_opt_out_at is null then new.invite_code := null; end if;
  return new;
end $$;
drop trigger if exists trg_supporter_optout_invite on public.supporters;
create trigger trg_supporter_optout_invite before update of privacy_opt_out_at on public.supporters
  for each row execute function public.fn_supporter_optout_invite();

-- ================================================================ C. Casillas y actas
create table if not exists public.polling_stations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  section_id text not null,
  tipo text not null default 'B',
  address text,
  latitude double precision,
  longitude double precision,
  lista_nominal int,
  created_at timestamptz not null default now(),
  unique (tenant_id, section_id, tipo)
);
create table if not exists public.poll_watchers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  station_id uuid not null references public.polling_stations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'propietario' check (role in ('propietario', 'suplente', 'general')),
  checked_in_at timestamptz,
  check_lat double precision,
  check_lng double precision,
  created_at timestamptz not null default now(),
  unique (station_id, user_id)
);
create table if not exists public.ballot_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  is_ours boolean not null default false,
  color text
);
create table if not exists public.tally_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  station_id uuid not null references public.polling_stations(id) on delete cascade,
  captured_by uuid references public.users(id) on delete set null,
  votes jsonb not null default '{}'::jsonb,       -- {"<ballot_option_id>": votos}
  nulos int not null default 0 check (nulos >= 0),
  no_registrados int not null default 0 check (no_registrados >= 0),
  total int not null check (total >= 0),
  photo_path text,
  incidents text,
  status text not null default 'capturada' check (status in ('capturada', 'validada', 'con_error')),
  flags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  unique (station_id, captured_by)
);
create index if not exists poll_watchers_user_idx on public.poll_watchers(user_id);
create index if not exists tally_station_idx on public.tally_reports(station_id);

alter table public.polling_stations enable row level security;
alter table public.poll_watchers enable row level security;
alter table public.ballot_options enable row level security;
alter table public.tally_reports enable row level security;

drop policy if exists "Stations visible" on public.polling_stations;
create policy "Stations visible" on public.polling_stations for select to authenticated
  using (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[])));
drop policy if exists "Stations managed" on public.polling_stations;
create policy "Stations managed" on public.polling_stations for all to authenticated
  using (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_is_command_role()))
  with check (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_is_command_role()));

drop policy if exists "Ballot visible" on public.ballot_options;
create policy "Ballot visible" on public.ballot_options for select to authenticated
  using (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[])));
drop policy if exists "Ballot managed" on public.ballot_options;
create policy "Ballot managed" on public.ballot_options for all to authenticated
  using (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_is_command_role()))
  with check (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_is_command_role()));

drop policy if exists "Watchers visible" on public.poll_watchers;
create policy "Watchers visible" on public.poll_watchers for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role()) or (select public.fn_is_command_role())
           or user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])))));
drop policy if exists "Watchers managed" on public.poll_watchers;
create policy "Watchers managed" on public.poll_watchers for all to authenticated
  using (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_is_command_role()))
  with check (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_is_command_role()));

drop policy if exists "Tally visible" on public.tally_reports;
create policy "Tally visible" on public.tally_reports for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role()) or (select public.fn_is_command_role())
           or captured_by = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])))));
drop policy if exists "Tally status by command" on public.tally_reports;
create policy "Tally status by command" on public.tally_reports for update to authenticated
  using (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_is_command_role()))
  with check (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_is_command_role()));

-- El representante marca su llegada a la casilla
create or replace function public.fn_watcher_checkin(p_station uuid, p_lat double precision, p_lng double precision)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.poll_watchers set checked_in_at = coalesce(checked_in_at, now()), check_lat = p_lat, check_lng = p_lng
   where station_id = p_station and user_id = public.fn_current_user_id();
  return found;
end $$;
revoke execute on function public.fn_watcher_checkin(uuid, double precision, double precision) from public, anon;
grant execute on function public.fn_watcher_checkin(uuid, double precision, double precision) to authenticated;

-- Captura del acta: solo el representante asignado a la casilla o un mando. Revisa que las cifras cuadren.
create or replace function public.fn_submit_tally(p_station uuid, p_votes jsonb, p_nulos int, p_no_registrados int,
                                                  p_total int, p_photo_path text default null, p_incidents text default null)
returns json language plpgsql security definer set search_path = public as $$
declare me public.users; st public.polling_stations; v_sum int := 0; v_flags text[] := '{}'::text[]; k text; v_val int; other record; v_id uuid;
begin
  select * into me from public.users where auth_id = auth.uid();
  if me.id is null then return json_build_object('estado', 'sin_sesion'); end if;
  select * into st from public.polling_stations where id = p_station and tenant_id = me.tenant_id;
  if st.id is null then return json_build_object('estado', 'no_existe'); end if;
  if not (public.fn_is_command_role() or exists (select 1 from public.poll_watchers w where w.station_id = st.id and w.user_id = me.id)) then
    return json_build_object('estado', 'no_asignado');
  end if;
  if jsonb_typeof(p_votes) <> 'object' or p_total is null or p_total < 0 then return json_build_object('estado', 'datos_invalidos'); end if;
  for k, v_val in select key, (value #>> '{}')::int from jsonb_each(p_votes) loop
    if v_val < 0 or not exists (select 1 from public.ballot_options b where b.id::text = k and b.tenant_id = me.tenant_id) then
      return json_build_object('estado', 'datos_invalidos');
    end if;
    v_sum := v_sum + v_val;
  end loop;
  if v_sum + coalesce(p_nulos, 0) + coalesce(p_no_registrados, 0) <> p_total then v_flags := array_append(v_flags, 'suma_no_cuadra'); end if;
  if st.lista_nominal is not null and p_total > st.lista_nominal then v_flags := array_append(v_flags, 'excede_lista_nominal'); end if;
  if p_photo_path is null then v_flags := array_append(v_flags, 'sin_foto'); end if;
  select * into other from public.tally_reports t where t.station_id = st.id and t.captured_by is distinct from me.id
   order by t.created_at desc limit 1;
  if other.id is not null and (other.votes <> p_votes or other.total <> p_total) then
    v_flags := array_append(v_flags, 'capturas_distintas');
    update public.tally_reports set flags = array(select distinct unnest(flags || array['capturas_distintas'])) where id = other.id;
  end if;
  insert into public.tally_reports as t (tenant_id, station_id, captured_by, votes, nulos, no_registrados, total, photo_path, incidents, flags,
                                    status)
  values (me.tenant_id, st.id, me.id, p_votes, coalesce(p_nulos, 0), coalesce(p_no_registrados, 0), p_total, p_photo_path,
          left(p_incidents, 1000), v_flags, case when 'suma_no_cuadra' = any(v_flags) or 'excede_lista_nominal' = any(v_flags) then 'con_error' else 'capturada' end)
  on conflict (station_id, captured_by) do update set votes = excluded.votes, nulos = excluded.nulos, no_registrados = excluded.no_registrados,
     total = excluded.total, photo_path = coalesce(excluded.photo_path, t.photo_path), incidents = excluded.incidents,
     flags = excluded.flags, status = excluded.status, created_at = now()
  returning id into v_id;
  return json_build_object('estado', 'ok', 'alertas', to_json(v_flags), 'id', v_id);
end $$;
revoke execute on function public.fn_submit_tally(uuid, jsonb, int, int, int, text, text) from public, anon;
grant execute on function public.fn_submit_tally(uuid, jsonb, int, int, int, text, text) to authenticated;

-- Conteo propio: una captura por casilla (la validada; si no, la más reciente sin error; si no, la más reciente)
create or replace function public.fn_tally_summary()
returns table (option_id uuid, name text, is_ours boolean, color text, sort int, votos bigint,
               casillas_capturadas bigint, casillas_totales bigint, votos_totales bigint, con_alertas bigint)
language sql stable security definer set search_path = public as $$
  with me as (select tenant_id from public.users where auth_id = auth.uid()),
  allowed as (select (public.fn_current_role() = 'superadmin' or public.fn_is_full_scope_role() or public.fn_is_command_role()) as ok),
  best as (
    select distinct on (t.station_id) t.*
      from public.tally_reports t, me, allowed
     where allowed.ok and t.tenant_id = me.tenant_id
     order by t.station_id, (t.status = 'validada') desc, (t.status = 'con_error') asc, t.created_at desc
  ),
  per_opt as (
    select (e.key)::uuid as oid, sum((e.value #>> '{}')::int) as v from best, jsonb_each(best.votes) e group by 1
  )
  select b.id, b.name, b.is_ours, b.color, b.sort, coalesce(p.v, 0)::bigint,
         (select count(*) from best), (select count(*) from public.polling_stations s, me where s.tenant_id = me.tenant_id),
         (select coalesce(sum(total), 0) from best), (select count(*) from best where cardinality(flags) > 0)
    from public.ballot_options b join me on b.tenant_id = me.tenant_id
    left join per_opt p on p.oid = b.id, allowed
   where allowed.ok
   order by b.sort, b.name
$$;
revoke execute on function public.fn_tally_summary() from public, anon;
grant execute on function public.fn_tally_summary() to authenticated;

-- Genera casillas a partir de la lista nominal: 1 básica por sección y una contigua por cada 750 electores adicionales
create or replace function public.fn_generate_stations(p_sections text[])
returns int language plpgsql security definer set search_path = public as $$
declare me public.users; s text; ln int; n int; i int; created int := 0;
begin
  select * into me from public.users where auth_id = auth.uid();
  if me.id is null or not public.fn_is_command_role() then raise exception 'Sin permiso' using errcode = '42501'; end if;
  foreach s in array coalesce(p_sections, '{}'::text[]) loop
    s := trim(s);
    continue when s !~ '^\d{1,5}$';
    select p.lista_nominal into ln from public.padron_electoral p where p.section_id = s order by p.year desc limit 1;
    n := greatest(1, ceil(coalesce(ln, 0) / 750.0)::int);
    for i in 1 .. n loop
      insert into public.polling_stations (tenant_id, section_id, tipo, lista_nominal)
      values (me.tenant_id, s, case when i = 1 then 'B' else 'C' || (i - 1) end, case when ln is null then null else ceil(ln::numeric / n)::int end)
      on conflict (tenant_id, section_id, tipo) do nothing;
      if found then created := created + 1; end if;
    end loop;
  end loop;
  return created;
end $$;
revoke execute on function public.fn_generate_stations(text[]) from public, anon;
grant execute on function public.fn_generate_stations(text[]) to authenticated;

-- Archivos privados de la campaña: actas (fotos) y comprobantes fiscales
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign_docs', 'campaign_docs', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'application/xml', 'text/xml'])
on conflict (id) do nothing;

drop policy if exists "Campaign docs upload" on storage.objects;
create policy "Campaign docs upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'campaign_docs'
  and (storage.foldername(name))[1] = (select public.fn_current_user_tenant())::text
  and (((storage.foldername(name))[2] = 'actas')
       or ((storage.foldername(name))[2] = 'fiscal' and (select public.fn_is_finance_role()))));
drop policy if exists "Campaign docs read" on storage.objects;
create policy "Campaign docs read" on storage.objects for select to authenticated using (
  bucket_id = 'campaign_docs'
  and (storage.foldername(name))[1] = (select public.fn_current_user_tenant())::text
  and ((owner_id = (select auth.uid())::text)
       or ((storage.foldername(name))[2] = 'actas' and ((select public.fn_is_command_role()) or (select public.fn_is_full_scope_role())))
       or ((storage.foldername(name))[2] = 'fiscal' and (select public.fn_is_finance_role()))));

-- ================================================================ D. Finanzas y fiscalización
alter table public.tenants add column if not exists tope_gasto numeric(14, 2);
alter table public.tenants add column if not exists limite_aportacion numeric(14, 2);

alter table public.campaign_finances add column if not exists concept text;
alter table public.campaign_finances add column if not exists proveedor text;
alter table public.campaign_finances add column if not exists rfc text;
alter table public.campaign_finances add column if not exists cfdi_uuid text;
alter table public.campaign_finances add column if not exists payment_method text;
alter table public.campaign_finances add column if not exists receipt_path text;
alter table public.campaign_finances add column if not exists evidence_path text;
alter table public.campaign_finances add column if not exists donor_name text;
alter table public.campaign_finances add column if not exists donor_key text;
alter table public.campaign_finances add column if not exists created_by uuid references public.users(id) on delete set null;

-- Antes cualquier integrante de la campaña podía ver, crear o borrar movimientos
drop policy if exists "Campaign finances tenant scope" on public.campaign_finances;
drop policy if exists "Finances by finance roles" on public.campaign_finances;
create policy "Finances by finance roles" on public.campaign_finances for all to authenticated
  using (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[])) and (select public.fn_is_finance_role()))
  with check (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_is_finance_role()));

create or replace function public.fn_finance_compliance()
returns json language sql stable security definer set search_path = public as $$
  with me as (select u.tenant_id from public.users u where u.auth_id = auth.uid() and public.fn_is_finance_role()),
  t as (select tn.* from public.tenants tn join me on me.tenant_id = tn.id),
  f as (select cf.* from public.campaign_finances cf join me on me.tenant_id = cf.tenant_id),
  donors as (
    select coalesce(nullif(upper(trim(donor_key)), ''), lower(trim(donor_name))) as k, max(donor_name) as nombre, sum(amount) as total
      from f where transaction_type = 'ingreso' and coalesce(donor_name, donor_key) is not null group by 1)
  select json_build_object(
    'tope_gasto', (select tope_gasto from t),
    'limite_aportacion', (select limite_aportacion from t),
    'egresos', (select coalesce(sum(amount), 0) from f where transaction_type = 'egreso'),
    'ingresos', (select coalesce(sum(amount), 0) from f where transaction_type = 'ingreso'),
    'sin_comprobante', (select count(*) from f where transaction_type = 'egreso' and receipt_path is null),
    'sin_rfc', (select count(*) from f where transaction_type = 'egreso' and coalesce(rfc, '') = ''),
    'aportaciones_sin_aportante', (select count(*) from f where transaction_type = 'ingreso' and coalesce(donor_name, '') = ''),
    'aportantes_sobre_limite', coalesce((select json_agg(json_build_object('nombre', nombre, 'total', total))
                                           from donors where (select limite_aportacion from t) is not null and total > (select limite_aportacion from t)), '[]'::json),
    'por_concepto', coalesce((select json_agg(json_build_object('concepto', c, 'total', s) order by s desc)
                                from (select coalesce(concept, category, 'Sin concepto') c, sum(amount) s from f where transaction_type = 'egreso' group by 1) x), '[]'::json))
  where exists (select 1 from me)
$$;
revoke execute on function public.fn_finance_compliance() from public, anon;
grant execute on function public.fn_finance_compliance() to authenticated;

-- Funciones de trigger fuera de la API
revoke execute on function public.fn_door_knock_defaults() from public, anon, authenticated;
revoke execute on function public.fn_supporter_invite_code() from public, anon, authenticated;
revoke execute on function public.fn_supporter_optout_invite() from public, anon, authenticated;

-- ---------------------------------------------------------------- Ajuste: canal "referido"
alter table public.supporters drop constraint if exists supporters_verification_channel_check;
alter table public.supporters add constraint supporters_verification_channel_check
  check (verification_channel = any (array['whatsapp', 'qr', 'referido']));
-- (fn_public_join: el registro lo hace la propia persona desde su celular; las alertas de ráfaga o mismas
--  coordenadas son del brigadista y no aplican, así que se limpian al insertar)
alter table public.campaign_finances alter column reference_date set default current_date;
