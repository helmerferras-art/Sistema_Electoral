-- Setup Alliances and Jurisdiction Scope

-- 1. Create the tenant_alliances table
CREATE TABLE IF NOT EXISTS public.tenant_alliances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    superior_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    inferior_tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(superior_tenant_id, inferior_tenant_id)
);

-- Enable RLS
ALTER TABLE public.tenant_alliances ENABLE ROW LEVEL SECURITY;

-- Allow read access to anyone authenticated (we could restrict this to just the involved tenants, but for full hierarchy calculation it's easier to leave it readable or readable by the participants)
CREATE POLICY "Users can view alliances involving their tenant" ON public.tenant_alliances
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.auth_id = auth.uid() 
            AND (users.tenant_id = tenant_alliances.superior_tenant_id OR users.tenant_id = tenant_alliances.inferior_tenant_id)
        )
        OR
        -- Superadmins can see all
        EXISTS (
            SELECT 1 FROM public.users WHERE users.auth_id = auth.uid() AND users.role = 'superadmin'
        )
    );

CREATE POLICY "Superadmins can manage all alliances" ON public.tenant_alliances
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE users.auth_id = auth.uid() AND users.role = 'superadmin')
    );

-- Allow users to create basic requests if they are from the inferior tenant
CREATE POLICY "Inferior tenants can request alliances" ON public.tenant_alliances
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.auth_id = auth.uid() AND users.tenant_id = inferior_tenant_id
        )
    );

-- Allow superior tenants to update status
CREATE POLICY "Superior tenants can update alliances" ON public.tenant_alliances
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.auth_id = auth.uid() AND users.tenant_id = superior_tenant_id
        )
    );

-- 2. Create the Recursive Function to get the Tenant Scope (Jurisdiction)
-- This function returns the starting tenant_id PLUS all approved inferior tenant_ids below it in the hierarchy.
CREATE OR REPLACE FUNCTION public.fn_get_tenant_scope(p_tenant_id UUID)
RETURNS TABLE (tenant_id UUID) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE tenant_hierarchy AS (
        -- Base case: the tenant itself
        SELECT p_tenant_id AS current_tenant_id
        
        UNION
        
        -- Recursive step: find all approved inferior tenants for the current tenants in the hierarchy
        SELECT a.inferior_tenant_id
        FROM public.tenant_alliances a
        INNER JOIN tenant_hierarchy th ON a.superior_tenant_id = th.current_tenant_id
        WHERE a.status = 'approved'
    )
    SELECT current_tenant_id FROM tenant_hierarchy;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
