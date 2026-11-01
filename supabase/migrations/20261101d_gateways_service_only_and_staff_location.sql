-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-01.
-- 1) La cola gateway_commands y communication_gateways ya no aceptan la llave pública (anon).
--    El puente SMS (scripts/sms_bridge.js) usa SUPABASE_SERVICE_ROLE_KEY.
-- 2) Última ubicación conocida del personal: se guarda al registrar un simpatizante y solo se lee
--    vía fn_get_staff_locations (mandos: todo su alcance; demás: su equipo hacia abajo).
drop policy if exists "Gateways anon heartbeat insert" on public.communication_gateways;
drop policy if exists "Gateways anon heartbeat update" on public.communication_gateways;
drop policy if exists "Gateways anon select for upsert" on public.communication_gateways;
drop policy if exists "Gateway commands anon read" on public.gateway_commands;
drop policy if exists "Gateway commands anon update" on public.gateway_commands;
revoke all on public.communication_gateways from anon;
revoke all on public.gateway_commands from anon;

alter table public.users add column if not exists last_latitude double precision;
alter table public.users add column if not exists last_longitude double precision;
alter table public.users add column if not exists last_location_at timestamptz;

create or replace function public.fn_update_my_location(p_lat double precision, p_lng double precision)
returns void language sql volatile security definer set search_path = public as $$
  update public.users
     set last_latitude = p_lat, last_longitude = p_lng, last_location_at = now()
   where auth_id = auth.uid()
     and p_lat between -90 and 90 and p_lng between -180 and 180
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
             and (coalesce(public.fn_current_role(), '') in ('candidato','coordinador_campana','coordinador_territorial')
                  or u.id = any(public.fn_current_team_ids()))))
$$;

revoke execute on function public.fn_update_my_location(double precision, double precision) from public, anon;
revoke execute on function public.fn_get_staff_locations() from public, anon;
grant execute on function public.fn_update_my_location(double precision, double precision) to authenticated;
grant execute on function public.fn_get_staff_locations() to authenticated;
