-- ==========================================
-- SCRIPT DE MIGRACIÓN: BOTÓN GLOBAL DÍA D
-- ==========================================

-- Añadir el estado de activación a la configuración del Tenant
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'tenants'
        AND column_name = 'dia_d_active'
    ) THEN
        ALTER TABLE tenants ADD COLUMN dia_d_active BOOLEAN DEFAULT false;
    END IF;
END $$;
