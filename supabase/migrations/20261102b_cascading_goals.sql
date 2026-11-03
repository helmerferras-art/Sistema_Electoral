-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-02 (cascading_goals + territory_sections_guard).
-- Metas en cascada calculadas con el histórico electoral por sección.
--   Datos de referencia: historical_election_results (+padrón), padron_electoral, colonia_secciones
--   Cargar con: node scripts/dev/cargar_datos_electorales.mjs "<ruta>\Subir CSV" --colonias "<ruta>\colonia_seccion.csv"
--   Parámetros por campaña: goal_settings (candidato / coord. de campaña)
--   Metas: goals (una vigente por persona; escritura solo vía fn_set_goal)
--   Cascada: candidato/coord. campaña → coordinador → coord. territorial → líder → brigadista

-- ═══ 1) Datos de referencia ═══
alter table public.historical_election_results add column if not exists padron_total integer;
alter table public.historical_election_results add column if not exists candidate_names jsonb;
alter table public.historical_election_results add column if not exists padron_edad_rangos jsonb;
create unique index if not exists historical_unique_section
  on public.historical_election_results (election_year, election_type, section_id);

create table if not exists public.padron_electoral (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  section_id text not null,
  municipality text,
  municipality_id integer,
  distrito_f integer,
  padron_total integer,
  hombres integer,
  mujeres integer,
  lista_nominal integer,
  edad_rangos jsonb,
  unique (section_id, year)
);
create index if not exists padron_mun_idx on public.padron_electoral (municipality_id);
alter table public.padron_electoral enable row level security;
drop policy if exists "Padron read" on public.padron_electoral;
create policy "Padron read" on public.padron_electoral for select to authenticated using (true);
revoke all on public.padron_electoral from anon;
grant select on public.padron_electoral to authenticated;

create table if not exists public.colonia_secciones (
  colonia_id integer not null,
  municipio integer,
  colonia text,
  cp text,
  seccion integer not null,
  porcentaje numeric,
  primary key (colonia_id, seccion)
);
alter table public.colonia_secciones enable row level security;
drop policy if exists "Colonia secciones read" on public.colonia_secciones;
create policy "Colonia secciones read" on public.colonia_secciones for select to authenticated using (true);
revoke all on public.colonia_secciones from anon;
grant select on public.colonia_secciones to authenticated;

-- ═══ 2) Parámetros de metas por campaña ═══
create table if not exists public.goal_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  method text not null default 'ganador' check (method in ('ganador','participacion')),
  base_year integer not null default 2024,
  base_election text not null default 'gubernatura',
  win_margin numeric not null default 0.10 check (win_margin between 0 and 1),
  target_share numeric not null default 0.50 check (target_share between 0.05 and 1),
  supporter_ratio numeric not null default 0.40 check (supporter_ratio between 0.01 and 1),
  contacts_per_supporter numeric not null default 3 check (contacts_per_supporter between 1 and 20),
  campaign_start date,
  campaign_end date,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.goal_settings enable row level security;
revoke all on public.goal_settings from anon;
drop policy if exists "Goal settings read" on public.goal_settings;
create policy "Goal settings read" on public.goal_settings for select to authenticated
using ((select public.fn_current_role()) = 'superadmin' or tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[])));
drop policy if exists "Goal settings write" on public.goal_settings;
create policy "Goal settings write" on public.goal_settings for all to authenticated
using ((select public.fn_current_role()) = 'superadmin'
       or (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_current_role()) in ('candidato','coordinador_campana')))
with check ((select public.fn_current_role()) = 'superadmin'
       or (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_current_role()) in ('candidato','coordinador_campana')));
grant select, insert, update on public.goal_settings to authenticated;

-- ═══ 3) Metas ═══
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null unique references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  sections text[] not null default '{}',
  meta_votos integer not null default 0 check (meta_votos >= 0),
  meta_simpatizantes integer not null default 0 check (meta_simpatizantes >= 0),
  meta_contactos integer not null default 0 check (meta_contactos >= 0),
  method text not null default 'manual' check (method in ('historico','reparto','manual')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists goals_tenant_idx on public.goals (tenant_id);
alter table public.goals enable row level security;
revoke all on public.goals from anon;
drop policy if exists "Goals scoped read" on public.goals;
create policy "Goals scoped read" on public.goals for select to authenticated
using ((select public.fn_current_role()) = 'superadmin'
       or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
           and ((select public.fn_current_role()) in ('candidato','coordinador_campana')
                or user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])))));
grant select on public.goals to authenticated;

-- ═══ 4) Helpers ═══
create or replace function public.fn_team_of(p_user_id uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  with recursive team as (
    select id from public.users where id = p_user_id
    union all
    select u.id from public.users u join team t on u.parent_id = t.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) from team
$$;

create or replace function public.fn_can_manage(p_user_id uuid, p_allow_self boolean default false)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.fn_current_role() = 'superadmin' then true
    when p_user_id = public.fn_current_user_id() then p_allow_self
    else exists (select 1 from public.users u where u.id = p_user_id
                   and u.tenant_id = any(public.fn_current_tenant_scope())
                   and (public.fn_current_role() in ('candidato','coordinador_campana')
                        or u.id = any(public.fn_current_team_ids())))
  end
$$;

create or replace function public.fn_territory_sections(p_user_id uuid)
returns table(section_id text, weight numeric)
language plpgsql stable security definer set search_path = public as $$
declare t jsonb; lt text; z text[];
begin
  if not public.fn_can_manage(p_user_id, true) then return; end if;
  select assigned_territory into t from public.users where id = p_user_id;
  lt := lower(coalesce(t->>'layer_type', ''));
  z := array(select jsonb_array_elements_text(coalesce(t->'zone_ids', '[]'::jsonb)));
  if coalesce(array_length(z, 1), 0) = 0 then return; end if;

  if lt = 'seccion' then
    return query select distinct x, 1::numeric from unnest(z) x;
  elsif lt = 'municipio' then
    return query select distinct s, 1::numeric from (
      select p.section_id s from public.padron_electoral p where p.municipality_id::text = any(z)
      union select e.seccion::text from public.electoral_sections e where e.municipio::text = any(z)) q;
  elsif lt = 'distrito_federal' then
    return query select distinct s, 1::numeric from (
      select p.section_id s from public.padron_electoral p where p.distrito_f::text = any(z)
      union select e.seccion::text from public.electoral_sections e where e.distrito_f::text = any(z)) q;
  elsif lt = 'distrito_local' then
    return query select distinct e.seccion::text, 1::numeric from public.electoral_sections e where e.distrito_l::text = any(z);
  elsif lt = 'colonia' then
    return query select c.seccion::text, least(1, sum(c.porcentaje) / 100.0)
      from public.colonia_secciones c where c.colonia_id::text = any(z) and c.porcentaje >= 1
      group by c.seccion;
  end if;
end;
$$;

-- ═══ 5) Línea base por sección ═══
create or replace function public.fn_section_baseline(p_sections text[], p_tenant_id uuid default null)
returns table(section_id text, municipality text, lista_nominal_actual integer, lista_nominal_base integer,
              votos_base integer, ganador_base integer, segundo_base integer, participacion numeric,
              margen_pct numeric, meta_votos integer, meta_simpatizantes integer, meta_contactos integer)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select coalesce(g.method, 'ganador') method, coalesce(g.base_year, 2024) base_year,
           coalesce(g.base_election, 'gubernatura') base_election, coalesce(g.win_margin, 0.10) win_margin,
           coalesce(g.target_share, 0.50) target_share, coalesce(g.supporter_ratio, 0.40) supporter_ratio,
           coalesce(g.contacts_per_supporter, 3) cps
    from (select 1) d left join public.goal_settings g
      on g.tenant_id = coalesce(p_tenant_id, public.fn_current_user_tenant())
  ), base as (
    select h.section_id, h.municipality, h.nominal_list_size ln_base, h.total_votes votos,
           h.winning_votes ganador, h.second_place_votes segundo,
           (select p.lista_nominal from public.padron_electoral p where p.section_id = h.section_id
             order by p.year desc limit 1) ln_actual
    from public.historical_election_results h, cfg
    where h.section_id = any(p_sections) and h.election_year = cfg.base_year and h.election_type = cfg.base_election
  ), calc as (
    select b.*, cfg.*,
           least(1.5, greatest(0.8, coalesce(b.ln_actual::numeric / nullif(b.ln_base, 0), 1))) growth,
           coalesce(b.votos::numeric / nullif(b.ln_base, 0), 0.5) part
    from base b, cfg
  )
  select section_id, municipality, ln_actual, ln_base, votos, ganador, segundo, round(part, 3),
         round(coalesce((ganador - segundo)::numeric / nullif(votos, 0), 0), 3),
         mv, ceil(mv * supporter_ratio)::int, ceil(ceil(mv * supporter_ratio) * cps)::int
  from (select c.*, (case when c.method = 'participacion'
                         then ceil(coalesce(c.ln_actual, c.ln_base) * c.part * c.target_share)
                         else ceil(c.ganador * (1 + c.win_margin) * c.growth) end)::int mv
        from calc c) x
$$;

-- ═══ 6) Sugerencia de meta ═══
create or replace function public.fn_suggest_goal(p_user_id uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  u record; v_secs text[]; v_n int; r json; pg record; v_siblings int; v_assigned record;
begin
  if not public.fn_can_manage(p_user_id, true) then raise exception 'Sin permiso sobre este usuario'; end if;
  select id, tenant_id, parent_id, role, name into u from public.users where id = p_user_id;

  select array_agg(section_id) into v_secs from public.fn_territory_sections(p_user_id);
  v_n := coalesce(array_length(v_secs, 1), 0);

  if v_n > 0 then
    select json_build_object(
      'method', 'historico',
      'sections', v_secs,
      'sections_count', v_n,
      'sections_with_data', count(b.section_id),
      'lista_nominal', coalesce(sum(round(coalesce(b.lista_nominal_actual, b.lista_nominal_base) * t.weight)), 0),
      'votos_base', coalesce(sum(round(b.votos_base * t.weight)), 0),
      'ganador_base', coalesce(sum(round(b.ganador_base * t.weight)), 0),
      'meta_votos', coalesce(sum(ceil(b.meta_votos * t.weight)), 0),
      'meta_simpatizantes', coalesce(sum(ceil(b.meta_simpatizantes * t.weight)), 0),
      'meta_contactos', coalesce(sum(ceil(b.meta_contactos * t.weight)), 0),
      'secciones_competidas', count(*) filter (where b.margen_pct < 0.10))
    into r
    from public.fn_territory_sections(p_user_id) t
    left join public.fn_section_baseline(v_secs, u.tenant_id) b on b.section_id = t.section_id;
    return r;
  end if;

  select * into pg from public.goals where user_id = u.parent_id;
  if pg.id is null then
    return json_build_object('method', 'sin_base', 'sections_count', 0,
      'mensaje', 'Asigna un territorio o define primero la meta del superior.');
  end if;
  select count(*) into v_siblings from public.users s
   where s.parent_id = u.parent_id and s.is_active is not false
     and not exists (select 1 from public.goals g where g.user_id = s.id and s.id <> p_user_id);
  select coalesce(sum(g.meta_votos), 0) mv, coalesce(sum(g.meta_simpatizantes), 0) ms, coalesce(sum(g.meta_contactos), 0) mc
    into v_assigned
    from public.goals g join public.users s on s.id = g.user_id
   where s.parent_id = u.parent_id and s.id <> p_user_id;
  v_siblings := greatest(v_siblings, 1);
  return json_build_object(
    'method', 'reparto', 'sections', pg.sections, 'sections_count', coalesce(array_length(pg.sections, 1), 0),
    'meta_votos', greatest(0, ceil((pg.meta_votos - v_assigned.mv)::numeric / v_siblings)),
    'meta_simpatizantes', greatest(0, ceil((pg.meta_simpatizantes - v_assigned.ms)::numeric / v_siblings)),
    'meta_contactos', greatest(0, ceil((pg.meta_contactos - v_assigned.mc)::numeric / v_siblings)),
    'repartido_entre', v_siblings);
end;
$$;

-- ═══ 7) Fijar meta ═══
create or replace function public.fn_set_goal(p_user_id uuid, p_meta_votos integer, p_meta_simpatizantes integer,
                                              p_meta_contactos integer, p_method text default 'manual', p_notes text default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare u record; v_id uuid; v_secs text[];
begin
  if not public.fn_can_manage(p_user_id,
       public.fn_current_role() in ('coordinador_territorial','coordinador','coordinador_campana','candidato','superadmin')) then
    raise exception 'Solo tu cadena de mando puede fijar esta meta';
  end if;
  if least(p_meta_votos, p_meta_simpatizantes, p_meta_contactos) < 0 then raise exception 'Metas inválidas'; end if;
  select id, tenant_id into u from public.users where id = p_user_id;
  select coalesce(array_agg(section_id), '{}') into v_secs from public.fn_territory_sections(p_user_id);
  insert into public.goals (tenant_id, user_id, assigned_by, sections, meta_votos, meta_simpatizantes, meta_contactos, method, notes)
  values (u.tenant_id, p_user_id, public.fn_current_user_id(), v_secs, p_meta_votos, p_meta_simpatizantes, p_meta_contactos,
          case when p_method in ('historico','reparto','manual') then p_method else 'manual' end, p_notes)
  on conflict (user_id) do update set
    assigned_by = excluded.assigned_by, sections = excluded.sections, meta_votos = excluded.meta_votos,
    meta_simpatizantes = excluded.meta_simpatizantes, meta_contactos = excluded.meta_contactos,
    method = excluded.method, notes = excluded.notes, updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ═══ 8) Tablero ═══
create or replace function public.fn_goal_board(p_root uuid default null)
returns table(user_id uuid, name text, role text, is_root boolean, territory_type text, territory_zones integer,
              meta_votos integer, meta_simpatizantes integer, meta_contactos integer, method text,
              avance_simpatizantes bigint, avance_contactos bigint, avance_convencidos bigint, actividades bigint,
              repartido_simpatizantes bigint, equipo integer, sin_meta integer)
language plpgsql stable security definer set search_path = public as $$
declare v_root uuid := coalesce(p_root, public.fn_current_user_id()); v_start timestamptz;
begin
  if not public.fn_can_manage(v_root, true) then raise exception 'Sin permiso'; end if;
  select coalesce(gs.campaign_start::timestamptz, '1970-01-01'::timestamptz) into v_start
    from public.users u left join public.goal_settings gs on gs.tenant_id = u.tenant_id where u.id = v_root;
  return query
  with people as (
    select u.id, u.name, u.role, (u.id = v_root) is_root, u.assigned_territory at
    from public.users u where u.id = v_root or (u.parent_id = v_root and u.is_active is not false)
  )
  select p.id, p.name, p.role, p.is_root,
         p.at->>'layer_type', coalesce(jsonb_array_length(p.at->'zone_ids'), 0),
         g.meta_votos, g.meta_simpatizantes, g.meta_contactos, g.method,
         (select count(*) from public.supporters s
           where s.recruiter_id = any(public.fn_team_of(p.id)) and s.created_at >= v_start),
         (select coalesce(sum(a.contacts_count), 0) from public.field_activities a
           where a.user_id = any(public.fn_team_of(p.id)) and a.occurred_at >= v_start),
         (select coalesce(sum(a.convinced_count), 0) from public.field_activities a
           where a.user_id = any(public.fn_team_of(p.id)) and a.occurred_at >= v_start),
         (select count(*) from public.field_activities a
           where a.user_id = any(public.fn_team_of(p.id)) and a.occurred_at >= v_start),
         (select coalesce(sum(g2.meta_simpatizantes), 0) from public.goals g2 join public.users c on c.id = g2.user_id
           where c.parent_id = p.id),
         (select count(*)::int from public.users c where c.parent_id = p.id and c.is_active is not false),
         (select count(*)::int from public.users c where c.parent_id = p.id and c.is_active is not false
             and not exists (select 1 from public.goals g3 where g3.user_id = c.id))
  from people p left join public.goals g on g.user_id = p.id
  order by p.is_root desc, p.name;
end;
$$;

-- ═══ 9) Permisos ═══
revoke execute on function public.fn_team_of(uuid) from public, anon, authenticated;
revoke execute on function public.fn_can_manage(uuid, boolean) from public, anon;
revoke execute on function public.fn_territory_sections(uuid) from public, anon;
revoke execute on function public.fn_section_baseline(text[], uuid) from public, anon;
revoke execute on function public.fn_suggest_goal(uuid) from public, anon;
revoke execute on function public.fn_set_goal(uuid, integer, integer, integer, text, text) from public, anon;
revoke execute on function public.fn_goal_board(uuid) from public, anon;
grant execute on function public.fn_can_manage(uuid, boolean) to authenticated;
grant execute on function public.fn_territory_sections(uuid) to authenticated;
grant execute on function public.fn_section_baseline(text[], uuid) to authenticated;
grant execute on function public.fn_suggest_goal(uuid) to authenticated;
grant execute on function public.fn_set_goal(uuid, integer, integer, integer, text, text) to authenticated;
grant execute on function public.fn_goal_board(uuid) to authenticated;
