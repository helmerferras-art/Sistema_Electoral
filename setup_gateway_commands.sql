-- Tabla para encolar comandos de envío (SMS/WA) desde la nube hacia los puentes locales
CREATE TABLE IF NOT EXISTS public.gateway_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bridge_id TEXT NOT NULL REFERENCES public.communication_gateways(bridge_id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('sms', 'wa', 'call')),
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    error_log TEXT,
    created_by UUID REFERENCES auth.users(id)
);

-- Habilitar RLS
ALTER TABLE public.gateway_commands ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad (Se eliminan antes de crear para evitar errores de duplicidad)
DROP POLICY IF EXISTS "Superadmins can create all commands" ON public.gateway_commands;
CREATE POLICY "Superadmins can create all commands" 
ON public.gateway_commands 
FOR INSERT 
WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE auth_id = auth.uid() AND role = 'superadmin')
);

DROP POLICY IF EXISTS "Users can create commands for accessible bridges" ON public.gateway_commands;
CREATE POLICY "Users can create commands for accessible bridges" 
ON public.gateway_commands 
FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.communication_gateways cg
        WHERE cg.bridge_id = gateway_commands.bridge_id
        AND (
            cg.tenant_id = (SELECT tenant_id FROM public.users WHERE auth_id = auth.uid())
            OR 
            cg.tenant_id IN (
                SELECT t.tenant_id 
                FROM public.fn_get_tenant_scope((SELECT tenant_id FROM public.users WHERE auth_id = auth.uid())) t
            )
        )
    )
);

DROP POLICY IF EXISTS "Bridges can read their own commands" ON public.gateway_commands;
CREATE POLICY "Bridges can read their own commands" 
ON public.gateway_commands 
FOR SELECT 
USING (true); 

DROP POLICY IF EXISTS "Bridges can update their command status" ON public.gateway_commands;
CREATE POLICY "Bridges can update their command status"
ON public.gateway_commands
FOR UPDATE
USING (true);

-- Habilitar Realtime para esta tabla (Manejo de error si ya existe)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'gateway_commands'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.gateway_commands;
    END IF;
END $$;
