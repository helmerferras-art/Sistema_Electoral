-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-01.
-- Columnas sensibles de users (password_hash, temp_code, temp_code_expires_at, curp, id_card_key, address)
-- dejan de ser legibles desde la API. Las Edge Functions (service_role) no se ven afectadas.
revoke select on public.users from anon, authenticated;
grant select (id, tenant_id, auth_id, created_at, name, phone, role, parent_id, assigned_territory,
              assigned_targets, xp, rank_name, current_streak, last_action_date, is_active, seccion_id,
              is_first_login, photo_url, code_sent, two_factor_enabled)
  on public.users to authenticated;

create or replace function public.fn_pending_access_codes()
returns table(id uuid, phone text, name text, temp_code text)
language sql stable security definer set search_path = public as $$
  select u.id, u.phone, u.name, u.temp_code
  from public.users u
  where u.code_sent = false and u.temp_code is not null
    and coalesce(public.fn_current_role(), '') in
        ('superadmin','candidato','coordinador_campana','coordinador_territorial','coordinador','coordinador_logistica')
    and (public.fn_current_role() = 'superadmin' or u.tenant_id = any(public.fn_current_tenant_scope()))
$$;

create or replace function public.fn_mark_access_code_sent(p_user_id uuid)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
begin
  update public.users u set code_sent = true
   where u.id = p_user_id
     and coalesce(public.fn_current_role(), '') in
         ('superadmin','candidato','coordinador_campana','coordinador_territorial','coordinador','coordinador_logistica')
     and (public.fn_current_role() = 'superadmin' or u.tenant_id = any(public.fn_current_tenant_scope()));
  return found;
end;
$$;

revoke execute on function public.fn_pending_access_codes() from public, anon;
revoke execute on function public.fn_mark_access_code_sent(uuid) from public, anon;
grant execute on function public.fn_pending_access_codes() to authenticated;
grant execute on function public.fn_mark_access_code_sent(uuid) to authenticated;
