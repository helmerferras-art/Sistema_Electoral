-- Licencias por campaña: vigencia, cobranza, límites propios, aviso y pausa automática al vencer.
-- El administrador del sistema registra cada licencia desde su panel (fn_license_register).

-- 1) Vigencia en la campaña
alter table public.tenants
  add column if not exists license_start date,
  add column if not exists license_end date,
  add column if not exists license_warned_at timestamptz,
  add column if not exists suspended_reason text;

-- 2) Registro de licencias (control de cobranza)
create sequence if not exists public.license_folio_seq;
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('TL-' || to_char(now() at time zone 'America/Mexico_City', 'YYYY') || '-' || lpad(nextval('public.license_folio_seq')::text, 4, '0')),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan text not null check (plan in ('arranque', 'profesional', 'a_medida')),
  start_date date not null,
  end_date date not null,
  amount numeric(12,2),
  currency text not null default 'MXN',
  payment_method text check (payment_method in ('transferencia', 'deposito', 'efectivo', 'tarjeta', 'otro')),
  payment_status text not null default 'pendiente' check (payment_status in ('pagado', 'parcial', 'pendiente', 'cortesia')),
  paid_at date,
  reference text,
  services text[] not null default '{}',
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint licenses_dates_ok check (end_date >= start_date)
);
create index if not exists licenses_tenant_idx on public.licenses (tenant_id, end_date desc);
alter table public.licenses enable row level security;
drop policy if exists "Licenses superadmin" on public.licenses;
create policy "Licenses superadmin" on public.licenses for all
  using ((select public.fn_current_role()) = 'superadmin') with check ((select public.fn_current_role()) = 'superadmin');

-- 3) Límites propios por campaña (tienen prioridad sobre los del plan; valor vacío = sin límite)
create table if not exists public.tenant_limit_overrides (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  value int,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, key)
);
alter table public.tenant_limit_overrides enable row level security;
drop policy if exists "Overrides superadmin" on public.tenant_limit_overrides;
create policy "Overrides superadmin" on public.tenant_limit_overrides for all
  using ((select public.fn_current_role()) = 'superadmin') with check ((select public.fn_current_role()) = 'superadmin');

create or replace function public.fn_plan_limit(p_tenant uuid, p_key text)
returns integer language sql stable security definer set search_path to 'public' as $$
  select case when o.tenant_id is not null then o.value else l.value end
    from public.tenants t
    left join public.plan_limits l on l.plan = t.plan and l.key = p_key
    left join public.tenant_limit_overrides o on o.tenant_id = t.id and o.key = p_key
   where t.id = p_tenant
$$;
revoke execute on function public.fn_plan_limit(uuid, text) from public, anon;

create or replace function public.fn_my_plan()
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object('plan', t.plan, 'sandbox', t.is_sandbox, 'campana', t.name,
    'limites', (
      coalesce((select jsonb_object_agg(l.key, l.value) from public.plan_limits l where l.plan = t.plan), '{}'::jsonb)
      || coalesce((select jsonb_object_agg(o.key, o.value) from public.tenant_limit_overrides o where o.tenant_id = t.id and o.value is not null), '{}'::jsonb)
      - coalesce((select array_agg(o.key) from public.tenant_limit_overrides o where o.tenant_id = t.id and o.value is null), '{}'::text[])
    )::json,
    'vigencia_fin', t.license_end,
    'uso', json_build_object(
      'simpatizantes', (select count(*) from public.supporters s where s.tenant_id = t.id),
      'usuarios', (select json_object_agg(role, n) from (select role, count(*) n from public.users where tenant_id = t.id and is_active is not false group by role) r)))
  from public.users u join public.tenants t on t.id = u.tenant_id where u.auth_id = auth.uid()
$$;
revoke execute on function public.fn_my_plan() from public, anon;
grant execute on function public.fn_my_plan() to authenticated;

-- 4) Utilidades: fecha en español y envío de SMS por el puente
create or replace function public.fn_mx_date(d date) returns text language sql immutable as $$
  select extract(day from d)::int || ' de ' ||
    (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from d)::int]
    || ' de ' || extract(year from d)::int
$$;

create or replace function public.fn_queue_sms(p_tenant uuid, p_phone text, p_message text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_bridge text;
begin
  if coalesce(p_phone, '') = '' or coalesce(p_message, '') = '' then return false; end if;
  v_bridge := public.fn_pick_bridge(p_tenant);
  if v_bridge is null then
    select bridge_id into v_bridge from public.communication_gateways
     where tenant_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid order by last_seen desc nulls last limit 1;
  end if;
  if v_bridge is null then return false; end if;
  insert into public.gateway_commands (bridge_id, type, phone, message, status)
  values (v_bridge, 'sms', case when p_phone like '+%' then p_phone else '+52' || right(regexp_replace(p_phone, '\D', '', 'g'), 10) end, left(p_message, 300), 'pending');
  return true;
end $$;
revoke execute on function public.fn_queue_sms(uuid, text, text) from public, anon, authenticated;

-- El administrador del sistema puede mandar un SMS a la cuenta principal de una campaña (bienvenida, avisos)
create or replace function public.fn_admin_send_sms(p_tenant uuid, p_phone text, p_message text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
begin
  if public.fn_current_role() <> 'superadmin' then raise exception 'Solo el administrador del sistema'; end if;
  return public.fn_queue_sms(p_tenant, p_phone, p_message);
end $$;
revoke execute on function public.fn_admin_send_sms(uuid, text, text) from public, anon;
grant execute on function public.fn_admin_send_sms(uuid, text, text) to authenticated;

create or replace function public.fn_tenant_admin_contact(p_tenant uuid)
returns table (name text, phone text) language sql stable security definer set search_path to 'public' as $$
  select u.name, u.phone from public.users u
   where u.tenant_id = p_tenant and u.role in ('candidato', 'coordinador_campana') and u.is_active is not false and coalesce(u.phone, '') <> ''
   order by (u.role = 'candidato') desc, u.created_at limit 1
$$;
revoke execute on function public.fn_tenant_admin_contact(uuid) from public, anon, authenticated;

-- 5) Registrar / renovar una licencia: actualiza plan y vigencia, reactiva y (opcional) avisa por SMS
create or replace function public.fn_license_register(
  p_tenant uuid, p_plan text, p_start date, p_end date,
  p_amount numeric default null, p_method text default null, p_status text default 'pendiente',
  p_paid_at date default null, p_reference text default null, p_services text[] default '{}', p_notes text default null,
  p_send_sms boolean default true
) returns json language plpgsql security definer set search_path to 'public' as $$
declare v_lic public.licenses; v_today date := (now() at time zone 'America/Mexico_City')::date; v_t public.tenants;
        v_c record; v_sms boolean := false; v_label text;
begin
  if public.fn_current_role() <> 'superadmin' then raise exception 'Solo el administrador del sistema'; end if;
  select * into v_t from public.tenants where id = p_tenant;
  if v_t.id is null then raise exception 'Campaña no encontrada'; end if;
  if p_end < p_start then raise exception 'La fecha de fin no puede ser anterior al inicio'; end if;

  insert into public.licenses (tenant_id, plan, start_date, end_date, amount, payment_method, payment_status, paid_at, reference, services, notes)
  values (p_tenant, p_plan, p_start, p_end, p_amount, nullif(p_method, ''), coalesce(nullif(p_status, ''), 'pendiente'), p_paid_at,
          nullif(trim(p_reference), ''), coalesce(p_services, '{}'), nullif(trim(p_notes), ''))
  returning * into v_lic;

  update public.tenants set
    plan = p_plan,
    license_start = least(coalesce(license_start, p_start), p_start),
    license_end = p_end,
    license_warned_at = null,
    is_active = case when p_end >= v_today and p_start <= v_today then true else is_active end,
    suspended_reason = case when p_end >= v_today and p_start <= v_today then null else suspended_reason end
  where id = p_tenant;
  -- El tope diario de IA sigue al plan (o al límite propio de la campaña)
  update public.tenants set ai_daily_limit = coalesce(public.fn_plan_limit(p_tenant, 'ia_diaria'), ai_daily_limit) where id = p_tenant;

  if p_send_sms then
    select * into v_c from public.fn_tenant_admin_contact(p_tenant);
    v_label := case p_plan when 'arranque' then 'Arranque' when 'profesional' then 'Profesional' else 'A la medida' end;
    if v_c.phone is not null then
      v_sms := public.fn_queue_sms(p_tenant, v_c.phone,
        'TLATOANI: Hola ' || split_part(coalesce(v_c.name, ''), ' ', 1) || ', tu plan ' || v_label || ' de ' || v_t.name ||
        ' esta activo del ' || public.fn_mx_date(p_start) || ' al ' || public.fn_mx_date(p_end) || '. Gracias por tu confianza.');
    end if;
  end if;
  return json_build_object('folio', v_lic.folio, 'id', v_lic.id, 'sms', v_sms);
end $$;
revoke execute on function public.fn_license_register(uuid, text, date, date, numeric, text, text, date, text, text[], text, boolean) from public, anon;
grant execute on function public.fn_license_register(uuid, text, date, date, numeric, text, text, date, text, text[], text, boolean) to authenticated;

-- 6) Revisión diaria: avisa 7 días antes y pausa al vencer (excluye demo, pruebas y la cuenta del administrador)
create or replace function public.fn_license_sweep()
returns json language plpgsql security definer set search_path to 'public' as $$
declare v_today date := (now() at time zone 'America/Mexico_City')::date; r record; v_c record; n_warn int := 0; n_pause int := 0;
begin
  for r in select * from public.tenants
            where license_end is not null and license_end < v_today and is_active is not false
              and not coalesce(is_sandbox, false) and not coalesce(is_demo, false) and id <> 'aaaaaaaa-0000-0000-0000-000000000001'::uuid loop
    update public.tenants set is_active = false, suspended_reason = 'licencia_vencida' where id = r.id;
    insert into public.system_alerts (source, message) values ('Licencias', 'Se pausó "' || r.name || '": su licencia venció el ' || public.fn_mx_date(r.license_end) || '.');
    select * into v_c from public.fn_tenant_admin_contact(r.id);
    if v_c.phone is not null then
      perform public.fn_queue_sms(r.id, v_c.phone, 'TLATOANI: La licencia de ' || r.name || ' vencio el ' || public.fn_mx_date(r.license_end) ||
        ' y la app quedo en pausa. Tus datos estan a salvo. Para renovarla comunicate con nosotros.');
    end if;
    n_pause := n_pause + 1;
  end loop;

  for r in select * from public.tenants
            where license_end is not null and license_end between v_today and v_today + 7 and license_warned_at is null and is_active is not false
              and not coalesce(is_sandbox, false) and not coalesce(is_demo, false) and id <> 'aaaaaaaa-0000-0000-0000-000000000001'::uuid loop
    update public.tenants set license_warned_at = now() where id = r.id;
    insert into public.system_alerts (source, message) values ('Licencias', 'La licencia de "' || r.name || '" vence el ' || public.fn_mx_date(r.license_end) || '.');
    select * into v_c from public.fn_tenant_admin_contact(r.id);
    if v_c.phone is not null then
      perform public.fn_queue_sms(r.id, v_c.phone, 'TLATOANI: Hola ' || split_part(coalesce(v_c.name, ''), ' ', 1) || ', la licencia de ' || r.name ||
        ' vence el ' || public.fn_mx_date(r.license_end) || '. Renueva a tiempo para que tu equipo siga trabajando sin pausa.');
    end if;
    n_warn := n_warn + 1;
  end loop;
  return json_build_object('avisos', n_warn, 'pausadas', n_pause);
end $$;
revoke execute on function public.fn_license_sweep() from public, anon, authenticated;

-- 7) Bitácora: también registra licencias y límites propios
create or replace function public.fn_audit_changes() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  v_skip text[] := array['api_key','temp_code','password_hash','temp_code_expires_at','code_sent','demo_last_seen','demo_ip',
                         'last_action_date','last_latitude','last_longitude','last_location_at','xp','current_streak','updated_at','license_warned_at'];
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

  v_entity := case tg_table_name when 'tenants' then 'campaña' when 'plan_limits' then 'plan' when 'ai_config' then 'ia'
                when 'licenses' then 'licencia' when 'tenant_limit_overrides' then 'límite' else 'usuario' end;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', concat(coalesce(v_new ->> 'plan', v_old ->> 'plan', v_new ->> 'tenant_id', v_old ->> 'tenant_id'), ':', coalesce(v_new ->> 'key', v_old ->> 'key')));
  v_tenant := case tg_table_name when 'tenants' then coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid)
                                 when 'plan_limits' then null when 'ai_config' then null
                                 else coalesce((v_new ->> 'tenant_id')::uuid, (v_old ->> 'tenant_id')::uuid) end;
  v_label := case tg_table_name
    when 'tenants' then coalesce(v_new ->> 'name', v_old ->> 'name')
    when 'plan_limits' then concat('Plan ', coalesce(v_new ->> 'plan', v_old ->> 'plan'), ' · ', coalesce(v_new ->> 'key', v_old ->> 'key'))
    when 'ai_config' then concat('Proveedor ', coalesce(v_new ->> 'provider', v_old ->> 'provider'))
    when 'licenses' then concat('Licencia ', coalesce(v_new ->> 'folio', v_old ->> 'folio'), ' · ', (select name from public.tenants where id = v_tenant),
                                ' · ', coalesce(v_new ->> 'plan', v_old ->> 'plan'), ' hasta ', coalesce(v_new ->> 'end_date', v_old ->> 'end_date'))
    when 'tenant_limit_overrides' then concat('Límite propio ', coalesce(v_new ->> 'key', v_old ->> 'key'), ' · ', (select name from public.tenants where id = v_tenant))
    else concat(coalesce(v_new ->> 'name', v_old ->> 'name'), ' (', coalesce(v_new ->> 'role', v_old ->> 'role'), ')') end;
  select name into v_name from public.users where auth_id = auth.uid() limit 1;

  insert into public.admin_audit_log (actor_name, action, entity, entity_id, tenant_id, summary, detail)
  values (coalesce(v_name, case when auth.uid() is null then 'Sistema' else 'Usuario' end),
          case tg_op when 'INSERT' then 'alta' when 'DELETE' then 'baja' else 'cambio' end,
          v_entity, v_id, v_tenant, v_label,
          case when tg_op = 'UPDATE' then v_diff when tg_table_name = 'tenant_limit_overrides' then jsonb_build_object('value', v_new -> 'value') else null end);
  return null;
end $$;

drop trigger if exists trg_audit_licenses on public.licenses;
create trigger trg_audit_licenses after insert or update or delete on public.licenses for each row execute function public.fn_audit_changes();
drop trigger if exists trg_audit_overrides on public.tenant_limit_overrides;
create trigger trg_audit_overrides after insert or update or delete on public.tenant_limit_overrides for each row execute function public.fn_audit_changes();

-- 8) Revisión diaria a las 8:05 de Chiapas (14:05 UTC)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'tl-license-sweep';
    perform cron.schedule('tl-license-sweep', '5 14 * * *', 'select public.fn_license_sweep()');
  end if;
end $$;
