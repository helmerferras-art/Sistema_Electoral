-- ============================================================================
-- Tlatoani · IA segura (4-nov-2026)
--  - Las llaves de IA dejan de ser legibles por los usuarios: solo el superadmin las administra
--    y solo la función del servidor ai-proxy las usa.
--  - Bitácora y tope diario de consultas por campaña.
--  - Datos agregados por sección para el resumen semanal (sin nombres ni teléfonos).
-- ============================================================================

drop policy if exists "AI config tenant scope" on public.ai_config;
drop policy if exists "AI config superadmin" on public.ai_config;
create policy "AI config superadmin" on public.ai_config for all to authenticated
  using ((select public.fn_current_role()) = 'superadmin')
  with check ((select public.fn_current_role()) = 'superadmin');

-- ¿Hay IA disponible? (sin exponer llaves)
create or replace function public.fn_ai_status()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('disponible', exists (select 1 from public.ai_config where is_active and coalesce(api_key, '') <> ''),
                           'proveedores', coalesce((select json_agg(distinct provider) from public.ai_config where is_active and coalesce(api_key, '') <> ''), '[]'::json))
$$;
revoke execute on function public.fn_ai_status() from public, anon;
grant execute on function public.fn_ai_status() to authenticated;

alter table public.tenants add column if not exists ai_daily_limit int not null default 60;

create table if not exists public.ai_usage_log (
  id bigint generated always as identity primary key,
  tenant_id uuid references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  task text not null,
  provider text,
  ok boolean not null default false,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_tenant_idx on public.ai_usage_log(tenant_id, created_at desc);
alter table public.ai_usage_log enable row level security;
drop policy if exists "AI usage visible" on public.ai_usage_log;
create policy "AI usage visible" on public.ai_usage_log for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_is_command_role())));

create table if not exists public.ai_section_briefs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  model text,
  summary text,
  sections jsonb not null default '[]'::jsonb,
  priorities jsonb not null default '[]'::jsonb,
  data_snapshot jsonb,
  created_at timestamptz not null default now()
);
alter table public.ai_section_briefs enable row level security;
drop policy if exists "Briefs visible" on public.ai_section_briefs;
create policy "Briefs visible" on public.ai_section_briefs for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_command_role()) or (select public.fn_is_full_scope_role()))));

-- Datos agregados por sección. Solo la usa la función del servidor (service_role).
-- Nunca incluye nombres, teléfonos ni coordenadas de personas.
create or replace function public.fn_section_brief_data(p_tenant uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with
  sup as (
    select coalesce(nullif(section_id, ''), geo_section_id) as sec, count(*) as registrados,
           count(*) filter (where verified_at is not null) as validados,
           count(*) filter (where referred_by is not null) as por_referido
      from public.supporters where tenant_id = p_tenant and privacy_opt_out_at is null group by 1),
  kn as (
    select section_id as sec, count(*) as puertas,
           count(*) filter (where outcome in ('no_estaba', 'no_abrio')) as sin_respuesta,
           count(*) filter (where outcome = 'no_interesa') as no_interesa,
           count(*) filter (where outcome = 'volver' and resolved_at is null) as por_volver
      from public.door_knocks where tenant_id = p_tenant group by 1),
  pr as (
    select r.section_id as sec, q.question_text as pregunta, o.option_text as opcion, count(*) as n
      from public.poll_responses r
      join public.poll_questions q on q.id = r.question_id
      join public.poll_options o on o.id = r.option_id
     where r.tenant_id = p_tenant group by 1, 2, 3),
  pet as (
    select public.fn_section_at(latitude, longitude) as sec, category,
           left(regexp_replace(regexp_replace(coalesce(description, ''), '\S+@\S+', '[correo]', 'g'), '\d{4,}', '[número]', 'g'), 160) as texto,
           created_at
      from public.petitions where tenant_id = p_tenant and latitude is not null),
  secs as (
    select sec from (
      select sec, registrados as w from sup union all select sec, puertas from kn
      union all select sec, sum(n) from pr group by sec union all select sec, count(*) from pet group by sec) x
     where sec is not null and sec ~ '^\d+$'
     group by sec order by sum(w) desc limit 40),
  ln as (
    select distinct on (section_id) section_id as sec, lista_nominal from public.padron_electoral
     where section_id in (select sec from secs) order by section_id, year desc),
  hist as (
    select distinct on (section_id) section_id as sec, election_year, election_type, total_votes, winning_votes, second_place_votes, nominal_list_size
      from public.historical_election_results where section_id in (select sec from secs) order by section_id, election_year desc)
  select jsonb_build_object(
    'campana', (select name from public.tenants where id = p_tenant),
    'tipo_eleccion', (select election_type from public.tenants where id = p_tenant),
    'secciones', coalesce((select jsonb_agg(jsonb_build_object(
        'seccion', s.sec,
        'lista_nominal', ln.lista_nominal,
        'registrados', coalesce(sup.registrados, 0), 'validados', coalesce(sup.validados, 0), 'por_referido', coalesce(sup.por_referido, 0),
        'validados_por_mil_electores', case when ln.lista_nominal > 0 then round(coalesce(sup.validados, 0) * 1000.0 / ln.lista_nominal, 1) end,
        'puertas', coalesce(kn.puertas, 0), 'sin_respuesta', coalesce(kn.sin_respuesta, 0), 'no_interesa', coalesce(kn.no_interesa, 0), 'por_volver', coalesce(kn.por_volver, 0),
        'ultima_eleccion', case when hist.sec is not null then jsonb_build_object('anio', hist.election_year, 'tipo', hist.election_type,
            'participacion_pct', case when hist.nominal_list_size > 0 then round(hist.total_votes * 100.0 / hist.nominal_list_size, 1) end,
            'margen_1o_2o_pct', case when hist.total_votes > 0 then round((hist.winning_votes - hist.second_place_votes) * 100.0 / hist.total_votes, 1) end) end,
        'respuestas_guion', coalesce((select jsonb_agg(jsonb_build_object('pregunta', pregunta, 'opcion', opcion, 'n', n) order by n desc)
                                        from (select * from pr where pr.sec = s.sec order by n desc limit 12) z), '[]'::jsonb),
        'reportes_ciudadanos', coalesce((select jsonb_agg(jsonb_build_object('categoria', category, 'texto', texto))
                                           from (select * from pet where pet.sec = s.sec order by created_at desc limit 5) z), '[]'::jsonb)
      ) order by coalesce(sup.validados, 0) desc)
      from secs s left join sup on sup.sec = s.sec left join kn on kn.sec = s.sec left join ln on ln.sec = s.sec left join hist on hist.sec = s.sec), '[]'::jsonb)
  )
$$;
revoke execute on function public.fn_section_brief_data(uuid) from public, anon, authenticated;
grant execute on function public.fn_section_brief_data(uuid) to service_role;
