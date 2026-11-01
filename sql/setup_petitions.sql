-- 1. Añadir slug a tenants para rutas personalizadas (nemia.lat/slug)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- 2. Sistema de Demandas Ciudadanas
CREATE TABLE IF NOT EXISTS petitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Null si es anónimo
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Otros', -- agua, pavimentación, salud, seguridad, etc.
  status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'en_proceso', 'resuelto', 'rechazado')),
  priority TEXT DEFAULT 'media' CHECK (priority IN ('baja', 'media', 'alta')),
  
  -- Ubicación Táctica
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  address_reference TEXT,
  
  -- Priorización Automática e IA
  votes_count INTEGER DEFAULT 0,
  urgency_score INTEGER DEFAULT 0,
  is_emergency BOOLEAN DEFAULT false,
  affects_count INTEGER DEFAULT 1, -- Cuántas personas afecta según el reporte
  
  -- Gestión Administrativa
  government_level TEXT CHECK (government_level IN ('federal', 'estatal', 'municipal')),
  assigned_office TEXT, -- SEDATU, Obras Públicas, etc.
  contact_official TEXT,
  
  is_anonymous BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Evidencia Multimedia (Fotos/Videos)
CREATE TABLE IF NOT EXISTS petition_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  petition_id UUID REFERENCES petitions(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_type TEXT, -- image/jpeg, video/mp4, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sistema de Votos / Likes para Priorización Social
CREATE TABLE IF NOT EXISTS petition_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  petition_id UUID REFERENCES petitions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(petition_id, user_id)
);

-- 5. Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_petitions_updated_at
BEFORE UPDATE ON petitions
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();
