-- SCRIPT DE LIMPIEZA TOTAL PARA PRODUCCIÓN (LEGIÓN C4I) --
-- ADVERTENCIA: Este script borra TODOS los datos de prueba.

-- 1. Limpieza de tablas operativas (Sujeto a integridad referencial)
TRUNCATE TABLE audit_call_log CASCADE;
TRUNCATE TABLE whatsapp_campaigns CASCADE;
TRUNCATE TABLE resource_assignments CASCADE;
TRUNCATE TABLE petitions CASCADE;

-- 2. Limpieza de Simpatizantes y Padrón
TRUNCATE TABLE supporters CASCADE;
TRUNCATE TABLE padron_electoral CASCADE;
TRUNCATE TABLE historical_election_results CASCADE;

-- 3. Limpieza de Usuarios (Preservando solo la estructura)
-- Primero borramos todos para asegurar limpieza total
TRUNCATE TABLE users CASCADE;

-- 4. Aplicar Integridad de Datos e Infraestructura 2FA
DO $$ 
BEGIN 
    -- Unicidad del teléfono
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_key') THEN
        ALTER TABLE users ADD CONSTRAINT users_phone_key UNIQUE (phone);
    END IF;

    -- Columnas para 2FA y Seguridad
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'users' AND column_name = 'two_factor_enabled') THEN
        ALTER TABLE users ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 5. Restaurar SuperAdmin Maestro (DIOS MODE)
-- NOTA: Este es el único usuario que quedará en el sistema.
INSERT INTO users (name, phone, role, rank_name, is_first_login, temp_code, two_factor_enabled)
VALUES ('Alto Mando Maestro', '+529616685236', 'superadmin', 'COMANDANTE SUPREMO', true, '999999', true);

-- 6. Limpieza de Tenants (Opcional - Mantener si se desea conservar la estructura de campañas)
-- TRUNCATE TABLE tenants CASCADE;

