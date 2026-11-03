-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-03 (account_deletion).
-- Eliminación de cuenta, requisito de Google Play y App Store:
--   fn_delete_my_account('ELIMINAR')  desde la app (no aplica a candidato ni superadmin)
--   fn_request_account_deletion(tel)  desde nemia.lat/eliminar-cuenta, sin sesión
-- Las solicitudes web quedan en account_deletion_requests (solo las ve el superadmin):
--   select * from account_deletion_requests where status = 'pendiente' order by created_at;
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  name text,
  ip text,
  status text not null default 'pendiente' check (status in ('pendiente','atendida','sin_cuenta')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from anon, authenticated;
grant select, update (status, processed_at) on public.account_deletion_requests to authenticated;
drop policy if exists "Deletion requests superadmin" on public.account_deletion_requests;
create policy "Deletion requests superadmin" on public.account_deletion_requests for select to authenticated
  using ((select public.fn_current_role()) = 'superadmin');
drop policy if exists "Deletion requests superadmin update" on public.account_deletion_requests;
create policy "Deletion requests superadmin update" on public.account_deletion_requests for update to authenticated
  using ((select public.fn_current_role()) = 'superadmin') with check ((select public.fn_current_role()) = 'superadmin');

create or replace function public.fn_request_account_deletion(p_phone text, p_name text default null)
returns json language plpgsql volatile security definer set search_path = public as $$
declare v_d text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  if length(v_d) <> 10 then return json_build_object('estado', 'telefono_invalido'); end if;
  if not exists (select 1 from public.account_deletion_requests
                  where phone = v_d and status = 'pendiente' and created_at > now() - interval '1 day') then
    insert into public.account_deletion_requests (phone, name, ip)
    values (v_d, left(nullif(trim(p_name), ''), 120), public.fn_request_ip());
  end if;
  return json_build_object('estado', 'recibida');
end;
$$;
revoke execute on function public.fn_request_account_deletion(text, text) from public;
grant execute on function public.fn_request_account_deletion(text, text) to anon, authenticated;

create or replace function public.fn_delete_my_account(p_confirm text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare u record; n_act int;
begin
  select * into u from public.users where auth_id = auth.uid();
  if u.id is null then raise exception 'No encontramos tu cuenta'; end if;
  if p_confirm is distinct from 'ELIMINAR' then raise exception 'Para confirmar escribe ELIMINAR'; end if;
  if u.role in ('candidato', 'superadmin') then
    raise exception 'La cuenta del candidato o del administrador se elimina con soporte para no dejar la campaña sin responsable';
  end if;
  update public.users set parent_id = u.parent_id where parent_id = u.id;
  update public.audit_call_log set agent_id = null where agent_id = u.id;
  update public.audit_pitch set updated_by = null where updated_by = u.id;
  select count(*) into n_act from public.field_activities where user_id = u.id;
  insert into public.data_access_log (tenant_id, user_id, action, detail, rows_count)
  values (u.tenant_id, null, 'cuenta_eliminada', jsonb_build_object('rol', u.role, 'actividades', n_act), 1);
  delete from public.users where id = u.id;
  delete from auth.users where id = auth.uid();
  update public.account_deletion_requests set status = 'atendida', processed_at = now()
   where phone = right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) and status = 'pendiente';
  return json_build_object('estado', 'eliminada');
end;
$$;
revoke execute on function public.fn_delete_my_account(text) from public, anon;
grant execute on function public.fn_delete_my_account(text) to authenticated;
