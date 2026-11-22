-- SOLO base de la demo: identidad de las campañas ficticias editable desde el panel del administrador (vía función demo-admin).
create table if not exists public.demo_brand (
  k int primary key,
  photo text, short_name text, slogan text, color text,
  updated_at timestamptz default now()
);
alter table public.demo_brand enable row level security; -- solo la función de servidor (service role) la toca
insert into public.demo_brand (k, photo, short_name, slogan, color) values
  (1, '/demo-brand/k1.svg', 'Lucía Ordóñez',   'Chiapas se construye con su gente', '#0F766E'),
  (2, '/demo-brand/k2.svg', 'Andrés Molina',   'Tuxtla, colonia por colonia',       '#4338CA'),
  (3, '/demo-brand/k3.svg', 'Julieta Castañón','Escuchar primero, decidir juntos',  '#7C3AED'),
  (4, '/demo-brand/k4.svg', 'Rodrigo Albores', 'El distrito 13 se camina',          '#B45309')
on conflict (k) do nothing;

create or replace function public.fn_demo_brand(p_k int)
returns table (photo text, short_name text, slogan text, color text)
language sql stable security definer set search_path to 'public' as $$
  select b.photo, b.short_name, b.slogan, b.color from public.demo_brand b where b.k = p_k
$$;
