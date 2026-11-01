-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-01.
-- PostGIS: polígonos de secciones (electoral_sections), sección por GPS de cada simpatizante
-- (geo_section_id; section_id se llena solo si viene vacío) y conteo por sección en la base.
-- Cargar polígonos: node scripts/dev/cargar_secciones_postgis.mjs "<ruta>\SECCION.json"
create extension if not exists postgis with schema extensions;

create table if not exists public.electoral_sections (
  entidad integer not null default 7,
  seccion integer not null,
  municipio integer not null,
  distrito_f integer,
  distrito_l integer,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  primary key (entidad, seccion)
);
create index if not exists electoral_sections_geom_idx on public.electoral_sections using gist (geom);
create index if not exists electoral_sections_mun_idx on public.electoral_sections (municipio);
alter table public.electoral_sections enable row level security;
drop policy if exists "Sections read" on public.electoral_sections;
create policy "Sections read" on public.electoral_sections for select to authenticated using (true);
revoke all on public.electoral_sections from anon;

create or replace function public.fn_load_sections(p_features jsonb)
returns integer language plpgsql volatile security definer set search_path = public, extensions as $$
declare n integer;
begin
  insert into public.electoral_sections (entidad, seccion, municipio, distrito_f, distrito_l, geom)
  select coalesce((f->'properties'->>'entidad')::int, 7),
         (f->'properties'->>'seccion')::int,
         (f->'properties'->>'municipio')::int,
         (f->'properties'->>'distrito_f')::int,
         (f->'properties'->>'distrito_l')::int,
         ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(f->>'geometry'), 4326)))
  from jsonb_array_elements(p_features) f
  where f->'geometry' is not null and (f->'properties'->>'seccion') is not null
  on conflict (entidad, seccion) do update
    set municipio = excluded.municipio, distrito_f = excluded.distrito_f,
        distrito_l = excluded.distrito_l, geom = excluded.geom;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.fn_load_sections(jsonb) from public, anon, authenticated;
grant execute on function public.fn_load_sections(jsonb) to service_role;

alter table public.supporters add column if not exists geo_section_id text;
grant select (geo_section_id) on public.supporters to authenticated;

create or replace function public.fn_supporter_geo_section()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.latitude is not null and new.longitude is not null then
    select s.seccion::text into new.geo_section_id
      from public.electoral_sections s
     where ST_Contains(s.geom, ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326))
     limit 1;
    if new.section_id is null or new.section_id = '' then
      new.section_id := new.geo_section_id;
    end if;
  else
    new.geo_section_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_supporter_geo_section on public.supporters;
create trigger trg_supporter_geo_section before insert or update of latitude, longitude on public.supporters
for each row execute function public.fn_supporter_geo_section();

create or replace function public.fn_recompute_supporter_sections()
returns integer language plpgsql volatile security definer set search_path = public, extensions as $$
declare n integer;
begin
  update public.supporters set latitude = latitude where latitude is not null and longitude is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.fn_recompute_supporter_sections() from public, anon, authenticated;
grant execute on function public.fn_recompute_supporter_sections() to service_role;

create or replace function public.fn_supporters_by_section()
returns table(section_id text, total bigint, comprometidos bigint)
language sql stable security invoker set search_path = public as $$
  select coalesce(nullif(s.section_id, ''), s.geo_section_id) as section_id,
         count(*) as total,
         count(*) filter (where s.commitment_level >= 4) as comprometidos
  from public.supporters s
  where coalesce(nullif(s.section_id, ''), s.geo_section_id) is not null
  group by 1
$$;
revoke execute on function public.fn_supporters_by_section() from public, anon;
grant execute on function public.fn_supporters_by_section() to authenticated;
