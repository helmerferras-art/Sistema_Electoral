-- Tabla para registrar todos los puentes físicos (PC de escritorio) conectados al sistema
CREATE TABLE IF NOT EXISTS public.communication_gateways (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    bridge_id TEXT UNIQUE NOT NULL, -- Un ID único generado por la PC (ej: Hostname-MAC)
    name TEXT, -- Nombre descriptivo puesto por el candidato
    status TEXT DEFAULT 'offline' CHECK (status IN ('online', 'offline')),
    last_seen TIMESTAMPTZ DEFAULT now(),
    supported_methods JSONB DEFAULT '["sms", "wa", "call"]'::jsonb,
    local_ip TEXT, -- IP local para facilitar descubrimiento en la misma red
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.communication_gateways ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad (Se eliminan antes de crear para evitar errores de duplicidad)
DROP POLICY IF EXISTS "Superadmins can manage all gateways" ON public.communication_gateways;
CREATE POLICY "Superadmins can manage all gateways" 
ON public.communication_gateways 
FOR ALL 
USING (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'superadmin')
);

DROP POLICY IF EXISTS "Users can see own and allied gateways" ON public.communication_gateways;
CREATE POLICY "Users can see own and allied gateways" 
ON public.communication_gateways 
FOR SELECT 
USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE auth_id = auth.uid())
    OR 
    tenant_id IN (
        SELECT t.tenant_id 
        FROM public.fn_get_tenant_scope((SELECT tenant_id FROM public.users WHERE auth_id = auth.uid())) t
    )
);

DROP POLICY IF EXISTS "Users can register their own gateways" ON public.communication_gateways;
CREATE POLICY "Users can register their own gateways" 
ON public.communication_gateways 
FOR INSERT 
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE auth_id = auth.uid())
);
