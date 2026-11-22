-- Identidad de cada campaña: foto, nombre corto, slogan y color. La edita candidato / coordinación de campaña
-- (la política "Tenants update by command" ya lo permite) y la lee todo el equipo (política "Tenants select in scope").
-- Las imágenes van al bucket público campaign_media, carpeta <tenant_id>/.
alter table public.tenants
  add column if not exists brand_photo_url text,
  add column if not exists brand_short_name text,
  add column if not exists brand_slogan text,
  add column if not exists brand_color text,
  add column if not exists brand_rights_ok boolean not null default false,
  add column if not exists brand_updated_at timestamptz;

alter table public.tenants drop constraint if exists tenants_brand_color_hex;
alter table public.tenants add constraint tenants_brand_color_hex check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$');
alter table public.tenants drop constraint if exists tenants_brand_lengths;
alter table public.tenants add constraint tenants_brand_lengths check (
  coalesce(length(brand_short_name), 0) <= 40 and coalesce(length(brand_slogan), 0) <= 90
);
