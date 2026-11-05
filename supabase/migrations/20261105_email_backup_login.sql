-- Correo de respaldo para el código de acceso.
-- El correo lo registra quien da de alta a la persona, la persona misma en "Mi cuenta" o al crear su campaña.
-- Nunca se vincula un correo nuevo desde la pantalla de inicio de sesión (evita robar cuentas conociendo el celular).
alter table public.users add column if not exists email text;
create unique index if not exists users_email_unique on public.users (lower(email)) where email is not null;
grant select (email) on public.users to authenticated;

-- Pista del correo para la pantalla de inicio: "t***@gmail.com". No revela el correo completo.
create or replace function public.fn_login_email_hint(p_phone text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with c as (select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10) d)
  select case when u.email is null then null
              else left(split_part(u.email, '@', 1), 1) || '***@' || split_part(u.email, '@', 2) end
  from public.users u, c
  where length(c.d) = 10 and right(regexp_replace(coalesce(u.phone, ''), '\D', '', 'g'), 10) = c.d
  order by u.created_at desc
  limit 1
$$;
revoke all on function public.fn_login_email_hint(text) from public;
grant execute on function public.fn_login_email_hint(text) to anon, authenticated;

-- Plan Arranque: la cuenta se crea con correo + código (ya no con Google). El correo queda vinculado
-- y se pide crear contraseña para entrar después con el celular.
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.fn_create_trial_campaign(text,text,text,text,text,text,boolean,text)'::regprocedure);
  if position('terms_accepted_at, email)' in d) = 0 then
    d := replace(d, 'privacy_version, privacy_accepted_at, terms_accepted_at)', 'privacy_version, privacy_accepted_at, terms_accepted_at, email)');
    d := replace(d, '''candidato'', true, false, left(p_version, 32), now(), now())', '''candidato'', true, true, left(p_version, 32), now(), now(), case when v_email like ''%@c4i.local'' then null else lower(v_email) end)');
    execute d;
  end if;
end
$do$;
