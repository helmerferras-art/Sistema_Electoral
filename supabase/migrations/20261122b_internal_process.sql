-- ============================================================================
-- Tlatoani · Proceso interno (22-nov-2026)
-- Termómetro con las 8 variables de las encuestas de definición de coordinaciones,
-- rivales internos y mapa de reconocimiento por sección.
-- Las entrevistas son anónimas: no se guarda nombre ni teléfono del entrevistado.
-- ============================================================================

create table if not exists public.internal_contest (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  self_name text not null check (length(trim(self_name)) between 2 and 80),
  process_label text not null default 'Coordinación',
  coalition_label text not null default 'Morena, PT o PVEM',
  template text not null default 'morena_pt_pvem' check (template in ('morena_pt_pvem', 'generico')),
  weights jsonb not null default '{"opinion":2,"votaria":2,"preferencia":3,"buen_candidato":1,"honestidad":1.25,"conoce_territorio":0.25,"cercania":0.25,"cumple":0.25}'::jsonb,
  survey_date date,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.internal_rivals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  notes text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists internal_rivals_tenant_idx on public.internal_rivals(tenant_id, sort);

create table if not exists public.thermo_interviews (
  id uuid primary key default gen_random_uuid(),
  offline_id uuid unique,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  section_id text,
  lat double precision,
  lng double precision,
  mode text not null default 'vivienda' check (mode in ('vivienda', 'telefono')),
  sampled boolean not null default false,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists thermo_interviews_tenant_idx on public.thermo_interviews(tenant_id, created_at desc);

alter table public.internal_contest enable row level security;
alter table public.internal_rivals enable row level security;
alter table public.thermo_interviews enable row level security;

drop policy if exists "Contest visible" on public.internal_contest;
create policy "Contest visible" on public.internal_contest for select to authenticated
  using ((select public.fn_current_role()) = 'superadmin' or tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[])));
drop policy if exists "Contest managed" on public.internal_contest;
create policy "Contest managed" on public.internal_contest for all to authenticated
  using (public.fn_can_manage_polls(tenant_id)) with check (public.fn_can_manage_polls(tenant_id));

drop policy if exists "Rivals visible" on public.internal_rivals;
create policy "Rivals visible" on public.internal_rivals for select to authenticated
  using ((select public.fn_current_role()) = 'superadmin' or tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[])));
drop policy if exists "Rivals managed" on public.internal_rivals;
create policy "Rivals managed" on public.internal_rivals for all to authenticated
  using (public.fn_can_manage_polls(tenant_id)) with check (public.fn_can_manage_polls(tenant_id));

drop policy if exists "Interviews insert own" on public.thermo_interviews;
create policy "Interviews insert own" on public.thermo_interviews for insert to authenticated
  with check (user_id = (select public.fn_current_user_id()) and tenant_id = (select public.fn_current_user_tenant()));
drop policy if exists "Interviews visible" on public.thermo_interviews;
create policy "Interviews visible" on public.thermo_interviews for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role()) or user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])))));

-- Sección por GPS cuando la entrevista no la trae
create or replace function public.fn_thermo_defaults()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.section_id is null and new.lat is not null and new.lng is not null then
    select es.seccion::text into new.section_id from public.electoral_sections es
     where st_contains(es.geom, st_setsrid(st_point(new.lng, new.lat), 4326)) limit 1;
  end if;
  return new;
end $$;
drop trigger if exists trg_thermo_defaults on public.thermo_interviews;
create trigger trg_thermo_defaults before insert on public.thermo_interviews
  for each row execute function public.fn_thermo_defaults();

-- Resultado del termómetro: % por variable y persona, puntos al primer lugar de cada variable
-- (como en la metodología publicada: el puntaje completo es para quien tiene el porcentaje más alto).
create or replace function public.fn_thermometer(p_days int default null, p_only_sampled boolean default false)
returns json language plpgsql stable security definer set search_path = public as $$
declare v_t uuid := public.fn_current_user_tenant(); c record; r json;
begin
  if v_t is null or not public.fn_can_manage_polls(v_t) then raise exception 'Sin permiso' using errcode = '42501'; end if;
  select * into c from public.internal_contest where tenant_id = v_t;
  if c.tenant_id is null then return json_build_object('configured', false); end if;

  with iv as (
    select * from public.thermo_interviews
     where tenant_id = v_t and (p_days is null or created_at > now() - make_interval(days => p_days))
       and (not p_only_sampled or sampled)),
  tot as (select count(*)::numeric n, count(*) filter (where sampled) ns, max(created_at) last_at from iv),
  people as (
    select 'self'::text pid, c.self_name pname, true is_self, 0 sort
    union all select r.id::text, r.name, false, r.sort + 1 from public.internal_rivals r where r.tenant_id = v_t),
  metrics(key, label, kind, pos, sort) as (values
    ('conoce', 'Lo conocen', 'per', 'si', 0),
    ('opinion', 'Opinión positiva', 'per', 'buena', 1),
    ('votaria', 'Disposición a votar', 'per', 'si', 2),
    ('preferencia', 'Preferencia como candidato(a)', 'cmp', null, 3),
    ('buen_candidato', 'Quién sería buen candidato(a)', 'cmp', null, 4),
    ('honestidad', 'Honestidad', 'cmp', null, 5),
    ('conoce_territorio', 'Conoce el territorio', 'cmp', null, 6),
    ('cercania', 'Cercanía con la gente', 'cmp', null, 7),
    ('cumple', 'Cumple su palabra', 'cmp', null, 8)),
  res as (
    select m.key, m.label, m.sort msort, coalesce((c.weights->>m.key)::numeric, 0) weight, p.pid, p.pname, p.is_self, p.sort psort,
           round(100.0 * count(iv.id) filter (where case when m.kind = 'per' then iv.answers->m.key->>p.pid = m.pos
                                                         else iv.answers->>m.key = p.pid end)
                 / nullif((select n from tot), 0), 1) pct
      from metrics m cross join people p left join iv on true
     group by m.key, m.label, m.sort, p.pid, p.pname, p.is_self, p.sort),
  win as (
    select r.*, case when r.weight > 0 and r.pct > 0 and r.pct = (select max(x.pct) from res x where x.key = r.key)
                     then r.weight / (select count(*) from res x where x.key = r.key and x.pct = r.pct) else 0 end points
      from res r),
  secs as (
    select iv.section_id,
           count(*) n,
           round(100.0 * count(*) filter (where iv.answers->'conoce'->>'self' = 'si') / count(*), 1) conoce_self,
           (select max(v) from (select round(100.0 * count(*) filter (where i2.answers->'conoce'->>p.pid = 'si') / count(*), 1) v
                                  from iv i2, people p where i2.section_id = iv.section_id and not p.is_self group by p.pid) q) conoce_rival
      from iv where iv.section_id is not null group by iv.section_id)
  select json_build_object(
    'configured', true,
    'contest', json_build_object('self_name', c.self_name, 'process_label', c.process_label, 'coalition_label', c.coalition_label,
                                 'template', c.template, 'survey_date', c.survey_date, 'active', c.active, 'weights', c.weights),
    'n', (select n from tot), 'n_sampled', (select ns from tot), 'last_at', (select last_at from tot),
    'persons', (select coalesce(json_agg(json_build_object('pid', p.pid, 'name', p.pname, 'is_self', p.is_self,
                         'score', (select coalesce(sum(w.points), 0) from win w where w.pid = p.pid)) order by p.sort), '[]'::json) from people p),
    'variables', (select coalesce(json_agg(v order by v.msort), '[]'::json) from (
                   select w.key, w.label, w.msort, max(w.weight) weight,
                          json_agg(json_build_object('pid', w.pid, 'name', w.pname, 'is_self', w.is_self, 'pct', coalesce(w.pct, 0), 'points', w.points) order by w.psort) results
                     from win w group by w.key, w.label, w.msort) v),
    'sections', (select coalesce(json_agg(s order by s.conoce_self, s.n desc), '[]'::json) from secs s)
  ) into r;
  return r;
end $$;
revoke execute on function public.fn_thermometer(int, boolean) from public, anon;
grant execute on function public.fn_thermometer(int, boolean) to authenticated;
