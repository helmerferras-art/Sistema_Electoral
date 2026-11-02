-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-02 (goals_calendar).
-- Temporalidad de las metas: calendario de campaña con fases ponderadas, periodo propio por meta,
-- fracción esperada a una fecha, calendario semanal (meta vs real) y ritmo en el tablero.

-- ═══ 1) Calendario de campaña ═══
alter table public.goal_settings add column if not exists pacing text not null default 'fases'
  check (pacing in ('lineal','fases'));

create table if not exists public.campaign_phases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  start_date date not null,
  end_date date not null,
  weight numeric not null default 0 check (weight between 0 and 100),
  sort integer not null default 0,
  check (end_date >= start_date)
);
create index if not exists campaign_phases_tenant_idx on public.campaign_phases (tenant_id, start_date);
alter table public.campaign_phases enable row level security;
revoke all on public.campaign_phases from anon;
drop policy if exists "Phases read" on public.campaign_phases;
create policy "Phases read" on public.campaign_phases for select to authenticated
using ((select public.fn_current_role()) = 'superadmin' or tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[])));
drop policy if exists "Phases write" on public.campaign_phases;
create policy "Phases write" on public.campaign_phases for all to authenticated
using ((select public.fn_current_role()) = 'superadmin'
       or (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_current_role()) in ('candidato','coordinador_campana')))
with check ((select public.fn_current_role()) = 'superadmin'
       or (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_current_role()) in ('candidato','coordinador_campana')));
grant select, insert, update, delete on public.campaign_phases to authenticated;

-- ═══ 2) Periodo propio de cada meta ═══
alter table public.goals add column if not exists start_date date;
alter table public.goals add column if not exists end_date date;

create or replace function public.fn_goal_window(p_user_id uuid)
returns table(start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select coalesce(g.start_date, gs.campaign_start, g.created_at::date, current_date) s,
         greatest(coalesce(g.end_date, gs.campaign_end, coalesce(g.start_date, gs.campaign_start, g.created_at::date, current_date) + 90),
                  coalesce(g.start_date, gs.campaign_start, g.created_at::date, current_date))
  from public.users u
  left join public.goals g on g.user_id = u.id
  left join public.goal_settings gs on gs.tenant_id = u.tenant_id
  where u.id = p_user_id
$$;

create or replace function public.fn_expected_fraction(p_tenant_id uuid, p_start date, p_end date, p_at date)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_pacing text; v_total numeric; v_done numeric;
begin
  if p_at < p_start then return 0; end if;
  if p_at >= p_end then return 1; end if;
  select coalesce(pacing, 'fases') into v_pacing from public.goal_settings where tenant_id = p_tenant_id;

  if coalesce(v_pacing, 'fases') = 'fases' then
    select sum(ph.weight * greatest(0, (least(ph.end_date, p_end) - greatest(ph.start_date, p_start) + 1))::numeric
                         / (ph.end_date - ph.start_date + 1)),
           sum(ph.weight * greatest(0, (least(ph.end_date, p_end, p_at) - greatest(ph.start_date, p_start) + 1))::numeric
                         / (ph.end_date - ph.start_date + 1))
      into v_total, v_done
      from public.campaign_phases ph
     where ph.tenant_id = p_tenant_id and ph.end_date >= p_start and ph.start_date <= p_end;
    if coalesce(v_total, 0) > 0 then
      return least(1, greatest(0, v_done / v_total));
    end if;
  end if;
  return least(1, greatest(0, (p_at - p_start + 1)::numeric / (p_end - p_start + 1)));
end;
$$;

-- ═══ 3) Calendario semanal ═══
create or replace function public.fn_goal_schedule(p_user_id uuid)
returns table(period_start date, period_end date, phase text, is_current boolean,
              meta_simpatizantes integer, meta_contactos integer,
              meta_simpatizantes_acum integer, meta_contactos_acum integer,
              real_simpatizantes integer, real_contactos integer,
              real_simpatizantes_acum integer, real_contactos_acum integer)
language plpgsql stable security definer set search_path = public as $$
declare g record; w record; v_tenant uuid; v_team uuid[];
begin
  if not public.fn_can_manage(p_user_id, true) then raise exception 'Sin permiso'; end if;
  select * into g from public.goals where user_id = p_user_id;
  if g.id is null then return; end if;
  select tenant_id into v_tenant from public.users where id = p_user_id;
  select * into w from public.fn_goal_window(p_user_id);
  v_team := public.fn_team_of(p_user_id);

  return query
  with weeks as (
    select greatest(d::date, w.start_date) ps, least((d + interval '6 days')::date, w.end_date) pe
    from generate_series(date_trunc('week', w.start_date::timestamp), w.end_date::timestamp, interval '7 days') d
  ), calc as (
    select wk.ps, wk.pe,
           public.fn_expected_fraction(v_tenant, w.start_date, w.end_date, wk.pe) f_end,
           public.fn_expected_fraction(v_tenant, w.start_date, w.end_date, wk.ps - 1) f_start,
           (select count(*) from public.supporters s where s.recruiter_id = any(v_team)
              and s.created_at::date between wk.ps and wk.pe)::int rs,
           (select coalesce(sum(a.contacts_count), 0) from public.field_activities a where a.user_id = any(v_team)
              and a.occurred_at::date between wk.ps and wk.pe)::int rc
    from weeks wk
  )
  select c.ps, c.pe,
         (select ph.name from public.campaign_phases ph where ph.tenant_id = v_tenant
            and ph.start_date <= c.pe and ph.end_date >= c.ps order by ph.start_date limit 1),
         current_date between c.ps and c.pe,
         (round(g.meta_simpatizantes * c.f_end) - round(g.meta_simpatizantes * c.f_start))::int,
         (round(g.meta_contactos * c.f_end) - round(g.meta_contactos * c.f_start))::int,
         round(g.meta_simpatizantes * c.f_end)::int,
         round(g.meta_contactos * c.f_end)::int,
         c.rs, c.rc,
         (sum(c.rs) over (order by c.ps))::int,
         (sum(c.rc) over (order by c.ps))::int
  from calc c
  order by c.ps;
end;
$$;

-- ═══ 4) Fijar meta con periodo ═══
drop function if exists public.fn_set_goal(uuid, integer, integer, integer, text, text);
create or replace function public.fn_set_goal(p_user_id uuid, p_meta_votos integer, p_meta_simpatizantes integer,
                                              p_meta_contactos integer, p_method text default 'manual', p_notes text default null,
                                              p_start_date date default null, p_end_date date default null)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare u record; v_id uuid; v_secs text[];
begin
  if not public.fn_can_manage(p_user_id,
       public.fn_current_role() in ('coordinador_territorial','coordinador','coordinador_campana','candidato','superadmin')) then
    raise exception 'Solo tu cadena de mando puede fijar esta meta';
  end if;
  if least(p_meta_votos, p_meta_simpatizantes, p_meta_contactos) < 0 then raise exception 'Metas inválidas'; end if;
  if p_start_date is not null and p_end_date is not null and p_end_date < p_start_date then
    raise exception 'La fecha final no puede ser anterior a la inicial';
  end if;
  select id, tenant_id into u from public.users where id = p_user_id;
  select coalesce(array_agg(section_id), '{}') into v_secs from public.fn_territory_sections(p_user_id);
  insert into public.goals (tenant_id, user_id, assigned_by, sections, meta_votos, meta_simpatizantes, meta_contactos,
                            method, notes, start_date, end_date)
  values (u.tenant_id, p_user_id, public.fn_current_user_id(), v_secs, p_meta_votos, p_meta_simpatizantes, p_meta_contactos,
          case when p_method in ('historico','reparto','manual') then p_method else 'manual' end, p_notes,
          p_start_date, p_end_date)
  on conflict (user_id) do update set
    assigned_by = excluded.assigned_by, sections = excluded.sections, meta_votos = excluded.meta_votos,
    meta_simpatizantes = excluded.meta_simpatizantes, meta_contactos = excluded.meta_contactos,
    method = excluded.method, notes = excluded.notes, start_date = excluded.start_date, end_date = excluded.end_date,
    updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ═══ 5) Tablero con ritmo ═══
drop function if exists public.fn_goal_board(uuid);
create or replace function public.fn_goal_board(p_root uuid default null)
returns table(user_id uuid, name text, role text, is_root boolean, territory_type text, territory_zones integer,
              meta_votos integer, meta_simpatizantes integer, meta_contactos integer, method text,
              periodo_inicio date, periodo_fin date, dias_restantes integer, fraccion_esperada numeric,
              esperado_simpatizantes integer, esperado_contactos integer,
              avance_simpatizantes bigint, avance_contactos bigint, avance_convencidos bigint, actividades bigint,
              repartido_simpatizantes bigint, equipo integer, sin_meta integer)
language plpgsql stable security definer set search_path = public as $$
declare v_root uuid := coalesce(p_root, public.fn_current_user_id()); v_tenant uuid;
begin
  if not public.fn_can_manage(v_root, true) then raise exception 'Sin permiso'; end if;
  select tenant_id into v_tenant from public.users where id = v_root;
  return query
  with people as (
    select u.id, u.name, u.role, (u.id = v_root) is_root, u.assigned_territory at, u.tenant_id
    from public.users u where u.id = v_root or (u.parent_id = v_root and u.is_active is not false)
  ), win as (
    select p.*, w.start_date ws, w.end_date we,
           public.fn_expected_fraction(p.tenant_id, w.start_date, w.end_date, current_date) f
    from people p cross join lateral public.fn_goal_window(p.id) w
  )
  select p.id, p.name, p.role, p.is_root,
         p.at->>'layer_type', coalesce(jsonb_array_length(p.at->'zone_ids'), 0),
         g.meta_votos, g.meta_simpatizantes, g.meta_contactos, g.method,
         p.ws, p.we, greatest(0, p.we - current_date)::int, round(p.f, 4),
         round(coalesce(g.meta_simpatizantes, 0) * p.f)::int, round(coalesce(g.meta_contactos, 0) * p.f)::int,
         (select count(*) from public.supporters s
           where s.recruiter_id = any(public.fn_team_of(p.id)) and s.created_at::date >= p.ws),
         (select coalesce(sum(a.contacts_count), 0) from public.field_activities a
           where a.user_id = any(public.fn_team_of(p.id)) and a.occurred_at::date >= p.ws),
         (select coalesce(sum(a.convinced_count), 0) from public.field_activities a
           where a.user_id = any(public.fn_team_of(p.id)) and a.occurred_at::date >= p.ws),
         (select count(*) from public.field_activities a
           where a.user_id = any(public.fn_team_of(p.id)) and a.occurred_at::date >= p.ws),
         (select coalesce(sum(g2.meta_simpatizantes), 0) from public.goals g2 join public.users c on c.id = g2.user_id
           where c.parent_id = p.id),
         (select count(*)::int from public.users c where c.parent_id = p.id and c.is_active is not false),
         (select count(*)::int from public.users c where c.parent_id = p.id and c.is_active is not false
             and not exists (select 1 from public.goals g3 where g3.user_id = c.id))
  from win p left join public.goals g on g.user_id = p.id
  order by p.is_root desc, p.name;
end;
$$;

-- ═══ 6) Permisos ═══
revoke execute on function public.fn_goal_window(uuid) from public, anon, authenticated;
revoke execute on function public.fn_expected_fraction(uuid, date, date, date) from public, anon;
revoke execute on function public.fn_goal_schedule(uuid) from public, anon;
revoke execute on function public.fn_set_goal(uuid, integer, integer, integer, text, text, date, date) from public, anon;
revoke execute on function public.fn_goal_board(uuid) from public, anon;
grant execute on function public.fn_expected_fraction(uuid, date, date, date) to authenticated;
grant execute on function public.fn_goal_schedule(uuid) to authenticated;
grant execute on function public.fn_set_goal(uuid, integer, integer, integer, text, text, date, date) to authenticated;
grant execute on function public.fn_goal_board(uuid) to authenticated;
