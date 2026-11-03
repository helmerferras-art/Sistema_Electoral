-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-02 (quality_audit_governance + ajustes).
-- A) Alertas automáticas de calidad al registrar (ráfaga, mismas coordenadas, nocturno, teléfonos repetidos/consecutivos)
-- B) Bitácora de accesos a datos personales (exportación, muestras de auditoría, borrado)
-- C) Auditoría telefónica por muestreo y calidad por brigadista
-- D) Borrado/anonimización de datos personales al cerrar el proceso (frase de confirmación)
-- E) 2FA: el código se genera y encola en el servidor
-- F) Tablero de metas: las alertas incluyen las de calidad
-- G) Recordatorios semanales de metas con pg_cron (lunes 8:00 am centro de México)

-- ═══════════ A) ALERTAS AUTOMÁTICAS DE CALIDAD ═══════════
alter table public.supporters add column if not exists captured_at timestamptz;          -- hora real de captura (offline)
alter table public.supporters add column if not exists quality_flags text[] not null default '{}';
grant select (captured_at, quality_flags) on public.supporters to authenticated;

create or replace function public.fn_supporter_quality_flags()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  v_at timestamptz := coalesce(new.captured_at, new.created_at, now());
  v_flags text[] := '{}'::text[];
  v_d text := right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10);
  v_hour int := extract(hour from v_at at time zone 'America/Mexico_City');
begin
  -- Varios registros del mismo brigadista con menos de 45 s de diferencia
  if new.recruiter_id is not null and exists (
       select 1 from public.supporters s where s.recruiter_id = new.recruiter_id and s.id <> new.id
          and abs(extract(epoch from (coalesce(s.captured_at, s.created_at) - v_at))) < 45) then
    v_flags := array_append(v_flags, 'rafaga');
  end if;
  -- 3 o más registros del mismo brigadista, el mismo día, a menos de 15 m (¿registrando desde un mismo lugar?)
  if new.recruiter_id is not null and new.latitude is not null and new.longitude is not null and (
       select count(*) from public.supporters s
        where s.recruiter_id = new.recruiter_id and s.id <> new.id and s.latitude is not null
          and (coalesce(s.captured_at, s.created_at) at time zone 'America/Mexico_City')::date = (v_at at time zone 'America/Mexico_City')::date
          and ST_DWithin(ST_MakePoint(s.longitude, s.latitude)::geography, ST_MakePoint(new.longitude, new.latitude)::geography, 15)) >= 3 then
    v_flags := array_append(v_flags, 'mismas_coordenadas');
  end if;
  -- Registros de noche (22:00 a 06:00)
  if v_hour >= 22 or v_hour < 6 then v_flags := array_append(v_flags, 'nocturno'); end if;
  if length(v_d) = 10 then
    -- Teléfono ya registrado en la campaña
    if exists (select 1 from public.supporters s where s.tenant_id = new.tenant_id and s.id <> new.id
                and right(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), 10) = v_d) then
      v_flags := array_append(v_flags, 'telefono_repetido');
    end if;
    -- Teléfonos casi consecutivos del mismo brigadista (961-555-0001, -0002...)
    if new.recruiter_id is not null and exists (
         select 1 from public.supporters s where s.recruiter_id = new.recruiter_id and s.id <> new.id
            and right(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), 10) ~ '^\d{10}$'
            and right(regexp_replace(s.phone, '\D', '', 'g'), 10) <> v_d
            and abs(right(regexp_replace(s.phone, '\D', '', 'g'), 10)::bigint - v_d::bigint) <= 3) then
      v_flags := array_append(v_flags, 'telefonos_consecutivos');
    end if;
  end if;
  new.quality_flags := v_flags;
  return new;
end;
$$;
drop trigger if exists trg_supporter_quality_flags on public.supporters;
create trigger trg_supporter_quality_flags before insert on public.supporters
for each row execute function public.fn_supporter_quality_flags();

-- ═══════════ B) BITÁCORA DE ACCESOS A DATOS PERSONALES ═══════════
create table if not exists public.data_access_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  rows_count integer,
  created_at timestamptz not null default now()
);
create index if not exists data_access_log_tenant_idx on public.data_access_log (tenant_id, created_at desc);
alter table public.data_access_log enable row level security;
revoke all on public.data_access_log from anon, authenticated;
grant select on public.data_access_log to authenticated;
drop policy if exists "Access log read" on public.data_access_log;
create policy "Access log read" on public.data_access_log for select to authenticated
using ((select public.fn_current_role()) = 'superadmin'
       or (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_current_role()) in ('candidato','coordinador_campana')));

create or replace function public.fn_log_access(p_action text, p_detail jsonb, p_rows integer)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.data_access_log (tenant_id, user_id, action, detail, rows_count)
  values (public.fn_current_user_tenant(), public.fn_current_user_id(), p_action, coalesce(p_detail, '{}'::jsonb), p_rows)
$$;
revoke execute on function public.fn_log_access(text, jsonb, integer) from public, anon, authenticated;

-- La exportación con datos sensibles ahora deja registro de quién, cuándo y cuántos
drop function if exists public.fn_supporters_export(uuid);
create or replace function public.fn_supporters_export(p_tenant_id uuid default null)
returns setof public.supporters
language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if coalesce(public.fn_current_role(), '') not in ('superadmin','candidato','coordinador_campana') then return; end if;
  select count(*) into n from public.supporters s
   where (public.fn_current_role() = 'superadmin' or s.tenant_id = any(public.fn_current_tenant_scope()))
     and (p_tenant_id is null or s.tenant_id = p_tenant_id);
  perform public.fn_log_access('exportacion_simpatizantes', jsonb_build_object('tenant', p_tenant_id), n);
  return query
    select s.* from public.supporters s
     where (public.fn_current_role() = 'superadmin' or s.tenant_id = any(public.fn_current_tenant_scope()))
       and (p_tenant_id is null or s.tenant_id = p_tenant_id)
     order by s.created_at desc;
end;
$$;
revoke execute on function public.fn_supporters_export(uuid) from public, anon;
grant execute on function public.fn_supporters_export(uuid) to authenticated;

-- ═══════════ C) AUDITORÍA TELEFÓNICA POR MUESTREO ═══════════
alter table public.audit_call_log add column if not exists notes text;
alter table public.audit_call_log alter column called_at set default now();
alter table public.audit_call_log drop constraint if exists audit_call_log_outcome_check;
alter table public.audit_call_log add constraint audit_call_log_outcome_check
  check (outcome in ('confirmado','no_conoce','numero_invalido','no_contesta','pidio_baja'));

create or replace function public.fn_is_auditor()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_current_role(), '') in ('superadmin','candidato','coordinador_campana','comunicacion_digital')
$$;

-- Muestra para llamar: primero los que tienen alertas o no validaron; después, al azar. Excluye bajas y ya auditados.
create or replace function public.fn_audit_sample(p_n integer default 20)
returns table(supporter_id uuid, name text, phone text, brigadista text, registrado date,
              alertas text[], validacion text, prioridad integer)
language plpgsql volatile security definer set search_path = public as $$
declare n int := greatest(1, least(coalesce(p_n, 20), 100)); got int;
begin
  if not public.fn_is_auditor() then raise exception 'Solo el equipo de auditoría puede ver la muestra'; end if;
  return query
  with base as (
    select s.id, s.name, s.phone, u.name brig, coalesce(s.captured_at, s.created_at)::date reg,
           (s.quality_flags || s.verification_flags) fl,
           case when s.verification_response = 'si' then 'validado' when s.verification_sent_at is not null then 'enviado' else 'sin validar' end val,
           case when cardinality(s.quality_flags || s.verification_flags) > 0 then 1
                when s.verification_response is null then 2 else 3 end pr
    from public.supporters s left join public.users u on u.id = s.recruiter_id
    where s.tenant_id = any(public.fn_current_tenant_scope())
      and s.privacy_opt_out_at is null and coalesce(s.phone, '') <> ''
      and not exists (select 1 from public.audit_call_log a where a.supporter_id = s.id and a.outcome <> 'no_contesta')
  )
  select b.id, b.name, b.phone, b.brig, b.reg, b.fl, b.val, b.pr from base b order by b.pr, random() limit n;
  get diagnostics got = row_count;
  perform public.fn_log_access('auditoria_muestra', jsonb_build_object('solicitados', n), got);
end;
$$;

create or replace function public.fn_audit_record(p_supporter_id uuid, p_outcome text, p_notes text default null)
returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if not public.fn_is_auditor() then raise exception 'Sin permiso'; end if;
  select tenant_id into v_tenant from public.supporters where id = p_supporter_id and tenant_id = any(public.fn_current_tenant_scope());
  if v_tenant is null then raise exception 'Simpatizante fuera de tu campaña'; end if;
  insert into public.audit_call_log (tenant_id, supporter_id, agent_id, outcome, notes)
  values (v_tenant, p_supporter_id, public.fn_current_user_id(), p_outcome, left(p_notes, 500));
  if p_outcome = 'pidio_baja' then
    update public.supporters set privacy_opt_out_at = coalesce(privacy_opt_out_at, now()) where id = p_supporter_id;
  end if;
  return true;
end;
$$;

-- Calidad por brigadista según las llamadas de auditoría
create or replace function public.fn_audit_quality(p_days integer default 60)
returns table(recruiter_id uuid, brigadista text, registrados bigint, auditados bigint, confirmados bigint,
              no_conoce bigint, numero_invalido bigint, alertas bigint, tasa_confirmacion numeric)
language sql stable security definer set search_path = public as $$
  with s as (
    select s.* from public.supporters s
    where public.fn_is_auditor() and s.tenant_id = any(public.fn_current_tenant_scope())
      and s.created_at > now() - make_interval(days => greatest(1, least(p_days, 365)))
  ), last_audit as (
    select distinct on (a.supporter_id) a.supporter_id, a.outcome
    from public.audit_call_log a join s on s.id = a.supporter_id
    where a.outcome <> 'no_contesta' order by a.supporter_id, a.called_at desc
  )
  select s.recruiter_id, coalesce(u.name, 'Sin brigadista'), count(*), count(la.outcome),
         count(*) filter (where la.outcome = 'confirmado'), count(*) filter (where la.outcome = 'no_conoce'),
         count(*) filter (where la.outcome = 'numero_invalido'),
         count(*) filter (where cardinality(s.quality_flags || s.verification_flags) > 0),
         round(count(*) filter (where la.outcome = 'confirmado')::numeric / nullif(count(la.outcome), 0), 3)
  from s left join last_audit la on la.supporter_id = s.id left join public.users u on u.id = s.recruiter_id
  group by s.recruiter_id, u.name
  order by count(*) desc
$$;

revoke execute on function public.fn_is_auditor() from public, anon;
revoke execute on function public.fn_audit_sample(integer) from public, anon;
revoke execute on function public.fn_audit_record(uuid, text, text) from public, anon;
revoke execute on function public.fn_audit_quality(integer) from public, anon;
grant execute on function public.fn_is_auditor() to authenticated;
grant execute on function public.fn_audit_sample(integer) to authenticated;
grant execute on function public.fn_audit_record(uuid, text, text) to authenticated;
grant execute on function public.fn_audit_quality(integer) to authenticated;

-- ═══════════ D) BORRADO DE DATOS PERSONALES AL CERRAR EL PROCESO ═══════════
create or replace function public.fn_purge_personal_data(p_confirm text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare v_tenant uuid := public.fn_current_user_tenant(); v_name text; n_sup int; n_ev int; n_act int;
begin
  if coalesce(public.fn_current_role(), '') not in ('candidato','superadmin') then
    raise exception 'Solo el candidato puede borrar los datos personales de la campaña';
  end if;
  select name into v_name from public.tenants where id = v_tenant;
  if p_confirm is distinct from ('BORRAR ' || upper(v_name)) then
    raise exception 'Para confirmar escribe exactamente: BORRAR %', upper(v_name);
  end if;
  -- Se conservan las estadísticas por sección; se eliminan nombres, teléfonos, documentos y ubicación exacta
  update public.supporters set
    name = 'Anonimizado', phone = null, curp = null, clave_elector = null, domicilio = null, vigencia = null,
    birth_date = null, photo_evidence_url = null, verification_phone = null, verification_ip = null,
    verification_sent_ip = null, confirm_device = null, recruiter_device = null, verification_token = null,
    latitude = round(latitude::numeric, 2)::double precision, longitude = round(longitude::numeric, 2)::double precision
   where tenant_id = v_tenant;
  get diagnostics n_sup = row_count;
  update public.field_activities set notes = null where tenant_id = v_tenant;
  get diagnostics n_act = row_count;
  delete from public.activity_evidence where tenant_id = v_tenant;
  get diagnostics n_ev = row_count;
  perform public.fn_log_access('borrado_datos_personales',
    jsonb_build_object('simpatizantes', n_sup, 'actividades', n_act, 'evidencias', n_ev), n_sup);
  return json_build_object('simpatizantes', n_sup, 'actividades', n_act, 'evidencias', n_ev);
end;
$$;
revoke execute on function public.fn_purge_personal_data(text) from public, anon;
grant execute on function public.fn_purge_personal_data(text) to authenticated;

-- ═══════════ E) 2FA: EL CÓDIGO SE GENERA Y ENVÍA DESDE EL SERVIDOR ═══════════
create or replace function public.fn_issue_2fa_code()
returns boolean language plpgsql volatile security definer set search_path = public, extensions as $$
declare u record; v_code text; v_bridge text;
begin
  select id, tenant_id, phone into u from public.users where auth_id = auth.uid();
  if u.id is null or coalesce(u.phone, '') = '' then return false; end if;
  v_code := lpad(((get_byte(gen_random_bytes(3), 0) * 65536 + get_byte(gen_random_bytes(3), 1) * 256
                   + get_byte(gen_random_bytes(3), 2)) % 1000000)::text, 6, '0');
  update public.users set temp_code = v_code, temp_code_expires_at = now() + interval '5 minutes', code_sent = false
   where id = u.id;
  select bridge_id into v_bridge from public.communication_gateways
   where tenant_id = u.tenant_id order by last_seen desc nulls last limit 1;
  if v_bridge is null then return false; end if;
  insert into public.gateway_commands (bridge_id, type, phone, message, status)
  values (v_bridge, 'sms', u.phone, 'SISTEMA C4I (NEMIA): Tu código de seguridad es ' || v_code || '. Vence en 5 minutos. No lo compartas.', 'pending');
  update public.users set code_sent = true where id = u.id;
  return true;
end;
$$;
revoke execute on function public.fn_issue_2fa_code() from public, anon;
grant execute on function public.fn_issue_2fa_code() to authenticated;

-- ═══════════ F) TABLERO: LAS ALERTAS INCLUYEN LAS DE CALIDAD ═══════════
create or replace function public.fn_goal_board(p_root uuid default null)
returns table(user_id uuid, name text, role text, is_root boolean, territory_type text, territory_zones integer,
              meta_votos integer, meta_simpatizantes integer, meta_contactos integer, method text,
              periodo_inicio date, periodo_fin date, dias_restantes integer, fraccion_esperada numeric,
              esperado_simpatizantes integer, esperado_contactos integer,
              avance_simpatizantes bigint, avance_verificados bigint, avance_alertas bigint,
              avance_contactos bigint, avance_convencidos bigint, avance_conocian bigint,
              actividades bigint, repartido_simpatizantes bigint, equipo integer, sin_meta integer)
language plpgsql stable security definer set search_path = public as $$
declare v_root uuid := coalesce(p_root, public.fn_current_user_id());
begin
  if not public.fn_can_manage(v_root, true) then raise exception 'Sin permiso'; end if;
  return query
  with people as (
    select u.id, u.name, u.role, (u.id = v_root) is_root, u.assigned_territory at, u.tenant_id
    from public.users u where u.id = v_root or (u.parent_id = v_root and u.is_active is not false)
  ), win as (
    select p.*, w.start_date ws, w.end_date we, public.fn_team_of(p.id) team,
           public.fn_expected_fraction(p.tenant_id, w.start_date, w.end_date, current_date) f
    from people p cross join lateral public.fn_goal_window(p.id) w
  ), act as (
    select p.id, coalesce(sum(a.contacts_count), 0) c, coalesce(sum(a.convinced_count), 0) v,
           coalesce(sum(a.known_count), 0) k, count(a.id) n
    from win p left join public.field_activities a on a.user_id = any(p.team) and a.occurred_at::date >= p.ws
    group by p.id
  ), sup as (
    select p.id, count(s.id) total,
           count(s.id) filter (where s.verification_response = 'si' and cardinality(s.verification_flags) = 0
                                 and cardinality(s.quality_flags) = 0) verif,
           count(s.id) filter (where s.verification_response = 'no' or cardinality(s.verification_flags) > 0
                                 or cardinality(s.quality_flags) > 0) alert
    from win p left join public.supporters s on s.recruiter_id = any(p.team) and s.created_at::date >= p.ws
    group by p.id
  )
  select p.id, p.name, p.role, p.is_root,
         p.at->>'layer_type', coalesce(jsonb_array_length(p.at->'zone_ids'), 0),
         g.meta_votos, g.meta_simpatizantes, g.meta_contactos, g.method,
         p.ws, p.we, greatest(0, p.we - current_date)::int, round(p.f, 4),
         round(coalesce(g.meta_simpatizantes, 0) * p.f)::int, round(coalesce(g.meta_contactos, 0) * p.f)::int,
         su.total, su.verif, su.alert,
         a.c, a.v, a.k, a.n,
         (select coalesce(sum(g2.meta_simpatizantes), 0) from public.goals g2 join public.users c on c.id = g2.user_id
           where c.parent_id = p.id),
         (select count(*)::int from public.users c where c.parent_id = p.id and c.is_active is not false),
         (select count(*)::int from public.users c where c.parent_id = p.id and c.is_active is not false
             and not exists (select 1 from public.goals g3 where g3.user_id = c.id))
  from win p left join public.goals g on g.user_id = p.id join act a on a.id = p.id join sup su on su.id = p.id
  order by p.is_root desc, p.name;
end;
$$;

-- ═══════════ G) RECORDATORIOS SEMANALES DE METAS ═══════════
create or replace function public.fn_goal_reminders()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare g record; v_team uuid[]; v_f numeric; v_exp_s int; v_exp_c int; v_s int; v_c int; n int := 0; v_msg text;
begin
  for g in
    select go.*, u.tenant_id t, w.start_date ws, w.end_date we
    from public.goals go join public.users u on u.id = go.user_id and u.is_active is not false
    cross join lateral public.fn_goal_window(go.user_id) w
    where current_date between w.start_date and w.end_date
  loop
    v_team := public.fn_team_of(g.user_id);
    v_f := public.fn_expected_fraction(g.t, g.ws, g.we, current_date);
    v_exp_s := round(g.meta_simpatizantes * v_f); v_exp_c := round(g.meta_contactos * v_f);
    select count(*) into v_s from public.supporters s where s.recruiter_id = any(v_team) and s.created_at::date >= g.ws
       and s.verification_response = 'si' and cardinality(s.verification_flags) = 0 and cardinality(s.quality_flags) = 0;
    select coalesce(sum(a.contacts_count), 0) into v_c from public.field_activities a where a.user_id = any(v_team) and a.occurred_at::date >= g.ws;
    -- Solo a quien va más de 15% abajo de lo esperado, y como máximo un aviso cada 5 días
    if (v_exp_s > 0 and v_s < v_exp_s * 0.85) or (v_exp_c > 0 and v_c < v_exp_c * 0.85) then
      if not exists (select 1 from public.notifications nt where nt.user_id = g.user_id and nt.type = 'mission'
                       and nt.title like '🎯 Tu meta%' and nt.created_at > now() - interval '5 days') then
        v_msg := format('A hoy deberías llevar %s simpatizantes validados (llevas %s) y %s contactos (llevas %s). ¡Todavía faltan %s días, vamos!',
                        v_exp_s, v_s, v_exp_c, v_c, greatest(0, g.we - current_date));
        insert into public.notifications (user_id, title, message, type, is_read)
        values (g.user_id, '🎯 Tu meta de la semana', v_msg, 'mission', false);
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end;
$$;
revoke execute on function public.fn_goal_reminders() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'recordatorio-metas';
-- Lunes 8:00 am hora del centro de México (14:00 UTC)
select cron.schedule('recordatorio-metas', '0 14 * * 1', $cron$select public.fn_goal_reminders()$cron$);

-- ═══════════ Ajustes posteriores ═══════════
-- El candidato puede borrar los archivos de evidencia de su campaña (cierre del proceso)
drop policy if exists "Evidence files purge by candidate" on storage.objects;
create policy "Evidence files purge by candidate" on storage.objects for delete to authenticated
using (bucket_id = 'activity_evidence'
       and (storage.foldername(name))[1] = (select public.fn_current_user_tenant())::text
       and (select public.fn_current_role()) in ('candidato','superadmin'));

-- Funciones de trigger: no deben poder llamarse por la API
revoke execute on function public.fn_supporter_quality_flags() from public, anon, authenticated;
revoke execute on function public.fn_supporter_geo_section() from public, anon, authenticated;
revoke execute on function public.fn_activity_geo_section() from public, anon, authenticated;
-- search_path fijo en funciones antiguas (aviso de seguridad de Supabase)
alter function public.fn_get_territory_progress(uuid) set search_path = public;
alter function public.update_updated_at_column() set search_path = public;
alter function public.fn_get_tenant_scope(uuid) set search_path = public;
alter function public.check_level_up() set search_path = public;
