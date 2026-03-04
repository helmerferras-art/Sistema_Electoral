-- 1. Actualizar la restricción de roles para incluir 'coordinador_territorial'
DO $$
BEGIN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check 
        CHECK (role IN ('superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial', 'comunicacion_digital', 'coordinador_logistica', 'coordinador', 'lider', 'brigadista'));
END $$;

-- 2. Añadir columnas para el Perfil Completo Mandatorio
ALTER TABLE users ADD COLUMN IF NOT EXISTS curp TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS id_card_key TEXT; -- Clave de Elector
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seccion_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_targets JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_territory JSONB DEFAULT '{"layer_type": "entidad", "zone_ids": []}'::jsonb;

-- 3. Función optimizada para obtener el progreso territorial
-- Ahora lee directamente de assigned_territory JSONB
CREATE OR REPLACE FUNCTION fn_get_territory_progress(p_user_id UUID)
RETURNS TABLE (
    total_supporters BIGINT,
    target_votes BIGINT,
    percentage NUMERIC
) AS $$
DECLARE
    v_zones TEXT[];
    v_tenant_id UUID;
    v_target BIGINT;
BEGIN
    -- Extraer IDs de zona desde el JSONB
    SELECT ARRAY(SELECT jsonb_array_elements_text(assigned_territory->'zone_ids')), tenant_id 
    INTO v_zones, v_tenant_id
    FROM users WHERE id = p_user_id;

    -- Si no hay zonas, devolver ceros
    IF v_zones IS NULL OR array_length(v_zones, 1) IS NULL THEN
        RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, 0::NUMERIC;
        RETURN;
    END IF;

    -- 1. Contar simpatizantes en esas zonas (soporta seccion_id directo)
    SELECT count(*) INTO total_supporters
    FROM supporters
    WHERE tenant_id = v_tenant_id
    AND section_id = ANY(v_zones);

    -- 2. Obtener meta histórica (Target) para esas secciones
    SELECT COALESCE(sum(target_votes_calculated), 0) INTO v_target
    FROM historical_election_results
    WHERE section_id = ANY(v_zones)
    AND election_year = 2024;

    target_votes := v_target;
    
    IF v_target > 0 THEN
        percentage := round((total_supporters::NUMERIC / v_target::NUMERIC) * 100, 2);
    ELSE
        percentage := 0;
    END IF;

    RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
