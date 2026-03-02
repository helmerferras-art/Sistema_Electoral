-- New Table for Demographic Padrón Electoral
-- This is independent of election results and stores census/registry data.

CREATE TABLE IF NOT EXISTS padron_electoral (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    section_id TEXT NOT NULL, -- e.g., '1683'
    municipality TEXT NOT NULL, -- e.g., 'Tuxtla Gutiérrez'
    year INTEGER NOT NULL, -- e.g., 2024
    padron_total INTEGER DEFAULT 0,
    hombres INTEGER DEFAULT 0,
    mujeres INTEGER DEFAULT 0,
    edad_rangos JSONB DEFAULT '{}'::jsonb, -- e.g., {"18-24": 320, "25-34": 410, ...}
    
    -- Ensure we only have one record per section/year
    UNIQUE(section_id, year)
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_padron_section ON padron_electoral(section_id);
CREATE INDEX IF NOT EXISTS idx_padron_municipality ON padron_electoral(municipality);
CREATE INDEX IF NOT EXISTS idx_padron_year ON padron_electoral(year);

-- Enable RLS
ALTER TABLE padron_electoral ENABLE ROW LEVEL SECURITY;

-- 1. Read access for all authenticated users (to allow C4I crossing)
CREATE POLICY "Allow read access to everyone" ON padron_electoral
    FOR SELECT USING (true);

-- 2. Management access for SuperAdmins
-- In MVP/Dev mode with devLogin bypass, auth.uid() may be null.
-- We allow mutations for now to unblock development.
-- TODO: Restrict to service_role or valid auth.uid() in production.
CREATE POLICY "Allow management for all" ON padron_electoral
    FOR ALL USING (true) WITH CHECK (true);

-- Add to Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE padron_electoral;
