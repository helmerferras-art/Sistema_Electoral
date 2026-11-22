-- ============================================================================
-- Tlatoani · Rutas de visita automáticas por sección (22-nov-2026)
-- El operativo elige la sección (o la busca por nombre de colonia) y el sistema
-- arma la ruta: nombre, colonias que la forman, punto de llegada, puertas meta
-- (viviendas estimadas) y meta de simpatizantes según la línea base de metas.
-- ============================================================================

alter table public.walk_zones add column if not exists center_lat double precision;
alter table public.walk_zones add column if not exists center_lng double precision;
alter table public.walk_zones add column if not exists meta_simpatizantes int;
alter table public.walk_zones add column if not exists auto boolean not null default false;

-- Secciones que el usuario puede trabajar: su territorio asignado o, si no tiene, el ámbito de la campaña.
-- p_search: número de sección exacto o parte del nombre de una colonia.
create or replace function public.fn_route_sections(p_search text default null, p_limit int default 40)
returns table(section_id text, colonias text, lista_nominal int, viviendas_est int, meta_simpatizantes int,
              center_lat double precision, center_lng double precision, zonas_abiertas int, simpatizantes int)
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  v_uid uuid := public.fn_current_user_id();
  v_tenant uuid := public.fn_current_user_tenant();
  v_role text := public.fn_current_role();
  v_secs text[];
  t record;
  v_norm text;
  v_dist int;
  v_q text := nullif(trim(coalesce(p_search, '')), '');
  v_sel text[];
begin
  if v_uid is null or v_role is null or v_role = 'brigadista' then return; end if;

  select array_agg(x.section_id) into v_secs from public.fn_territory_sections(v_uid) x;

  if coalesce(array_length(v_secs, 1), 0) = 0 and v_role <> 'superadmin' then
    select x.position, x.geographic_scope, x.election_type into t from public.tenants x where x.id = v_tenant;
    v_norm := upper(translate(coalesce(t.geographic_scope, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'));
    if coalesce(t.position, '') ilike '%municipal%' then
      select array_agg(distinct p.section_id) into v_secs
        from public.padron_electoral p
       where upper(translate(p.municipality, 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')) = v_norm;
    elsif coalesce(t.position, '') ilike '%diput%' then
      v_dist := nullif(regexp_replace(coalesce(t.geographic_scope, ''), '\D', '', 'g'), '')::int;
      if lower(coalesce(t.election_type, '')) = 'federal' then
        select array_agg(e.seccion::text) into v_secs from public.electoral_sections e where e.distrito_f = v_dist;
      else
        select array_agg(e.seccion::text) into v_secs from public.electoral_sections e where e.distrito_l = v_dist;
      end if;
    end if;
    -- gubernatura / estatal: v_secs queda nulo = todas las secciones
  end if;

  -- Secciones que coinciden con la búsqueda (limitadas) antes de calcular metas
  select array_agg(sid) into v_sel from (
    select e.seccion::text sid
      from public.electoral_sections e
     where (v_secs is null or e.seccion::text = any(v_secs))
       and (v_q is null
            or e.seccion::text = ltrim(v_q, '0')
            or exists (select 1 from public.colonia_secciones c
                        where c.seccion = e.seccion and c.porcentaje >= 1
                          and translate(lower(c.colonia), 'áéíóúüñ', 'aeiouun')
                              like '%' || translate(lower(v_q), 'áéíóúüñ', 'aeiouun') || '%'))
     order by e.seccion
     limit greatest(1, least(p_limit, 200))) s;

  if v_sel is null then return; end if;

  return query
  with b as (select * from public.fn_section_baseline(v_sel, v_tenant)),
  col as (
    select c.seccion::text sid, string_agg(initcap(lower(c.colonia)), ', ' order by c.porcentaje desc) cols
      from public.colonia_secciones c
     where c.seccion::text = any(v_sel) and c.porcentaje >= 5
     group by c.seccion),
  ln as (
    select distinct on (p.section_id) p.section_id sid, coalesce(p.lista_nominal, p.padron_total) ln
      from public.padron_electoral p where p.section_id = any(v_sel)
     order by p.section_id, p.year desc),
  z as (
    select w.section_id sid, count(*)::int n from public.walk_zones w
     where w.tenant_id = v_tenant and w.status = 'abierta' and w.section_id = any(v_sel) group by w.section_id),
  sp as (
    select coalesce(s.geo_section_id, s.section_id) sid, count(*)::int n from public.supporters s
     where s.tenant_id = v_tenant and coalesce(s.geo_section_id, s.section_id) = any(v_sel) group by 1)
  select e.seccion::text,
         col.cols,
         coalesce(ln.ln, b.lista_nominal_actual, b.lista_nominal_base)::int,
         ceil(coalesce(ln.ln, b.lista_nominal_actual, b.lista_nominal_base, 0) / 2.6)::int,
         b.meta_simpatizantes,
         st_y(st_pointonsurface(e.geom)),
         st_x(st_pointonsurface(e.geom)),
         coalesce(z.n, 0),
         coalesce(sp.n, 0)
    from public.electoral_sections e
    left join col on col.sid = e.seccion::text
    left join ln on ln.sid = e.seccion::text
    left join b on b.section_id = e.seccion::text
    left join z on z.sid = e.seccion::text
    left join sp on sp.sid = e.seccion::text
   where e.seccion::text = any(v_sel)
   order by e.seccion;
end;
$$;

revoke execute on function public.fn_route_sections(text, int) from public, anon;
grant execute on function public.fn_route_sections(text, int) to authenticated;
