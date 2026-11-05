create or replace function public.fn_demo_spec()
returns jsonb language sql immutable as $f$ select $j$[
   {"k":1, "name":"DEMO · Gubernatura Chiapas 2030", "slug":"demo-gubernatura", "position":"gubernatura",
    "scope":"CHIAPAS", "objective":"votos", "base":"gubernatura", "cand":"Lucía Ordóñez Pineda", "meta":120,
    "thanks":"¡Gracias por abrirnos la puerta! Chiapas se construye platicando casa por casa. Juntos vamos a cuidar lo que importa: agua, salud y empleo para tu colonia.",
    "coords":[{"layer":"distrito_federal","zone":"9","df":9,"name":"Región Centro (Tuxtla)"},
              {"layer":"distrito_federal","zone":"12","df":12,"name":"Región Soconusco (Tapachula)"},
              {"layer":"distrito_federal","zone":"5","df":5,"name":"Región Altos (San Cristóbal)"}],
    "lideres":2, "brig":3, "profiles":["bueno","estrella","regular","bueno","malo","bueno","regular","bueno","estrella"]},
   {"k":2, "name":"DEMO · Presidencia Municipal Tuxtla 2030", "slug":"demo-tuxtla", "position":"presidencia_municipal",
    "scope":"TUXTLA GUTIERREZ", "objective":"votos", "base":"ayuntamiento", "cand":"Andrés Molina Toledo", "meta":100,
    "thanks":"Gracias por tu tiempo. Tuxtla merece calles seguras, colonias con servicios y un gobierno que escuche. Síguenos para enterarte de las reuniones en tu colonia.",
    "coords":[{"layer":"distrito_local","zone":"1","mun":102,"dl":1,"name":"Tuxtla Poniente"},
              {"layer":"distrito_local","zone":"13","mun":102,"dl":13,"name":"Tuxtla Oriente"}],
    "lideres":2, "brig":3, "profiles":["estrella","bueno","regular","malo","bueno","regular"]},
   {"k":3, "name":"DEMO · Aspirante San Cristóbal (encuesta interna)", "slug":"demo-aspirante", "position":"presidencia_municipal",
    "scope":"SAN CRISTOBAL DE LAS CASAS", "objective":"encuesta", "base":"ayuntamiento", "cand":"Julieta Castañón Ruiz", "meta":60,
    "thanks":"Gracias por escucharnos. Queremos conocer lo que piensas de tu barrio y construir propuestas contigo. Sigue nuestras redes para conocer más.",
    "coords":[{"layer":"seccion","mun":77,"part":0,"name":"Barrios del Centro"},
              {"layer":"seccion","mun":77,"part":1,"name":"Zona Norte y Periferia"}],
    "lideres":2, "brig":2, "profiles":["bueno","estrella","regular","bueno","bueno","regular","estrella","bueno"]}
  ]$j$::jsonb $f$;

-- Crea UNA campaña demo a partir de su especificación. p_fixed = teléfonos fijos de presentador (00000K000N).
create or replace function public.fn_demo_seed_campaign(c jsonb, p_slug text, p_fixed boolean)
returns uuid language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  co jsonb; v_start date := current_date - 56; v_end date := current_date + 56;
  v_t uuid; v_cand uuid; v_cc uuid; v_com uuid; v_log uuid; v_coord uuid; v_lid uuid; v_brig uuid;
  v_pool text[]; v_lpool text[]; v_bpool text[]; ci int; li int; bi int; v_bn int; v_prof text; v_n int;
  v_meta int; v_obj text;
begin
    v_obj := c->>'objective';
    insert into public.tenants (name, slug, position, election_type, geographic_scope, is_active, is_demo, description,
                                thanks_title, thanks_message, social_links)
    values (c->>'name', p_slug, c->>'position', 'local', c->>'scope', true, true,
            'Campaña ficticia para demostraciones. Personas y teléfonos inventados.',
            '¡Gracias por escucharnos!', c->>'thanks', '{}'::jsonb)
    returning id into v_t;

    insert into public.goal_settings (tenant_id, method, base_year, base_election, win_margin, target_share, supporter_ratio,
                                      contacts_per_supporter, campaign_start, campaign_end, pacing, objective, reach_target, preference_target)
    values (v_t, 'ganador', 2024, c->>'base', 0.10, 0.50, 0.40, 3, v_start, v_end, 'fases', v_obj, 0.25, 0.40);
    insert into public.campaign_phases (tenant_id, name, start_date, end_date, weight, sort) values
      (v_t, case when v_obj = 'votos' then 'Arranque' else 'Darse a conocer' end, v_start, v_start + 27, 20, 1),
      (v_t, case when v_obj = 'votos' then 'Consolidación' else 'Recorridos y reuniones' end, v_start + 28, v_start + 83, 50, 2),
      (v_t, case when v_obj = 'votos' then 'Cierre' else 'Rumbo a la encuesta' end, v_start + 84, v_end, 30, 3);

    -- Mando: candidato y su primer círculo (teléfonos fijos para poder darles acceso: 00000K000N)
    insert into public.users (tenant_id, name, phone, role, is_active, is_first_login, xp, rank_name)
    values (v_t, c->>'cand', (case when p_fixed then format('00000%s0001', c->>'k') else public.fn_demo_phone() end), 'candidato', true, false, 0, null) returning id into v_cand;
    update public.tenants set owner_id = v_cand where id = v_t;
    insert into public.users (tenant_id, name, phone, role, parent_id, is_active, is_first_login)
    values (v_t, public.fn_demo_person(), (case when p_fixed then format('00000%s0002', c->>'k') else public.fn_demo_phone() end), 'coordinador_campana', v_cand, true, false) returning id into v_cc;
    insert into public.users (tenant_id, name, phone, role, parent_id, is_active, is_first_login)
    values (v_t, public.fn_demo_person(), (case when p_fixed then format('00000%s0003', c->>'k') else public.fn_demo_phone() end), 'comunicacion_digital', v_cand, true, false) returning id into v_com;
    insert into public.users (tenant_id, name, phone, role, parent_id, is_active, is_first_login)
    values (v_t, public.fn_demo_person(), public.fn_demo_phone(), 'coordinador_logistica', v_cand, true, false) returning id into v_log;

    ci := 0; v_bn := 0;
    for co in select * from jsonb_array_elements(c->'coords') loop
      ci := ci + 1;
      -- Secciones reales del territorio
      if co ? 'df' then
        select array_agg(s order by s::int) into v_pool from (
          select seccion::text s from public.electoral_sections where distrito_f = (co->>'df')::int order by seccion limit 36) q;
      elsif co ? 'dl' then
        select array_agg(s order by s::int) into v_pool from (
          select seccion::text s from public.electoral_sections
           where municipio = (co->>'mun')::int and distrito_l = (co->>'dl')::int order by seccion limit 36) q;
      else
        select array_agg(s order by s::int) into v_pool from (
          select seccion::text s from public.electoral_sections where municipio = (co->>'mun')::int
           order by seccion offset (co->>'part')::int * 24 limit 24) q;
      end if;

      insert into public.users (tenant_id, name, phone, role, parent_id, is_active, is_first_login, assigned_territory)
      values (v_t, public.fn_demo_person(),
              case when ci = 1 then (case when p_fixed then format('00000%s0004', c->>'k') else public.fn_demo_phone() end) else public.fn_demo_phone() end,
              'coordinador_territorial', v_cc, true, false,
              jsonb_build_object('layer_type', co->>'layer', 'label', co->>'name',
                                 'zone_ids', case when co ? 'zone' then jsonb_build_array(co->>'zone') else to_jsonb(v_pool) end))
      returning id into v_coord;

      for li in 1..(c->>'lideres')::int loop
        v_lpool := v_pool[1 + (li - 1) * (cardinality(v_pool) / (c->>'lideres')::int) : li * (cardinality(v_pool) / (c->>'lideres')::int)];
        insert into public.users (tenant_id, name, phone, role, parent_id, is_active, is_first_login, assigned_territory)
        values (v_t, public.fn_demo_person(),
                case when ci = 1 and li = 1 then (case when p_fixed then format('00000%s0005', c->>'k') else public.fn_demo_phone() end) else public.fn_demo_phone() end,
                'lider', v_coord, true, false,
                jsonb_build_object('layer_type', 'seccion', 'zone_ids', to_jsonb(v_lpool)))
        returning id into v_lid;

        for bi in 1..(c->>'brig')::int loop
          v_bn := v_bn + 1;
          v_bpool := v_lpool[1 + (bi - 1) * (cardinality(v_lpool) / (c->>'brig')::int) : bi * (cardinality(v_lpool) / (c->>'brig')::int)];
          v_prof := c->'profiles'->>((v_bn - 1) % jsonb_array_length(c->'profiles'));
          insert into public.users (tenant_id, name, phone, role, parent_id, is_active, is_first_login, assigned_territory,
                                    current_streak, last_action_date)
          values (v_t, public.fn_demo_person(),
                  case when ci = 1 and li = 1 and bi = 1 then (case when p_fixed then format('00000%s0006', c->>'k') else public.fn_demo_phone() end) else public.fn_demo_phone() end,
                  'brigadista', v_lid, true, false,
                  jsonb_build_object('layer_type', 'seccion', 'zone_ids', to_jsonb(v_bpool)),
                  case v_prof when 'estrella' then 12 when 'bueno' then 5 when 'regular' then 1 else 3 end,
                  current_date - case v_prof when 'regular' then 4 else 0 end)
          returning id into v_brig;

          v_meta := (c->>'meta')::int;
          v_n := round(v_meta * case v_prof when 'estrella' then 0.70 when 'bueno' then 0.56 when 'regular' then 0.34 else 0.42 end
                       * (0.9 + random() * 0.2));
          perform public.fn_demo_fill_brigadista(v_t, v_brig, v_bpool, v_start, v_n, v_prof, v_obj);

          insert into public.goals (tenant_id, user_id, assigned_by, sections, meta_votos, meta_simpatizantes, meta_contactos,
                                    method, start_date, end_date, notes)
          values (v_t, v_brig, v_lid, v_bpool,
                  case when v_obj = 'votos' then ceil(v_meta / 0.40) else 0 end, v_meta,
                  case when v_obj = 'votos' then v_meta * 5 else v_meta * 8 end, 'reparto', v_start, v_end, null);
        end loop;
      end loop;
    end loop;

    -- Metas hacia arriba: cada jefe = suma de su equipo (+10% de colchón en mandos)
    insert into public.goals (tenant_id, user_id, assigned_by, sections, meta_votos, meta_simpatizantes, meta_contactos, method, start_date, end_date)
    select v_t, u.id, u.parent_id, array(select jsonb_array_elements_text(u.assigned_territory->'zone_ids')),
           sum(g.meta_votos), sum(g.meta_simpatizantes), sum(g.meta_contactos), 'reparto', v_start, v_end
    from public.users u join public.users b on b.parent_id = u.id join public.goals g on g.user_id = b.id
    where u.tenant_id = v_t and u.role = 'lider' group by u.id, u.parent_id, u.assigned_territory;
    insert into public.goals (tenant_id, user_id, assigned_by, meta_votos, meta_simpatizantes, meta_contactos, method, start_date, end_date)
    select v_t, u.id, u.parent_id, sum(g.meta_votos), sum(g.meta_simpatizantes), sum(g.meta_contactos), 'historico', v_start, v_end
    from public.users u join public.users l on l.parent_id = u.id join public.goals g on g.user_id = l.id
    where u.tenant_id = v_t and u.role = 'coordinador_territorial' group by u.id, u.parent_id;
    insert into public.goals (tenant_id, user_id, assigned_by, meta_votos, meta_simpatizantes, meta_contactos, method, start_date, end_date)
    select v_t, v_cc, v_cand, ceil(sum(g.meta_votos) * 1.1), ceil(sum(g.meta_simpatizantes) * 1.1), ceil(sum(g.meta_contactos) * 1.1), 'historico', v_start, v_end
    from public.users u join public.goals g on g.user_id = u.id where u.parent_id = v_cc and u.role = 'coordinador_territorial';
    insert into public.goals (tenant_id, user_id, assigned_by, meta_votos, meta_simpatizantes, meta_contactos, method, start_date, end_date)
    select v_t, v_cand, null, ceil(g.meta_votos * 1.1), ceil(g.meta_simpatizantes * 1.1), ceil(g.meta_contactos * 1.1), 'historico', v_start, v_end
    from public.goals g where g.user_id = v_cc;

    -- Puntos y rangos según lo trabajado (el trigger de rangos genera el aviso de ascenso)
    update public.users u set
      xp = x.xp,
      rank_name = case when x.xp >= 2500 then 'Leyenda Electoral 5' when x.xp >= 2000 then 'Comandante en Jefe'
                       when x.xp >= 1500 then 'Centurión' when x.xp >= 1000 then 'Operador de Campo'
                       when x.xp >= 500 then 'Guardián Táctico' else null end,
      last_latitude = x.lat, last_longitude = x.lng, last_location_at = x.last_at
    from (select b.id, coalesce(count(distinct s.id), 0) * 50 + coalesce(count(distinct a.id), 0) * 20 xp,
                 max(a.latitude) lat, max(a.longitude) lng, max(a.occurred_at) last_at
          from public.users b left join public.supporters s on s.recruiter_id = b.id
          left join public.field_activities a on a.user_id = b.id
          where b.tenant_id = v_t and b.role = 'brigadista' group by b.id) x
    where u.id = x.id;

    -- Llamadas de auditoría ya hechas (~12% de la base), peores resultados con el brigadista "malo"
    insert into public.audit_call_log (tenant_id, supporter_id, agent_id, called_at, outcome, notes)
    select v_t, s.id, v_com, least(now(), s.created_at + make_interval(days => 1 + floor(random() * 6)::int)),
           case when cardinality(s.quality_flags || coalesce(s.verification_flags, '{}')) > 0 then
                  (array['confirmado','no_conoce','no_conoce','numero_invalido','no_contesta'])[1 + floor(random() * 5)::int]
                else (array['confirmado','confirmado','confirmado','confirmado','confirmado','confirmado','confirmado','no_contesta','no_conoce'])[1 + floor(random() * 9)::int] end,
           null
    from public.supporters s
    where s.tenant_id = v_t and s.privacy_opt_out_at is null
      and random() < case when cardinality(s.quality_flags || coalesce(s.verification_flags, '{}')) > 0 then 0.45 else 0.10 end;

    -- La sección "oficial" del simpatizante = la que salió del GPS
    update public.supporters set section_id = geo_section_id where tenant_id = v_t and section_id is null;

    -- Bitácora de accesos y avisos de ejemplo
    insert into public.data_access_log (tenant_id, user_id, action, detail, rows_count, created_at)
    select v_t, v_cand, 'exportacion_simpatizantes', '{}'::jsonb, count(*), now() - interval '6 days'
      from public.supporters where tenant_id = v_t;
    insert into public.data_access_log (tenant_id, user_id, action, detail, rows_count, created_at)
    values (v_t, v_com, 'auditoria_muestra', '{"solicitados":20}'::jsonb, 20, now() - interval '2 days');
    insert into public.notifications (user_id, title, message, type, is_read, created_at)
    select u.id, '🎯 Tu meta de la semana',
           'Vas abajo del ritmo esperado. ¡Todavía hay tiempo de alcanzar la meta, vamos!', 'mission', false, now() - interval '1 day'
      from public.users u where u.tenant_id = v_t and u.role = 'brigadista' and u.current_streak <= 1;

  return v_t;
end;
$$;
-- ============================================================================
-- Tlatoani · Planes, demo aislada por visitante, registro con Google y cotizaciones (4-nov-2026)
-- ============================================================================

-- ---------------------------------------------------------------- Planes
alter table public.tenants add column if not exists plan text not null default 'profesional';
do $$ begin
  alter table public.tenants add constraint tenants_plan_check check (plan in ('demo', 'arranque', 'profesional', 'a_medida'));
exception when duplicate_object then null; end $$;
alter table public.tenants add column if not exists is_sandbox boolean not null default false;
alter table public.tenants add column if not exists demo_last_seen timestamptz;
alter table public.tenants add column if not exists demo_ip text;
alter table public.tenants add column if not exists cargo text;
alter table public.tenants add column if not exists estado text;
alter table public.tenants add column if not exists municipio text;
update public.tenants set plan = 'demo' where is_demo and plan <> 'demo';

create table if not exists public.plan_limits (
  plan text not null,
  key text not null,
  value int,              -- null = sin límite; 0 = no disponible
  primary key (plan, key)
);
alter table public.plan_limits enable row level security;
drop policy if exists "Plan limits readable" on public.plan_limits;
create policy "Plan limits readable" on public.plan_limits for select to authenticated using (true);

insert into public.plan_limits (plan, key, value) values
  ('arranque', 'rol:candidato', 1), ('arranque', 'rol:coordinador_campana', 1), ('arranque', 'rol:comunicacion', 1),
  ('arranque', 'rol:comunicacion_digital', 1), ('arranque', 'rol:coordinador_territorial', 1), ('arranque', 'rol:lider', 2),
  ('arranque', 'rol:coordinador', 0), ('arranque', 'rol:coordinador_logistica', 0),
  ('arranque', 'brigadistas_por_lider', 5), ('arranque', 'simpatizantes', 500), ('arranque', 'guiones_activos', 1),
  ('arranque', 'sondeos_activos', 1), ('arranque', 'eventos_mes', 3), ('arranque', 'zonas_abiertas', 10),
  ('arranque', 'casillas', 10), ('arranque', 'ia_diaria', 3), ('arranque', 'exportar', 0), ('arranque', 'mensajeria', 0),
  ('demo', 'ia_diaria', 5), ('demo', 'mensajeria', 0)
on conflict (plan, key) do nothing;

-- Límite vigente para una campaña (null = sin límite)
create or replace function public.fn_plan_limit(p_tenant uuid, p_key text)
returns int language sql stable security definer set search_path = public as $$
  select l.value from public.tenants t join public.plan_limits l on l.plan = t.plan and l.key = p_key where t.id = p_tenant
$$;
create or replace function public.fn_plan_has_limit(p_tenant uuid, p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenants t join public.plan_limits l on l.plan = t.plan and l.key = p_key where t.id = p_tenant)
$$;

create or replace function public.fn_plan_block(p_msg text)
returns void language plpgsql as $$
begin
  raise exception '%', p_msg using errcode = 'P0402', hint = 'Tu plan llegó a su límite. Solicita una cotización en nemia.lat/cotizacion';
end $$;

-- Candados por plan (se revisan en el servidor, también para altas hechas por funciones)
create or replace function public.fn_plan_guard_users()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lim int; v_n int;
begin
  if tg_op = 'UPDATE' and new.role is not distinct from old.role and new.parent_id is not distinct from old.parent_id
     and new.tenant_id is not distinct from old.tenant_id and new.is_active is not distinct from old.is_active then
    return new;
  end if;
  if new.is_active is false then return new; end if;
  if new.role = 'brigadista' then
    if public.fn_plan_has_limit(new.tenant_id, 'brigadistas_por_lider') then
      v_lim := public.fn_plan_limit(new.tenant_id, 'brigadistas_por_lider');
      select count(*) into v_n from public.users where parent_id = new.parent_id and role = 'brigadista' and is_active is not false and id <> new.id;
      if v_n >= v_lim then perform public.fn_plan_block(format('Tu plan permite %s brigadistas por líder.', v_lim)); end if;
    end if;
  elsif public.fn_plan_has_limit(new.tenant_id, 'rol:' || new.role) then
    v_lim := public.fn_plan_limit(new.tenant_id, 'rol:' || new.role);
    select count(*) into v_n from public.users where tenant_id = new.tenant_id and role = new.role and is_active is not false and id <> new.id;
    if v_n >= v_lim then
      perform public.fn_plan_block(case when v_lim = 0 then format('El perfil %s no está incluido en tu plan.', new.role)
                                        else format('Tu plan permite %s cuenta(s) de %s.', v_lim, new.role) end);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_plan_guard_users on public.users;
create trigger trg_plan_guard_users before insert or update on public.users
  for each row execute function public.fn_plan_guard_users();

create or replace function public.fn_plan_guard_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_key text; v_lim int; v_n int; v_msg text;
begin
  if tg_table_name = 'supporters' then
    v_key := 'simpatizantes';
    if not public.fn_plan_has_limit(new.tenant_id, v_key) then return new; end if;
    v_lim := public.fn_plan_limit(new.tenant_id, v_key);
    select count(*) into v_n from public.supporters where tenant_id = new.tenant_id;
    v_msg := format('Tu plan permite registrar %s simpatizantes.', v_lim);
  elsif tg_table_name = 'events' then
    v_key := 'eventos_mes';
    if not public.fn_plan_has_limit(new.tenant_id, v_key) then return new; end if;
    v_lim := public.fn_plan_limit(new.tenant_id, v_key);
    select count(*) into v_n from public.events where tenant_id = new.tenant_id
       and date_trunc('month', starts_at) = date_trunc('month', new.starts_at) and id <> new.id;
    v_msg := format('Tu plan permite %s eventos al mes.', v_lim);
  elsif tg_table_name = 'walk_zones' then
    v_key := 'zonas_abiertas';
    if new.status <> 'abierta' or (tg_op = 'UPDATE' and old.status = 'abierta') then return new; end if;
    if not public.fn_plan_has_limit(new.tenant_id, v_key) then return new; end if;
    v_lim := public.fn_plan_limit(new.tenant_id, v_key);
    select count(*) into v_n from public.walk_zones where tenant_id = new.tenant_id and status = 'abierta' and id <> new.id;
    v_msg := format('Tu plan permite %s zonas abiertas a la vez.', v_lim);
  elsif tg_table_name = 'polling_stations' then
    v_key := 'casillas';
    if not public.fn_plan_has_limit(new.tenant_id, v_key) then return new; end if;
    v_lim := public.fn_plan_limit(new.tenant_id, v_key);
    select count(*) into v_n from public.polling_stations where tenant_id = new.tenant_id;
    v_msg := format('Tu plan permite %s casillas.', v_lim);
  elsif tg_table_name = 'polls' then
    v_key := case when new.kind = 'guion' then 'guiones_activos' else 'sondeos_activos' end;
    if not new.active or (tg_op = 'UPDATE' and old.active) then return new; end if;
    if not public.fn_plan_has_limit(new.tenant_id, v_key) then return new; end if;
    v_lim := public.fn_plan_limit(new.tenant_id, v_key);
    select count(*) into v_n from public.polls where tenant_id = new.tenant_id and kind = new.kind and active and id <> new.id;
    v_msg := format('Tu plan permite %s %s activo(s) a la vez. Cierra uno para activar otro.', v_lim, case when new.kind = 'guion' then 'guion' else 'sondeo' end);
  else
    return new;
  end if;
  if v_n >= v_lim then perform public.fn_plan_block(v_msg); end if;
  return new;
end $$;
drop trigger if exists trg_plan_guard_supporters on public.supporters;
create trigger trg_plan_guard_supporters before insert on public.supporters for each row execute function public.fn_plan_guard_counts();
drop trigger if exists trg_plan_guard_events on public.events;
create trigger trg_plan_guard_events before insert on public.events for each row execute function public.fn_plan_guard_counts();
drop trigger if exists trg_plan_guard_zones on public.walk_zones;
create trigger trg_plan_guard_zones before insert or update of status on public.walk_zones for each row execute function public.fn_plan_guard_counts();
drop trigger if exists trg_plan_guard_stations on public.polling_stations;
create trigger trg_plan_guard_stations before insert on public.polling_stations for each row execute function public.fn_plan_guard_counts();
drop trigger if exists trg_plan_guard_polls on public.polls;
create trigger trg_plan_guard_polls before insert or update of active on public.polls for each row execute function public.fn_plan_guard_counts();

-- fn_generate_stations: respeta el límite de casillas sin abortar todo
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
      begin
        insert into public.polling_stations (tenant_id, section_id, tipo, lista_nominal)
        values (me.tenant_id, s, case when i = 1 then 'B' else 'C' || (i - 1) end, case when ln is null then null else ceil(ln::numeric / n)::int end)
        on conflict (tenant_id, section_id, tipo) do nothing;
        if found then created := created + 1; end if;
      exception when sqlstate 'P0402' then return created;
      end;
    end loop;
  end loop;
  return created;
end $$;

-- Exportar listas no está incluido en el Plan Arranque
create or replace function public.fn_plan_allows(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select l.value from public.users u join public.tenants t on t.id = u.tenant_id
                     join public.plan_limits l on l.plan = t.plan and l.key = p_key
                    where u.auth_id = auth.uid()), 1) <> 0
$$;
revoke execute on function public.fn_plan_allows(text) from public, anon;
grant execute on function public.fn_plan_allows(text) to authenticated;

-- Estado del plan para la app
create or replace function public.fn_my_plan()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('plan', t.plan, 'sandbox', t.is_sandbox, 'campana', t.name,
    'limites', coalesce((select json_object_agg(l.key, l.value) from public.plan_limits l where l.plan = t.plan), '{}'::json),
    'uso', json_build_object(
      'simpatizantes', (select count(*) from public.supporters s where s.tenant_id = t.id),
      'usuarios', (select json_object_agg(role, n) from (select role, count(*) n from public.users where tenant_id = t.id and is_active is not false group by role) r)))
  from public.users u join public.tenants t on t.id = u.tenant_id where u.auth_id = auth.uid()
$$;
revoke execute on function public.fn_my_plan() from public, anon;
grant execute on function public.fn_my_plan() to authenticated;

-- El tope de IA del plan
update public.tenants t set ai_daily_limit = l.value from public.plan_limits l where l.plan = t.plan and l.key = 'ia_diaria';

-- ---------------------------------------------------------------- Rol "comunicacion" (comunicación social)
create or replace function public.fn_is_full_scope_role()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_current_role(), '') in ('superadmin', 'candidato', 'coordinador_campana', 'comunicacion_digital', 'comunicacion')
$$;

create or replace function public.fn_supporters_export(p_tenant_id uuid default null)
returns setof public.supporters language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if coalesce(public.fn_current_role(), '') not in ('superadmin','candidato','coordinador_campana') then return; end if;
  if not public.fn_plan_allows('exportar') then
    perform public.fn_plan_block('Exportar listas no está incluido en tu plan.');
  end if;
  select count(*) into n from public.supporters s
   where (public.fn_current_role() = 'superadmin' or s.tenant_id = any(public.fn_current_tenant_scope()))
     and (p_tenant_id is null or s.tenant_id = p_tenant_id);
  perform public.fn_log_access('exportacion_simpatizantes', jsonb_build_object('tenant', p_tenant_id), n);
  return query
    select s.* from public.supporters s
     where (public.fn_current_role() = 'superadmin' or s.tenant_id = any(public.fn_current_tenant_scope()))
       and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     order by s.created_at desc;
end;
$$;

-- ================================================================ Demo aislada por visitante
-- Datos de ejemplo de los módulos nuevos (guion, eventos, rutas, casillas, finanzas, referidos, capacitación)
create or replace function public.fn_demo_enrich(p_t uuid)
returns void language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_cand uuid; v_cc uuid; v_poll uuid; q1 uuid; q2 uuid; q3 uuid; o uuid[]; o2 uuid[]; o3 uuid[];
  r record; z uuid; ev uuid; st uuid; b uuid[]; i int; v_ref uuid; secs text[];
begin
  select id into v_cand from public.users where tenant_id = p_t and role = 'candidato' limit 1;
  select id into v_cc from public.users where tenant_id = p_t and role = 'coordinador_campana' limit 1;

  -- Guion de visita con respuestas ligadas a los registros
  insert into public.polls (tenant_id, title, description, kind, script_intro, script_closing, created_by)
  values (p_t, 'Guion de visita', 'Conocer qué preocupa en cada colonia', 'guion',
          'Buenas tardes, soy del equipo de la campaña. ¿Me regala un minuto para conocer qué le preocupa de su colonia?',
          'Muchas gracias. Le dejo este QR para que confirme que platicamos y reciba información.', v_cand)
  returning id into v_poll;
  insert into public.poll_questions (poll_id, question_text, sort) values (v_poll, '¿Qué es lo que más le preocupa de su colonia?', 0) returning id into q1;
  with ins as (insert into public.poll_options (question_id, option_text, sort)
               select q1, x, n from unnest(array['Agua','Seguridad','Empleo','Calles y alumbrado','Salud']) with ordinality u(x, n) returning id, sort)
  select array_agg(id order by sort) into o from ins;
  insert into public.poll_questions (poll_id, question_text, sort, show_if_option) values (v_poll, '¿Cada cuánto le llega el agua?', 1, o[1]) returning id into q2;
  with ins as (insert into public.poll_options (question_id, option_text, sort)
               select q2, x, n from unnest(array['Diario','Dos o tres días por semana','Una vez por semana o menos']) with ordinality u(x, n) returning id, sort)
  select array_agg(id order by sort) into o2 from ins;
  insert into public.poll_questions (poll_id, question_text, sort) values (v_poll, '¿Le gustaría participar como voluntario?', 2) returning id into q3;
  with ins as (insert into public.poll_options (question_id, option_text, sort)
               select q3, x, n from unnest(array['Sí','Tal vez más adelante','No']) with ordinality u(x, n) returning id, sort)
  select array_agg(id order by sort) into o3 from ins;

  for r in select id, recruiter_id, coalesce(section_id, geo_section_id) sec, latitude, longitude, captured_at
             from public.supporters where tenant_id = p_t and random() < 0.65 loop
    i := 1 + floor(random() ^ 1.4 * 5)::int;
    insert into public.poll_responses (poll_id, question_id, option_id, user_id, supporter_id, tenant_id, section_id, lat, lng, created_at)
    values (v_poll, q1, o[i], r.recruiter_id, r.id, p_t, r.sec, r.latitude, r.longitude, r.captured_at);
    if i = 1 then
      insert into public.poll_responses (poll_id, question_id, option_id, user_id, supporter_id, tenant_id, section_id, lat, lng, created_at)
      values (v_poll, q2, o2[1 + floor(random() * 3)::int], r.recruiter_id, r.id, p_t, r.sec, r.latitude, r.longitude, r.captured_at);
    end if;
    insert into public.poll_responses (poll_id, question_id, option_id, user_id, supporter_id, tenant_id, section_id, lat, lng, created_at)
    values (v_poll, q3, o3[1 + floor(random() ^ 0.7 * 3)::int], r.recruiter_id, r.id, p_t, r.sec, r.latitude, r.longitude, r.captured_at);
  end loop;
  update public.supporters s set survey = jsonb_build_object('poll_id', v_poll, 'answers', '{}'::jsonb)
   where s.tenant_id = p_t and exists (select 1 from public.poll_responses pr where pr.supporter_id = s.id);

  -- Eventos: dos realizados con asistencia y dos próximos con confirmaciones
  for i in 1..4 loop
    insert into public.events (tenant_id, title, place, starts_at, ends_at, capacity, created_by, status)
    values (p_t, (array['Reunión vecinal','Asamblea con mujeres emprendedoras','Encuentro con jóvenes','Recorrido y reunión de colonia'])[i],
            (array['Casa ejidal','Salón de usos múltiples','Cancha del barrio','Parque central'])[i],
            date_trunc('hour', now()) + make_interval(days => (array[-12, -5, 3, 9])[i], hours => 18 - extract(hour from now())::int),
            date_trunc('hour', now()) + make_interval(days => (array[-12, -5, 3, 9])[i], hours => 20 - extract(hour from now())::int),
            (array[80, 60, 120, 100])[i], v_cc, case when i <= 2 then 'realizado' else 'programado' end)
    returning id into ev;
    insert into public.event_attendance (event_id, tenant_id, name, phone, rsvp_at, checked_in_at, invited_by, privacy_version, privacy_accepted_at)
    select ev, p_t, public.fn_demo_person(), public.fn_demo_phone(), now() - interval '14 days',
           case when i <= 2 and random() < 0.75 then now() - make_interval(days => (array[12, 5])[i]) end,
           (select id from public.users where tenant_id = p_t and role = 'brigadista' order by random() limit 1), '1.0', now() - interval '14 days'
      from generate_series(1, (array[45, 38, 52, 27])[i]);
  end loop;

  -- Rutas de visita: una zona por brigadista con puertas tocadas
  for r in select u.id uid, u.parent_id lid, u.assigned_territory->'zone_ids'->>0 sec, u.assigned_territory->'zone_ids' zs
             from public.users u where u.tenant_id = p_t and u.role = 'brigadista' loop
    continue when r.sec is null;
    insert into public.walk_zones (tenant_id, name, section_id, target_doors, assigned_to, created_by, due_date, notes)
    values (p_t, 'Manzanas sección ' || r.sec, r.sec, 60 + floor(random() * 40)::int, r.uid, r.lid, current_date + 5,
            'Calles entre la avenida principal y el mercado') returning id into z;
    select array_agg(x) into secs from jsonb_array_elements_text(r.zs) x;
    insert into public.door_knocks (tenant_id, zone_id, user_id, outcome, note, latitude, longitude, section_id, captured_at)
    select p_t, z, r.uid,
           (array['registrado','no_estaba','no_estaba','volver','no_interesa','registrado','no_abrio'])[1 + floor(random() * 7)::int],
           (array[null, null, 'Casa azul, portón negro', 'Tienda de la esquina', null, 'Frente al kínder'])[1 + floor(random() * 6)::int],
           p.lat, p.lng, r.sec, now() - make_interval(days => floor(random() * 14)::int, hours => floor(random() * 8)::int)
      from generate_series(1, 25 + floor(random() * 30)::int) g, lateral (select * from public.fn_demo_point(array[r.sec]) where g.g = g.g) p;
  end loop;

  -- Casillas, boleta, representantes y un simulacro de actas
  insert into public.ballot_options (tenant_id, name, sort, is_ours, color) values
    (p_t, 'Nuestra coalición', 0, true, '#E8743B'), (p_t, 'Partido Azul', 1, false, '#3B82F6'),
    (p_t, 'Partido Verde', 2, false, '#10B981'), (p_t, 'Partido Rojo', 3, false, '#EF4444');
  select array_agg(id order by sort) into b from public.ballot_options where tenant_id = p_t;
  select array_agg(distinct sec) into secs from (select coalesce(section_id, geo_section_id) sec from public.supporters
     where tenant_id = p_t and coalesce(section_id, geo_section_id) is not null limit 400) x;
  for i in 1..least(8, coalesce(cardinality(secs), 0)) loop
    st := null;
    insert into public.polling_stations (tenant_id, section_id, tipo, lista_nominal, address)
    values (p_t, secs[i], 'B', 600 + floor(random() * 150)::int, 'Escuela primaria de la sección ' || secs[i])
    on conflict do nothing returning id into st;
    continue when st is null;
    insert into public.poll_watchers (tenant_id, station_id, user_id, role)
    select p_t, st, id, 'propietario' from public.users where tenant_id = p_t and role = 'brigadista' order by random() limit 1
    on conflict do nothing;
    if i <= 4 then
      insert into public.tally_reports (tenant_id, station_id, captured_by, votes, nulos, no_registrados, total, status, flags, incidents)
      select p_t, st, w.user_id, jsonb_build_object(b[1]::text, v1, b[2]::text, v2, b[3]::text, v3, b[4]::text, v4), 9, 0,
             v1 + v2 + v3 + v4 + 9 + case when i = 4 then 12 else 0 end,
             case when i = 4 then 'con_error' else 'capturada' end,
             case when i = 4 then array['suma_no_cuadra', 'sin_foto'] else array['sin_foto'] end,
             'Simulacro de captura para la demostración'
        from public.poll_watchers w,
             lateral (select 150 + floor(random() * 60)::int v1, 90 + floor(random() * 50)::int v2,
                             40 + floor(random() * 30)::int v3, 20 + floor(random() * 20)::int v4) v
       where w.station_id = st limit 1;
    end if;
  end loop;

  -- Finanzas con pendientes de fiscalización
  update public.tenants set tope_gasto = 850000, limite_aportacion = 25000 where id = p_t;
  insert into public.campaign_finances (tenant_id, transaction_type, amount, category, concept, description, reference_date,
                                        proveedor, rfc, payment_method, receipt_path, donor_name, donor_key, created_by)
  select p_t, x.t, x.m, x.c, x.c, x.d, current_date - x.dd, x.p, x.r, x.pm, x.rc, x.dn, x.dk, v_cand
    from (values
      ('egreso', 64500, 'Propaganda impresa (lonas, volantes, carteles)', 'Lonas y volantes primera etapa', 40, 'Impresos del Sureste', 'ISU150310AB1', 'Transferencia', 'demo/factura.pdf', null, null),
      ('egreso', 38200, 'Propaganda utilitaria (playeras, gorras, artículos)', 'Playeras para brigadas', 33, 'Textiles Chiapas', 'TCH120505KL9', 'Transferencia', 'demo/factura.pdf', null, null),
      ('egreso', 22800, 'Eventos y mítines (renta, sonido, templetes)', 'Sonido y templete reunión vecinal', 12, 'Audio Pro Tuxtla', 'APT180909QW2', 'Transferencia', null, null, null),
      ('egreso', 15600, 'Transporte y combustible', 'Combustible de recorridos', 9, 'Gasolinera del Valle', null, 'Tarjeta', null, null, null),
      ('egreso', 47000, 'Propaganda en internet y redes sociales', 'Pauta en redes', 20, 'Agencia Digital Sur', 'ADS200101XY3', 'Transferencia', 'demo/factura.pdf', null, null),
      ('egreso', 18000, 'Renta de inmuebles y servicios', 'Renta de casa de campaña', 30, 'Inmobiliaria Centro', 'ICE100202MN4', 'Transferencia', 'demo/factura.pdf', null, null),
      ('egreso', 9800, 'Alimentos del equipo', 'Alimentos jornada de brigadas', 4, null, null, 'Efectivo', null, null, null),
      ('ingreso', 150000, 'Financiamiento del partido', 'Primera ministración', 45, null, null, 'Transferencia', 'demo/recibo.pdf', 'Comité estatal', null),
      ('ingreso', 20000, 'Aportación de simpatizante', 'Aportación', 25, null, null, 'Transferencia', 'demo/recibo.pdf', 'Rosa Toledo Pineda', 'TOPR800101AB1'),
      ('ingreso', 15000, 'Aportación de simpatizante', 'Segunda aportación', 6, null, null, 'Transferencia', null, 'Rosa Toledo Pineda', 'TOPR800101AB1'),
      ('ingreso', 8000, 'Aportación de simpatizante', 'Aportación', 10, null, null, 'Cheque', null, null, null)
    ) as x(t, m, c, d, dd, p, r, pm, rc, dn, dk);

  -- Red de referidos: algunos simpatizantes validados invitaron a conocidos
  for r in select id, tenant_id, recruiter_id, latitude, longitude, captured_at from public.supporters
            where tenant_id = p_t and verified_at is not null and privacy_opt_out_at is null order by random() limit 25 loop
    for i in 1..(1 + floor(random() * 4)::int) loop
      insert into public.supporters (tenant_id, name, phone, recruiter_id, referred_by, latitude, longitude, commitment_level,
             verification_token, verification_response, verified_at, verification_channel, privacy_accepted_at, captured_at, created_at)
      values (p_t, public.fn_demo_person(), public.fn_demo_phone(), r.recruiter_id, r.id,
              r.latitude + (random() - 0.5) * 0.004, r.longitude + (random() - 0.5) * 0.004, 3,
              substr(md5(random()::text), 1, 20), 'si', r.captured_at + make_interval(days => i), 'referido',
              r.captured_at + make_interval(days => i), r.captured_at + make_interval(days => i), r.captured_at + make_interval(days => i))
      returning id into v_ref;
    end loop;
  end loop;
  update public.supporters set quality_flags = '{}' where tenant_id = p_t and verification_channel = 'referido';
  update public.supporters set section_id = geo_section_id where tenant_id = p_t and section_id is null;

  -- Capacitación: la mayoría del equipo ya aprobó
  insert into public.training_progress (user_id, module_id, tenant_id, attempts, score, passed_at)
  select u.id, m.id, p_t, 1, jsonb_array_length(m.quiz), now() - make_interval(days => floor(random() * 30)::int)
    from public.users u cross join public.training_modules m
   where u.tenant_id = p_t and m.tenant_id is null and random() < 0.7
  on conflict do nothing;
end;
$$;
revoke execute on function public.fn_demo_enrich(uuid) from public, anon, authenticated;

-- Una campaña demo privada para un visitante (k = 1 gubernatura, 2 municipio, 3 aspirante)
create or replace function public.fn_demo_sandbox_create(p_k int, p_ip text default null)
returns uuid language plpgsql volatile security definer set search_path = public, extensions as $$
declare c jsonb; v_t uuid; v_slug text := 'sbx-' || encode(extensions.gen_random_bytes(5), 'hex');
begin
  select e into c from jsonb_array_elements(public.fn_demo_spec()) e where (e->>'k')::int = coalesce(p_k, 2);
  if c is null then raise exception 'Campaña demo no válida'; end if;
  -- versión más ligera para que se cree en segundos
  c := jsonb_set(c, '{meta}', to_jsonb(least((c->>'meta')::int, 60)));
  v_t := public.fn_demo_seed_campaign(c, v_slug, false);
  update public.tenants set is_sandbox = true, is_demo = true, plan = 'demo', demo_last_seen = now(), demo_ip = left(p_ip, 64),
         ai_daily_limit = coalesce(public.fn_plan_limit(id, 'ia_diaria'), 5),
         name = replace(name, 'DEMO ·', 'DEMO PRIVADA ·')
   where id = v_t;
  perform public.fn_demo_enrich(v_t);
  return v_t;
end;
$$;
revoke execute on function public.fn_demo_sandbox_create(int, text) from public, anon, authenticated;
grant execute on function public.fn_demo_sandbox_create(int, text) to service_role;

-- Borra una demo privada (o todas las inactivas). Devuelve las campañas borradas para limpiar sus archivos.
create or replace function public.fn_demo_sandbox_purge(p_tenant uuid default null, p_idle interval default interval '30 minutes')
returns uuid[] language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids from public.tenants
   where is_sandbox and (id = p_tenant or (p_tenant is null and coalesce(demo_last_seen, created_at) < now() - p_idle));
  if cardinality(ids) = 0 then return ids; end if;
  delete from auth.users a using public.users u where a.id = u.auth_id and u.tenant_id = any(ids);
  delete from public.notifications n using public.users u where n.user_id = u.id and u.tenant_id = any(ids);
  delete from public.data_access_log where tenant_id = any(ids);
  delete from public.audit_call_log where tenant_id = any(ids);
  delete from public.audit_pitch where tenant_id = any(ids);
  delete from public.tenants where id = any(ids);
  return ids;
end;
$$;
revoke execute on function public.fn_demo_sandbox_purge(uuid, interval) from public, anon, authenticated;
grant execute on function public.fn_demo_sandbox_purge(uuid, interval) to service_role;

-- La app avisa que la demo sigue en uso
create or replace function public.fn_demo_touch()
returns boolean language sql volatile security definer set search_path = public as $$
  update public.tenants t set demo_last_seen = now()
    from public.users u where u.auth_id = auth.uid() and u.tenant_id = t.id and t.is_sandbox
  returning true
$$;
revoke execute on function public.fn_demo_touch() from public, anon;
grant execute on function public.fn_demo_touch() to authenticated;

-- La demo general (para presentaciones) se sigue creando igual, ahora con los módulos nuevos
create or replace function public.fn_demo_seed()
returns json language plpgsql volatile security definer set search_path = public, extensions as $$
declare c jsonb; v_t uuid; n int := 0;
begin
  if auth.uid() is not null and public.fn_current_role() is distinct from 'superadmin' then
    raise exception 'Solo el superadmin puede crear la demo';
  end if;
  for c in select * from jsonb_array_elements(public.fn_demo_spec()) loop
    v_t := public.fn_demo_seed_campaign(c, c->>'slug', true);
    update public.tenants set plan = 'demo' where id = v_t;
    perform public.fn_demo_enrich(v_t);
    n := n + 1;
  end loop;
  return json_build_object('campanas', n,
    'simpatizantes', (select count(*) from public.supporters s join public.tenants t on t.id = s.tenant_id where t.is_demo and not t.is_sandbox),
    'usuarios', (select count(*) from public.users u join public.tenants t on t.id = u.tenant_id where t.is_demo and not t.is_sandbox));
end;
$$;
revoke execute on function public.fn_demo_seed() from public, anon, authenticated;

-- fn_demo_purge no toca las demos privadas en uso
create or replace function public.fn_demo_purge()
returns json language plpgsql volatile security definer set search_path = public as $$
declare n_t int; n_u int; n_s int;
begin
  if auth.uid() is not null and public.fn_current_role() is distinct from 'superadmin' then
    raise exception 'Solo el superadmin puede borrar la demo';
  end if;
  select count(*) into n_s from public.supporters s join public.tenants t on t.id = s.tenant_id where t.is_demo and not t.is_sandbox;
  select count(*) into n_u from public.users u join public.tenants t on t.id = u.tenant_id where t.is_demo and not t.is_sandbox;
  delete from auth.users a using public.users u, public.tenants t where a.id = u.auth_id and u.tenant_id = t.id and t.is_demo and not t.is_sandbox;
  delete from public.notifications n using public.users u, public.tenants t where n.user_id = u.id and u.tenant_id = t.id and t.is_demo and not t.is_sandbox;
  delete from public.data_access_log l using public.tenants t where l.tenant_id = t.id and t.is_demo and not t.is_sandbox;
  delete from public.audit_call_log a using public.tenants t where a.tenant_id = t.id and t.is_demo and not t.is_sandbox;
  delete from public.audit_pitch a using public.tenants t where a.tenant_id = t.id and t.is_demo and not t.is_sandbox;
  delete from public.tenants where is_demo and not is_sandbox;
  get diagnostics n_t = row_count;
  return json_build_object('campanas', n_t, 'usuarios', n_u, 'simpatizantes', n_s);
end;
$$;

select cron.schedule('demo-privadas-limpieza', '*/10 * * * *', $c$select public.fn_demo_sandbox_purge(null, interval '30 minutes')$c$);

-- ================================================================ Registro propio (Plan Arranque) y cotizaciones
-- Crea la campaña de prueba para quien entró con Google y aún no tiene usuario
create or replace function public.fn_create_trial_campaign(p_name text, p_phone text, p_cargo text, p_estado text,
                                                           p_municipio text, p_campaign text, p_accept boolean, p_version text)
returns json language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_auth uuid := auth.uid(); v_email text; v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
        v_t uuid; v_u uuid; v_slug text;
begin
  if v_auth is null then return json_build_object('estado', 'sin_sesion'); end if;
  if exists (select 1 from public.users where auth_id = v_auth) then return json_build_object('estado', 'ya_tiene_cuenta'); end if;
  if not coalesce(p_accept, false) then return json_build_object('estado', 'falta_aceptar'); end if;
  if length(trim(coalesce(p_name, ''))) < 3 or length(trim(coalesce(p_campaign, ''))) < 3 then return json_build_object('estado', 'faltan_datos'); end if;
  if length(v_phone) <> 10 then return json_build_object('estado', 'falta_telefono'); end if;
  if exists (select 1 from public.users where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_phone) then
    return json_build_object('estado', 'telefono_registrado');
  end if;
  select email into v_email from auth.users where id = v_auth;
  if (select count(*) from public.tenants t join public.users u on u.id = t.owner_id
       where t.plan = 'arranque' and u.auth_id in (select id from auth.users where lower(email) = lower(v_email))) > 0 then
    return json_build_object('estado', 'ya_tiene_prueba');
  end if;
  v_slug := left(regexp_replace(translate(lower(trim(p_campaign)), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '-', 'g'), 40) || '-' || encode(extensions.gen_random_bytes(3), 'hex');
  insert into public.tenants (name, slug, position, election_type, geographic_scope, is_active, plan, cargo, estado, municipio, description)
  values (left(trim(p_campaign), 120), v_slug, left(p_cargo, 60),
          case when p_cargo in ('diputacion_federal', 'senaduria', 'presidencia') then 'federal' else 'local' end, upper(coalesce(nullif(trim(p_municipio), ''), trim(p_estado))),
          true, 'arranque', left(p_cargo, 60), left(p_estado, 60), left(p_municipio, 80),
          'Versión de demostración gratuita. No constituye aportación a ninguna campaña electoral.')
  returning id into v_t;
  update public.tenants set ai_daily_limit = coalesce(public.fn_plan_limit(v_t, 'ia_diaria'), 3) where id = v_t;
  insert into public.users (tenant_id, auth_id, name, phone, role, is_active, is_first_login, privacy_version, privacy_accepted_at, terms_accepted_at)
  values (v_t, v_auth, left(trim(p_name), 120), '+52' || v_phone, 'candidato', true, false, left(p_version, 32), now(), now())
  returning id into v_u;
  update public.tenants set owner_id = v_u where id = v_t;
  insert into public.goal_settings (tenant_id, method, campaign_start, campaign_end, objective)
  values (v_t, 'ganador', current_date, current_date + 90, 'votos') on conflict do nothing;
  return json_build_object('estado', 'ok', 'tenant', v_t);
end;
$$;
revoke execute on function public.fn_create_trial_campaign(text, text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.fn_create_trial_campaign(text, text, text, text, text, text, boolean, text) to authenticated;

create table if not exists public.sales_leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  election_type text,
  territory text,
  structure_size text,
  modules text[],
  election_date date,
  message text,
  source text,
  tenant_id uuid references public.tenants(id) on delete set null,
  status text not null default 'nuevo' check (status in ('nuevo', 'contactado', 'cotizado', 'ganado', 'perdido')),
  ip text,
  created_at timestamptz not null default now()
);
alter table public.sales_leads enable row level security;
drop policy if exists "Leads superadmin" on public.sales_leads;
create policy "Leads superadmin" on public.sales_leads for all to authenticated
  using ((select public.fn_current_role()) = 'superadmin') with check ((select public.fn_current_role()) = 'superadmin');

create or replace function public.fn_request_quote(p_name text, p_phone text, p_email text, p_election_type text, p_territory text,
                                                   p_structure text, p_modules text[], p_election_date date, p_message text, p_source text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare v_ip text := public.fn_request_ip(); v_t uuid;
begin
  if length(trim(coalesce(p_name, ''))) < 3 or (length(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')) < 10 and coalesce(p_email, '') !~ '@') then
    return json_build_object('estado', 'faltan_datos');
  end if;
  if (select count(*) from public.sales_leads where ip = v_ip and created_at > now() - interval '1 hour') >= 5 then
    return json_build_object('estado', 'demasiadas_solicitudes');
  end if;
  select tenant_id into v_t from public.users where auth_id = auth.uid();
  insert into public.sales_leads (name, phone, email, election_type, territory, structure_size, modules, election_date, message, source, tenant_id, ip)
  values (left(trim(p_name), 120), left(p_phone, 20), left(p_email, 120), left(p_election_type, 60), left(p_territory, 120),
          left(p_structure, 60), p_modules[1:12], p_election_date, left(p_message, 2000), left(p_source, 40), v_t, v_ip);
  insert into public.notifications (user_id, title, message, type)
  select id, 'Nueva solicitud de cotización', left(trim(p_name), 60) || ' · ' || coalesce(p_election_type, '') || ' · ' || coalesce(p_territory, ''), 'mission'
    from public.users where role = 'superadmin';
  return json_build_object('estado', 'ok');
end;
$$;
revoke execute on function public.fn_request_quote(text, text, text, text, text, text, text[], date, text, text) from public;
grant execute on function public.fn_request_quote(text, text, text, text, text, text, text[], date, text, text) to anon, authenticated;

revoke execute on function public.fn_plan_guard_users() from public, anon, authenticated;
revoke execute on function public.fn_plan_guard_counts() from public, anon, authenticated;
revoke execute on function public.fn_plan_block(text) from public, anon, authenticated;
revoke execute on function public.fn_plan_limit(uuid, text) from public, anon;
revoke execute on function public.fn_plan_has_limit(uuid, text) from public, anon;
