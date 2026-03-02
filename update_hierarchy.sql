-- Función para obtener todos los IDs de subordinados de forma recursiva (PIRAMIDAL)
CREATE OR REPLACE FUNCTION get_team_ids(root_user_id UUID)
RETURNS TABLE (user_id UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE team_hierarchy AS (
        -- Caso base: el usuario raíz
        SELECT id FROM users WHERE id = root_user_id
        UNION ALL
        -- Caso recursivo: todos los que tengan como parent_id a alguien ya en la lista
        SELECT u.id
        FROM users u
        INNER JOIN team_hierarchy th ON u.parent_id = th.id
    )
    SELECT id FROM team_hierarchy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
