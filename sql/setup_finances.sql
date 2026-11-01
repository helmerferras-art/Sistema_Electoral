-- Create campaign finances table
CREATE TABLE IF NOT EXISTS campaign_finances (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    transaction_type TEXT CHECK (transaction_type IN ('ingreso', 'egreso')),
    amount DECIMAL(15, 2) NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    reference_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE campaign_finances ENABLE ROW LEVEL SECURITY;

-- Create policies mapping back to tenant 
DROP POLICY IF EXISTS "Users can view their own tenant finances" ON campaign_finances;
CREATE POLICY "Users can view their own tenant finances"
ON campaign_finances FOR SELECT
USING (auth.uid() IN (SELECT id FROM users WHERE users.tenant_id = campaign_finances.tenant_id) OR auth.uid() IN (SELECT id FROM users WHERE users.role = 'superadmin'));

DROP POLICY IF EXISTS "Users can insert into their own tenant finances" ON campaign_finances;
CREATE POLICY "Users can insert into their own tenant finances"
ON campaign_finances FOR INSERT
WITH CHECK (auth.uid() IN (SELECT id FROM users WHERE users.tenant_id = campaign_finances.tenant_id) OR auth.uid() IN (SELECT id FROM users WHERE users.role = 'superadmin'));

-- Mock initial budget for SuperAdmin (Tuxtla)
INSERT INTO campaign_finances (tenant_id, transaction_type, amount, category, description, reference_date)
SELECT id, 'ingreso', 1500000.00, 'Aportación', 'Presupuesto Inicial Aprobado', CURRENT_DATE
FROM tenants
WHERE geographic_scope ILIKE '%Tuxtla%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO campaign_finances (tenant_id, transaction_type, amount, category, description, reference_date)
SELECT id, 'egreso', 120000.00, 'Logística', 'Adelanto Transporte Evento Cierre', CURRENT_DATE
FROM tenants
WHERE geographic_scope ILIKE '%Tuxtla%' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO campaign_finances (tenant_id, transaction_type, amount, category, description, reference_date)
SELECT id, 'egreso', 240000.00, 'Propaganda', 'Contrato Espectaculares Periférico', CURRENT_DATE
FROM tenants
WHERE geographic_scope ILIKE '%Tuxtla%' LIMIT 1
ON CONFLICT DO NOTHING;
