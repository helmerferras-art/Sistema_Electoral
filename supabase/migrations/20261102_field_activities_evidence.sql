-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-02.
-- Bitácora de campo del brigadista (field_activities) con evidencias privadas (activity_evidence +
-- bucket privado activity_evidence), mapa de calor y resumen por persona. Visibilidad: cada quien lo
-- suyo; cadena de mando hacia abajo; candidato y coordinador de campaña toda la campaña.
-- Incluye corrección: coordinador_territorial ve solo su equipo (está bajo coordinador).

create or replace function public.fn_is_full_scope_role()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_current_role(), '') in ('superadmin','candidato','coordinador_campana','comunicacion_digital')
$$;
create or replace function public.fn_get_staff_locations()
returns table(id uuid, name text, phone text, role text, xp integer, rank_name text, assigned_targets jsonb,
              latitude double precision, longitude double precision, last_location_at timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id, u.name, u.phone, u.role, u.xp, u.rank_name, u.assigned_targets,
         u.last_latitude, u.last_longitude, u.last_location_at
  from public.users u
  where u.last_latitude is not null and u.last_longitude is not null
    and (public.fn_current_role() = 'superadmin'
         or (u.tenant_id = any(public.fn_current_tenant_scope())
             and (coalesce(public.fn_current_role(), '') in ('candidato','coordinador_campana')
                  or u.id = any(public.fn_current_team_ids()))))
$$;

create or replace function public.fn_current_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.users where auth_id = auth.uid()
$$;
create or replace function public.fn_current_user_tenant()
returns uuid language sql stable security definer set search_path = public as $$
  select tenant_id from public.users where auth_id = auth.uid()
$$;
revoke execute on function public.fn_current_user_id() from public, anon;
revoke execute on function public.fn_current_user_tenant() from public, anon;
grant execute on function public.fn_current_user_id() to authenticated;
grant execute on function public.fn_current_user_tenant() to authenticated;

create table if not exists public.field_activities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  activity_type text not null check (activity_type in ('casa_por_casa','crucero','parque','mercado','evento','reunion','otro')),
  notes text check (char_length(notes) <= 2000),
  contacts_count integer not null default 0 check (contacts_count between 0 and 2000),
  convinced_count integer not null default 0 check (convinced_count >= 0 and convinced_count <= contacts_count),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy_m real,
  geo_section_id text,
  consent_confirmed boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  offline_id text unique
);
create index if not exists field_activities_tenant_time_idx on public.field_activities (tenant_id, occurred_at desc);
create index if not exists field_activities_user_time_idx on public.field_activities (user_id, occurred_at desc);

create table if not exists public.activity_evidence (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.field_activities(id) on delete cascade,
  tenant_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('foto','audio','video')),
  storage_path text not null unique,
  mime_type text,
  size_bytes integer,
  duration_s real,
  created_at timestamptz not null default now()
);
create index if not exists activity_evidence_activity_idx on public.activity_evidence (activity_id);

create or replace function public.fn_activity_geo_section()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  new.geo_section_id := null;
  if new.latitude is not null and new.longitude is not null then
    select s.seccion::text into new.geo_section_id from public.electoral_sections s
     where ST_Contains(s.geom, ST_SetSRID(ST_MakePoint(new.longitude, new.latitude), 4326)) limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_activity_geo_section on public.field_activities;
create trigger trg_activity_geo_section before insert or update of latitude, longitude on public.field_activities
for each row execute function public.fn_activity_geo_section();

alter table public.field_activities enable row level security;
alter table public.activity_evidence enable row level security;
revoke all on public.field_activities from anon;
revoke all on public.activity_evidence from anon;

drop policy if exists "Activities insert own" on public.field_activities;
create policy "Activities insert own" on public.field_activities for insert to authenticated
with check (user_id = (select public.fn_current_user_id()) and tenant_id = (select public.fn_current_user_tenant()));

drop policy if exists "Activities scoped select" on public.field_activities;
create policy "Activities scoped select" on public.field_activities for select to authenticated
using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_current_role()) in ('candidato','coordinador_campana')
           or user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[]))))
);

drop policy if exists "Activities update own recent" on public.field_activities;
create policy "Activities update own recent" on public.field_activities for update to authenticated
using (user_id = (select public.fn_current_user_id()) and created_at > now() - interval '24 hours')
with check (user_id = (select public.fn_current_user_id()));

drop policy if exists "Activities delete own recent" on public.field_activities;
create policy "Activities delete own recent" on public.field_activities for delete to authenticated
using (user_id = (select public.fn_current_user_id()) and created_at > now() - interval '24 hours');

drop policy if exists "Evidence insert own" on public.activity_evidence;
create policy "Evidence insert own" on public.activity_evidence for insert to authenticated
with check (user_id = (select public.fn_current_user_id())
            and exists (select 1 from public.field_activities a where a.id = activity_id and a.user_id = (select public.fn_current_user_id())));

drop policy if exists "Evidence scoped select" on public.activity_evidence;
create policy "Evidence scoped select" on public.activity_evidence for select to authenticated
using (exists (select 1 from public.field_activities a where a.id = activity_id));

drop policy if exists "Evidence delete own" on public.activity_evidence;
create policy "Evidence delete own" on public.activity_evidence for delete to authenticated
using (user_id = (select public.fn_current_user_id()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity_evidence', 'activity_evidence', false, 15728640,
        array['image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','video/mp4','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Evidence files upload own" on storage.objects;
create policy "Evidence files upload own" on storage.objects for insert to authenticated
with check (bucket_id = 'activity_evidence'
            and (storage.foldername(name))[1] = (select public.fn_current_user_tenant())::text
            and (storage.foldername(name))[2] = (select public.fn_current_user_id())::text);

drop policy if exists "Evidence files read scoped" on storage.objects;
create policy "Evidence files read scoped" on storage.objects for select to authenticated
using (bucket_id = 'activity_evidence'
       and exists (select 1 from public.activity_evidence e where e.storage_path = name));

drop policy if exists "Evidence files delete own" on storage.objects;
create policy "Evidence files delete own" on storage.objects for delete to authenticated
using (bucket_id = 'activity_evidence' and (storage.foldername(name))[2] = (select public.fn_current_user_id())::text);

create or replace function public.fn_activity_heatmap(p_days integer default 30)
returns table(lat double precision, lng double precision, weight integer, activity_type text, occurred_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select a.latitude, a.longitude, greatest(a.contacts_count, 1), a.activity_type, a.occurred_at
  from public.field_activities a
  where a.latitude is not null and a.longitude is not null
    and a.occurred_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
$$;

create or replace function public.fn_activity_summary(p_days integer default 7)
returns table(user_id uuid, name text, role text, activities bigint, contacts bigint, convinced bigint,
              evidences bigint, sections bigint, last_activity_at timestamptz)
language sql stable security invoker set search_path = public as $$
  with a as (
    select * from public.field_activities
    where occurred_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
  )
  select a.user_id, u.name, u.role, count(*), sum(a.contacts_count), sum(a.convinced_count),
         (select count(*) from public.activity_evidence e join a a2 on a2.id = e.activity_id where a2.user_id = a.user_id),
         count(distinct a.geo_section_id), max(a.occurred_at)
  from a join public.users u on u.id = a.user_id
  group by a.user_id, u.name, u.role
  order by sum(a.contacts_count) desc
$$;

revoke execute on function public.fn_activity_heatmap(integer) from public, anon;
revoke execute on function public.fn_activity_summary(integer) from public, anon;
grant execute on function public.fn_activity_heatmap(integer) to authenticated;
grant execute on function public.fn_activity_summary(integer) to authenticated;

grant select, insert, update, delete on public.field_activities to authenticated;
grant select, insert, delete on public.activity_evidence to authenticated;
