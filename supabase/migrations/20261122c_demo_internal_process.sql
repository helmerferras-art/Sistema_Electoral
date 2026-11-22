-- ============================================================================
-- Tlatoani · Demo de proceso interno (solo base de demo, 22-nov-2026)
-- Campaña ficticia k=4: aspirante a una coordinación distrital local en Tuxtla,
-- con 3 rivales internos inventados y ~200 entrevistas del termómetro ya levantadas.
-- ============================================================================

create or replace function public.fn_demo_pick(p_ids text[], p_w numeric[])
returns text language plpgsql volatile as $$
declare tot numeric := 0; acc numeric := 0; x numeric; i int;
begin
  for i in 1..cardinality(p_w) loop tot := tot + p_w[i]; end loop;
  x := random() * tot;
  for i in 1..cardinality(p_w) loop
    acc := acc + p_w[i];
    if x <= acc then return p_ids[i]; end if;
  end loop;
  return p_ids[cardinality(p_ids)];
end $$;

create or replace function public.fn_demo_seed_interno(p_t uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_cand text; r1 uuid; r2 uuid; r3 uuid; b record; sec text; i int; f numeric;
  v_ids text[]; pt record; ans jsonb; per jsonb; pid text; k int;
  p_con numeric[]; p_buena numeric[]; p_vot numeric[];
begin
  select name into v_cand from public.users where tenant_id = p_t and role = 'candidato' limit 1;
  insert into public.internal_contest (tenant_id, self_name, process_label, coalition_label, template, survey_date)
  values (p_t, v_cand, 'Coordinación distrital local', 'Morena, PT o PVEM', 'morena_pt_pvem', current_date + 21)
  on conflict (tenant_id) do nothing;
  insert into public.internal_rivals (tenant_id, name, sort) values (p_t, public.fn_demo_person(), 1) returning id into r1;
  insert into public.internal_rivals (tenant_id, name, sort) values (p_t, public.fn_demo_person(), 2) returning id into r2;
  insert into public.internal_rivals (tenant_id, name, sort) values (p_t, public.fn_demo_person(), 3) returning id into r3;
  v_ids := array['self', r1::text, r2::text, r3::text];

  for b in select u.id, array(select jsonb_array_elements_text(u.assigned_territory->'zone_ids')) secs
             from public.users u where u.tenant_id = p_t and u.role = 'brigadista' loop
    if cardinality(b.secs) = 0 then continue; end if;
    for i in 1..(26 + floor(random() * 10))::int loop
      sec := b.secs[1 + floor(random() * cardinality(b.secs))::int];
      f := (sec::int % 7) / 6.0;                         -- unas secciones te conocen más que otras
      p_con := array[0.30 + 0.45 * f, 0.66, 0.44, 0.30];   -- tú, rival 1, rival 2, rival 3
      p_buena := array[0.64, 0.46, 0.50, 0.42];
      p_vot := array[0.55, 0.52, 0.40, 0.32];
      ans := jsonb_build_object('conoce', '{}'::jsonb, 'opinion', '{}'::jsonb, 'votaria', '{}'::jsonb);
      for k in 1..4 loop
        pid := v_ids[k];
        if random() < p_con[k] then
          ans := jsonb_set(ans, array['conoce', pid], '"si"');
          ans := jsonb_set(ans, array['opinion', pid], to_jsonb(case when random() < p_buena[k] then 'buena' when random() < 0.6 then 'regular' else 'mala' end));
          ans := jsonb_set(ans, array['votaria', pid], to_jsonb(case when random() < p_vot[k] then 'si' when random() < 0.7 then 'no' else 'ns' end));
        else
          ans := jsonb_set(ans, array['conoce', pid], '"no"');
        end if;
      end loop;
      ans := ans || jsonb_build_object(
        'preferencia',       public.fn_demo_pick(v_ids || 'ninguno'::text, array[0.29, 0.33, 0.17, 0.08, 0.13]),
        'buen_candidato',    public.fn_demo_pick(v_ids || 'ninguno'::text, array[0.33, 0.27, 0.16, 0.09, 0.15]),
        'honestidad',        public.fn_demo_pick(v_ids || 'ninguno'::text, array[0.37, 0.24, 0.15, 0.08, 0.16]),
        'conoce_territorio', public.fn_demo_pick(v_ids || 'ninguno'::text, array[0.28, 0.36, 0.14, 0.08, 0.14]),
        'cercania',          public.fn_demo_pick(v_ids || 'ninguno'::text, array[0.39, 0.26, 0.14, 0.07, 0.14]),
        'cumple',            public.fn_demo_pick(v_ids || 'ninguno'::text, array[0.34, 0.29, 0.13, 0.08, 0.16]));
      select * into pt from public.fn_demo_point(array[sec]);
      insert into public.thermo_interviews (tenant_id, user_id, section_id, lat, lng, mode, sampled, answers, created_at)
      values (p_t, b.id, sec, pt.lat, pt.lng, case when random() < 0.25 then 'telefono' else 'vivienda' end,
              random() < 0.75, ans, now() - make_interval(days => floor(random() * 21)::int, hours => floor(random() * 10)::int));
    end loop;
  end loop;
end $$;
revoke execute on function public.fn_demo_seed_interno(uuid) from public, anon, authenticated;

create or replace function public.fn_demo_spec()
returns jsonb language sql immutable set search_path = public, extensions as $f$ select $j$[
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
    "lideres":2, "brig":2, "profiles":["bueno","estrella","regular","bueno","bueno","regular","estrella","bueno"]},
   {"k":4, "name":"DEMO · Proceso interno · Coordinación distrital local 13 (Tuxtla)", "slug":"demo-proceso-interno", "position":"diputacion_local",
    "scope":"DISTRITO LOCAL 13", "objective":"conocimiento", "base":"ayuntamiento", "cand":"Rodrigo Albores Nájera", "meta":60,
    "thanks":"Gracias por platicar con nosotros. Queremos escuchar lo que necesita tu colonia y trabajar juntos. Síguenos para enterarte de las asambleas vecinales.",
    "coords":[{"layer":"distrito_local","zone":"13","mun":102,"dl":13,"name":"Distrito local 13"}],
    "lideres":2, "brig":3, "profiles":["bueno","estrella","regular","bueno","malo","bueno"]}
  ]$j$::jsonb $f$;

create or replace function public.fn_demo_sandbox_create(p_k int, p_ip text default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare c jsonb; v_t uuid; v_slug text := 'sbx-' || encode(extensions.gen_random_bytes(5), 'hex');
begin
  select e into c from jsonb_array_elements(public.fn_demo_spec()) e where (e->>'k')::int = coalesce(p_k, 2);
  if c is null then raise exception 'Campaña demo no válida'; end if;
  c := jsonb_set(c, '{meta}', to_jsonb(least((c->>'meta')::int, 60)));
  v_t := public.fn_demo_seed_campaign(c, v_slug, false);
  update public.tenants set is_sandbox = true, is_demo = true, plan = 'demo', demo_last_seen = now(), demo_ip = left(p_ip, 64),
         ai_daily_limit = coalesce(public.fn_plan_limit(id, 'ia_diaria'), 5),
         name = replace(name, 'DEMO ·', 'DEMO PRIVADA ·')
   where id = v_t;
  perform public.fn_demo_enrich(v_t);
  -- Proceso interno: rivales y termómetro ya levantado (demo k=4), y termómetro básico en la de aspirante (k=3)
  if coalesce(p_k, 2) in (3, 4) then perform public.fn_demo_seed_interno(v_t); end if;
  return v_t;
end;
$$;
