-- Control total del administrador del sistema: edición de planes y bitácora de cambios importantes.

-- 1) Planes: el administrador del sistema puede editar los límites (todos pueden leerlos, como antes)
drop policy if exists "Plan limits superadmin write" on public.plan_limits;
create policy "Plan limits superadmin write" on public.plan_limits for all
  using ((select public.fn_current_role()) = 'superadmin')
  with check ((select public.fn_current_role()) = 'superadmin');
create unique index if not exists plan_limits_plan_key_uq on public.plan_limits (plan, key);

-- 2) Bitácora
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_auth uuid default auth.uid(),
  actor_name text,
  action text not null,          -- alta | cambio | baja | respaldo | entrar_como | demo
  entity text not null,          -- campaña | plan | ia | usuario | demo
  entity_id text,
  tenant_id uuid,
  summary text,
  detail jsonb
);
create index if not exists admin_audit_log_at_idx on public.admin_audit_log (at desc);
alter table public.admin_audit_log enable row level security;
drop policy if exists "Audit superadmin read" on public.admin_audit_log;
create policy "Audit superadmin read" on public.admin_audit_log for select using ((select public.fn_current_role()) = 'superadmin');
drop policy if exists "Audit superadmin insert" on public.admin_audit_log;
create policy "Audit superadmin insert" on public.admin_audit_log for insert with check ((select public.fn_current_role()) = 'superadmin');

create or replace function public.fn_audit_changes() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  -- Nunca se guardan secretos ni columnas que cambian solas
  v_skip text[] := array['api_key','temp_code','password_hash','temp_code_expires_at','code_sent','demo_last_seen','demo_ip',
                         'last_action_date','last_latitude','last_longitude','last_location_at','xp','current_streak','updated_at'];
  v_diff jsonb := '{}'::jsonb; k text; v_entity text; v_name text; v_tenant uuid; v_id text; v_label text;
begin
  for k in select jsonb_object_keys(v_old || v_new) loop
    continue when k = any(v_skip);
    if (v_old -> k) is distinct from (v_new -> k) then
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('antes', v_old -> k, 'despues', v_new -> k));
    end if;
  end loop;
  if tg_table_name = 'ai_config' and (v_old ->> 'api_key') is distinct from (v_new ->> 'api_key') then
    v_diff := v_diff || jsonb_build_object('llave', 'cambiada');
  end if;
  if tg_op = 'UPDATE' and v_diff = '{}'::jsonb then return null; end if;

  v_entity := case tg_table_name when 'tenants' then 'campaña' when 'plan_limits' then 'plan' when 'ai_config' then 'ia' else 'usuario' end;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', concat(coalesce(v_new ->> 'plan', v_old ->> 'plan'), ':', coalesce(v_new ->> 'key', v_old ->> 'key')));
  v_tenant := case tg_table_name when 'tenants' then coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid)
                                 when 'users' then coalesce((v_new ->> 'tenant_id')::uuid, (v_old ->> 'tenant_id')::uuid) end;
  v_label := case tg_table_name
    when 'tenants' then coalesce(v_new ->> 'name', v_old ->> 'name')
    when 'plan_limits' then concat('Plan ', coalesce(v_new ->> 'plan', v_old ->> 'plan'), ' · ', coalesce(v_new ->> 'key', v_old ->> 'key'))
    when 'ai_config' then concat('Proveedor ', coalesce(v_new ->> 'provider', v_old ->> 'provider'))
    else concat(coalesce(v_new ->> 'name', v_old ->> 'name'), ' (', coalesce(v_new ->> 'role', v_old ->> 'role'), ')') end;
  select name into v_name from public.users where auth_id = auth.uid() limit 1;

  insert into public.admin_audit_log (actor_name, action, entity, entity_id, tenant_id, summary, detail)
  values (coalesce(v_name, case when auth.uid() is null then 'Sistema' else 'Usuario' end),
          case tg_op when 'INSERT' then 'alta' when 'DELETE' then 'baja' else 'cambio' end,
          v_entity, v_id, v_tenant, v_label,
          case when tg_op = 'UPDATE' then v_diff else null end);
  return null;
end $$;

drop trigger if exists trg_audit_tenants on public.tenants;
create trigger trg_audit_tenants after insert or update or delete on public.tenants for each row execute function public.fn_audit_changes();
drop trigger if exists trg_audit_plan_limits on public.plan_limits;
create trigger trg_audit_plan_limits after insert or update or delete on public.plan_limits for each row execute function public.fn_audit_changes();
drop trigger if exists trg_audit_ai_config on public.ai_config;
create trigger trg_audit_ai_config after insert or update or delete on public.ai_config for each row execute function public.fn_audit_changes();
drop trigger if exists trg_audit_users on public.users;
create trigger trg_audit_users after insert or delete or update of role, is_active, tenant_id on public.users for each row execute function public.fn_audit_changes();
