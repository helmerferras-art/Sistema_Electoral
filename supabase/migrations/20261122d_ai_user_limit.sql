-- Tope diario de consultas de IA por persona (además del tope por campaña ai_daily_limit).
-- ai-proxy lo lee de tenants.ai_user_daily_limit; en la base de la demo el tope es fijo (3 por visitante, 40 en total al día).
alter table public.tenants add column if not exists ai_user_daily_limit int not null default 15;
comment on column public.tenants.ai_user_daily_limit is 'Consultas de IA por persona al día dentro de la campaña';
