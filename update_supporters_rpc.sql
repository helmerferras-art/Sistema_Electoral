
DROP FUNCTION IF EXISTS public.fn_get_map_supporters();

CREATE OR REPLACE FUNCTION public.fn_get_map_supporters()
RETURNS TABLE (
    id UUID,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    commitment_level INTEGER,
    name TEXT,
    section_id TEXT,
    tenant_id UUID,
    status TEXT,
    tenant_name TEXT
) AS $$
DECLARE
    v_my_tenant_id UUID;
BEGIN
    -- Get caller's tenant_id
    SELECT u.tenant_id INTO v_my_tenant_id
    FROM public.users u
    WHERE u.auth_id = auth.uid();

    RETURN QUERY
    WITH accessible_tenants AS (
        SELECT t.tenant_id 
        FROM public.fn_get_tenant_scope(v_my_tenant_id) t
    )
    SELECT 
        s.id, s.latitude, s.longitude, 
        s.commitment_level, s.name, s.section_id, s.tenant_id, s.status,
        curr_t.name as tenant_name
    FROM public.supporters s
    INNER JOIN accessible_tenants at ON s.tenant_id = at.tenant_id
    INNER JOIN public.tenants curr_t ON s.tenant_id = curr_t.id
    WHERE 
        s.latitude IS NOT NULL 
        AND s.longitude IS NOT NULL
        AND (
            -- Either it belongs directly to my campaign
            s.tenant_id = v_my_tenant_id
            -- Or it belongs to an allied campaign AND has a verified status
            OR (
                s.tenant_id != v_my_tenant_id 
                AND s.status IN ('auditado', 'verificado')
            )
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
