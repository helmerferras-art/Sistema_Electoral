-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-02 (demo_campaigns + ajuste de proporciones).
-- Campañas de DEMOSTRACIÓN dentro de la base de producción, aisladas y borrables.
--   select public.fn_demo_reset();   -- borra la demo y la vuelve a crear con fechas de hoy (a mitad de campaña)
--   select public.fn_demo_purge();   -- borra TODA la demo (campañas, usuarios, simpatizantes, bitácoras)
-- Solo superadmin (o el SQL Editor de Supabase). Personas, teléfonos y candidatos son FICTICIOS:
-- los teléfonos empiezan con 00, que no existe en México, para que nadie marque a una persona real.

alter table public.tenants add column if not exists is_demo boolean not null default false;

-- ───────────── utilidades ─────────────
create or replace function public.fn_demo_person()
returns text language sql volatile set search_path = public as $$
  select (array['María','José','Guadalupe','Juan','Rosa','Luis','Ana','Carlos','Leticia','Miguel','Patricia','Jorge',
                'Silvia','Fernando','Adriana','Ricardo','Verónica','Alejandro','Martha','Roberto','Claudia','Eduardo',
                'Gabriela','Héctor','Norma','Arturo','Elizabeth','Raúl','Yolanda','Sergio','Laura','Manuel','Karla',
                'Óscar','Diana','Javier','Mónica','Rubén','Alma','Daniel','Beatriz','Iván','Fabiola','Mario'])[1 + floor(random() * 44)::int]
         || ' ' ||
         (array['Hernández','García','Martínez','López','González','Pérez','Rodríguez','Sánchez','Ramírez','Cruz',
                'Gómez','Morales','Vázquez','Jiménez','Reyes','Díaz','Torres','Gutiérrez','Ruiz','Mendoza','Aguilar',
                'Méndez','Moreno','Velázquez','Domínguez','Castillo','Pineda','Coutiño','Nangusé','Gordillo','Penagos',
                'Culebro','Albores','Esponda','Moguel','Toledo','Zenteno','Grajales','Utrilla','Constantino'])[1 + floor(random() * 40)::int]
         || ' ' ||
         (array['Hernández','García','Martínez','López','González','Pérez','Rodríguez','Sánchez','Ramírez','Cruz',
                'Gómez','Morales','Vázquez','Jiménez','Reyes','Díaz','Torres','Gutiérrez','Ruiz','Mendoza','Aguilar',
                'Méndez','Moreno','Velázquez','Domínguez','Castillo','Pineda','Coutiño','Nangusé','Gordillo','Penagos',
                'Culebro','Albores','Esponda','Moguel','Toledo','Zenteno','Grajales','Utrilla','Constantino'])[1 + floor(random() * 40)::int]
$$;

-- Teléfono ficticio: empieza con 00 (no existe en México)
create or replace function public.fn_demo_phone()
returns text language sql volatile as $$ select '00' || lpad(floor(random() * 100000000)::bigint::text, 8, '0') $$;

-- Punto al azar dentro de una de las secciones
create or replace function public.fn_demo_point(p_sections text[], out lat double precision, out lng double precision)
language sql volatile set search_path = public, extensions as $$
  select st_y(p.geom), st_x(p.geom)
  from (select p_sections[1 + floor(random() * cardinality(p_sections))::int] sid offset 0) x
  join public.electoral_sections e on e.seccion::text = x.sid
  cross join lateral (select (st_dump(st_generatepoints(e.geom, 1))).geom) p
  limit 1
$$;

-- ───────────── borrar la demo ─────────────
create or replace function public.fn_demo_purge()
returns json language plpgsql volatile security definer set search_path = public as $$
declare n_t int; n_u int; n_s int;
begin
  if auth.uid() is not null and public.fn_current_role() is distinct from 'superadmin' then
    raise exception 'Solo el superadmin puede borrar la demo';
  end if;
  select count(*) into n_s from public.supporters s join public.tenants t on t.id = s.tenant_id where t.is_demo;
  select count(*) into n_u from public.users u join public.tenants t on t.id = u.tenant_id where t.is_demo;
  -- cuentas de acceso ligadas a usuarios demo
  delete from auth.users a using public.users u, public.tenants t
   where a.id = u.auth_id and u.tenant_id = t.id and t.is_demo;
  -- notificaciones y bitácoras que no cuelgan de la campaña
  delete from public.notifications n using public.users u, public.tenants t
   where n.user_id = u.id and u.tenant_id = t.id and t.is_demo;
  delete from public.data_access_log l using public.tenants t where l.tenant_id = t.id and t.is_demo;
  delete from public.audit_call_log a using public.tenants t where a.tenant_id = t.id and t.is_demo;
  -- la campaña borra en cascada usuarios, simpatizantes, actividades, metas, fases, etc.
  delete from public.tenants where is_demo;
  get diagnostics n_t = row_count;
  return json_build_object('campanas', n_t, 'usuarios', n_u, 'simpatizantes', n_s);
end;
$$;

-- ───────────── un brigadista: simpatizantes + bitácora de campo ─────────────
create or replace function public.fn_demo_fill_brigadista(p_tenant uuid, p_user uuid, p_sections text[], p_start date,
                                                          p_n int, p_profile text, p_objective text)
returns void language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  i int; t timestamp; pt record; burst_pt record; v_ok numeric; v_sent numeric; base_phone bigint;
  n_act int; c int; d int; v_type text; v_known numeric;
begin
  -- Calidad del perfil: % que valida la visita y % al que al menos se le envió el enlace
  v_ok   := case p_profile when 'estrella' then 0.90 when 'bueno' then 0.80 when 'regular' then 0.62 else 0.25 end;
  v_sent := case p_profile when 'malo' then 0.35 else 0.18 end;
  base_phone := 10000000 + floor(random() * 80000000)::bigint;

  for i in 1..p_n loop
    if p_profile = 'malo' and i % 4 = 0 then
      -- ráfagas: varios registros seguidos, en el mismo punto, a veces de noche y con teléfonos consecutivos
      t := (p_start + floor(56 * sqrt(random()))::int)::timestamp
           + make_interval(hours => case when random() < 0.5 then 23 else 15 end);
      continue when (t at time zone 'America/Mexico_City') > now();
      select * into burst_pt from public.fn_demo_point(p_sections);
      for c in 0..3 loop
        insert into public.supporters (tenant_id, recruiter_id, name, phone, latitude, longitude, commitment_level,
               created_at, captured_at, lives_here, status, verification_token, verification_sent_at,
               verified_at, verification_response, verification_channel, verification_flags, privacy_accepted_at)
        select p_tenant, p_user, public.fn_demo_person(), '00' || lpad((base_phone + i * 10 + c)::text, 8, '0'),
               burst_pt.lat + random() * 0.00003, burst_pt.lng + random() * 0.00003, 1 + floor(random() * 3)::int,
               ts, ts, true, 'pendiente', substr(md5(random()::text), 1, 20),
               case when r < 0.6 then ts + interval '2 minutes' end,
               case when ok then ts + interval '3 minutes' end,
               case when ok then 'si' end,
               case when ok then 'whatsapp' end,
               case when ok then array['mismo_dispositivo'] else '{}'::text[] end,
               case when ok then ts + interval '3 minutes' end
        from (select (t at time zone 'America/Mexico_City') + make_interval(secs => c * 20) ts, r, (c = 0 and r < 0.5) ok
                from (select random() r) z) x;
      end loop;
      continue;
    end if;

    -- registro normal: más actividad en las últimas semanas, en horario de 9 a 19 h
    t := (p_start + least(55, floor(56 * sqrt(random()))::int))::timestamp
         + make_interval(hours => 9 + floor(random() * 10)::int, mins => floor(random() * 60)::int);
    continue when (t at time zone 'America/Mexico_City') > now();
    select * into pt from public.fn_demo_point(p_sections);
    d := floor(random() * 1000)::int;
    insert into public.supporters (tenant_id, recruiter_id, name, phone, latitude, longitude, commitment_level,
           created_at, captured_at, lives_here, status, verification_token, verification_sent_at, verified_at,
           verification_response, verification_channel, verification_flags, verification_phone, privacy_accepted_at,
           privacy_opt_out_at)
    select p_tenant, p_user, public.fn_demo_person(), ph, pt.lat, pt.lng, 1 + floor(random() * 5)::int,
           ts, ts, random() < 0.88, 'pendiente', substr(md5(random()::text), 1, 20),
           case when r < v_ok + v_sent then ts + interval '1 minute' end,
           case when r < v_ok then ts + make_interval(mins => 2 + floor(random() * 600)::int) end,
           case when r < v_ok then 'si' end,
           case when r < v_ok then (case when random() < 0.7 then 'qr' else 'whatsapp' end) end,
           case when r < v_ok and random() < (case when p_profile = 'malo' then 0.4 else 0.03 end)
                then array['misma_red'] else '{}'::text[] end,
           case when r < v_ok then ph end,
           case when r < v_ok then ts + interval '3 minutes' end,
           case when d < 8 then ts + interval '2 days' end
    from (select public.fn_demo_phone() ph, (t at time zone 'America/Mexico_City') ts, random() r) x;
  end loop;

  -- Bitácora de campo: jornadas con contactos, cuántos ya conocían y cuántos se sumaron
  n_act := case p_profile when 'estrella' then 30 when 'bueno' then 24 when 'regular' then 15 else 18 end;
  for i in 1..n_act loop
    d := least(55, floor(56 * sqrt(random()))::int);
    t := (p_start + d)::timestamp + make_interval(hours => 9 + floor(random() * 9)::int);
    continue when (t at time zone 'America/Mexico_City') > now();
    select * into pt from public.fn_demo_point(p_sections);
    v_type := (array['casa_por_casa','casa_por_casa','casa_por_casa','crucero','mercado','parque','reunion','evento'])[1 + floor(random() * 8)::int];
    c := case v_type when 'evento' then 20 + floor(random() * 30)::int when 'reunion' then 8 + floor(random() * 12)::int
              else 5 + floor(random() * 14)::int end;
    -- el conocimiento del candidato crece conforme avanza la campaña
    v_known := least(0.85, 0.20 + d / 56.0 * 0.45 + (random() - 0.5) * 0.15);
    insert into public.field_activities (tenant_id, user_id, activity_type, notes, contacts_count, convinced_count,
           known_count, latitude, longitude, accuracy_m, consent_confirmed, occurred_at, created_at)
    values (p_tenant, p_user, v_type,
            (array[null, null, 'Buena recepción, piden más presencia en la colonia.', 'Preguntan por agua y alumbrado.',
                   'Varios jóvenes interesados en sumarse.', 'Señoras del mercado piden reunión con el equipo.',
                   'Poca gente en casa, regresar por la tarde.'])[1 + floor(random() * 7)::int],
            c, floor(floor(c * greatest(0.05, v_known)) * (0.40 + random() * 0.25))::int,  -- solo prefiere quien ya conocía
            floor(c * greatest(0.05, v_known))::int, pt.lat, pt.lng, 5 + floor(random() * 20), true,
            (t at time zone 'America/Mexico_City'), (t at time zone 'America/Mexico_City'));
  end loop;
end;
$$;

-- ───────────── crear la demo ─────────────
create or replace function public.fn_demo_seed()
returns json language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  spec jsonb := $j$[
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
  ]$j$;
  c jsonb; co jsonb; v_start date := current_date - 56; v_end date := current_date + 56;
  v_t uuid; v_cand uuid; v_cc uuid; v_com uuid; v_log uuid; v_coord uuid; v_lid uuid; v_brig uuid;
  v_pool text[]; v_lpool text[]; v_bpool text[]; ci int; li int; bi int; v_bn int; v_prof text; v_n int;
  v_total_sup int := 0; v_meta int; v_obj text;
begin
  if auth.uid() is not null and public.fn_current_role() is distinct from 'superadmin' then
    raise exception 'Solo el superadmin puede crear la demo';
  end if;

  for c in select * from jsonb_array_elements(spec) loop
    v_obj := c->>'objective';
    insert into public.tenants (name, slug, position, election_type, geographic_scope, is_active, is_demo, description,
                                thanks_title, thanks_message, social_links)
    values (c->>'name', c->>'slug', c->>'position', 'local', c->>'scope', true, true,
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
    values (v_t, c->>'cand', format('00000%s0001', c->>'k'), 'candidato', true, false, 0, null) returning id into v_cand;
    update public.tenants set owner_id = v_cand where id = v_t;
    insert into public.users (tenant_id, name, phone, role, parent_id, is_active, is_first_login)
    values (v_t, public.fn_demo_person(), format('00000%s0002', c->>'k'), 'coordinador_campana', v_cand, true, false) returning id into v_cc;
    insert into public.users (tenant_id, name, phone, role, parent_id, is_active, is_first_login)
    values (v_t, public.fn_demo_person(), format('00000%s0003', c->>'k'), 'comunicacion_digital', v_cand, true, false) returning id into v_com;
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
              case when ci = 1 then format('00000%s0004', c->>'k') else public.fn_demo_phone() end,
              'coordinador_territorial', v_cc, true, false,
              jsonb_build_object('layer_type', co->>'layer', 'label', co->>'name',
                                 'zone_ids', case when co ? 'zone' then jsonb_build_array(co->>'zone') else to_jsonb(v_pool) end))
      returning id into v_coord;

      for li in 1..(c->>'lideres')::int loop
        v_lpool := v_pool[1 + (li - 1) * (cardinality(v_pool) / (c->>'lideres')::int) : li * (cardinality(v_pool) / (c->>'lideres')::int)];
        insert into public.users (tenant_id, name, phone, role, parent_id, is_active, is_first_login, assigned_territory)
        values (v_t, public.fn_demo_person(),
                case when ci = 1 and li = 1 then format('00000%s0005', c->>'k') else public.fn_demo_phone() end,
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
                  case when ci = 1 and li = 1 and bi = 1 then format('00000%s0006', c->>'k') else public.fn_demo_phone() end,
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

    select v_total_sup + count(*) into v_total_sup from public.supporters where tenant_id = v_t;
  end loop;

  return json_build_object('campanas', jsonb_array_length(spec), 'simpatizantes', v_total_sup,
    'usuarios', (select count(*) from public.users u join public.tenants t on t.id = u.tenant_id where t.is_demo),
    'actividades', (select count(*) from public.field_activities a join public.tenants t on t.id = a.tenant_id where t.is_demo));
end;
$$;

create or replace function public.fn_demo_reset()
returns json language plpgsql volatile security definer set search_path = public as $$
declare p json; s json;
begin
  p := public.fn_demo_purge();
  s := public.fn_demo_seed();
  return json_build_object('borrado', p, 'creado', s);
end;
$$;

-- Ligar cuentas de acceso creadas en el panel de Supabase (Authentication → Users → Add user,
-- correo <10 dígitos>@c4i.local) con su usuario del sistema por número de teléfono.
create or replace function public.fn_link_auth_accounts()
returns table(usuario text, rol text, telefono text) language sql volatile security definer set search_path = public as $$
  update public.users u set auth_id = a.id
    from auth.users a
   where u.auth_id is null
     and lower(a.email) = right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) || '@c4i.local'
     and not exists (select 1 from public.users x where x.auth_id = a.id)
  returning u.name, u.role, u.phone
$$;

revoke execute on function public.fn_demo_person() from public, anon, authenticated;
revoke execute on function public.fn_demo_phone() from public, anon, authenticated;
revoke execute on function public.fn_demo_point(text[]) from public, anon, authenticated;
revoke execute on function public.fn_demo_fill_brigadista(uuid, uuid, text[], date, int, text, text) from public, anon, authenticated;
revoke execute on function public.fn_demo_seed() from public, anon, authenticated;
revoke execute on function public.fn_demo_purge() from public, anon, authenticated;
revoke execute on function public.fn_demo_reset() from public, anon, authenticated;
revoke execute on function public.fn_link_auth_accounts() from public, anon, authenticated;
grant execute on function public.fn_demo_reset() to authenticated;   -- adentro valida que sea superadmin
grant execute on function public.fn_demo_purge() to authenticated;
