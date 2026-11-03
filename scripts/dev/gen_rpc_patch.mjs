import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC'; // Using anon key for this exploration
const supabase = createClient(supabaseUrl, supabaseKey);

async function extractSql() {
    // There isn't a direct way to view function bodies with just the anon key via the JS client,
    // so let's prepare a SQL script that updates the function.

    // We'll write the SQL that will redefine our function.
    const sqlContent = `
CREATE OR REPLACE FUNCTION public.fn_get_map_supporters()
RETURNS TABLE (
    id UUID,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    commitment_level INTEGER,
    name TEXT,
    section_id TEXT,
    tenant_id UUID,
    status TEXT
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
        s.commitment_level, s.name, s.section_id, s.tenant_id, s.status
    FROM public.supporters s
    INNER JOIN accessible_tenants at ON s.tenant_id = at.tenant_id
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
`;

    fs.writeFileSync('update_supporters_rpc.sql', sqlContent);
    console.log("SQL script generated in update_supporters_rpc.sql");
}

extractSql();
