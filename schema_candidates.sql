-- Tabla de Mapeo de Candidatos y Coaliciones
CREATE TABLE candidate_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  election_year INTEGER NOT NULL,
  election_type TEXT NOT NULL, -- 'ayuntamiento', 'gubernatura', etc.
  municipality TEXT, -- NULL para gubernatura si es estatal
  party_code TEXT NOT NULL, -- El encabezado del CSV (ej: PVEM_PT_...)
  candidate_name TEXT NOT NULL,
  
  -- Restricción para evitar duplicados
  UNIQUE(election_year, election_type, municipality, party_code)
);

-- Habilitar RLS
ALTER TABLE candidate_mappings ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública (para los dashboards de candidatos)
CREATE POLICY "Allow public read" ON candidate_mappings FOR SELECT USING (true);

-- Política de gestión completa para SuperAdmin
CREATE POLICY "Allow all for authenticated users" ON candidate_mappings
    FOR ALL USING (true) WITH CHECK (true);
