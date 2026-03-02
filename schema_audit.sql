-- schema_audit.sql
-- Run this in the Supabase SQL Editor to enable:
--   1. Pitch script persistence (shared across all agents)
--   2. Per-call audit log with outcome tracking

-- =====================================================
-- TABLE: audit_pitch
-- One row per tenant — stores the supervisor-editable call script
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_pitch (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    script      TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_by  UUID REFERENCES users(id),
    CONSTRAINT  audit_pitch_tenant_unique UNIQUE (tenant_id)
);

-- =====================================================
-- TABLE: audit_call_log
-- One row per call attempt — outcome per contact per agent session
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_call_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
    supporter_id UUID REFERENCES supporters(id) ON DELETE CASCADE,
    agent_id     UUID REFERENCES users(id),
    called_at    TIMESTAMPTZ DEFAULT NOW(),
    outcome      TEXT CHECK (outcome IN ('simpatiza', 'no_disponible', 'rechazo', 'sin_servicio', 'buzon'))
);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE audit_pitch    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_call_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to allow re-running script
DROP POLICY IF EXISTS "Tenant access audit_pitch" ON audit_pitch;
CREATE POLICY "Tenant access audit_pitch" ON audit_pitch
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Tenant access audit_call_log" ON audit_call_log;
CREATE POLICY "Tenant access audit_call_log" ON audit_call_log
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));


-- =====================================================
-- REALTIME (so all agents see pitch updates live)
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE audit_pitch;
ALTER PUBLICATION supabase_realtime ADD TABLE audit_call_log;
