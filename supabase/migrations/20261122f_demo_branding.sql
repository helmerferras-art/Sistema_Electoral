-- SOLO base de la demo (tlatoani-demo): cada campaña ficticia trae su identidad para que se vea cómo queda la app personalizada.
-- Retratos ilustrados (no son personas reales) servidos por la app en /demo-brand/k<n>.svg
create or replace function public.fn_demo_brand(p_k int)
returns table (photo text, short_name text, slogan text, color text)
language sql immutable as $$
  select v.photo, v.short_name, v.slogan, v.color from (values
    (1, '/demo-brand/k1.svg', 'Lucía Ordóñez',   'Chiapas se construye con su gente', '#0F766E'),
    (2, '/demo-brand/k2.svg', 'Andrés Molina',   'Tuxtla, colonia por colonia',       '#4338CA'),
    (3, '/demo-brand/k3.svg', 'Julieta Castañón','Escuchar primero, decidir juntos',  '#7C3AED'),
    (4, '/demo-brand/k4.svg', 'Rodrigo Albores', 'El distrito 13 se camina',          '#B45309')
  ) v(k, photo, short_name, slogan, color) where v.k = p_k
$$;

create or replace function public.fn_demo_sandbox_create(p_k integer, p_ip text default null)
returns uuid language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare c jsonb; v_t uuid; v_slug text := 'sbx-' || encode(extensions.gen_random_bytes(5), 'hex'); b record;
begin
  select e into c from jsonb_array_elements(public.fn_demo_spec()) e where (e->>'k')::int = coalesce(p_k, 2);
  if c is null then raise exception 'Campaña demo no válida'; end if;
  c := jsonb_set(c, '{meta}', to_jsonb(least((c->>'meta')::int, 60)));
  v_t := public.fn_demo_seed_campaign(c, v_slug, false);
  select * into b from public.fn_demo_brand(coalesce(p_k, 2));
  update public.tenants set is_sandbox = true, is_demo = true, plan = 'demo', demo_last_seen = now(), demo_ip = left(p_ip, 64),
         ai_daily_limit = coalesce(public.fn_plan_limit(id, 'ia_diaria'), 5),
         name = replace(name, 'DEMO ·', 'DEMO PRIVADA ·'),
         brand_photo_url = b.photo, brand_short_name = b.short_name, brand_slogan = b.slogan, brand_color = b.color,
         brand_rights_ok = true, brand_updated_at = now()
   where id = v_t;
  perform public.fn_demo_enrich(v_t);
  if coalesce(p_k, 2) in (3, 4) then perform public.fn_demo_seed_interno(v_t); end if;
  return v_t;
end;
$function$;

-- Campañas demo fijas (no privadas) ya creadas
update public.tenants t set brand_photo_url = b.photo, brand_short_name = b.short_name, brand_slogan = b.slogan,
       brand_color = b.color, brand_rights_ok = true, brand_updated_at = now()
  from jsonb_array_elements(public.fn_demo_spec()) e, lateral public.fn_demo_brand((e->>'k')::int) b
 where t.slug = e->>'slug';
