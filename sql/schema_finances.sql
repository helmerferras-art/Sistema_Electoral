-- ==========================================
-- SCRIPT DE MIGRACIÓN: MÓDULO DE FINANZAS
-- ==========================================

-- 1. Tabla PRINCIPAL de Finanzas
CREATE TABLE IF NOT EXISTS campaign_finances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tenant_id UUID REFERENCES tenants(id),
  transaction_type TEXT CHECK (transaction_type IN ('ingreso', 'egreso')),
  amount DECIMAL(12, 2) NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  reference_date DATE DEFAULT CURRENT_DATE
);

-- ==========================================
-- POLÍTICAS DE SEGURIDAD (RLS)
-- ==========================================

ALTER TABLE campaign_finances ENABLE ROW LEVEL SECURITY;

-- 1. Políticas genéricas (MVP: permitir acceso a usuarios autenticados)
DROP POLICY IF EXISTS "Todos pueden leer finanzas" ON campaign_finances;
CREATE POLICY "Todos pueden leer finanzas" ON campaign_finances
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Todos pueden insertar finanzas" ON campaign_finances;
CREATE POLICY "Todos pueden insertar finanzas" ON campaign_finances
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Todos pueden actualizar finanzas" ON campaign_finances;
CREATE POLICY "Todos pueden actualizar finanzas" ON campaign_finances
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Todos pueden eliminar finanzas" ON campaign_finances;
CREATE POLICY "Todos pueden eliminar finanzas" ON campaign_finances
  FOR DELETE USING (true);
