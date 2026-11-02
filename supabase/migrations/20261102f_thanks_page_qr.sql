-- Aplicada en Supabase (proyecto sistema_electoral) el 2026-11-02 (thanks_page_and_qr_validation).
-- Página de agradecimiento definida por el candidato (mensaje, imagen/video, redes) y validación:
-- abrir el enlace = visita validada. Por QR la persona escribe su celular (alerta si no coincide).
-- Derecho de oposición: la persona puede pedir que no se usen sus datos.
-- Seguridad: solo candidato / coordinador de campaña / superadmin editan la campaña (antes: cualquier usuario).

alter table public.tenants add column if not exists thanks_title text check (char_length(thanks_title) <= 120);
alter table public.tenants add column if not exists thanks_message text check (char_length(thanks_message) <= 1500);
alter table public.tenants add column if not exists thanks_media_url text;
alter table public.tenants add column if not exists thanks_media_type text check (thanks_media_type in ('imagen','video'));
alter table public.tenants add column if not exists social_links jsonb not null default '{}'::jsonb;

drop policy if exists "Tenants update own or superadmin" on public.tenants;
drop policy if exists "Tenants update by command" on public.tenants;
create policy "Tenants update by command" on public.tenants for update to authenticated
using ((select public.fn_current_role()) = 'superadmin'
       or (id = (select public.fn_current_user_tenant()) and (select public.fn_current_role()) in ('candidato','coordinador_campana')))
with check ((select public.fn_current_role()) = 'superadmin'
       or (id = (select public.fn_current_user_tenant()) and (select public.fn_current_role()) in ('candidato','coordinador_campana')));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign_media', 'campaign_media', true, 26214400,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Campaign media write" on storage.objects;
create policy "Campaign media write" on storage.objects for insert to authenticated
with check (bucket_id = 'campaign_media'
            and (storage.foldername(name))[1] = (select public.fn_current_user_tenant())::text
            and (select public.fn_current_role()) in ('candidato','coordinador_campana','superadmin'));
drop policy if exists "Campaign media update" on storage.objects;
create policy "Campaign media update" on storage.objects for update to authenticated
using (bucket_id = 'campaign_media' and (storage.foldername(name))[1] = (select public.fn_current_user_tenant())::text
       and (select public.fn_current_role()) in ('candidato','coordinador_campana','superadmin'));
drop policy if exists "Campaign media delete" on storage.objects;
create policy "Campaign media delete" on storage.objects for delete to authenticated
using (bucket_id = 'campaign_media' and (storage.foldername(name))[1] = (select public.fn_current_user_tenant())::text
       and (select public.fn_current_role()) in ('candidato','coordinador_campana','superadmin'));

alter table public.supporters add column if not exists verification_phone text;
alter table public.supporters add column if not exists verification_channel text check (verification_channel in ('whatsapp','qr'));
alter table public.supporters add column if not exists privacy_opt_out_at timestamptz;
grant select (verification_channel, privacy_opt_out_at) on public.supporters to authenticated;

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

drop function if exists public.fn_confirm_verification(text, text, text);
create or replace function public.fn_confirm_verification(p_token text, p_channel text default 'whatsapp',
                                                           p_device text default null, p_phone text default null)
returns json language plpgsql volatile security definer set search_path = public as $$
declare s record; v_ip text := public.fn_request_ip(); v_flags text[] := '{}'::text[];
        v_phone text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  if length(coalesce(p_token, '')) < 12 or p_channel not in ('whatsapp','qr') then
    return json_build_object('estado', 'no_encontrado');
  end if;
  if p_channel = 'qr' and length(v_phone) <> 10 then
    return json_build_object('estado', 'falta_telefono');
  end if;
  select * into s from public.supporters where verification_token = p_token for update;
  if s.id is null then return json_build_object('estado', 'no_encontrado'); end if;
  if s.verification_response is not null then
    return json_build_object('estado', 'confirmado');
  end if;

  if p_device is not null and p_device = s.recruiter_device then v_flags := array_append(v_flags, 'mismo_dispositivo'); end if;
  if p_channel = 'whatsapp' and v_ip is not null and v_ip = s.verification_sent_ip then v_flags := array_append(v_flags, 'misma_red'); end if;
  if p_channel = 'whatsapp' and s.verification_sent_at is not null and now() - s.verification_sent_at < interval '20 seconds' then
    v_flags := array_append(v_flags, 'muy_rapido');
  end if;
  if p_channel = 'qr' and coalesce(s.phone, '') <> '' and right(regexp_replace(s.phone, '\D', '', 'g'), 10) <> v_phone then
    v_flags := array_append(v_flags, 'telefono_distinto');
  end if;

  update public.supporters
     set verification_response = 'si', verified_at = now(), verification_ip = v_ip,
         confirm_device = left(p_device, 64), verification_flags = v_flags, verification_channel = p_channel,
         verification_phone = nullif(v_phone, ''),
         phone = case when coalesce(phone, '') = '' and v_phone <> '' then v_phone else phone end,
         privacy_accepted_at = now()
   where id = s.id;
  return json_build_object('estado', 'confirmado');
end;
$$;

create or replace function public.fn_verification_opt_out(p_token text)
returns json language plpgsql volatile security definer set search_path = public as $$
begin
  update public.supporters set privacy_opt_out_at = coalesce(privacy_opt_out_at, now())
   where length(p_token) >= 12 and verification_token = p_token;
  return json_build_object('estado', case when found then 'baja' else 'no_encontrado' end);
end;
$$;

revoke execute on function public.fn_verification_info(text) from public;
revoke execute on function public.fn_confirm_verification(text, text, text, text) from public;
revoke execute on function public.fn_verification_opt_out(text) from public;
grant execute on function public.fn_verification_info(text) to anon, authenticated;
grant execute on function public.fn_confirm_verification(text, text, text, text) to anon, authenticated;
grant execute on function public.fn_verification_opt_out(text) to anon, authenticated;
