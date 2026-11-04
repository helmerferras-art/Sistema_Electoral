-- ============================================================================
-- Tlatoani · Fortalecimiento de campo (4-nov-2026)
--  1. Candado de columnas sensibles en users (antes un usuario podía cambiarse
--     su propio rol, campaña, jefe o puntos desde el cliente)
--  2. Puntos (XP) otorgados solo por el servidor + bitácora + canje de recompensas
--  3. Guiones con encuesta ramificada (las tablas polls no existían)
--  4. Eventos con confirmación y asistencia por QR
--  5. Capacitación con examen calificado en el servidor
--  6. Versión del aviso de privacidad aceptada
-- ============================================================================

-- ---------------------------------------------------------------- 6 (columnas)
alter table public.tenants   add column if not exists privacy_version text not null default '1.0';
alter table public.tenants   add column if not exists training_required boolean not null default false;
alter table public.supporters add column if not exists privacy_version text;
alter table public.supporters add column if not exists survey jsonb;
alter table public.users     add column if not exists privacy_version text;
alter table public.users     add column if not exists privacy_accepted_at timestamptz;
alter table public.users     add column if not exists terms_accepted_at timestamptz;

-- ---------------------------------------------------------------- 1. Candado
-- SECURITY INVOKER a propósito: current_user es el rol de quien hace el UPDATE.
-- Las funciones SECURITY DEFINER del sistema (dueño postgres) sí pueden cambiar estas columnas.
create or replace function public.fn_users_guard_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') and coalesce(public.fn_current_role(), '') <> 'superadmin' then
    if new.role is distinct from old.role
       or new.tenant_id is distinct from old.tenant_id
       or new.parent_id is distinct from old.parent_id
       or new.auth_id is distinct from old.auth_id
       or new.phone is distinct from old.phone
       or new.xp is distinct from old.xp
       or new.rank_name is distinct from old.rank_name
       or new.current_streak is distinct from old.current_streak
       or new.last_action_date is distinct from old.last_action_date
       or new.is_active is distinct from old.is_active
       or new.assigned_territory is distinct from old.assigned_territory
       or new.assigned_targets is distinct from old.assigned_targets
       or new.password_hash is distinct from old.password_hash
       or new.privacy_version is distinct from old.privacy_version
       or new.privacy_accepted_at is distinct from old.privacy_accepted_at
       or new.terms_accepted_at is distinct from old.terms_accepted_at
       or (new.temp_code is distinct from old.temp_code and new.temp_code is not null)
       or (new.temp_code_expires_at is distinct from old.temp_code_expires_at and new.temp_code_expires_at is not null)
    then
      raise exception 'No puedes modificar esos datos de tu cuenta' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_users_guard_columns on public.users;
create trigger trg_users_guard_columns before update on public.users
  for each row execute function public.fn_users_guard_columns();

-- ---------------------------------------------------------------- 2. Puntos
create table if not exists public.xp_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  points int not null,
  reason text not null,
  ref_id text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, reason, ref_id)
);
create index if not exists xp_ledger_user_idx on public.xp_ledger(user_id, created_at desc);
alter table public.xp_ledger enable row level security;
drop policy if exists "XP ledger own or team" on public.xp_ledger;
create policy "XP ledger own or team" on public.xp_ledger for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role()) or user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])))));

-- Otorga puntos una sola vez por (usuario, motivo, referencia). Solo la llaman triggers y RPC del servidor.
create or replace function public.fn_award_xp(p_user uuid, p_points int, p_reason text, p_ref text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_user is null or coalesce(p_points, 0) = 0 then return false; end if;
  insert into public.xp_ledger (user_id, tenant_id, points, reason, ref_id)
  select p_user, u.tenant_id, p_points, p_reason, coalesce(p_ref, '') from public.users u where u.id = p_user
  on conflict (user_id, reason, ref_id) do nothing
  returning id into v_id;
  if v_id is null then return false; end if;
  update public.users set xp = coalesce(xp, 0) + p_points, last_action_date = current_date where id = p_user;
  return true;
end $$;
revoke execute on function public.fn_award_xp(uuid, int, text, text) from public, anon, authenticated;

-- Visita validada por el ciudadano: 50 pts; +20 si no tiene ninguna alerta; +10 si se aplicó el guion
create or replace function public.fn_xp_on_verification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.verified_at is null and new.verified_at is not null and new.recruiter_id is not null then
    perform public.fn_award_xp(new.recruiter_id, 50, 'visita_validada', new.id::text);
    if coalesce(array_length(new.verification_flags, 1), 0) = 0 and coalesce(array_length(new.quality_flags, 1), 0) = 0 then
      perform public.fn_award_xp(new.recruiter_id, 20, 'validacion_limpia', new.id::text);
    end if;
    if new.survey is not null then
      perform public.fn_award_xp(new.recruiter_id, 10, 'guion_aplicado', new.id::text);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_xp_on_verification on public.supporters;
create trigger trg_xp_on_verification after update of verified_at on public.supporters
  for each row execute function public.fn_xp_on_verification();

-- Actividad de campo: 10 pts, máximo 5 por día
create or replace function public.fn_xp_on_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (
       select count(*) from public.xp_ledger l
        where l.user_id = new.user_id and l.reason = 'actividad_campo'
          and (l.created_at at time zone 'America/Mexico_City')::date = (now() at time zone 'America/Mexico_City')::date) < 5 then
    perform public.fn_award_xp(new.user_id, 10, 'actividad_campo', new.id::text);
  end if;
  return new;
end $$;
drop trigger if exists trg_xp_on_activity on public.field_activities;
create trigger trg_xp_on_activity after insert on public.field_activities
  for each row execute function public.fn_xp_on_activity();

-- Recompensas
create table if not exists public.reward_tiers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade, -- null = para todas las campañas
  name text not null,
  description text,
  xp_required int not null check (xp_required > 0),
  color text not null default '#E8743B',
  sort int not null default 0,
  active boolean not null default true
);
alter table public.reward_tiers enable row level security;
drop policy if exists "Rewards visible" on public.reward_tiers;
create policy "Rewards visible" on public.reward_tiers for select to authenticated using (
  tenant_id is null or tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[])));
drop policy if exists "Rewards managed by command" on public.reward_tiers;
create policy "Rewards managed by command" on public.reward_tiers for all to authenticated
  using (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_current_role()) in ('candidato', 'coordinador_campana'))
  with check (tenant_id = (select public.fn_current_user_tenant()) and (select public.fn_current_role()) in ('candidato', 'coordinador_campana'));

insert into public.reward_tiers (tenant_id, name, description, xp_required, color, sort)
select null, x.name, x.description, x.xp, x.color, x.sort from (values
  ('Kit digital', 'Fondos de pantalla y marco para tu foto de perfil.', 100, '#cd7f32', 1),
  ('Reunión estratégica', 'Acceso a la reunión mensual por videollamada con el equipo de campaña.', 500, '#C0C0C0', 2),
  ('Gorra y playera', 'Paquete del equipo, entregado en tu municipio.', 1500, '#FFD700', 3),
  ('Encuentro con el equipo directivo', 'Reunión con el candidato y los mejores líderes del estado.', 5000, '#b9f2ff', 4)
) as x(name, description, xp, color, sort)
where not exists (select 1 from public.reward_tiers where tenant_id is null);

create table if not exists public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tier_id uuid not null references public.reward_tiers(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivered_by uuid references public.users(id) on delete set null,
  unique (user_id, tier_id)
);
alter table public.reward_claims enable row level security;
drop policy if exists "Claims own or team" on public.reward_claims;
create policy "Claims own or team" on public.reward_claims for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role()) or user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])))));

create or replace function public.fn_claim_reward(p_tier uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_user public.users; v_tier public.reward_tiers;
begin
  select * into v_user from public.users where auth_id = auth.uid();
  if v_user.id is null then return json_build_object('estado', 'sin_sesion'); end if;
  select * into v_tier from public.reward_tiers where id = p_tier and active
     and (tenant_id is null or tenant_id = v_user.tenant_id);
  if v_tier.id is null then return json_build_object('estado', 'no_existe'); end if;
  if coalesce(v_user.xp, 0) < v_tier.xp_required then return json_build_object('estado', 'faltan_puntos'); end if;
  insert into public.reward_claims (user_id, tier_id, tenant_id) values (v_user.id, v_tier.id, v_user.tenant_id)
  on conflict (user_id, tier_id) do nothing;
  insert into public.notifications (user_id, title, message, type)
  select p.id, 'Recompensa solicitada', v_user.name || ' desbloqueó "' || v_tier.name || '".', 'achievement'
    from public.users p where p.id = v_user.parent_id;
  return json_build_object('estado', 'ok');
end $$;
revoke execute on function public.fn_claim_reward(uuid) from public, anon;
grant execute on function public.fn_claim_reward(uuid) to authenticated;

-- El jefe directo o un mando marca la recompensa como entregada
create or replace function public.fn_deliver_reward(p_claim uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_me uuid := public.fn_current_user_id();
begin
  update public.reward_claims c set delivered_at = now(), delivered_by = v_me
   where c.id = p_claim and c.delivered_at is null
     and c.user_id <> v_me
     and (public.fn_is_full_scope_role() or c.user_id = any(public.fn_current_team_ids()));
  return found;
end $$;
revoke execute on function public.fn_deliver_reward(uuid) from public, anon;
grant execute on function public.fn_deliver_reward(uuid) to authenticated;

-- ---------------------------------------------------------------- 3. Guiones y encuestas
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  kind text not null default 'sondeo' check (kind in ('sondeo', 'guion')),
  script_intro text,
  script_closing text,
  active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.poll_questions (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  question_text text not null,
  question_type text not null default 'single',
  sort int not null default 0,
  show_if_option uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.poll_questions(id) on delete cascade,
  option_text text not null,
  sort int not null default 0
);
do $$ begin
  alter table public.poll_questions add constraint poll_questions_show_if_fk
    foreign key (show_if_option) references public.poll_options(id) on delete set null;
exception when duplicate_object then null; end $$;
create table if not exists public.poll_responses (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  question_id uuid not null references public.poll_questions(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  supporter_id uuid references public.supporters(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  section_id text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  unique (supporter_id, question_id)
);
create index if not exists poll_questions_poll_idx on public.poll_questions(poll_id, sort);
create index if not exists poll_options_q_idx on public.poll_options(question_id, sort);
create index if not exists poll_responses_poll_idx on public.poll_responses(poll_id);

alter table public.polls enable row level security;
alter table public.poll_questions enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_responses enable row level security;

create or replace function public.fn_can_manage_polls(p_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_current_role(), '') = 'superadmin'
      or (p_tenant = public.fn_current_user_tenant()
          and coalesce(public.fn_current_role(), '') in ('candidato', 'coordinador_campana', 'coordinador_territorial', 'comunicacion_digital'))
$$;

drop policy if exists "Polls visible in scope" on public.polls;
create policy "Polls visible in scope" on public.polls for select to authenticated
  using (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[])));
drop policy if exists "Polls managed by command" on public.polls;
create policy "Polls managed by command" on public.polls for all to authenticated
  using (public.fn_can_manage_polls(tenant_id)) with check (public.fn_can_manage_polls(tenant_id));

drop policy if exists "Questions visible" on public.poll_questions;
create policy "Questions visible" on public.poll_questions for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id));
drop policy if exists "Questions managed" on public.poll_questions;
create policy "Questions managed" on public.poll_questions for all to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id and public.fn_can_manage_polls(p.tenant_id)))
  with check (exists (select 1 from public.polls p where p.id = poll_id and public.fn_can_manage_polls(p.tenant_id)));

drop policy if exists "Options visible" on public.poll_options;
create policy "Options visible" on public.poll_options for select to authenticated
  using (exists (select 1 from public.poll_questions q where q.id = question_id));
drop policy if exists "Options managed" on public.poll_options;
create policy "Options managed" on public.poll_options for all to authenticated
  using (exists (select 1 from public.poll_questions q join public.polls p on p.id = q.poll_id
                  where q.id = question_id and public.fn_can_manage_polls(p.tenant_id)))
  with check (exists (select 1 from public.poll_questions q join public.polls p on p.id = q.poll_id
                  where q.id = question_id and public.fn_can_manage_polls(p.tenant_id)));

drop policy if exists "Responses insert own" on public.poll_responses;
create policy "Responses insert own" on public.poll_responses for insert to authenticated
  with check (user_id = (select public.fn_current_user_id()) and supporter_id is null
              and exists (select 1 from public.polls p where p.id = poll_id and p.tenant_id = (select public.fn_current_user_tenant())));
drop policy if exists "Responses visible" on public.poll_responses;
create policy "Responses visible" on public.poll_responses for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role()) or user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])))));

-- Completa tenant/sección de las respuestas sueltas (sondeos fuera del registro)
create or replace function public.fn_poll_response_defaults()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  select p.tenant_id into new.tenant_id from public.polls p where p.id = new.poll_id;
  if new.section_id is null and new.lat is not null and new.lng is not null then
    select es.seccion::text into new.section_id from public.electoral_sections es
     where ST_Contains(es.geom, ST_SetSRID(ST_MakePoint(new.lng, new.lat), 4326)) limit 1;
  end if;
  return new;
exception when others then
  return new; -- la sección es un extra: nunca bloquear la respuesta
end $$;
drop trigger if exists trg_poll_response_defaults on public.poll_responses;
create trigger trg_poll_response_defaults before insert on public.poll_responses
  for each row execute function public.fn_poll_response_defaults();

-- El guion se guarda junto con el simpatizante (funciona sin conexión) y aquí se desglosa en respuestas.
-- Formato: {"poll_id": "...", "answers": {"<question_id>": "<option_id>", ...}}
create or replace function public.fn_supporter_survey_expand()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_poll uuid; r record;
begin
  if new.survey is null or jsonb_typeof(new.survey -> 'answers') <> 'object' then return new; end if;
  begin v_poll := (new.survey ->> 'poll_id')::uuid; exception when others then return new; end;
  if not exists (select 1 from public.polls p where p.id = v_poll and p.tenant_id = new.tenant_id) then return new; end if;
  for r in
    select q.id as qid, o.id as oid
      from jsonb_each_text(new.survey -> 'answers') a
      join public.poll_questions q on q.id::text = a.key and q.poll_id = v_poll
      join public.poll_options o on o.id::text = a.value and o.question_id = q.id
  loop
    insert into public.poll_responses (poll_id, question_id, option_id, user_id, supporter_id, tenant_id, section_id, lat, lng, created_at)
    values (v_poll, r.qid, r.oid, new.recruiter_id, new.id, new.tenant_id, coalesce(new.section_id, new.geo_section_id),
            new.latitude, new.longitude, coalesce(new.captured_at, now()))
    on conflict (supporter_id, question_id) do nothing;
  end loop;
  return new;
end $$;
drop trigger if exists trg_supporter_survey_expand on public.supporters;
create trigger trg_supporter_survey_expand after insert on public.supporters
  for each row execute function public.fn_supporter_survey_expand();

-- Resultados por pregunta, opción y sección; distingue las respuestas de visitas validadas
create or replace function public.fn_poll_results(p_poll uuid)
returns table (question_id uuid, question_text text, q_sort int, option_id uuid, option_text text, o_sort int,
               section_id text, total bigint, validadas bigint)
language sql stable security definer set search_path = public as $$
  select q.id, q.question_text, q.sort, o.id, o.option_text, o.sort, r.section_id,
         count(r.id), count(r.id) filter (where s.verified_at is not null)
    from public.polls p
    join public.poll_questions q on q.poll_id = p.id
    join public.poll_options o on o.question_id = q.id
    left join public.poll_responses r on r.option_id = o.id
    left join public.supporters s on s.id = r.supporter_id
   where p.id = p_poll
     and (public.fn_current_role() = 'superadmin'
          or (p.tenant_id = any(public.fn_current_tenant_scope())
              and (public.fn_is_full_scope_role()
                   or r.id is null or r.user_id = any(public.fn_current_team_ids()))))
   group by q.id, q.question_text, q.sort, o.id, o.option_text, o.sort, r.section_id
$$;
revoke execute on function public.fn_poll_results(uuid) from public, anon;
grant execute on function public.fn_poll_results(uuid) to authenticated;

-- ---------------------------------------------------------------- 4. Eventos
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  description text,
  place text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  latitude double precision,
  longitude double precision,
  capacity int check (capacity is null or capacity > 0),
  status text not null default 'programado' check (status in ('programado', 'cancelado', 'realizado')),
  checkin_token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists events_tenant_idx on public.events(tenant_id, starts_at);
create table if not exists public.event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text,
  phone text not null,
  rsvp_at timestamptz,
  checked_in_at timestamptz,
  invited_by uuid references public.users(id) on delete set null,
  privacy_version text,
  privacy_accepted_at timestamptz,
  ip text,
  device text,
  created_at timestamptz not null default now(),
  unique (event_id, phone)
);
alter table public.events enable row level security;
alter table public.event_attendance enable row level security;

drop policy if exists "Events visible in scope" on public.events;
create policy "Events visible in scope" on public.events for select to authenticated
  using (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[])));
drop policy if exists "Events create by organizers" on public.events;
create policy "Events create by organizers" on public.events for insert to authenticated
  with check (tenant_id = (select public.fn_current_user_tenant())
              and created_by = (select public.fn_current_user_id())
              and coalesce((select public.fn_current_role()), '') <> 'brigadista');
drop policy if exists "Events edit by creator or command" on public.events;
create policy "Events edit by creator or command" on public.events for update to authenticated
  using (created_by = (select public.fn_current_user_id()) or public.fn_can_manage_polls(tenant_id))
  with check (created_by = (select public.fn_current_user_id()) or public.fn_can_manage_polls(tenant_id));
drop policy if exists "Events delete by creator or command" on public.events;
create policy "Events delete by creator or command" on public.events for delete to authenticated
  using (created_by = (select public.fn_current_user_id()) or public.fn_can_manage_polls(tenant_id));

drop policy if exists "Attendance visible" on public.event_attendance;
create policy "Attendance visible" on public.event_attendance for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role())
           or invited_by = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[]))
           or exists (select 1 from public.events e where e.id = event_id and e.created_by = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[]))))));

-- Datos públicos del evento para la página /e/<token>
create or replace function public.fn_public_event(p_token text)
returns json language sql stable security definer set search_path = public as $$
  select coalesce((
    select json_build_object(
      'estado', e.status, 'titulo', e.title, 'descripcion', e.description, 'lugar', e.place,
      'inicio', e.starts_at, 'fin', e.ends_at, 'campana', t.name, 'aviso_url', t.privacy_notice_url,
      'aviso_version', t.privacy_version, 'cupo', e.capacity,
      'confirmados', (select count(*) from public.event_attendance a where a.event_id = e.id and a.rsvp_at is not null),
      'registro_abierto', now() between e.starts_at - interval '3 hours' and coalesce(e.ends_at, e.starts_at + interval '6 hours'))
    from public.events e join public.tenants t on t.id = e.tenant_id
    where length(coalesce(p_token, '')) >= 16 and e.checkin_token = p_token
  ), json_build_object('estado', 'no_encontrado'))
$$;
revoke execute on function public.fn_public_event(text) from public;
grant execute on function public.fn_public_event(text) to anon, authenticated;

-- Confirmar asistencia (antes) o registrar llegada (durante). Requiere aceptación del aviso.
create or replace function public.fn_event_register(p_token text, p_name text, p_phone text, p_mode text,
                                                    p_accept boolean, p_ref uuid default null, p_device text default null)
returns json language plpgsql security definer set search_path = public as $$
declare e record; v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
        v_ref uuid; v_first boolean; v_count int;
begin
  if p_mode not in ('rsvp', 'checkin') then return json_build_object('estado', 'modo_invalido'); end if;
  if not coalesce(p_accept, false) then return json_build_object('estado', 'falta_aviso'); end if;
  if length(v_phone) <> 10 then return json_build_object('estado', 'falta_telefono'); end if;
  select ev.*, t.privacy_version as pv into e from public.events ev join public.tenants t on t.id = ev.tenant_id
   where length(coalesce(p_token, '')) >= 16 and ev.checkin_token = p_token;
  if e.id is null then return json_build_object('estado', 'no_encontrado'); end if;
  if e.status = 'cancelado' then return json_build_object('estado', 'cancelado'); end if;
  if p_mode = 'checkin' and not (now() between e.starts_at - interval '3 hours' and coalesce(e.ends_at, e.starts_at + interval '6 hours')) then
    return json_build_object('estado', 'fuera_de_horario');
  end if;
  if p_mode = 'rsvp' and e.capacity is not null then
    select count(*) into v_count from public.event_attendance where event_id = e.id and rsvp_at is not null and phone <> v_phone;
    if v_count >= e.capacity then return json_build_object('estado', 'cupo_lleno'); end if;
  end if;
  select u.id into v_ref from public.users u where u.id = p_ref and u.tenant_id = e.tenant_id;

  select checked_in_at is null into v_first from public.event_attendance where event_id = e.id and phone = v_phone;
  insert into public.event_attendance as a (event_id, tenant_id, name, phone, rsvp_at, checked_in_at, invited_by,
                                       privacy_version, privacy_accepted_at, ip, device)
  values (e.id, e.tenant_id, left(trim(coalesce(p_name, '')), 120), v_phone,
          case when p_mode = 'rsvp' then now() end, case when p_mode = 'checkin' then now() end,
          v_ref, e.pv, now(), public.fn_request_ip(), left(p_device, 64))
  on conflict (event_id, phone) do update set
    name = coalesce(nullif(excluded.name, ''), a.name),
    rsvp_at = coalesce(a.rsvp_at, excluded.rsvp_at),
    checked_in_at = coalesce(a.checked_in_at, excluded.checked_in_at),
    invited_by = coalesce(a.invited_by, excluded.invited_by),
    privacy_version = excluded.privacy_version, privacy_accepted_at = now();

  if p_mode = 'checkin' and coalesce(v_first, true) then
    perform public.fn_award_xp(e.created_by, 5, 'asistente_evento', e.id::text || ':' || v_phone);
    perform public.fn_award_xp(coalesce(v_ref, (select invited_by from public.event_attendance where event_id = e.id and phone = v_phone)),
                               10, 'invitado_asistio', e.id::text || ':' || v_phone);
  end if;
  return json_build_object('estado', 'ok', 'modo', p_mode);
end $$;
revoke execute on function public.fn_event_register(text, text, text, text, boolean, uuid, text) from public;
grant execute on function public.fn_event_register(text, text, text, text, boolean, uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------- 5. Capacitación
create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade, -- null = para todas las campañas
  title text not null,
  summary text,
  body text not null,
  quiz jsonb not null default '[]'::jsonb, -- [{"q": "...", "options": ["..."], "answer": 0}]
  sort int not null default 0,
  required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.training_progress (
  user_id uuid not null references public.users(id) on delete cascade,
  module_id uuid not null references public.training_modules(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  attempts int not null default 0,
  score int,
  passed_at timestamptz,
  primary key (user_id, module_id)
);
alter table public.training_modules enable row level security; -- sin políticas: solo vía RPC (las respuestas no salen)
alter table public.training_progress enable row level security;
drop policy if exists "Training progress own or team" on public.training_progress;
create policy "Training progress own or team" on public.training_progress for select to authenticated using (
  (select public.fn_current_role()) = 'superadmin'
  or (tenant_id = any(coalesce((select public.fn_current_tenant_scope()), '{}'::uuid[]))
      and ((select public.fn_is_full_scope_role()) or user_id = any(coalesce((select public.fn_current_team_ids()), '{}'::uuid[])))));

-- Módulos para el usuario actual, sin las respuestas correctas
create or replace function public.fn_my_training()
returns table (id uuid, title text, summary text, body text, quiz jsonb, sort int, required boolean,
               passed_at timestamptz, attempts int, training_required boolean)
language sql stable security definer set search_path = public as $$
  select m.id, m.title, m.summary, m.body,
         (select coalesce(jsonb_agg(jsonb_build_object('q', x -> 'q', 'options', x -> 'options') order by ord), '[]'::jsonb)
            from jsonb_array_elements(m.quiz) with ordinality as t(x, ord)),
         m.sort, m.required, p.passed_at, coalesce(p.attempts, 0), coalesce(t.training_required, false)
    from public.users u
    join public.tenants t on t.id = u.tenant_id
    join public.training_modules m on m.active and (m.tenant_id is null or m.tenant_id = u.tenant_id)
    left join public.training_progress p on p.user_id = u.id and p.module_id = m.id
   where u.auth_id = auth.uid()
   order by m.sort, m.title
$$;
revoke execute on function public.fn_my_training() from public, anon;
grant execute on function public.fn_my_training() to authenticated;

-- Califica en el servidor. Aprueba con todas correctas; 25 pts la primera vez.
create or replace function public.fn_submit_training(p_module uuid, p_answers int[])
returns json language plpgsql security definer set search_path = public as $$
declare v_user public.users; m public.training_modules; v_total int; v_ok int := 0; i int; v_passed boolean;
        v_wrong int[] := '{}'::int[];
begin
  select * into v_user from public.users where auth_id = auth.uid();
  if v_user.id is null then return json_build_object('estado', 'sin_sesion'); end if;
  select * into m from public.training_modules where id = p_module and active and (tenant_id is null or tenant_id = v_user.tenant_id);
  if m.id is null then return json_build_object('estado', 'no_existe'); end if;
  v_total := jsonb_array_length(m.quiz);
  for i in 0 .. v_total - 1 loop
    if p_answers is not null and array_length(p_answers, 1) > i and p_answers[i + 1] = (m.quiz -> i ->> 'answer')::int then
      v_ok := v_ok + 1;
    else
      v_wrong := array_append(v_wrong, i);
    end if;
  end loop;
  v_passed := v_ok = v_total;
  insert into public.training_progress as tp (user_id, module_id, tenant_id, attempts, score, passed_at)
  values (v_user.id, m.id, v_user.tenant_id, 1, v_ok, case when v_passed then now() end)
  on conflict (user_id, module_id) do update set attempts = tp.attempts + 1, score = greatest(coalesce(tp.score, 0), excluded.score),
     passed_at = coalesce(tp.passed_at, excluded.passed_at);
  if v_passed then perform public.fn_award_xp(v_user.id, 25, 'capacitacion', m.id::text); end if;
  return json_build_object('estado', case when v_passed then 'aprobado' else 'reprobado' end,
                           'correctas', v_ok, 'total', v_total, 'incorrectas', to_json(v_wrong));
end $$;
revoke execute on function public.fn_submit_training(uuid, int[]) from public, anon;
grant execute on function public.fn_submit_training(uuid, int[]) to authenticated;

-- Avance de capacitación del equipo (para mandos y líderes)
create or replace function public.fn_team_training()
returns table (user_id uuid, name text, role text, aprobados bigint, requeridos bigint)
language sql stable security definer set search_path = public as $$
  with me as (select * from public.users where auth_id = auth.uid()),
  req as (select m.id from public.training_modules m, me where m.active and m.required and (m.tenant_id is null or m.tenant_id = me.tenant_id))
  select u.id, u.name, u.role,
         (select count(*) from public.training_progress p where p.user_id = u.id and p.passed_at is not null and p.module_id in (select id from req)),
         (select count(*) from req)
    from public.users u, me
   where u.tenant_id = me.tenant_id and u.id <> me.id and u.is_active is not false
     and (public.fn_is_full_scope_role() or u.id = any(public.fn_current_team_ids()))
   order by 4, u.name
$$;
revoke execute on function public.fn_team_training() from public, anon;
grant execute on function public.fn_team_training() to authenticated;

insert into public.training_modules (tenant_id, title, summary, body, quiz, sort)
select null, x.title, x.summary, x.body, x.quiz::jsonb, x.sort from (values
 ('Código de conducta', 'Lo que siempre haces y lo que nunca haces en campo.',
  E'Preséntate con tu nombre y di de qué proyecto vienes.\n\nPide permiso antes de registrar a alguien y respeta un "no".\n\nNunca prometas dinero, despensas, programas o apoyos a cambio de datos o del voto: eso es delito electoral.\n\nNo registres a menores de 18 años ni a personas que no conociste.\n\nTrata a todas las personas con respeto. La violencia política, incluida la que se ejerce contra las mujeres por razón de género, está prohibida.',
  '[{"q":"Una señora te pide una despensa a cambio de registrarse. ¿Qué haces?","options":["Le prometo que se la llevan después","Le explico que no se da nada a cambio y respeto si no quiere registrarse","La registro sin decirle nada"],"answer":1},{"q":"¿Puedes registrar a un joven de 17 años que quiere ayudar?","options":["Sí, si quiere","No, solo mayores de 18 años","Sí, con permiso de su líder"],"answer":1}]', 1),
 ('Privacidad y consentimiento', 'Qué datos pides, cuáles no, y por qué la persona debe aceptar.',
  E'Solo pides nombre y celular. Nunca pidas CURP, clave de elector ni fotos de la credencial para votar.\n\nEstar en la lista de simpatizantes revela una opinión política: es un dato sensible y la persona debe aceptarlo desde su propio celular.\n\nSi alguien pide que borren sus datos, avisa a tu líder; también puede hacerlo desde la página de validación con el botón "No quiero que guarden mis datos".\n\nNo copies, saques ni compartas listas de personas.',
  '[{"q":"¿Qué datos pides al registrar a una persona?","options":["Nombre, celular y foto de su credencial","Solo nombre y celular","Nombre, CURP y domicilio"],"answer":1},{"q":"¿Por qué la persona debe validar desde su propio celular?","options":["Porque su simpatía política es un dato sensible y necesita su consentimiento","Para ganar más puntos","No es necesario"],"answer":0}]', 2),
 ('Validar la visita', 'Cómo usar el QR y WhatsApp para que el registro cuente.',
  E'Después de registrar, muestra el QR para que la persona lo escanee con la cámara de su celular y escriba su número.\n\nSi no puede escanear, envíale el enlace por WhatsApp.\n\nNunca valides tú la visita desde tu propio teléfono: el sistema lo detecta y la marca para revisión.\n\nSolo las visitas validadas suman puntos y cuentan para tu meta.',
  '[{"q":"¿Cuándo suma puntos un registro?","options":["Al guardarlo","Cuando la persona lo valida desde su celular","Cuando lo revisa el coordinador"],"answer":1},{"q":"La persona no tiene datos en su celular. ¿Qué haces?","options":["Valido yo desde mi teléfono","Le envío el enlace por WhatsApp para que valide después","Lo dejo sin validar y no digo nada"],"answer":1}]', 3),
 ('Seguridad de tu celular y tu cuenta', 'Cómo proteger la información del equipo.',
  E'Pon bloqueo de pantalla a tu celular.\n\nNo prestes tu cuenta ni compartas tu contraseña o los códigos que te llegan por SMS.\n\nSi pierdes tu celular, avisa de inmediato a tu líder para que suspenda tu acceso.\n\nSincroniza tus registros en cuanto tengas señal: lo que no se sincroniza vive solo en tu teléfono.',
  '[{"q":"Perdiste tu celular. ¿Qué haces primero?","options":["Espero a ver si aparece","Aviso de inmediato a mi líder","Creo otra cuenta"],"answer":1},{"q":"Un compañero te pide tu código de acceso para entrar por ti.","options":["Se lo doy si es de confianza","No lo comparto nunca","Se lo doy solo hoy"],"answer":1}]', 4)
) as x(title, summary, body, quiz, sort)
where not exists (select 1 from public.training_modules where tenant_id is null);

-- ---------------------------------------------------------------- 6. Versión del aviso
create or replace function public.fn_accept_user_terms(p_version text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if length(coalesce(p_version, '')) not between 1 and 32 then return false; end if;
  update public.users set privacy_version = p_version, privacy_accepted_at = now(), terms_accepted_at = now()
   where auth_id = auth.uid();
  return found;
end $$;
revoke execute on function public.fn_accept_user_terms(text) from public, anon;
grant execute on function public.fn_accept_user_terms(text) to authenticated;

-- La validación de visita guarda la versión del aviso vigente de la campaña
create or replace function public.fn_supporter_privacy_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.privacy_accepted_at is not null and new.privacy_accepted_at is distinct from old.privacy_accepted_at then
    select t.privacy_version into new.privacy_version from public.tenants t where t.id = new.tenant_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_supporter_privacy_version on public.supporters;
create trigger trg_supporter_privacy_version before update of privacy_accepted_at on public.supporters
  for each row execute function public.fn_supporter_privacy_version();

create or replace function public.fn_verification_info(p_token text)
returns json language sql stable security definer set search_path = public as $$
  select coalesce((
    select json_build_object(
      'estado', case when s.privacy_opt_out_at is not null then 'baja'
                     when s.verification_response = 'si' then 'confirmado' else 'pendiente' end,
      'persona', split_part(trim(s.name), ' ', 1),
      'brigadista', split_part(trim(u.name), ' ', 1),
      'campana', t.name,
      'aviso_url', t.privacy_notice_url,
      'aviso_version', t.privacy_version,
      'titulo', t.thanks_title,
      'mensaje', t.thanks_message,
      'media_url', t.thanks_media_url,
      'media_tipo', t.thanks_media_type,
      'redes', t.social_links)
    from public.supporters s
    join public.tenants t on t.id = s.tenant_id
    left join public.users u on u.id = s.recruiter_id
    where length(p_token) >= 12 and s.verification_token = p_token
  ), json_build_object('estado', 'no_encontrado'))
$$;

-- Revocar ejecución de las funciones de trigger (no deben llamarse por API)
revoke execute on function public.fn_users_guard_columns() from public, anon, authenticated;
revoke execute on function public.fn_xp_on_verification() from public, anon, authenticated;
revoke execute on function public.fn_xp_on_activity() from public, anon, authenticated;
revoke execute on function public.fn_poll_response_defaults() from public, anon, authenticated;
revoke execute on function public.fn_supporter_survey_expand() from public, anon, authenticated;
revoke execute on function public.fn_supporter_privacy_version() from public, anon, authenticated;
revoke execute on function public.fn_can_manage_polls(uuid) from public, anon;
