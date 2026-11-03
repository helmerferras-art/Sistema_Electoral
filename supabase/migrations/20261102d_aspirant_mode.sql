-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-02 (aspirant_mode).
-- Modo aspirante: el sistema sirve para campaña constitucional (meta de votos) y para aspirantes en
-- procesos internos (ganar una encuesta) o que buscan darse a conocer (meta por alcance).
--   objective = 'votos'        → meta de votos con histórico (como antes)
--   objective = 'encuesta'     → personas a alcanzar = lista nominal × reach_target; simpatizantes = alcance × preference_target
--   objective = 'conocimiento' → igual que encuesta, con otros porcentajes
-- Bitácora: known_count = contactados que ya conocían al aspirante → termómetro de conocimiento por sección.

alter table public.goal_settings add column if not exists objective text not null default 'votos'
  check (objective in ('votos','encuesta','conocimiento'));
alter table public.goal_settings add column if not exists reach_target numeric not null default 0.25
  check (reach_target between 0.01 and 1);
alter table public.goal_settings add column if not exists preference_target numeric not null default 0.40
  check (preference_target between 0.01 and 1);

alter table public.field_activities add column if not exists known_count integer not null default 0;
alter table public.field_activities drop constraint if exists field_activities_known_count_check;
alter table public.field_activities add constraint field_activities_known_count_check
  check (known_count >= 0 and known_count <= contacts_count);

create or replace function public.fn_section_baseline(p_sections text[], p_tenant_id uuid default null)
returns table(section_id text, municipality text, lista_nominal_actual integer, lista_nominal_base integer,
              votos_base integer, ganador_base integer, segundo_base integer, participacion numeric,
              margen_pct numeric, meta_votos integer, meta_simpatizantes integer, meta_contactos integer)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select coalesce(g.objective, 'votos') objective, coalesce(g.method, 'ganador') method,
           coalesce(g.base_year, 2024) base_year, coalesce(g.base_election, 'gubernatura') base_election,
           coalesce(g.win_margin, 0.10) win_margin, coalesce(g.target_share, 0.50) target_share,
           coalesce(g.supporter_ratio, 0.40) supporter_ratio, coalesce(g.contacts_per_supporter, 3) cps,
           coalesce(g.reach_target, 0.25) reach, coalesce(g.preference_target, 0.40) pref
    from (select 1) d left join public.goal_settings g
      on g.tenant_id = coalesce(p_tenant_id, public.fn_current_user_tenant())
  ), secs as (
    select distinct s from unnest(p_sections) s
  ), base as (
    select s.s section_id,
           coalesce(h.municipality, p.municipality) municipality,
           h.nominal_list_size ln_base, h.total_votes votos, h.winning_votes ganador, h.second_place_votes segundo,
           p.lista_nominal ln_actual
    from secs s cross join cfg
    left join public.historical_election_results h
      on h.section_id = s.s and h.election_year = cfg.base_year and h.election_type = cfg.base_election
    left join lateral (select pe.lista_nominal, pe.municipality from public.padron_electoral pe
                        where pe.section_id = s.s order by pe.year desc limit 1) p on true
  ), calc as (
    select b.*, cfg.*,
           least(1.5, greatest(0.8, coalesce(b.ln_actual::numeric / nullif(b.ln_base, 0), 1))) growth,
           coalesce(b.votos::numeric / nullif(b.ln_base, 0), 0.5) part,
           coalesce(b.ln_actual, b.ln_base) ln
    from base b, cfg
    where b.ln_base is not null or b.ln_actual is not null
  ), metas as (
    select c.*,
      case
        when c.objective = 'votos' and c.method = 'participacion' then ceil(c.ln * c.part * c.target_share)
        when c.objective = 'votos' then ceil(coalesce(c.ganador, 0) * (1 + c.win_margin) * c.growth)
        else 0 end::int mv,
      case when c.objective = 'votos' then null else ceil(c.ln * c.reach)::int end alcance
    from calc c
  )
  select section_id, municipality, ln_actual, ln_base, votos, ganador, segundo, round(part, 3),
         round(coalesce((ganador - segundo)::numeric / nullif(votos, 0), 0), 3),
         mv,
         (case when objective = 'votos' then ceil(mv * supporter_ratio) else ceil(alcance * pref) end)::int,
         (case when objective = 'votos' then ceil(ceil(mv * supporter_ratio) * cps) else alcance end)::int
  from metas
$$;

create or replace function public.fn_suggest_goal(p_user_id uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  u record; v_secs text[]; v_n int; r json; pg record; v_siblings int; v_assigned record; v_obj text;
begin
  if not public.fn_can_manage(p_user_id, true) then raise exception 'Sin permiso sobre este usuario'; end if;
  select id, tenant_id, parent_id, role, name into u from public.users where id = p_user_id;
  select coalesce(objective, 'votos') into v_obj from public.goal_settings where tenant_id = u.tenant_id;
  v_obj := coalesce(v_obj, 'votos');

  select array_agg(section_id) into v_secs from public.fn_territory_sections(p_user_id);
  v_n := coalesce(array_length(v_secs, 1), 0);

  if v_n > 0 then
    select json_build_object(
      'method', 'historico', 'objective', v_obj,
      'sections', v_secs,
      'sections_count', v_n,
      'sections_with_data', count(b.section_id),
      'lista_nominal', coalesce(sum(round(coalesce(b.lista_nominal_actual, b.lista_nominal_base) * t.weight)), 0),
      'votos_base', coalesce(sum(round(b.votos_base * t.weight)), 0),
      'ganador_base', coalesce(sum(round(b.ganador_base * t.weight)), 0),
      'meta_votos', coalesce(sum(ceil(b.meta_votos * t.weight)), 0),
      'meta_simpatizantes', coalesce(sum(ceil(b.meta_simpatizantes * t.weight)), 0),
      'meta_contactos', coalesce(sum(ceil(b.meta_contactos * t.weight)), 0),
      'secciones_competidas', count(*) filter (where b.margen_pct < 0.10 and b.votos_base is not null))
    into r
    from public.fn_territory_sections(p_user_id) t
    left join public.fn_section_baseline(v_secs, u.tenant_id) b on b.section_id = t.section_id;
    return r;
  end if;

  select * into pg from public.goals where user_id = u.parent_id;
  if pg.id is null then
    return json_build_object('method', 'sin_base', 'objective', v_obj, 'sections_count', 0,
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
    'method', 'reparto', 'objective', v_obj, 'sections', pg.sections, 'sections_count', coalesce(array_length(pg.sections, 1), 0),
    'meta_votos', greatest(0, ceil((pg.meta_votos - v_assigned.mv)::numeric / v_siblings)),
    'meta_simpatizantes', greatest(0, ceil((pg.meta_simpatizantes - v_assigned.ms)::numeric / v_siblings)),
    'meta_contactos', greatest(0, ceil((pg.meta_contactos - v_assigned.mc)::numeric / v_siblings)),
    'repartido_entre', v_siblings);
end;
$$;

drop function if exists public.fn_goal_board(uuid);
create or replace function public.fn_goal_board(p_root uuid default null)
returns table(user_id uuid, name text, role text, is_root boolean, territory_type text, territory_zones integer,
              meta_votos integer, meta_simpatizantes integer, meta_contactos integer, method text,
              periodo_inicio date, periodo_fin date, dias_restantes integer, fraccion_esperada numeric,
              esperado_simpatizantes integer, esperado_contactos integer,
              avance_simpatizantes bigint, avance_contactos bigint, avance_convencidos bigint, avance_conocian bigint,
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
  )
  select p.id, p.name, p.role, p.is_root,
         p.at->>'layer_type', coalesce(jsonb_array_length(p.at->'zone_ids'), 0),
         g.meta_votos, g.meta_simpatizantes, g.meta_contactos, g.method,
         p.ws, p.we, greatest(0, p.we - current_date)::int, round(p.f, 4),
         round(coalesce(g.meta_simpatizantes, 0) * p.f)::int, round(coalesce(g.meta_contactos, 0) * p.f)::int,
         (select count(*) from public.supporters s where s.recruiter_id = any(p.team) and s.created_at::date >= p.ws),
         a.c, a.v, a.k, a.n,
         (select coalesce(sum(g2.meta_simpatizantes), 0) from public.goals g2 join public.users c on c.id = g2.user_id
           where c.parent_id = p.id),
         (select count(*)::int from public.users c where c.parent_id = p.id and c.is_active is not false),
         (select count(*)::int from public.users c where c.parent_id = p.id and c.is_active is not false
             and not exists (select 1 from public.goals g3 where g3.user_id = c.id))
  from win p left join public.goals g on g.user_id = p.id join act a on a.id = p.id
  order by p.is_root desc, p.name;
end;
$$;
revoke execute on function public.fn_goal_board(uuid) from public, anon;
grant execute on function public.fn_goal_board(uuid) to authenticated;

create or replace function public.fn_recognition_by_section(p_days integer default 30)
returns table(section_id text, actividades bigint, contactos bigint, conocian bigint, prefieren bigint,
              pct_conocimiento numeric, pct_preferencia numeric, lat double precision, lng double precision)
language sql stable security invoker set search_path = public as $$
  select coalesce(a.geo_section_id, 'sin sección'), count(*), sum(a.contacts_count), sum(a.known_count), sum(a.convinced_count),
         round(sum(a.known_count)::numeric / nullif(sum(a.contacts_count), 0), 3),
         round(sum(a.convinced_count)::numeric / nullif(sum(a.contacts_count), 0), 3),
         avg(a.latitude), avg(a.longitude)
  from public.field_activities a
  where a.occurred_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
  group by 1
  order by sum(a.contacts_count) desc
$$;
revoke execute on function public.fn_recognition_by_section(integer) from public, anon;
grant execute on function public.fn_recognition_by_section(integer) to authenticated;
