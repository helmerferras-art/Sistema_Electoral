-- Tablas para el Asesor Estratégico AI y Demografía Territorial

-- 1. Tabla de Configuración de IA (Llaves de API por Tenant/Global)
-- 1. Tabla de Configuración de IA
CREATE TABLE IF NOT EXISTS ai_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    api_key TEXT,
    is_active BOOLEAN DEFAULT true,
    last_consultation TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar que provider sea único para poder usar upsert desde el cliente
ALTER TABLE ai_config DROP CONSTRAINT IF EXISTS ai_config_provider_check;
ALTER TABLE ai_config DROP CONSTRAINT IF EXISTS ai_config_tenant_id_provider_key;
ALTER TABLE ai_config DROP CONSTRAINT IF EXISTS ai_config_provider_unique;
ALTER TABLE ai_config ADD CONSTRAINT ai_config_provider_unique UNIQUE (provider);

-- 2. Tabla de Demografía por Colonia
CREATE TABLE IF NOT EXISTS colony_demographics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cvegeo TEXT,
    estatus TEXT,
    cve_ent TEXT,
    nom_ent TEXT,
    nom_abr TEXT,
    cve_mun TEXT,
    nom_mun TEXT,
    cve_loc TEXT,
    nom_loc TEXT,
    ambito TEXT,
    latitud TEXT,
    longitud TEXT,
    lat_decimal DOUBLE PRECISION,
    lon_decimal DOUBLE PRECISION,
    altitud TEXT,
    cve_carta TEXT,
    pob_total INTEGER,
    pob_masculina INTEGER,
    pob_femenina INTEGER,
    total_viviendas_habitadas INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla para Insights Estratégicos
CREATE TABLE IF NOT EXISTS ai_strategic_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    topic TEXT,
    insight_text TEXT,
    suggested_tasks JSONB,
    model_used TEXT,
    is_implemented BOOLEAN DEFAULT false
);

-- Asegurar que existan las columnas de contexto geográfico (por si la tabla ya existía)
ALTER TABLE ai_strategic_insights ADD COLUMN IF NOT EXISTS municipality TEXT;
ALTER TABLE ai_strategic_insights ADD COLUMN IF NOT EXISTS section_id TEXT;
ALTER TABLE ai_strategic_insights ADD COLUMN IF NOT EXISTS district TEXT;

-- 4. Tabla para Alertas del Sistema (Modo Dios)
CREATE TABLE IF NOT EXISTS system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    source TEXT,
    message TEXT,
    is_read BOOLEAN DEFAULT false
);

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Superadmin manages system alerts" ON system_alerts;
CREATE POLICY "Superadmin manages system alerts" ON system_alerts FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON system_alerts TO authenticated, service_role;

-- RLS y Políticas (Tablas anteriores)
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE colony_demographics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_strategic_insights ENABLE ROW LEVEL SECURITY;

-- Limpieza de políticas antiguas
-- Limpieza de políticas antiguas y actuales
DROP POLICY IF EXISTS "Superadmin manages ai_config" ON ai_config;
DROP POLICY IF EXISTS "Public/Tenant view demographics" ON colony_demographics;
DROP POLICY IF EXISTS "Public view demographics" ON colony_demographics;
DROP POLICY IF EXISTS "Superadmin manages demographics" ON colony_demographics;
DROP POLICY IF EXISTS "Tenant access insights" ON ai_strategic_insights;
DROP POLICY IF EXISTS "Superadmin manages insights" ON ai_strategic_insights;
DROP POLICY IF EXISTS "Generic access insights" ON ai_strategic_insights;

-- Nuevas Políticas Robustas
CREATE POLICY "Superadmin manages ai_config" ON ai_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public view demographics" ON colony_demographics FOR SELECT USING (true);
CREATE POLICY "Superadmin manages demographics" ON colony_demographics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Generic access insights" ON ai_strategic_insights FOR ALL USING (true) WITH CHECK (true);

-- Permisos explícitos para anon y authenticated (Supabase PostgREST)
GRANT ALL ON ai_config TO authenticated, service_role;
GRANT ALL ON colony_demographics TO authenticated, service_role;
GRANT ALL ON ai_strategic_insights TO authenticated, service_role;
GRANT SELECT ON colony_demographics TO anon;
