-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-01.
-- Simpatizantes: mandos (superadmin, candidato, coordinador_campana, coordinador_territorial,
-- comunicacion_digital) ven toda la campaña; los demás roles solo lo que registró su equipo
-- más voluntarios sin reclutador (para poder reclamarlos). CURP, clave de elector, domicilio y
-- vigencia solo se leen con fn_supporters_export (superadmin, candidato, coordinador_campana).

create or replace function public.fn_current_team_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  with recursive team as (
    select id from public.users where auth_id = auth.uid()
    union all
    select u.id from public.users u join team t on u.parent_id = t.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) from team
$$;

create or replace function public.fn_is_full_scope_role()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_current_role(), '') in
    ('superadmin','candidato','coordinador_campana','coordinador_territorial','comunicacion_digital')
$$;

revoke execute on function public.fn_current_team_ids() from public, anon;
revoke execute on function public.fn_is_full_scope_role() from public, anon;
grant execute on function public.fn_current_team_ids() to authenticated;
grant execute on function public.fn_is_full_scope_role() to authenticated;

drop policy if exists "Supporters tenant select" on public.supporters;
drop policy if exists "Supporters scoped select" on public.supporters;
create policy "Supporters scoped select" on public.supporters for select to authenticated
using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role())
           or recruiter_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[]))
           or recruiter_id is null))
);

drop policy if exists "Supporters tenant update" on public.supporters;
drop policy if exists "Supporters scoped update" on public.supporters;
create policy "Supporters scoped update" on public.supporters for update to authenticated
using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role())
           or recruiter_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[]))
           or recruiter_id is null))
)
with check (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role())
           or recruiter_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[]))))
);

revoke select on public.supporters from anon, authenticated;
grant select (id, tenant_id, created_at, name, phone, latitude, longitude, commitment_level, offline_id,
              recruiter_id, section_id, status, photo_evidence_url, seccion, birth_date)
  on public.supporters to authenticated;

create or replace function public.fn_supporters_export(p_tenant_id uuid default null)
returns setof public.supporters
language sql stable security definer set search_path = public as $$
  select s.* from public.supporters s
  where coalesce(public.fn_current_role(), '') in ('superadmin','candidato','coordinador_campana')
    and (public.fn_current_role() = 'superadmin' or s.tenant_id = any(public.fn_current_tenant_scope()))
    and (p_tenant_id is null or s.tenant_id = p_tenant_id)
  order by s.created_at desc
$$;
revoke execute on function public.fn_supporters_export(uuid) from public, anon;
grant execute on function public.fn_supporters_export(uuid) to authenticated;

create or replace function public.fn_get_map_supporters()
returns table(id uuid, name text, phone text, latitude double precision, longitude double precision,
              section_id text, commitment_level integer, status text, recruiter_id uuid)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.phone, s.latitude, s.longitude, s.section_id, s.commitment_level, s.status, s.recruiter_id
  from public.supporters s
  where s.latitude is not null and s.longitude is not null
    and (public.fn_current_role() = 'superadmin'
         or (s.tenant_id = any(public.fn_current_tenant_scope())
             and (public.fn_is_full_scope_role()
                  or s.recruiter_id = any(public.fn_current_team_ids())
                  or s.recruiter_id is null)))
$$;

create or replace function public.fn_supporter_birth_from_curp()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.birth_date is null and new.curp ~ '^[A-Z]{4}[0-9]{6}' and length(new.curp) >= 17 then
    begin
      new.birth_date := to_date(
        (case when substr(new.curp, 17, 1) ~ '[0-9]' then '19' else '20' end) || substr(new.curp, 5, 6),
        'YYYYMMDD');
    exception when others then null;
    end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_supporter_birth_from_curp on public.supporters;
create trigger trg_supporter_birth_from_curp before insert or update of curp, birth_date on public.supporters
for each row execute function public.fn_supporter_birth_from_curp();
update public.supporters set curp = curp where birth_date is null and curp is not null;
